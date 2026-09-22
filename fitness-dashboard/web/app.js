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
    .select("metric_date,sleep_s,hrv,resting_hr,readiness,atl_load,ctl_load,calories_in,calories_out,protein_g,carbs_g,fat_g,raw")
    .order("metric_date", {ascending:false}).limit(30);
  if (!metrics?.length) return;

  // Training load/weight should use the newest wellness row.
  const m = metrics[0];
  $("snap-atl").textContent = m.raw?.atl != null ? Number(m.raw.atl).toFixed(1) : "–";
  $("snap-ctl").textContent = m.raw?.ctl != null ? Number(m.raw.ctl).toFixed(1) : "–";
  const rawWeight = m.raw?.weight;
  const weightLb = lbFromKg(rawWeight);
  $("snap-weight").textContent = weightLb != null ? fmtWeight(weightLb) : "–";

  // Garmin recovery data can arrive a day or two behind the wellness row.
  // Use the most recent actual value for each metric instead of today's empty row.
  const latestWith = (field) => metrics.find(row =>
    row[field] !== null && row[field] !== undefined && row[field] !== ""
  );

  const sleep = latestWith("sleep_s");
  const hrv = latestWith("hrv");
  const rhr = latestWith("resting_hr");

  $("snap-sleep").textContent = sleep ? fmtDuration(sleep.sleep_s) : "not synced";
  $("snap-hrv").textContent = hrv ? Math.round(hrv.hrv) : "not synced";
  $("snap-rhr").textContent = rhr ? Math.round(rhr.resting_hr) : "not synced";
  const nutrition = latestWith("calories_in");
  $("snap-cal-in").textContent = nutrition ? Math.round(nutrition.calories_in).toLocaleString() : "not synced";
  const expenditure = latestWith("calories_out");
  $("snap-cal-out").textContent = expenditure ? Math.round(expenditure.calories_out).toLocaleString() : "activity only";
}

async function loadRecoveryTrend() {
  const { data, error } = await db.from("daily_metrics")
    .select("metric_date,sleep_s,hrv,resting_hr,raw")
    .order("metric_date",{ascending:false}).limit(7);
  const chart=$("recovery-chart");
  if(error || !data?.length){ chart.innerHTML='<div class="empty-state">No recovery data yet.</div>'; return; }
  const rows=[...data].reverse();
  const maxSleep=Math.max(1,...rows.map(r=>Number(r.sleep_s)||0));
  chart.innerHTML=rows.map(r=>{
    const sleep=Number(r.sleep_s)||0, hrv=Number(r.hrv)||0, rhr=Number(r.resting_hr)||0;
    return '<div class="recovery-day"><div class="recovery-bars"><span class="recovery-bar sleep" style="height:'+Math.max(3,sleep/maxSleep*100)+'%" title="'+safe(fmtDuration(sleep))+' sleep"></span></div><div class="recovery-meta"><span>'+safe(new Date(r.metric_date+"T12:00:00").toLocaleDateString(undefined,{month:"numeric",day:"numeric"}))+'</span><span>HRV '+(hrv?Math.round(hrv):"–")+'</span><span>RHR '+(rhr?Math.round(rhr):"–")+'</span></div></div>';
  }).join("");
}

