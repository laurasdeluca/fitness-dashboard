// Field Log widget -- Scriptable (iOS)
// Setup:
//   1. Install Scriptable from the App Store.
//   2. Paste this whole file in as a new script named "Field Log".
//   3. Fill in SUPABASE_URL and SUPABASE_ANON_KEY below.
//   4. Long-press Home Screen -> + -> Scriptable -> pick a size -> add it,
//      then long-press the widget -> Edit Widget -> set Script to "Field Log".

const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";

async function supabaseGet(path) {
  const req = new Request(`${SUPABASE_URL}/rest/v1/${path}`);
  req.headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  return await req.loadJSON();
}

function fmtDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h${m}m` : `${m}m`;
}

async function buildWidget() {
  const w = new ListWidget();
  w.backgroundColor = new Color("#10161A");
  w.setPadding(14, 14, 14, 14);

  const title = w.addText("FIELD LOG");
  title.font = Font.mediumSystemFont(11);
  title.textColor = new Color("#8A9290");
  w.addSpacer(6);

  try {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const activities = await supabaseGet(
      `activities?select=load&start_time=gte.${encodeURIComponent(since)}`
    );
    const totalLoad = activities.reduce((s, a) => s + (a.load || 0), 0);

    const metrics = await supabaseGet(
      "daily_metrics?select=*&order=metric_date.desc&limit=1"
    );
    const latest = metrics[0] || {};

    const loadRow = w.addText(`Load  ${totalLoad ? Math.round(totalLoad) : "–"}`);
    loadRow.font = Font.boldSystemFont(20);
    loadRow.textColor = new Color("#B8873A");
    w.addSpacer(4);

    const sleepRow = w.addText(`Sleep  ${latest.sleep_s ? fmtDuration(latest.sleep_s) : "–"}`);
    sleepRow.font = Font.systemFont(13);
    sleepRow.textColor = new Color("#E7E2D6");

    const recent = await supabaseGet(
      "activities?select=name,sport,start_time&order=start_time.desc&limit=1"
    );
    if (recent[0]) {
      w.addSpacer(8);
      const last = w.addText(`Last: ${recent[0].name || recent[0].sport}`);
      last.font = Font.systemFont(11);
      last.textColor = new Color("#8A9290");
    }
  } catch (e) {
    const err = w.addText("Couldn't load data");
    err.font = Font.systemFont(12);
    err.textColor = new Color("#8A9290");
  }

  return w;
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentSmall();
}
Script.complete();
