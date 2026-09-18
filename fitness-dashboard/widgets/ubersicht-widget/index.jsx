// Field Log widget -- Übersicht (macOS)
// Setup:
//   1. Install Übersicht (ubersicht.tracesof.net), free.
//   2. Copy this whole "ubersicht-widget" folder into
//      ~/Library/Application Support/Übersicht/widgets/field-log/
//   3. Fill in SUPABASE_URL and SUPABASE_ANON_KEY below.
//   4. Übersicht picks it up automatically and keeps it refreshed.

import { css } from "uebersicht";

const SUPABASE_URL = "https://YOUR-PROJECT.supabase.co";
const SUPABASE_ANON_KEY = "your-anon-key";

export const refreshFrequency = 15 * 60 * 1000; // 15 minutes

export const className = css`
  position: fixed;
  top: 40px;
  right: 20px;
  width: 220px;
  padding: 16px;
  background: rgba(16, 22, 26, 0.85);
  border: 1px solid #2a3339;
  color: #e7e2d6;
  font-family: "IBM Plex Sans", -apple-system, sans-serif;
  border-radius: 2px;

  .eyebrow {
    font-family: "IBM Plex Mono", monospace;
    font-size: 10px;
    color: #8a9290;
    margin-bottom: 8px;
  }
  .load {
    font-family: "IBM Plex Mono", monospace;
    font-size: 22px;
    color: #b8873a;
    margin-bottom: 6px;
  }
  .row {
    font-size: 12px;
    color: #e7e2d6;
    margin-bottom: 2px;
  }
  .muted {
    color: #8a9290;
  }
`;

export const command = async () => {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };

  const since = new Date(Date.now() - 7 * 86400000).toISOString();

  const [activitiesRes, metricsRes, recentRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/activities?select=load&start_time=gte.${encodeURIComponent(since)}`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/daily_metrics?select=*&order=metric_date.desc&limit=1`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/activities?select=name,sport,start_time&order=start_time.desc&limit=1`, { headers }),
  ]);

  const activities = await activitiesRes.json();
  const metrics = await metricsRes.json();
  const recent = await recentRes.json();

  return JSON.stringify({
    totalLoad: activities.reduce((s, a) => s + (a.load || 0), 0),
    sleepSecs: metrics[0]?.sleep_s ?? null,
    hrv: metrics[0]?.hrv ?? null,
    lastActivity: recent[0]?.name || recent[0]?.sport || null,
  });
};

function fmtDuration(seconds) {
  if (!seconds) return "–";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h${m}m` : `${m}m`;
}

export const render = ({ output, error }) => {
  if (error) {
    return <div className="row muted">Couldn't load Field Log data</div>;
  }
  if (!output) {
    return <div className="row muted">Loading…</div>;
  }

  let data;
  try {
    data = JSON.parse(output);
  } catch {
    return <div className="row muted">Bad response</div>;
  }

  return (
    <div>
      <div className="eyebrow">FIELD LOG</div>
      <div className="load">{data.totalLoad ? Math.round(data.totalLoad) : "–"} load / 7d</div>
      <div className="row">Sleep: {fmtDuration(data.sleepSecs)}</div>
      <div className="row">HRV: {data.hrv ? Math.round(data.hrv) : "–"}</div>
      {data.lastActivity && <div className="row muted">Last: {data.lastActivity}</div>}
    </div>
  );
};