async function loadNutrition() {
  const dates=last7Dates();
  const {data:metrics,error}=await db.from("daily_metrics").select("metric_date,calories_in,calories_out,protein_g,carbs_g,fat_g").gte("metric_date",dates[0]).order("metric_date",{ascending:true});
  const {data:activities}=await db.from("activities").select("start_time,calories").gte("start_time",dates[0]+"T00:00:00");
  const chart=$("nutrition-chart");
  if(error){chart.innerHTML='<div class="empty-state">Couldn\'t load nutrition data.</div>';return;}
  const byDate=new Map((metrics||[]).map(r=>[r.metric_date,r]));
  for(const a of activities||[]){
    const d=String(a.start_time).slice(0,10);
    const r=byDate.get(d)||{metric_date:d};
    r.activity_calories=(r.activity_calories||0)+(Number(a.calories)||0);
    byDate.set(d,r);
  }
  const rows=dates.map(d=>byDate.get(d)||{metric_date:d});
  const max=Math.max(1,...rows.flatMap(r=>[Number(r.calories_in)||0,Number(r.calories_out)||0,Number(r.activity_calories)||0]));
  chart.innerHTML=rows.map(r=>{
    const cin=Number(r.calories_in)||0, cout=Number(r.calories_out)||0, act=Number(r.activity_calories)||0;
    const out=cout||act;
    return '<div class="nutrition-day" title="'+safe(fmtDate(r.metric_date))+': '+(cin?Math.round(cin)+" in, ":"")+ (out?Math.round(out)+" out":"no expenditure data")+'"><div class="nutrition-bars"><span class="nutrition-bar in" style="height:'+Math.max(cin?3:0,cin/max*100)+'%"></span><span class="nutrition-bar out" style="height:'+Math.max(out?3:0,out/max*100)+'%"></span></div><div class="nutrition-date">'+safe(new Date(r.metric_date+"T12:00:00").toLocaleDateString(undefined,{month:"numeric",day:"numeric"}))+'</div></div>';
  }).join("");
  const latest=[...rows].reverse().find(r=>Number(r.calories_in)>0 || Number(r.calories_out)>0 || Number(r.activity_calories)>0);
  $("nutrition-summary").textContent=latest ? (latest.calories_in ? Math.round(latest.calories_in).toLocaleString()+" in" : "no intake")+" · "+(latest.calories_out ? Math.round(latest.calories_out).toLocaleString()+" expenditure" : latest.activity_calories ? Math.round(latest.activity_calories).toLocaleString()+" activity kcal" : "no expenditure") : "No nutrition data yet.";
  $("nutrition-macros").textContent=latest && (latest.protein_g||latest.carbs_g||latest.fat_g) ? "P "+Math.round(latest.protein_g||0)+"g · C "+Math.round(latest.carbs_g||0)+"g · F "+Math.round(latest.fat_g||0)+"g" : "Macro data will appear when nutrition data is synced.";
}

async function loadTrainingLoad() {
  const { data, error } = await db.from("daily_metrics")
    .select("metric_date,raw")
    .order("metric_date", { ascending: false })
    .limit(14);

  const chart = $("load-chart");
  if (error || !data?.length) {
    chart.innerHTML = '<div class="empty-state">No training-load data yet.</div>';
    return;
  }

  const rows = [...data].reverse().map(r => ({
    date: r.metric_date,
    atl: Number(r.raw?.atl),
    ctl: Number(r.raw?.ctl)
  })).filter(r => Number.isFinite(r.atl) || Number.isFinite(r.ctl));

  if (!rows.length) {
    chart.innerHTML = '<div class="empty-state">No ATL/CTL values available.</div>';
    return;
  }

  const max = Math.max(1, ...rows.flatMap(r => [r.atl, r.ctl].filter(Number.isFinite)));
  chart.innerHTML = rows.map(r => {
    const atl = Number.isFinite(r.atl) ? r.atl : 0;
    const ctl = Number.isFinite(r.ctl) ? r.ctl : 0;
    return `<div class="load-day" title="${safe(fmtDate(r.date))}: ATL ${atl.toFixed(1)}, CTL ${ctl.toFixed(1)}">
      <div class="bars">
        <div class="bar-group">
          <span class="bar atl" style="height:${Math.max(3, atl / max * 100)}%"></span>
          <small>${atl.toFixed(0)}</small>
        </div>
        <div class="bar-group">
          <span class="bar ctl" style="height:${Math.max(3, ctl / max * 100)}%"></span>
          <small>${ctl.toFixed(0)}</small>
        </div>
      </div>
      <span class="load-date">${safe(new Date(r.date + "T12:00:00").toLocaleDateString(undefined,{month:"numeric",day:"numeric"}))}</span>
    </div>`;
  }).join("");

  const latest = rows.at(-1);
  const prior = rows.length > 1 ? rows.at(-2) : null;
  let trend = "";
  if (prior && Number.isFinite(latest.ctl) && Number.isFinite(prior.ctl)) {
    const delta = latest.ctl - prior.ctl;
    trend = `CTL trend: ${delta > 0 ? "+" : ""}${delta.toFixed(1)} since ${fmtDate(prior.date)}`;
  }
  $("load-trend").innerHTML =
    `<span><i class="legend-dot atl"></i> acute</span><span><i class="legend-dot ctl"></i> chronic</span><span class="trend">${safe(trend)}</span>`;
}

