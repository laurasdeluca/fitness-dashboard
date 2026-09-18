const { createClient } = supabase;
const db = createClient(window.SUPABASE_CONFIG.url, window.SUPABASE_CONFIG.anonKey);
const $ = (id) => document.getElementById(id);

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}
function fmtWeight(value) {
  if (value === null || value === undefined || value === "") return "–";
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })} lb`;
}
function lbFromKg(value) {
  if (value === null || value === undefined) return null;
  return Number(value) * 2.2046226218;
}
function safe(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function last7Dates() {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() - (6-i)); return d.toISOString().slice(0,10);
  });
}
function next7Dates() {
  return Array.from({length:7}, (_,i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d.toISOString().slice(0,10);
  });
}

async function loadSnapshot() {
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: activities } = await db.from("activities").select("load,start_time").gte("start_time", since);
  const total = (activities || []).reduce((sum,a) => sum + (Number(a.load) || 0), 0);
  $("snap-load").textContent = total ? Math.round(total).toLocaleString() : "–";

  const { data: metrics } = await db.from("daily_metrics")
    .select("metric_date,sleep_s,hrv,resting_hr,readiness,atl_load,ctl_load,raw")
    .order("metric_date", {ascending:false}).limit(1);
  if (!metrics?.length) return;
  const m = metrics[0];
  $("snap-atl").textContent = m.raw?.atl != null ? Number(m.raw.atl).toFixed(1) : "–";
  $("snap-ctl").textContent = m.raw?.ctl != null ? Number(m.raw.ctl).toFixed(1) : "–";
  const rawWeight = m.raw?.weight;
  const weightLb = lbFromKg(rawWeight);
  $("snap-weight").textContent = weightLb != null ? fmtWeight(weightLb) : "–";
  $("snap-sleep").textContent = m.sleep_s ? fmtDuration(m.sleep_s) : "–";
  $("snap-hrv").textContent = m.hrv != null ? Math.round(m.hrv) : "–";
  $("snap-rhr").textContent = m.resting_hr != null ? Math.round(m.resting_hr) : "–";
}

async function loadTrainingLoad() {
  const { data, error } = await db.from("daily_metrics")
    .select("metric_date,atl_load,ctl_load,raw")
    .order("metric_date", {ascending:false}).limit(14);
  const chart = $("load-chart");
  if (error || !data?.length) { chart.innerHTML = '<div class="empty-state">No training-load data yet.</div>'; return; }
  const rows = [...data].reverse();
  const max = Math.max(1, ...rows.flatMap(r => [Number(r.raw?.atl) || 0, Number(r.raw?.ctl) || 0]));
  chart.innerHTML = rows.map(r => {
    const atl = Number(r.atl_load ?? r.atl) || 0;
    const ctl = Number(r.ctl_load ?? r.ctl) || 0;
    return `<div class="load-day" title="${safe(fmtDate(r.metric_date))}: ATL ${Math.round(atl)}, CTL ${Math.round(ctl)}">
      <div class="bars"><span class="bar atl" style="height:${Math.max(2, atl/max*100)}%"></span><span class="bar ctl" style="height:${Math.max(2, ctl/max*100)}%"></span></div>
      <span class="load-date">${safe(new Date(r.metric_date+"T12:00:00").toLocaleDateString(undefined,{month:"numeric",day:"numeric"}))}</span>
    </div>`;
  }).join("");
  const latest = data[0], prior = data[1];
  const atl = Number(latest.raw?.atl), ctl = Number(latest.raw?.ctl);
  let trend = "";
  if (Number.isFinite(ctl) && prior) {
    const p = Number(prior.raw?.ctl);
    if (Number.isFinite(p)) trend = `CTL trend: ${ctl > p ? "+" : ""}${(ctl-p).toFixed(1)} since ${fmtDate(prior.metric_date)}`;
  }
  $("load-trend").innerHTML = `<span><i class="legend-dot atl"></i> acute</span><span><i class="legend-dot ctl"></i> chronic</span><span class="trend">${safe(trend)}</span>`;
}

async function loadActivities() {
  const {data,error}=await db.from("activities").select("*").order("start_time",{ascending:false}).limit(15);
  const list=$("activity-list"); list.innerHTML="";
  if(error){list.innerHTML=`<li class="empty-state">Couldn't load activities: ${safe(error.message)}</li>`;return;}
  if(!data?.length){list.innerHTML='<li class="empty-state">No activities synced yet.</li>';return;}
  for(const a of data){
    const li=document.createElement("li");
    const isLyfta=a.source==="lyfta";
    li.className=isLyfta?"clickable":"";
    const sourceLabel=isLyfta?"Strength":(a.raw?.source==="strava"?"Strava":"Intervals");
    const detail=isLyfta&&a.load?fmtWeight(a.load):(a.distance_m?(`${(Number(a.distance_m)/1609.344).toFixed(1)} mi`):fmtDuration(a.duration_s));
    li.innerHTML=`<span class="item-name">${safe(a.name||"Activity")} <span class="item-sport">${sourceLabel}</span></span><span class="item-date">${safe(fmtDate(a.start_time))}${detail?" · "+safe(detail):""}</span>`;
    if(isLyfta) li.addEventListener("click",()=>openLyfta(a));
    list.appendChild(li);
  }
}

