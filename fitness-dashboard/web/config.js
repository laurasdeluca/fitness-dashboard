// Public, client-side config. The anon key is safe to expose in a deployed
// site -- Supabase Row Level Security (see supabase/schema.sql) decides what
// it's allowed to read/write. Never put the service_role key here.
window.SUPABASE_CONFIG = {
  url: "https://YOUR-PROJECT.supabase.co",
  anonKey: "your-anon-key",
};
