// sync.mjs
// Pulls recent data from intervals.icu (Garmin + Strava activities, wellness)
// and Lyfta (strength workouts), then upserts it into Supabase.
// Run manually with `node sync.mjs`, or on a schedule via GitHub Actions.

import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  INTERVALS_ATHLETE_ID,
  INTERVALS_API_KEY,
  LYFTA_API_KEY,
  SYNC_DAYS_BACK = "14",
} = process.env;

function requireEnv(name, value) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}
requireEnv("SUPABASE_URL", SUPABASE_URL);
requireEnv("SUPABASE_SERVICE_ROLE_KEY", SUPABASE_SERVICE_ROLE_KEY);

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const daysBack = parseInt(SYNC_DAYS_BACK, 10) || 14;
const oldest = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const newest = new Date().toISOString().slice(0, 10);

// ---------- intervals.icu ----------
// Docs: https://forum.intervals.icu/t/api-access-to-intervals-icu/609
// Auth: HTTP Basic, username literally "API_KEY", password is your key.
async function syncIntervalsIcu() {
  if (!INTERVALS_ATHLETE_ID || !INTERVALS_API_KEY) {
    console.log("Skipping intervals.icu (no athlete id / api key set)");
    return;
  }

  const auth = Buffer.from(`API_KEY:${INTERVALS_API_KEY}`).toString("base64");
  const headers = { Authorization: `Basic ${auth}` };

  // Completed activities (Garmin + Strava data lands here once synced to intervals.icu)
  const actUrl = `https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/activities?oldest=${oldest}&newest=${newest}`;
  const actRes = await fetch(actUrl, { headers });
  if (!actRes.ok) {
    console.error("intervals.icu activities fetch failed:", actRes.status, await actRes.text());
  } else {
    const activities = await actRes.json();
    console.log(`intervals.icu: ${activities.length} activities`);

    const rows = activities.map((a) => ({
      source: "intervals_icu",
      external_id: String(a.id),
      sport: (a.type || "").toLowerCase(),
      name: a.name,
      start_time: a.start_date_local || a.start_date,
      duration_s: a.moving_time ?? a.elapsed_time ?? null,
      distance_m: a.distance ?? null,
      load: a.icu_training_load ?? a.training_load ?? null,
      calories: a.calories ?? null,
      raw: a,
    }));

    if (rows.length) {
      const { error } = await supabase
        .from("activities")
        .upsert(rows, { onConflict: "source,external_id" });
      if (error) console.error("Supabase upsert (activities/intervals) error:", error);
    }
  }

  // Wellness (sleep, HRV, resting HR, readiness/form)
  const wellUrl = `https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/wellness?oldest=${oldest}&newest=${newest}`;
  const wellRes = await fetch(wellUrl, { headers });
  if (!wellRes.ok) {
    console.error("intervals.icu wellness fetch failed:", wellRes.status, await wellRes.text());
    return;
  }
  const wellness = await wellRes.json();
  console.log(`intervals.icu: ${wellness.length} wellness days`);

  const wellRows = wellness.map((w) => ({
    source: "intervals_icu",
    metric_date: w.id, // wellness rows are keyed by date (YYYY-MM-DD) in intervals.icu
    sleep_s: w.sleepSecs ?? null,
    hrv: w.hrv ?? null,
    resting_hr: w.restingHR ?? null,
    readiness: w.readiness ?? w.ctlLoad ?? null,
    raw: w,
  }));

  if (wellRows.length) {
    const { error } = await supabase
      .from("daily_metrics")
      .upsert(wellRows, { onConflict: "source,metric_date" });
    if (error) console.error("Supabase upsert (daily_metrics/intervals) error:", error);
  }
}

// ---------- Lyfta ----------
// Generate a personal API key from the Lyfta app / my.lyfta.app community settings.
// Confirm the exact base URL and response shape against Lyfta's current docs --
// third-party APIs like this do change; adjust the fetch below if fields differ.
async function syncLyfta() {
  if (!LYFTA_API_KEY) {
    console.log("Skipping Lyfta (no api key set)");
    return;
  }

  const res = await fetch("https://my.lyfta.app/api/v1/workouts", {
    headers: { Authorization: `Bearer ${LYFTA_API_KEY}` },
  });

  if (!res.ok) {
    console.error("Lyfta fetch failed:", res.status, await res.text());
    return;
  }

  const data = await res.json();
  const workouts = Array.isArray(data) ? data : data.workouts ?? [];
  console.log(`Lyfta: ${workouts.length} workouts`);

  const rows = workouts.map((w) => ({
    source: "lyfta",
    external_id: String(w.id),
    sport: "strength",
    name: w.name || w.title || "Strength workout",
    start_time: w.performed_at || w.date || w.created_at,
    duration_s: w.duration_seconds ?? null,
    distance_m: null,
    load: null,
    calories: w.calories ?? null,
    raw: w,
  }));

  if (rows.length) {
    const { error } = await supabase
      .from("activities")
      .upsert(rows, { onConflict: "source,external_id" });
    if (error) console.error("Supabase upsert (activities/lyfta) error:", error);
  }
}

async function main() {
  console.log(`Syncing ${oldest} -> ${newest}`);
  await syncIntervalsIcu();
  await syncLyfta();
  console.log("Sync complete.");
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