function openLyfta(a){
  const d=$("workout-dialog"), raw=a.raw||{}, exercises=raw.exercises||[];
  $("workout-title").textContent=a.name||"Strength workout";
  $("workout-meta").innerHTML=`<span>${safe(fmtDate(a.start_time))}</span><span>${a.load!=null?safe(fmtWeight(a.load)):""} total volume</span><span>${raw.body_weight!=null?safe(fmtWeight(raw.body_weight)):""} body weight</span><span>${exercises.length} exercises</span>`;
  $("workout-exercises").innerHTML=exercises.length ? exercises.map(ex=>{
    const sets=ex.sets||[];
    return `<div class="exercise"><div class="exercise-name">${safe(ex.excercise_name||ex.exercise_name||"Exercise")}</div><div class="sets">${sets.map((s,i)=>`<span>Set ${i+1}: ${s.weight?safe(s.weight)+" lb × ":""}${s.reps?safe(s.reps)+" reps":s.duration?safe(s.duration):"—"}${s.rir!==""&&s.rir!=null?" · RIR "+safe(s.rir):""}</span>`).join("")}</div></div>`;
  }).join("") : '<div class="empty-state">Exercise details unavailable.</div>';
  if(typeof d.showModal==="function") d.showModal(); else d.setAttribute("open","");
}
$("close-workout").addEventListener("click",()=> $("workout-dialog").close());
$("workout-dialog").addEventListener("click",e=>{if(e.target===$("workout-dialog"))$("workout-dialog").close();});

async function loadHabits(){
  const grid=$("habit-grid"), dates=last7Dates();
  const {data:habits,error}=await db.from("habits").select("*").eq("archived",false).order("sort_order",{ascending:true});
  if(error){grid.innerHTML=`<div class="empty-state">Couldn't load habits: ${safe(error.message)}</div>`;return;}
  if(!habits?.length){grid.innerHTML='<div class="empty-state">No habits yet -- add one above.</div>';return;}
  const {data:logs}=await db.from("habit_logs").select("*").gte("log_date",dates[0]);
  const doneSet=new Set((logs||[]).map(l=>`${l.habit_id}:${l.log_date}`)), today=dates.at(-1);
  grid.innerHTML="";
  for(const habit of habits){
    const row=document.createElement("div"); row.className="habit-row";
    const name=document.createElement("span"); name.className="habit-name"; name.textContent=`${habit.emoji?habit.emoji+" ":""}${habit.name}`; row.appendChild(name);
    for(const date of dates){
      const b=document.createElement("button"), done=doneSet.has(`${habit.id}:${date}`), future=date>today;
      b.className="habit-cell"+(done?" done":"")+(future?" future":""); b.textContent="✓"; b.title=date; b.disabled=future;
      b.addEventListener("click",()=>toggleHabit(habit.id,date,done)); row.appendChild(b);
    }
    grid.appendChild(row);
  }
}
async function toggleHabit(habitId,date,isDone){
  if(isDone) await db.from("habit_logs").delete().match({habit_id:habitId,log_date:date});
  else await db.from("habit_logs").insert({habit_id:habitId,log_date:date});
  loadHabits();
}
$("add-habit").addEventListener("click",async()=>{
  const name=prompt("Habit name (e.g. Stretch, Sleep 8h, Protein target)"); if(!name)return;
  const emoji=prompt("Optional emoji for it (leave blank to skip)")||null;
  await db.from("habits").insert({name,emoji}); loadHabits();
});

async function loadPlan(){
  const dates=next7Dates();
  const {data,error}=await db.from("planned_workouts").select("*").gte("plan_date",dates[0]).lte("plan_date",dates.at(-1)).order("plan_date",{ascending:true});
  const list=$("plan-list"); list.innerHTML="";
  if(error){list.innerHTML=`<li class="empty-state">Couldn't load plan: ${safe(error.message)}</li>`;return;}
  if(!data?.length){list.innerHTML='<li class="empty-state">Nothing planned for the next 7 days.</li>';return;}
  for(const p of data){const li=document.createElement("li");li.innerHTML=`<span class="item-name">${safe(p.title)} <span class="item-sport">${safe(p.sport||"")}</span></span><span class="item-date">${safe(fmtDate(p.plan_date))}</span>`;list.appendChild(li);}
}
$("add-plan").addEventListener("click",async()=>{
  const title=prompt("Workout title (e.g. Easy 8mi, Upper body, 3000m swim)"); if(!title)return;
  const plan_date=prompt("Date (YYYY-MM-DD)",new Date().toISOString().slice(0,10)); if(!plan_date)return;
  const sport=prompt("Sport (run/ride/swim/strength/rest)","run");
  await db.from("planned_workouts").insert({title,plan_date,sport}); loadPlan();
});

async function init(){
  $("last-synced").textContent=`updated ${new Date().toLocaleTimeString()}`;
  await Promise.all([loadSnapshot(),loadTrainingLoad(),loadActivities(),loadHabits(),loadPlan()]);
}
init();
setInterval(init,5*60*1000);
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
