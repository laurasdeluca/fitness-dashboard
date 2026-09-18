const { createClient } = supabase;
const db = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);

const $ = (id) => document.getElementById(id);

function fmtDate(d) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function fmtDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

function last7Dates() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().slice(0, 10);
  });
}

function next7Dates() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

// ---------- Snapshot ----------
async function loadSnapshot() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: acts } = await db
    .from("activities")
    .select("load")
    .gte("start_time", since);
  const totalLoad = (acts || []).reduce((sum, a) => sum + (a.load || 0), 0);
  $("snap-load").textContent = totalLoad ? Math.round(totalLoad) : "–";

  const { data: metrics } = await db
    .from("daily_metrics")
    .select("*")
    .order("metric_date", { ascending: false })
    .limit(1);
  const latest = metrics && metrics[0];
  $("snap-sleep").textContent = latest?.sleep_s ? fmtDuration(latest.sleep_s) : "–";
  $("snap-hrv").textContent = latest?.hrv ? Math.round(latest.hrv) : "–";
  $("snap-rhr").textContent = latest?.resting_hr ? Math.round(latest.resting_hr) : "–";
}

// ---------- Activity feed ----------
async function loadActivities() {
  const { data, error } = await db
    .from("activities")
    .select("*")
    .order("start_time", { ascending: false })
    .limit(15);

  const list = $("activity-list");
  list.innerHTML = "";

  if (error) {
    list.innerHTML = `<li class="empty-state">Couldn't load activities: ${error.message}</li>`;
    return;
  }
  if (!data || !data.length) {
    list.innerHTML = `<li class="empty-state">No activities synced yet.</li>`;
    return;
  }

  for (const a of data) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="item-name">${a.name || a.sport || "Activity"} <span class="item-sport">${a.sport || a.source}</span></span>
      <span class="item-date">${fmtDate(a.start_time)}${a.duration_s ? " · " + fmtDuration(a.duration_s) : ""}</span>
    `;
    list.appendChild(li);
  }
}

// ---------- Habits ----------
async function loadHabits() {
  const grid = $("habit-grid");
  const dates = last7Dates();

  const { data: habits, error: hErr } = await db
    .from("habits")
    .select("*")
    .eq("archived", false)
    .order("sort_order", { ascending: true });

  if (hErr) {
    grid.innerHTML = `<div class="empty-state">Couldn't load habits: ${hErr.message}</div>`;
    return;
  }
  if (!habits || !habits.length) {
    grid.innerHTML = `<div class="empty-state">No habits yet -- add one above.</div>`;
    return;
  }

  const { data: logs } = await db
    .from("habit_logs")
    .select("*")
    .gte("log_date", dates[0]);

  const doneSet = new Set((logs || []).map((l) => `${l.habit_id}:${l.log_date}`));
  const today = dates[dates.length - 1];

  grid.innerHTML = "";
  for (const habit of habits) {
    const row = document.createElement("div");
    row.className = "habit-row";
    const nameEl = document.createElement("span");
    nameEl.className = "habit-name";
    nameEl.textContent = `${habit.emoji ? habit.emoji + " " : ""}${habit.name}`;
    row.appendChild(nameEl);

    for (const date of dates) {
      const cell = document.createElement("button");
      const isFuture = date > today;
      const key = `${habit.id}:${date}`;
      cell.className = "habit-cell" + (doneSet.has(key) ? " done" : "") + (isFuture ? " future" : "");
      cell.textContent = "✓";
      cell.title = date;
      cell.disabled = isFuture;
      cell.addEventListener("click", () => toggleHabit(habit.id, date, doneSet.has(key)));
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
}

async function toggleHabit(habitId, date, isDone) {
  if (isDone) {
    await db.from("habit_logs").delete().match({ habit_id: habitId, log_date: date });
  } else {
    await db.from("habit_logs").insert({ habit_id: habitId, log_date: date });
  }
  loadHabits();
}

$("add-habit").addEventListener("click", async () => {
  const name = prompt("Habit name (e.g. Stretch, Sleep 8h, Protein target)");
  if (!name) return;
  const emoji = prompt("Optional emoji for it (leave blank to skip)") || null;
  await db.from("habits").insert({ name, emoji });
  loadHabits();
});

// ---------- Plan ----------
async function loadPlan() {
  const dates = next7Dates();
  const { data, error } = await db
    .from("planned_workouts")
    .select("*")
    .gte("plan_date", dates[0])
    .lte("plan_date", dates[dates.length - 1])
    .order("plan_date", { ascending: true });

  const list = $("plan-list");
  list.innerHTML = "";

  if (error) {
    list.innerHTML = `<li class="empty-state">Couldn't load plan: ${error.message}</li>`;
    return;
  }
  if (!data || !data.length) {
    list.innerHTML = `<li class="empty-state">Nothing planned for the next 7 days.</li>`;
    return;
  }

  for (const p of data) {
    const li = document.createElement("li");
    li.innerHTML = `
      <span class="item-name">${p.title} <span class="item-sport">${p.sport || ""}</span></span>
      <span class="item-date">${fmtDate(p.plan_date)}</span>
    `;
    list.appendChild(li);
  }
}

$("add-plan").addEventListener("click", async () => {
  const title = prompt("Workout title (e.g. Easy 8mi, Upper body, 3000m swim)");
  if (!title) return;
  const plan_date = prompt("Date (YYYY-MM-DD)", new Date().toISOString().slice(0, 10));
  if (!plan_date) return;
  const sport = prompt("Sport (run/ride/swim/strength/rest)", "run");
  await db.from("planned_workouts").insert({ title, plan_date, sport });
  loadPlan();
});

// ---------- Init ----------
async function init() {
  $("last-synced").textContent = `updated ${new Date().toLocaleTimeString()}`;
  await Promise.all([loadSnapshot(), loadActivities(), loadHabits(), loadPlan()]);
}

init();
// Re-check for new data every 5 minutes while the tab/app is open.
setInterval(init, 5 * 60 * 1000);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
