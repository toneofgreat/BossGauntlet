# Adventure Cube online API (`src/online.js`)

Owned by the ONLINE agent. Files: `src/online.js`, `src/online-config.js`, `tools/online-live-test.mjs`.
Built on the site-wide `../platyfy-online.js` (repo root, served at `platyfy.com/platyfy-online.js`).

## Rules for callers
- Every function returns a Promise that **always resolves** and never rejects or throws.
- Success is `{ ok: true, ... }`. A failure is `{ ok: false, reason }`, where `reason` is one of:
  `offline` (no store module, or `CUBE_API` is empty), `network` (could not reach the store or timed out),
  `invalid`, `big`, `rude`, `taken`, `noname`, `notyours`, `missing`, `implausible` (a best time faster than the level
  allows, or no started run) or `slow` (a new level less than a minute after this device's last new level).
- If the store cannot be reached, the reads give back the last cached copy with `stale: true` where they can.
  A best time that cannot be sent is queued on the device and sent on the next successful call
  (the result then has `queued: true`).
- `src/online.js` loads the store lazily with a dynamic `import()`. If `../../platyfy-online.js` is missing (for
  example, a server rooted at `adventure-cube/`), the game still boots and every call gives `offline`.
- Nothing personal is ever sent. A player is a random 12-hex id kept in localStorage, plus the name they typed.
  That name is filtered with the PLATYPUS rules (`platypus/src/names.js`: 3-16 chars, multilingual rude filter).

## Names
Names are shared with PLATYPUS and with every platyfy game that uses `platyfy-online.js`.
| call | result |
|---|---|
| `getName()` | `Promise<string>` (`""` when there is none) |
| `isClaimed()` | `Promise<boolean>`: true when the name is reserved online for this device |
| `setName(name)` | `{ ok, name }`: saved on the device only |
| `claimName(name)` | `{ ok, name }`, or `{ ok:false, reason: "taken" / "rude" / "invalid" / "network" }`. Matching ignores capitals. A player's old names stay reserved for them. |

## Community levels
Levels are stored in the format from `src/sim/level.js`: `packLevel` going up, `unpackLevel` coming down.
Each is checked with `validateLevel(level, { community: true })` in both directions.
| call | result |
|---|---|
| `listLevels()` | `{ ok, levels: [{ id, name, author, difficulty, music, theme, w, h, hash, t, u, mine }], stale? }`, newest first, at most 60 |
| `getLevel(id)` | `{ ok, id, level, meta, mine }`. `level` is normalized and ready for `compileLevel`. |
| `publishLevel(level, { name, author, difficulty, music, theme, id? })` | `{ ok, id, updated }`. `difficulty` must be an integer from 1 to 10 (from the AI rater); anything else gives `invalid`. If `id` is one of your own levels, it is updated in place and keeps its id and best times. Someone else's id gives `notyours`. A packed level over 30000 bytes gives `big`. A rude name gives `rude`. An invalid level gives `invalid` plus `errors: [...]`. |
| `deleteLevel(id)` | `{ ok }`. Works only on your own levels. It also deletes that level's best-time board. |

- `id` is 8 characters from `[a-z0-9]`.
- `difficulty` is 1 = easy, 5 = hard, 10 = impossible.
- `music` is one of `MUSIC_IDS` and `theme` is one of `THEMES` (both from `src/sim/constants.js`).
- Each device (owner id) keeps at most 8 levels: publishing a 9th deletes its own oldest. When the collection is full
  (60 levels), the oldest level of the owner holding the most levels is dropped, so one device can never wipe
  everyone else's levels. A device can publish one NEW level per minute (`slow`); updates in place are not limited.
- Level text other players read (the name, the author, every sign's `text` / `touch`) is rude-filtered on publish
  (`rude`) and blanked on read. `getLevel` refuses records over 30000 bytes (`big`) or with more than 48 rows
  before expanding anything (and `unRle` itself is bounded).
- `publishLevel` meta may carry `frames` (the AI's winning route length); it becomes the level's time floor.

## Best times
`levelId` is `"area1"`, `"area2"`, `"area3"` or a community level `id`.
| call | result |
|---|---|
| `submitTime(levelId, ms, name?)` | `{ ok, rank, best, improved, queued? }`. `rank` is 0 when the time is outside the top 50. The board keeps one row per player (their best). `ms` must be between 500 and 10,800,000. `name`, if given and not yet this device's, is claimed first. With no name at all the result is `noname`. A time below `minTimeMs`, or with less than ms/5 of wall clock since `startRun(levelId)`, gives `implausible`. |
| `startRun(levelId)` | sync. The play screen calls it whenever a run (re)starts. |
| `minTimeMs(levelId)` | the fastest time `submitTime` accepts: half the AI route (areas: tools/routes, community: meta.frames), at least 500 ms |
| `getTop(levelId, n = 10)` | `{ ok, rows: [{ rank, name, ms, me }], me: { rank, ms } \| null, stale? }` |
| `ping()` | `{ ok }` |

## Where it is stored (`platyfy-online.js`)
- The data lives on the OofWorld relay `https://relay.platyfy.com`. That is the owner's own Cloudflare Worker and
  Durable Object, and it is already deployed.
- It uses the relay's published-games API: `POST /api/games`, `GET /api/games?q=`, `GET /api/games/<id>` and
  `DELETE /api/games/<id>`. All records are **private** and owned by one shared data account, `pf_datastore`
  (id `1d7249`), whose session token is embedded in the module.
  - A private record never appears in OofWorld's Games list.
  - Reading a private record without the token gives a 404.
- Each record is named by its key:
  | key | holds |
  |---|---|
  | `pfo:n:<lower name>` | a name |
  | `pfo:b:<board>` | a board (`ac-area1`, or `aclv:<id>` for a community level) |
  | `pfo:c:aclv` | the level index |
  | `pfo:i:aclv:<id>` | one level |
- There is no server-side compare-and-swap. Every write reads, merges, writes, then reads back and checks, with up to
  4 tries. If two first-writes race on the same key, they are merged into the oldest record and the duplicate is
  deleted. This was tested live with 3 simultaneous writers.
- Limits:
  - 50 rows per board
  - 60 levels in the index
  - 30000 bytes per level
- Everything the store returns is validated again before use, because the token is public.

## Tests
- `node tools/online-live-test.mjs` runs against the real relay, using a throwaway key prefix set through
  `globalThis.__PLATYFY_ONLINE_TEST = { prefix }`, and deletes everything it made.
- In a browser, set `window.__PLATYFY_ONLINE_TEST` (for example with puppeteer's `evaluateOnNewDocument`) before
  the game loads.
