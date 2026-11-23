// online-config.js - where the leaderboards live: the OofWorld relay (a Cloudflare worker, /api/platypus/*).
// Empty = the game is fully offline: names save on this device and the boards say "coming soon".
// While the server does not have the platypus endpoints yet (they answer 404), the game behaves exactly like
// offline mode too; it switches itself on the first time the server answers.
export const PLATY_API = "https://relay.platyfy.com";
