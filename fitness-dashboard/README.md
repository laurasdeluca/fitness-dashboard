# Field Log

A free, auto-updating personal training dashboard: Garmin + Strava (via
intervals.icu) and Lyfta strength workouts synced hourly into your own
database, plus MacroFactor nutrition and DuoSwim workouts via Apple Health.
Shows up as an installable web app, a Mac desktop widget, and an iPhone home
screen widget. Also includes a habit tracker and a simple workout planner/calendar.

## What's in here

```
supabase/schema.sql          Database schema (run once in Supabase)
sync/sync.mjs                 Node script: pulls intervals.icu + Lyfta -> Supabase
.github/workflows/sync.yml    Runs sync.mjs every hour, for free, via GitHub Actions
web/                           The dashboard itself -- an installable PWA
widgets/scriptable-widget.js   iPhone home screen widget (Scriptable app)
widgets/ubersicht-widget/      Mac desktop widget (Übersicht app)
```

## 1. Create the database (Supabase, free tier)

1. Go to supabase.com, create a free project.
2. Open the SQL Editor and paste in the contents of `supabase/schema.sql`, then run it.
3. Go to Project Settings -> API. You'll need three values from here:
   - Project URL
   - `anon` public key (goes in the website + widgets)
   - `service_role` key (goes only in the GitHub Actions secrets -- never in the website or widgets)

## 2. Connect your data sources

- **Garmin + Strava:** sign up free at intervals.icu, then Settings -> Integrations
  -> connect Garmin Connect and Strava. Activities and wellness data (sleep, HRV,
  resting HR) will start flowing in automatically.
- **intervals.icu API key:** Settings page, bottom of the page. Note your athlete ID
  too (it's in the URL, like `i123456`).
- **Lyfta:** in the Lyfta app/community site, generate a personal API key under
  Community/API settings.
- **DuoSwim:** in its settings, turn on direct sync to Garmin/Strava so completed
  swims flow into intervals.icu through the same pipe.
- **MacroFactor (and DuoSwim as a backup path):** install Health Auto Export on
  your iPhone (free tier works) and point it at a webhook -- see the note at the
  bottom of this file, since that part needs a small Supabase Edge Function.

## 3. Set up the hourly sync job (GitHub Actions, free)

1. Push this whole folder to a new GitHub repo.
2. In the repo, go to Settings -> Secrets and variables -> Actions, and add:
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERVALS_ATHLETE_ID`,
   `INTERVALS_API_KEY`, `LYFTA_API_KEY`.
3. That's it -- `.github/workflows/sync.yml` runs every hour automatically.
   You can also trigger it manually from the repo's Actions tab to test it
   before waiting for the schedule.

To test locally first: `cd sync && cp .env.example .env` (fill in real values),
`npm install`, `npm run sync`.

## 4. Deploy the dashboard (Vercel, free tier)

1. Edit `web/config.js` and fill in your Supabase URL + anon key.
2. Import the repo into Vercel (or Netlify/Cloudflare Pages), set the root
   directory to `web/`, and deploy -- it's static files, no build step needed.
3. Open the deployed URL on your phone in Safari -> Share -> Add to Home Screen,
   and on your laptop -> the browser's install icon in the address bar.

## 5. Set up the widgets

- **iPhone:** open `widgets/scriptable-widget.js`, fill in your Supabase URL +
  anon key, paste it into a new script in the Scriptable app, then add a
  Scriptable widget to your Home Screen and point it at that script.
- **Mac:** install Übersicht, copy the `widgets/ubersicht-widget` folder into
  `~/Library/Application Support/Übersicht/widgets/field-log/`, and fill in
  your Supabase URL + anon key in `index.jsx`.

## 6. Habits and planned workouts

These live entirely in your own database (the `habits`, `habit_logs`, and
`planned_workouts` tables) -- add/check off habits and add planned workouts
directly from the dashboard's "+" buttons. Nothing external to configure.

## Getting MacroFactor + DuoSwim data in via Apple Health

Health Auto Export can push new HealthKit entries to a URL on a schedule.
The cleanest target for that is a small Supabase Edge Function that accepts
the payload and writes rows into `daily_metrics` (nutrition/weight) or
`activities` (workouts). This is the one piece that isn't scaffolded above
since its payload shape depends on exactly which metrics you turn on in
Health Auto Export -- happy to write that Edge Function once you've picked
which fields you want it to export.

## Costs

Every piece here runs on a free tier at personal-use scale: GitHub Actions
(2,000 free minutes/month, this job uses a few seconds an hour), Supabase
free tier (500MB DB, more than enough), Vercel hobby tier, Scriptable and
Übersicht (both free apps). Nothing here should ever prompt a bill.
