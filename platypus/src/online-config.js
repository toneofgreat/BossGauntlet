// online-config.js - where the leaderboards live. The owner fills these two in (see supabase/SETUP.md).
// Both empty = the game is fully offline: names save on this device and the boards say "coming soon".
// The anon key is PUBLIC by design (it can only read the top-100 views and call the checked functions).
export const SUPABASE_URL = "";      // "https://xxxx.supabase.co"
export const SUPABASE_ANON_KEY = ""; // the "anon public" key from Settings -> API