async function loadActivities() {
  const { data, error } = await db.from("activities")
    .select("*")
    .order("start_time", { ascending: false })
    .limit(40);

  const list = $("activity-list");
  list.innerHTML = "";
  if (error) {
    list.innerHTML = `<li class="empty-state">Couldn't load activities: ${safe(error.message)}</li>`;
    return;
  }
  if (!data?.length) {
    list.innerHTML = '<li class="empty-state">No activities synced yet.</li>';
    return;
  }

  const sourceWords = new Set(["strava", "garmin", "activity", "intervals", "intervals_icu"]);
  const clean = (v) => v == null ? "" : String(v).trim();

  const getSource = (a, raw) => {
    if (a.source === "lyfta") return "Strength";
    const s = [
      raw.source, raw.provider, raw.device, raw.device_name,
      raw.external_source, raw.file_source
    ].map(clean).join(" ").toLowerCase();
    if (s.includes("strava")) return "Strava";
    if (s.includes("garmin")) return "Garmin";
    return "";
  };

  const getSport = (a, raw) => {
    const v = clean(a.sport || raw.type || raw.sport_type || raw.activity_type || raw.sport).toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const map = {
      run:"Run",running:"Run",
      ride:"Ride",cycling:"Ride",virtualride:"Ride",indoorcycling:"Ride",
      swim:"Swim",swimming:"Swim",
      walk:"Walk",walking:"Walk",
      hike:"Hike",hiking:"Hike",
      strength:"Strength",weighttraining:"Strength",
      yoga:"Yoga",row:"Row",rowing:"Row",
      elliptical:"Elliptical"
    };
    return map[v] || "";
  };

  const getName = (a, raw, sport) => {
    const candidates = [a.name, raw.name, raw.activity_name, raw.title, raw.sport_name];
    for (const candidate of candidates) {
      const v = clean(candidate);
      if (v && !sourceWords.has(v.toLowerCase())) return v;
    }
    return sport || "Activity";
  };

  const visible = (data || [])
    .filter(a => a.source !== "intervals_icu")
    .slice(0, 15);

  for (const a of visible) {
    const li = document.createElement("li");
    const isLyfta = a.source === "lyfta";
    const raw = a.raw || {};
    const sourceLabel = getSource(a, raw);
    const sportLabel = isLyfta ? "Strength" : getSport(a, raw);
    const displayName = isLyfta ? (a.name || "Strength workout") : getName(a, raw, sportLabel);

    let detail = "";
    if (isLyfta && a.load != null) {
      detail = fmtWeight(a.load);
    } else {
      const distance = Number(a.distance_m);
      if (Number.isFinite(distance) && distance > 0) detail = `${(distance / 1609.344).toFixed(1)} mi`;
      const duration = Number(a.duration_s);
      if (Number.isFinite(duration) && duration > 0) detail += detail ? ` · ${fmtDuration(duration)}` : fmtDuration(duration);
    }

    const tags = [...new Set([sportLabel].filter(Boolean))];

    li.className = isLyfta ? "clickable" : "";
    li.innerHTML = `
      <span class="item-name">${safe(displayName)}
        ${tags.length ? `<span class="item-sport">${safe(tags.join(" · "))}</span>` : ""}
      </span>
      <span class="item-date">${safe(fmtDate(a.start_time))}${detail ? " · " + safe(detail) : ""}</span>
    `;

    if (isLyfta) li.addEventListener("click", () => openLyfta(a));
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


function parseCsv(text){
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(quoted){
      if(c==='"' && n==='"'){cell+='"';i++;}
      else if(c==='"') quoted=false;
      else cell+=c;
    }else{
      if(c==='"') quoted=true;
      else if(c===','){row.push(cell);cell="";}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell="";}
      else if(c!=='\r') cell+=c;
    }
  }
  if(cell!=="" || row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(v=>String(v).trim()!==""));
}
function normHeader(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");}
function findColumn(headers, patterns){
  const normalized=headers.map(normHeader);
  return normalized.findIndex(h=>patterns.some(p=>h===p || h.includes(p)));
}
function parseNum(v){
  if(v===null||v===undefined||String(v).trim()==="") return null;
  const n=Number(String(v).replace(/,/g,"").replace(/[^\d.-]/g,""));
  return Number.isFinite(n)?n:null;
}
function parseDateValue(v){
  const s=String(v||"").trim();
  if(!s) return null;
  const m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if(m) return m[1]+"-"+String(m[2]).padStart(2,"0")+"-"+String(m[3]).padStart(2,"0");
  const d=new Date(s);
  return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
async function importMacroFactor(file){
  const text=await file.text();
  const rows=parseCsv(text);
  if(rows.length<2) throw new Error("That file does not contain enough CSV rows.");
  const headers=rows[0];
  const dateI=findColumn(headers,["date","day"]);
  const calI=findColumn(headers,["calories","calorie","energyintake"]);
  const outI=findColumn(headers,["expenditure","caloriesout","tdee","totaldailyenergyexpenditure"]);
  const pI=findColumn(headers,["protein"]);
  const cI=findColumn(headers,["carbs","carbohydrates"]);
  const fI=findColumn(headers,["fat","dietaryfat"]);
  const wtI=findColumn(headers,["scalewt","scaleweight","weight","weighttrend"]);
  if(dateI<0) throw new Error("I couldn't find a Date column in this MacroFactor export.");
  const records=[];
  for(const row of rows.slice(1)){
    const date=parseDateValue(row[dateI]); if(!date) continue;
    records.push({
      source:"macrofactor",
      metric_date:date,
      calories_in:calI>=0?parseNum(row[calI]):null,
      calories_out:outI>=0?parseNum(row[outI]):null,
      protein_g:pI>=0?parseNum(row[pI]):null,
      carbs_g:cI>=0?parseNum(row[cI]):null,
      fat_g:fI>=0?parseNum(row[fI]):null,
      weight_kg:wtI>=0?(parseNum(row[wtI])!=null?parseNum(row[wtI])/2.2046226218:null):null,
      raw:{imported_from:"MacroFactor CSV",headers,row}
    });
  }
  if(!records.length) throw new Error("No dated rows were found in that export.");
  const {error}=await db.from("daily_metrics").upsert(records,{onConflict:"source,metric_date"});
  if(error) throw error;
  alert("Imported "+records.length+" MacroFactor days.");
  await init();
}
$("import-macrofactor").addEventListener("click",()=> $("macrofactor-file").click());
$("macrofactor-file").addEventListener("change",async e=>{
  const file=e.target.files?.[0]; if(!file)return;
  try{await importMacroFactor(file);}
  catch(err){alert("MacroFactor import failed: "+(err.message||err));}
  e.target.value="";
});

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
  const result = isDone
    ? await db.from("habit_logs").delete().match({habit_id:habitId,log_date:date})
    : await db.from("habit_logs").insert({habit_id:habitId,log_date:date});
  if(result.error){ alert("Couldn’t save that habit check: "+result.error.message); return; }
  await loadHabits();
}
$("add-habit").addEventListener("click",async()=>{
  const name=prompt("Habit name (e.g. Stretch, Sleep 8h, Protein target)"); if(!name)return;
  const emoji=prompt("Optional emoji for it (leave blank to skip)")||null;
  const {error}=await db.from("habits").insert({name,emoji});
  if(error){ alert("Couldn’t add that habit: "+error.message); return; }
  await loadHabits();
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
  await Promise.all([loadSnapshot(),loadTrainingLoad(),loadRecoveryTrend(),loadNutrition(),loadActivities(),loadHabits(),loadPlan()]);
}
init();
setInterval(init,5*60*1000);
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
