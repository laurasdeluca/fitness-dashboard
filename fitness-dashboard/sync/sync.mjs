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

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY
);

const daysBack = parseInt(SYNC_DAYS_BACK, 10) || 14;

const oldest = new Date(
  Date.now() - daysBack * 24 * 60 * 60 * 1000
)
  .toISOString()
  .slice(0, 10);

const newest = new Date()
  .toISOString()
  .slice(0, 10);

// ---------- intervals.icu ----------

async function syncIntervalsIcu() {
  if (!INTERVALS_ATHLETE_ID || !INTERVALS_API_KEY) {
    console.log(
      "Skipping intervals.icu (no athlete id / api key set)"
    );
    return;
  }

  const auth = Buffer
    .from(`API_KEY:${INTERVALS_API_KEY}`)
    .toString("base64");

  const headers = {
    Authorization: `Basic ${auth}`,
  };

  // ---------- Activities ----------

  const actUrl =
    `https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/activities` +
    `?oldest=${oldest}&newest=${newest}`;

  const actRes = await fetch(actUrl, { headers });

  if (!actRes.ok) {
    console.error(
      "intervals.icu activities fetch failed:",
      actRes.status,
      await actRes.text()
    );
  } else {
    const activities = await actRes.json();

    console.log(
      `intervals.icu: ${activities.length} activities`
    );

    const rows = activities
      .map((a) => ({
        source: "intervals_icu",

        external_id: String(a.id),

        sport: (
          a.type ||
          a.sport_type ||
          a.activity_type ||
          a.sport ||
          ""
        ).toLowerCase(),

        name:
          a.name ||
          a.activity_name ||
          a.title ||
          a.sport_name ||
          null,

        start_time:
          a.start_date_local ||
          a.start_date ||
          null,

        duration_s:
          a.moving_time ??
          a.elapsed_time ??
          a.duration ??
          null,

        distance_m:
          a.distance ??
          null,

        load:
          a.icu_training_load ??
          a.training_load ??
          a.load ??
          null,

        calories:
          a.calories ??
          null,

        raw: a,
      }))
      .filter((row) => row.start_time);

    console.log(
      `intervals.icu: ${rows.length} activities ready for Supabase`
    );

    if (rows.length) {
      const { data, error } = await supabase
        .from("activities")
        .upsert(rows, {
          onConflict: "source,external_id",
        })
        .select(
          "id,source,external_id,name,start_time"
        );

      if (error) {
        console.error(
          "Supabase upsert (activities/intervals) error:",
          error
        );
        throw error;
      }

      console.log(
        `intervals.icu: successfully upserted ${data?.length ?? 0} activities`
      );
    }
  }

  // ---------- Wellness ----------

  const wellUrl =
    `https://intervals.icu/api/v1/athlete/${INTERVALS_ATHLETE_ID}/wellness` +
    `?oldest=${oldest}&newest=${newest}`;

  const wellRes = await fetch(wellUrl, { headers });

  if (!wellRes.ok) {
    console.error(
      "intervals.icu wellness fetch failed:",
      wellRes.status,
      await wellRes.text()
    );
    return;
  }

  const wellness = await wellRes.json();

  console.log(
    `intervals.icu: ${wellness.length} wellness days`
  );

  const wellRows = wellness
    .map((w) => ({
      source: "intervals_icu",

      metric_date:
        w.id ||
        w.date ||
        w.day ||
        null,

      // These remain null because the current
      // intervals.icu response is returning null
      // for sleepSecs.
      sleep_s:
        w.sleepSecs ??
        w.sleep_seconds ??
        w.sleep ??
        null,

      // Current API response is returning null for HRV.
      hrv:
        w.hrv ??
        w.hrvMs ??
        w.hrv_ms ??
        null,

      // Current API response is returning null
      // for resting HR.
      resting_hr:
        w.restingHR ??
        w.resting_hr ??
        w.restingHeartRate ??
        null,

      // Do NOT use ctlLoad as readiness.
      readiness:
        w.readiness ??
        null,

      // Actual Intervals.icu training-load fields.
      atl_load:
        w.atlLoad ??
        null,

      ctl_load:
        w.ctlLoad ??
        null,

      raw: w,
    }))
    .filter((row) => row.metric_date);

  console.log(
    `intervals.icu: ${wellRows.length} wellness rows ready for Supabase`
  );

  if (wellRows.length) {
    const { data, error } = await supabase
      .from("daily_metrics")
      .upsert(wellRows, {
        onConflict: "source,metric_date",
      })
      .select(
        "id,source,metric_date,sleep_s,hrv,resting_hr,readiness,atl_load,ctl_load"
      );

    if (error) {
      console.error(
        "Supabase upsert (daily_metrics/intervals) error:",
        error
      );
      throw error;
    }

    console.log(
      `intervals.icu: successfully upserted ${data?.length ?? 0} wellness rows`
    );
  }
}

// ---------- Lyfta ----------

async function syncLyfta() {
  if (!LYFTA_API_KEY) {
    console.log("Skipping Lyfta (no api key set)");
    return;
  }

  const res = await fetch(
    "https://my.lyfta.app/api/v1/workouts",
    {
      headers: {
        Authorization: `Bearer ${LYFTA_API_KEY}`,
      },
    }
  );

  if (!res.ok) {
    console.error(
      "Lyfta fetch failed:",
      res.status,
      await res.text()
    );
    return;
  }

  const data = await res.json();

  const workouts = Array.isArray(data)
    ? data
    : data.workouts ?? [];

  console.log(
    `Lyfta: ${workouts.length} workouts`
  );

  const rows = workouts
    .map((w) => ({
      source: "lyfta",

      external_id: String(w.id),

      sport: "strength",

      name:
        w.title ||
        w.name ||
        "Strength workout",

      // This is Lyfta's actual workout date field.
      start_time:
        w.workout_perform_date ||
        null,

      duration_s:
        w.duration_seconds ??
        w.durationSeconds ??
        w.duration ??
        null,

      distance_m: null,

      // Total lifted weight / workout volume.
      load:
        w.total_volume ??
        w.totalLiftedWeight ??
        null,

      calories:
        w.calories ??
        null,

      raw: w,
    }))
    .filter((row) => row.start_time);

  console.log(
    `Lyfta: ${rows.length} workouts ready for Supabase`
  );

  const skipped = workouts.length - rows.length;

  if (skipped > 0) {
    console.log(
      `Lyfta: skipped ${skipped} workouts with no usable date`
    );
  }

  if (rows.length) {
    const { data: inserted, error } = await supabase
      .from("activities")
      .upsert(rows, {
        onConflict: "source,external_id",
      })
      .select(
        "id,source,external_id,name,start_time,load"
      );

    if (error) {
      console.error(
        "Supabase upsert (activities/lyfta) error:",
        error
      );
      throw error;
    }

    console.log(
      `Lyfta: successfully upserted ${inserted?.length ?? 0} rows`
    );

    console.log(
      "Lyfta sample:",
      inserted?.slice(0, 2) ?? []
    );
  }
}

// ---------- Main ----------

async function main() {
  console.log(
    `Syncing ${oldest} -> ${newest}`
  );

  await syncIntervalsIcu();
  await syncLyfta();

  console.log("Sync complete.");
}

main().catch((err) => {
  console.error("Sync failed:", err);
  process.exit(1);
});
