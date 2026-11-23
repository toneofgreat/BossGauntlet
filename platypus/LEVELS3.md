# PLATYPUS — LEVELS3.md (binding spec for levels 12–13, names, leaderboards, Level 4 hard mode)

This is the only shared knowledge between the parallel builders of this round. Read CONTRACT.md (budget,
engine rules), LEVELS.md (level framework, `ctx`, player, worlds, input, UI, cinema, clean-up), LEVELS2.md
(health, checkpoints, vehicle, abilities, gear, army, HUD pieces, music, combat, potions, tribe, dream,
jungle, heli — ALL of it still applies and is not repeated here) and STORY3.md (the owner's brief,
binding) first. Where this file and STORY3.md disagree, STORY3.md wins; tell the lead.

Part A is the engine and online work (built first, by the engine builder, tested by
`node tools/playtest-engine3.cjs`). Part B is the contract of the new modules, built in parallel: build
yours to it exactly and call the others exactly as written. Part C is the storyboard of levels 12 and 13,
beat by beat. Part D is performance and the release order.

Rules for everything (unchanged): plain ES modules, vendored three.js, no assets, no build step, no new
CDN, no SDK; no per-frame allocations, canvas redraws or geometry rebuilds; InstancedMesh for anything
repeated; every file passes `node --check`; modules never touch the DOM and never add input listeners
(only `ui.js`, `hud.js`, `main.js`, `names-ui` code inside `ui.js` and `online.js`'s `fetch` do);
metres, +Y up, characters face +Z locally. Levels feature-detect NOTHING: every function named in Part B
must exist. Never change the behaviour of anything levels 1–11 use, except the two bug fixes in A0.

Tone (STORY.md / STORY2.md / STORY3.md): bloodless. The volcano boss cools to stone and crumbles into a
quiet mountain; the wolves yelp, flee and slink off into the trees; the robot babies are never hurt —
you only escape them (and they were never real). A child must always know what to do next: every beat
has an objective line, a world marker (`ui.setPing` / beacon) and a hint that appears after 20 s of no
progress and a stronger one after 45 s.

## File ownership

ENGINE (Part A; one builder): `index.html`, `src/main.js`, `src/ui.js`, `src/hud.js`, `src/progress.js`,
`src/services.js`, `src/game.js`, NEW `src/names.js`, NEW `src/online.js`, NEW `src/online-config.js`,
NEW `src/runtimer.js`, NEW `supabase/schema.sql`, NEW `supabase/SETUP.md`, `src/levels/level4.js` (hard
mode only), `src/levels/level11.js` (scream bug only), NEW `tools/playtest-engine3.cjs`.

One builder per file:

| file | what | shared key |
|---|---|---|
| `src/music.js` | EXTENSIONS (B1): four new states, two new motifs; change nothing that exists | `ctx.music` |
| `src/audio.js` | EXTENSIONS (B2): append only | `ctx.audio` |
| `src/platypus.js` | EXTENSIONS (B3): baby scale, sleep poses, robot skin, new tricks for hard mode | — |
| `src/fx.js` | EXTENSIONS (B4): lava, embers, ash, heat haze, portal, wind ribbons, sparks (≤ 8 extra draw calls) | `ctx.fx` |
| `src/volcano.js` | the volcano world, the dream shrine, Pip's lava cell, the crater arena (B5) | `"volcano"` |
| `src/magmor.js` | MAGMOR, the volcano boss (B6) | `"magmor"` |
| `src/winddance.js` | the wind duet and the flight home (B7) | `"winddance"` |
| `src/woods.js` | the dark woods and the wolves (B8) | `"woods"` |
| `src/farlands.js` | the restricted grove, the FAR LANDS PORTAL rock, the puzzle, the illusion (B9) | `"farlands"` |
| `src/babies.js` | Pip's babies: care, and the robot chase (B10) | `"babies"` |
| `src/house.js` | the platypus house and the building mechanic (B11) | `"house"` |
| `src/playtime.js` | the small games with Pip (morning / noon / night; level 13 morning) (B12) | `"playtime"` |
| `src/levels/level12.js`, `level13.js` | the levels (Part C). Create from `placeholder.js` style, export `meta` + `createLevel` | — |

Reused, read-only (call their existing API; ask the lead for any change): `"jungle"` (camp, river,
`setTime`), `"tribe"` (Burra, Tika, Rok, Nib, Moss, the instanced many, food), `"dream"`, `"potions"`
(the LIVING POTION), `"combat"` (the wolf AI may reuse its rival archetype, see B8), `"friend"` (Pip),
`"heli"` (not used), `getWizard(ctx)`. Always fetch through `ctx.shared(key, () => createX(ctx))`.

--------------------------------------------------------------------------------------------------

# Part A — engine and online (built first; release A0 straight away)

## A0. The two owner bugs (fix first, ship to platyfy.com alone, before anything else in this file)

1. **Scream stuck at the end of level 11.** Cause to look for: the scream slot's charge state is left
   `charging = true` (or `cooldown` never cleared) when the lesson's cinematic / `cinema.play` / a
   `checkpoint.respawn` / pointer-up outside the button interrupts the release, or the lesson disables
   the slot during the release frame. Fix, in `services.js` (abilities) and `level11.js`:
   - Release is accepted from ANY of: `keyup R`, `pointerup` / `pointercancel` / `lostpointercapture`
     on the scream button, `pointerup` anywhere on the window when the scream button owns the pointer,
     `blur` / `visibilitychange` (treated as a release with the current charge).
   - `abilities.cancel()`, `abilities.enable/disable`, `cinema.play` start and `checkpoint.respawn` all
     reset the scream to `idle` (charge 0, cooldown 0, button not pressed). A slot is never left in
     `charging` without a held input: every frame, `charging && !held("scream")` → release.
   - Level 11's last lesson re-arms the slot when its exercise starts and whenever `tries` changes, and
     its completion check counts screams via `abilities.onScream`, not via a one-shot flag.
   - Test (in `playtest-engine3.cjs`): in level 11 `skipTo("lesson-scream")` (use the existing name if
     it differs), press/release the scream 10 times by key, 10 by synthetic pointer on the button, 5 with
     pointer released outside the button, 3 interrupted by a respawn; every one must charge, fire, cool
     down and be ready again; the lesson must complete.
2. **Double-click / double-tap zoom.** In `index.html`: viewport
   `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`;
   `html, body, canvas, #ui { touch-action: none; -webkit-user-select: none; user-select: none;
   -webkit-touch-callout: none; }` (text inputs of A3 keep `user-select: text; touch-action: manipulation`);
   in `main.js`: `dblclick` → `preventDefault()` on `window` (capture, `passive: false`);
   `gesturestart/gesturechange` → `preventDefault()`; `touchend` within 300 ms of the previous one on the
   same spot → `preventDefault()` (except on inputs and buttons that need a click). Remove every
   camera "zoom on dblclick" / dbl-tap zoom path (grep `dblclick`, `detail === 2`, `zoomIn`) in all levels;
   wheel / pinch camera zoom, where a level has it, stays.

## A1. Thirteen levels

- `progress.js`: `LEVEL_COUNT = 13`; `beaten[13]`; saves of every older version load unchanged (missing
  entries false). `LIVE_RELEASED` stays 11 until 12 and 13 ship (then 12, then 13, one at a time).
- New fields in the same save key (all optional on load): `best: number[13]` (personal best ms per
  level, 0 = none), `l4wins: number`, `l4hardWins: number`, `l4bestCoins: number`, `l4bestHardCoins`.
  API: `progress.best(n)`, `progress.setBest(n, ms) -> bool (true if new PB)`, `progress.l4wins`,
  `progress.addL4Win(hard)`, `progress.l4hardUnlocked` (`l4wins >= 5`), `progress.setL4Coins(c, hard)`.
- Main screen: thirteen circles. Colours: 1 grey, 2–4 blue, 5 white, 6–8 green, 9–10 red, 11 gold,
  **12 lava orange `#ff6a1a`** (with a slow ember shimmer on the ring, CSS only), **13 deep purple
  `#8b4dff`** (with a faint star twinkle, CSS only). Layout: one row at ≥ 1280 wide (circles shrink to fit,
  min 56 px), 7 + 6 on tablets / landscape phones, 5 + 4 + 4 on a portrait phone.
- `meta.title`: 12 "THE VOLCANO", 13 "THE FAR LANDS". Level 13's win shows "TO BE CONTINUED…" on the
  end card instead of the normal "LEVEL COMPLETE" subtitle, then the main screen.
- Main screen additions (A3, A5): a NAME button (top-left, shows the current name, "✎"), a TROPHY button
  (top-right, "Leaderboards"). Both are 48 px+ touch targets, keyboard-focusable, and never cover a circle.

## A2. The run timer — `ctx.runTimer` (`src/runtimer.js`)

```js
runTimer.start(level)        // engine: when the title card finishes and control is first given
runTimer.stop() -> ms        // engine: inside win(), before the end card
runTimer.pause(); runTimer.resume()   // engine: pause menu, tab hidden, focus lost
runTimer.ms                  // elapsed (int ms), real time, excludes paused time
runTimer.assisted            // true once any debug seam (skipTo, tp, unlockAll, win, startLevel at a beat) was used
runTimer.hard                // level 4 hard mode run
```

- Counts real unpaused wall time (`performance.now` deltas, clamped to 0.25 s per frame so a stall never
  adds a jump) from start to win; restarts from checkpoints do NOT reset it (deaths cost time). Leaving
  the level discards the run. Cutscenes count (they are the same for everyone) but every cutscene of
  levels 1–13 must be skippable after it has been seen once (`cinema.play` already supports skip; the
  engine passes `skippable: progress.isBeaten(n)`).
- HUD (`hud.js`): top centre, small, monospace digits, `1:23.45`, under it `PB 1:20.02` (dim) when a PB
  exists. Hidden in level 4 (it shows coins instead). A setting "Show timer" (on by default) in the pause
  menu.
- On win: end card shows `TIME 1:23.45`, `NEW BEST!` (gold, `audio.coin` sparkle + `music.stinger
  ("discover")`) when it is a PB, and — online — `#37 in the world` once `online.submitTime` answers
  (a spinner until then; nothing at all if offline). An assisted run shows `(practice — not saved)` and is
  neither saved as PB nor submitted.

## A3. Names — `src/names.js` (pure, no DOM) + the name dialog in `ui.js`

```js
import { checkName, normalizeName, NAME_MIN, NAME_MAX } from "./names.js";
checkName(raw) -> { ok: true, name } | { ok: false, reason: "short" | "long" | "chars" | "rude" | "letters" }
normalizeName(raw) -> string    // the folded form used for the filter (NOT for uniqueness)
```

Rules: trim, collapse inner whitespace to one space; 3–16 characters; allowed `A–Z a–z 0–9 space _ -`;
at least two letters; not only digits. Displayed exactly as typed. Uniqueness key = `lower(name)`.

Profanity filter (strong; same algorithm in JS and SQL, the same word list in both):
1. Lower-case, strip diacritics (`NFKD` + drop combining marks).
2. Leet / look-alike map: `0→o 1→i 2→z 3→e 4→a 5→s 6→g 7→t 8→b 9→g @→a $→s !→i |→l +→t €→e £→l ¥→y`,
   `ph→f`, `vv→w`, `ck→k`, `q→k` (applied to a second copy, both copies are tested).
3. Remove everything that is not a–z (so `f u c k`, `f.u.c.k`, `f_u-c_k` fold together).
4. Collapse runs of the same letter to one (`fuuuuck → fuck`); also test the copy collapsed to two.
5. Remove allow-listed innocent words first (`class grass glass pass assist bass bassoon cocktail
   scunthorpe shitake hancock dickens peacock cockatoo sussex assume`… ≥ 40 entries, in the list file),
   then reject if ANY banned stem occurs as a substring.
- The banned list covers English plus Spanish, Portuguese, French, German, Italian, Dutch, Polish,
  Russian (transliterated), Turkish, Indonesian, Tagalog and Hindi (transliterated): sexual terms, slurs
  (ethnic, homophobic, ableist), excrement, "kys"/self-harm, Nazi terms, plus "admin", "moderator",
  "roblox", "platyfy", "official" (impersonation). ≥ 400 stems. It is stored in `names.js` as ROT13
  strings (keeps the source clean to read) and the exact same list is seeded into `banned_words` by
  `schema.sql` (in plain text there — the SQL editor is the owner's).
- Tests in `playtest-engine3.cjs`: 60 bad names (leet, spaced, repeated, mixed case, embedded:
  `xXfUcKXx`, `sh1t`, `a s s`, `n1gg`…) all rejected; 60 good names (`Bass Player`, `Classy Pip`,
  `Cassie`, `Grass_Kid`, `Dickens`, `Peacock7`…) all accepted.

The name dialog (`ui.openNameDialog()`; opened by the NAME button any time on the main screen, and once
automatically before the first leaderboard submission if the player has no name):
- A modal card, one text input (`maxlength 16`, `autocomplete off`, `spellcheck false`,
  `enterkeyhint done`), a live hint line under it, buttons SAVE and CANCEL, and a 🎲 button that
  suggests a random name built from two safe word lists (`Brave` + `Otter` + 2 digits).
- Live check on every keystroke: `checkName` → hint ("3 to 16 letters", "Only letters, numbers, - and _",
  "Let's pick a kinder name"). On SAVE online: `online.claimName` or `online.rename` → `taken` shows
  "Someone already has that name — try another" (also for names that were used before by anyone, even
  if they renamed); `rude` from the server shows the kind message; network failure saves locally and
  shows "Saved on this device — we'll try again later".
- Offline (no config): the name is saved locally (`platypus.name.v1`) and shown; uniqueness cannot be
  checked, which is fine; the first time the game goes online the stored name is claimed, and if it is
  taken the dialog opens with "That name is taken now — pick a new one".
- Input focus disables game keys (the engine's key handler ignores events whose target is an input).

## A4. Online — `src/online-config.js` and `src/online.js`

```js
// src/online-config.js (the owner fills these in; see supabase/SETUP.md)
export const SUPABASE_URL = "";      // "https://xxxx.supabase.co"
export const SUPABASE_ANON_KEY = ""; // the public anon key
```

```js
import { createOnline } from "./online.js";   // created once by main.js as ctx.online
online.enabled            // false when URL or key is empty → every call resolves { ok: false, offline: true }
online.name               // current name (local copy) or ""
online.id                 // server player id (uuid) or ""
online.ready() -> Promise<void>                       // loads/creates the identity; never rejects
online.claimName(name) -> Promise<{ ok, name?, reason?: "taken"|"rude"|"invalid"|"network"|"offline" }>
online.rename(name)    -> same shape
online.startRun(level, hard=false) -> Promise<{ ok, runId? }>
online.submitTime(level, ms) -> Promise<{ ok, rank?, best?, reason? }>        // uses the run id from startRun
online.submitCoins(coins, hard) -> Promise<{ ok, rank?, best?, reason? }>
online.topTimes(level) -> Promise<{ ok, rows: [{ rank, name, ms }], me?: { rank, ms } }>
online.topCoins() -> Promise<{ ok, rows: [{ rank, name, coins, hard }], me?: { rank, coins, hard } }>
```

- Identity: on first use, a 32-byte random token (`crypto.getRandomValues`, hex, 64 chars) is stored in
  `localStorage["platypus.online.v1"] = { token, id, name }`. It is the player's only secret; the server
  stores `sha256(token)` and never the token. Losing site data = a new player (documented in SETUP.md).
  The token is sent only in RPC bodies (POST JSON), never in a URL.
- Transport: `fetch(SUPABASE_URL + "/rest/v1/rpc/<fn>", { method: "POST", headers: { apikey, Authorization:
  "Bearer " + anon, "Content-Type": "application/json" }, body })` for RPCs; `GET /rest/v1/<view>?select=…
  &level=eq.N&order=rank.asc&limit=100` for boards. 8 s timeout (`AbortController`), one retry after 1.5 s
  for network errors, never for 4xx. Every promise resolves; nothing ever throws or rejects; every
  failure is `{ ok: false, reason }`; nothing is logged louder than `console.debug`.
- `startRun` is called by the engine at `runTimer.start` (fire and forget; when it fails the run simply
  isn't submittable). `submitTime` is called by the engine on a non-assisted win for levels ≠ 4;
  `submitCoins` on every level-4 win with the run's final coins. Pending submissions (network down) are
  queued in localStorage (max 20) and retried on the next `ready()`; the server rejects stale ones by
  run age (A6), which is fine.
- No calls at all while `online.enabled` is false.

## A5. Leaderboards UI (`ui.openBoards(level?)`)

- Opened by the TROPHY button on the main screen (and "See leaderboard" on a level's end card, which
  opens that level's tab).
- A full-screen panel (dims the menu), title "LEADERBOARDS", a row of tabs: `1 2 3 🪙4 5 6 7 8 9 10 11 12
  13` (each tab tinted with its level colour; scrolls horizontally on phones; arrow keys move between
  tabs). Speedrun tabs: columns `#`, `NAME`, `TIME` (`m:ss.cc`); coins tab: `#`, `NAME`, `COINS`, and a
  small red `HARD` badge on hard-mode entries. Top 3 rows get gold / silver / bronze rank discs.
- The player's own row is highlighted; when they are outside the top 100 a pinned row at the bottom shows
  `#412 You 4:10.33`. Under the table: "Your best: 1:20.02" from local progress (works offline too).
- Loading: skeleton rows; cached per tab for 60 s. Empty board: "No times yet — be the first!".
- Offline (`!online.enabled`): every tab shows the personal best and a friendly card "Leaderboards
  coming soon" with a small platypus — no error, no spinner forever. Network error: "Couldn't load —
  try again" + a retry button.
- Level 4 has no time tab; the coins board shows BEST COINS IN ONE SHOW per player (normal or hard,
  whichever is higher; the badge says which).

## A6. `supabase/schema.sql` (exact; idempotent; paste-and-run in the SQL editor)

```sql
-- PLATYPUS online: names + leaderboards. Safe to run more than once.
create extension if not exists pgcrypto;

-- ---------- tables ----------
create table if not exists public.players (
  id          uuid primary key default gen_random_uuid(),
  token_hash  bytea not null unique,
  name        text,
  created_at  timestamptz not null default now(),
  renamed_at  timestamptz
);
create unique index if not exists players_name_lower_uq on public.players (lower(name)) where name is not null;

-- every name ever claimed, forever (a rename never frees the old one)
create table if not exists public.names_ever (
  lname       text primary key,                      -- lower(name)
  player_id   uuid not null references public.players(id) on delete cascade,
  claimed_at  timestamptz not null default now()
);

create table if not exists public.banned_words (word text primary key);
create table if not exists public.allowed_words (word text primary key);

create table if not exists public.runs (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.players(id) on delete cascade,
  level       int  not null check (level between 1 and 13),
  hard        boolean not null default false,
  started_at  timestamptz not null default now(),
  used        boolean not null default false
);
create index if not exists runs_player_idx on public.runs (player_id, started_at desc);

create table if not exists public.times (
  player_id   uuid not null references public.players(id) on delete cascade,
  level       int  not null check (level between 1 and 13 and level <> 4),
  ms          int  not null check (ms > 0),
  at          timestamptz not null default now(),
  primary key (player_id, level)                    -- best time only
);
create index if not exists times_level_ms_idx on public.times (level, ms, at);

create table if not exists public.coins (
  player_id   uuid primary key references public.players(id) on delete cascade,
  coins       int  not null check (coins >= 0),
  hard        boolean not null default false,
  at          timestamptz not null default now()
);
create index if not exists coins_coins_idx on public.coins (coins desc, at);

-- per-level plausibility: fastest possible human time (ms) and a cap. Tuned at release (D2).
create table if not exists public.level_rules (
  level   int primary key,
  min_ms  int not null,
  max_ms  int not null default 10800000             -- 3 hours
);
insert into public.level_rules (level, min_ms) values
  (1, 45000), (2, 60000), (3, 60000), (5, 90000), (6, 120000), (7, 180000),
  (8, 150000), (9, 200000), (10, 240000), (11, 300000), (12, 360000), (13, 420000)
on conflict (level) do nothing;

create table if not exists public.coin_rules (hard boolean primary key, max_coins int not null, min_ms int not null);
insert into public.coin_rules values (false, 700, 150000), (true, 2600, 150000) on conflict do nothing;

-- ---------- RLS: the anon key can only READ the views; every write goes through the functions ----------
alter table public.players       enable row level security;
alter table public.names_ever    enable row level security;
alter table public.banned_words  enable row level security;
alter table public.allowed_words enable row level security;
alter table public.runs          enable row level security;
alter table public.times         enable row level security;
alter table public.coins         enable row level security;
alter table public.level_rules   enable row level security;
alter table public.coin_rules    enable row level security;
-- (no policies = no direct access for anon/authenticated)
revoke all on public.players, public.names_ever, public.banned_words, public.allowed_words,
  public.runs, public.times, public.coins, public.level_rules, public.coin_rules from anon, authenticated;

-- ---------- helpers ----------
create or replace function public.platy_fold(t text, leet boolean) returns text
language sql immutable as $$
  select regexp_replace(
           case when leet then
             replace(replace(replace(replace(
               translate(lower(t), '0123456789@$!|+€£¥', 'oizeasgtbgasiltely'),
               'ph','f'),'vv','w'),'ck','k'),'q','k')
           else lower(t) end,
         '[^a-z]', '', 'g')
$$;
-- strip diacritics without the unaccent extension (the server never trusts a client-folded copy)
create or replace function public.platy_deaccent(t text) returns text
language sql immutable as $$
  select translate(t, 'áàâäãåāéèêëēíìîïīóòôöõøōúùûüūýÿñçßÁÀÂÄÃÅĀÉÈÊËĒÍÌÎÏĪÓÒÔÖÕØŌÚÙÛÜŪÝÑÇ',
                      'aaaaaaaeeeeeiiiiiooooooouuuuuyyncsaaaaaaaeeeeeiiiiiooooooouuuuuync')
$$;

create or replace function public.platy_name_ok(n text) returns text   -- null = ok, else the reason
language plpgsql stable security definer set search_path = public as $$
declare v text; c text; w text; forms text[];
begin
  if n is null then return 'invalid'; end if;
  n := regexp_replace(btrim(n), '\s+', ' ', 'g');
  if char_length(n) < 3 or char_length(n) > 16 then return 'invalid'; end if;
  if n !~ '^[A-Za-z0-9 _-]+$' then return 'invalid'; end if;
  if (select count(*) from regexp_matches(n, '[A-Za-z]', 'g')) < 2 then return 'invalid'; end if;
  v := platy_deaccent(n);
  forms := array[ platy_fold(v, false), platy_fold(v, true) ];
  forms := forms || array[ regexp_replace(forms[1], '(.)\1+', '\1', 'g'), regexp_replace(forms[2], '(.)\1+', '\1', 'g'),
                           regexp_replace(forms[1], '(.)\1\1+', '\1\1', 'g'), regexp_replace(forms[2], '(.)\1\1+', '\1\1', 'g') ];
  foreach c in array forms loop
    for w in select word from allowed_words loop c := replace(c, w, ''); end loop;
    if exists (select 1 from banned_words b where position(b.word in c) > 0) then return 'rude'; end if;
  end loop;
  return null;
end $$;

create or replace function public.platy_player(p_token text) returns uuid
language sql stable security definer set search_path = public as $$
  select id from players where token_hash = digest(p_token, 'sha256')
$$;

-- ---------- RPCs (the only way in) ----------
-- claim_name: creates the player on first call (token never seen before) and claims a never-used name.
create or replace function public.claim_name(p_token text, p_name text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; why text; nm text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  nm := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  why := platy_name_ok(nm);
  if why is not null then return json_build_object('ok', false, 'reason', why); end if;
  pid := platy_player(p_token);
  if pid is null then
    insert into players (token_hash) values (digest(p_token, 'sha256')) returning id into pid;
  elsif (select name from players where id = pid) is not null then
    return rename_player(p_token, nm);
  end if;
  begin
    insert into names_ever (lname, player_id) values (lower(nm), pid);
  exception when unique_violation then
    return json_build_object('ok', false, 'reason', 'taken', 'id', pid);
  end;
  update players set name = nm where id = pid;
  return json_build_object('ok', true, 'id', pid, 'name', nm);
end $$;

-- rename_player: a new never-used name; the old one stays in names_ever forever. Max one rename per 30 s.
create or replace function public.rename_player(p_token text, p_name text) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; why text; nm text; last timestamptz;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  nm := regexp_replace(btrim(p_name), '\s+', ' ', 'g');
  why := platy_name_ok(nm);
  if why is not null then return json_build_object('ok', false, 'reason', why); end if;
  if exists (select 1 from names_ever where lname = lower(nm) and player_id = pid)
     and lower(nm) = lower(coalesce((select name from players where id = pid), '')) then
    update players set name = nm where id = pid;               -- only the capitals changed
    return json_build_object('ok', true, 'id', pid, 'name', nm);
  end if;
  select renamed_at into last from players where id = pid;
  if last is not null and last > now() - interval '30 seconds' then return json_build_object('ok', false, 'reason', 'slow'); end if;
  begin
    insert into names_ever (lname, player_id) values (lower(nm), pid);
  exception when unique_violation then
    return json_build_object('ok', false, 'reason', 'taken');
  end;
  update players set name = nm, renamed_at = now() where id = pid;
  return json_build_object('ok', true, 'id', pid, 'name', nm);
end $$;

-- start_run: a server timestamp the time must fit inside. Max 30 runs a minute per player.
create or replace function public.start_run(p_token text, p_level int, p_hard boolean default false) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; rid uuid;
begin
  pid := platy_player(p_token);
  if pid is null or p_level not between 1 and 13 then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  if (select count(*) from runs where player_id = pid and started_at > now() - interval '1 minute') >= 30 then
    return json_build_object('ok', false, 'reason', 'slow'); end if;
  delete from runs where player_id = pid and started_at < now() - interval '1 day';
  insert into runs (player_id, level, hard) values (pid, p_level, p_level = 4 and coalesce(p_hard, false)) returning id into rid;
  return json_build_object('ok', true, 'run', rid);
end $$;

-- submit_time: plausible (>= min_ms, <= max_ms) AND not faster than the real time since start_run (+2 s slack).
create or replace function public.submit_time(p_token text, p_run uuid, p_ms int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; r runs; rule level_rules; best int; rk int;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  if (select name from players where id = pid) is null then return json_build_object('ok', false, 'reason', 'noname'); end if;
  select * into r from runs where id = p_run and player_id = pid for update;
  if not found or r.used or r.level = 4 then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  select * into rule from level_rules where level = r.level;
  if p_ms is null or p_ms < rule.min_ms or p_ms > rule.max_ms then return json_build_object('ok', false, 'reason', 'implausible'); end if;
  if p_ms > extract(epoch from (now() - r.started_at)) * 1000 + 2000 then return json_build_object('ok', false, 'reason', 'implausible'); end if;
  update runs set used = true where id = r.id;
  insert into times (player_id, level, ms) values (pid, r.level, p_ms)
    on conflict (player_id, level) do update set ms = excluded.ms, at = now() where times.ms > excluded.ms;
  select ms into best from times where player_id = pid and level = r.level;
  select count(*) + 1 into rk from times where level = r.level and (ms < best);
  return json_build_object('ok', true, 'best', best, 'rank', rk);
end $$;

-- submit_coins: level 4 only; capped per mode; the show must have lasted min_ms since start_run.
create or replace function public.submit_coins(p_token text, p_run uuid, p_coins int) returns json
language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; r runs; rule coin_rules; cur coins; rk int;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  if (select name from players where id = pid) is null then return json_build_object('ok', false, 'reason', 'noname'); end if;
  select * into r from runs where id = p_run and player_id = pid for update;
  if not found or r.used or r.level <> 4 then return json_build_object('ok', false, 'reason', 'invalid'); end if;
  select * into rule from coin_rules where hard = r.hard;
  if p_coins is null or p_coins < 0 or p_coins > rule.max_coins
     or now() - r.started_at < make_interval(secs => rule.min_ms / 1000.0) then
    return json_build_object('ok', false, 'reason', 'implausible'); end if;
  update runs set used = true where id = r.id;
  insert into coins (player_id, coins, hard) values (pid, p_coins, r.hard)
    on conflict (player_id) do update set coins = excluded.coins, hard = excluded.hard, at = now() where coins.coins < excluded.coins;
  select * into cur from coins where player_id = pid;
  select count(*) + 1 into rk from coins where coins > cur.coins;
  return json_build_object('ok', true, 'best', cur.coins, 'rank', rk);
end $$;

-- my_rank: the pinned "you" row for a board (level 4 = coins)
create or replace function public.my_rank(p_token text, p_level int) returns json
language plpgsql stable security definer set search_path = public as $$
declare pid uuid; v int; rk int; h boolean;
begin
  pid := platy_player(p_token);
  if pid is null then return json_build_object('ok', false); end if;
  if p_level = 4 then
    select coins, hard into v, h from coins where player_id = pid;
    if v is null then return json_build_object('ok', true); end if;
    select count(*) + 1 into rk from coins where coins > v;
    return json_build_object('ok', true, 'rank', rk, 'coins', v, 'hard', h);
  end if;
  select ms into v from times where player_id = pid and level = p_level;
  if v is null then return json_build_object('ok', true); end if;
  select count(*) + 1 into rk from times where level = p_level and ms < v;
  return json_build_object('ok', true, 'rank', rk, 'ms', v);
end $$;

-- ---------- top-100 views (read by anon; names only, never ids or hashes) ----------
create or replace view public.top_times with (security_invoker = false) as
  select level, rank, name, ms from (
    select t.level, rank() over (partition by t.level order by t.ms, t.at) as rank, p.name, t.ms
    from times t join players p on p.id = t.player_id where p.name is not null
  ) s where rank <= 100;

create or replace view public.top_coins with (security_invoker = false) as
  select rank, name, coins, hard from (
    select rank() over (order by c.coins desc, c.at) as rank, p.name, c.coins, c.hard
    from coins c join players p on p.id = c.player_id where p.name is not null
  ) s where rank <= 100;

grant select on public.top_times, public.top_coins to anon, authenticated;
revoke all on function public.platy_name_ok(text), public.platy_player(text) from anon, authenticated, public;
grant execute on function public.claim_name(text, text), public.rename_player(text, text),
  public.start_run(text, int, boolean), public.submit_time(text, uuid, int),
  public.submit_coins(text, uuid, int), public.my_rank(text, int) to anon, authenticated;

-- ---------- word lists (the same lists as src/names.js; extend freely) ----------
insert into public.allowed_words (word) values ('class'), ('grass'), ('glass'), ('pass'), ('assist'), ('bass') /* … full list */
on conflict do nothing;
insert into public.banned_words (word) values ('fuck') /* … full list, folded form, ≥ 400 */
on conflict do nothing;
```

Notes binding on the SQL: the full word lists are generated from `names.js` by a small script
`tools/gen-wordlists.cjs` (decodes ROT13, folds each entry with the same algorithm, writes the two
`insert` statements into schema.sql between `-- BEGIN WORDS` / `-- END WORDS` markers) so client and
server can never drift. The leet `translate` mapping in SQL must equal the JS map character for
character (a test in `playtest-engine3.cjs` folds 200 strings with a JS port of the SQL and compares).
`security definer` functions all `set search_path = public`. No function returns the token hash or ids
of other players. `SETUP.md`: create project → SQL editor → paste schema.sql → Run → Settings → API →
copy Project URL and anon public key into `src/online-config.js` → push; with screenshots described in
words, child-simple, plus "how to remove a rude name by hand" (`update players set name = null where
lower(name) = '...'` — the name stays in names_ever, so it can never be taken again).

## A7. Level 4 hard mode (`level4.js`, `ui.js`)

- Unlock: `progress.l4wins >= 5` (normal wins; counting starts with this release — wins before it count
  as 1 if `beaten[3]`). The 5th win's end card shows "HARD MODE UNLOCKED 🔥" with a stinger.
- Choice: clicking circle 4 when hard is unlocked shows two buttons on the circle's swell: `NORMAL` and
  `HARD 🔥` (keyboard 1/2, Esc closes). Circle 4 gets a small flame badge. `startLevel(4, { hard: true })`.
  The level reads `ctx.levelOpts.hard`.
- What changes in hard (normal mode is untouched, byte-for-byte behaviour):
  - **Faster lane:** the note lane at the bottom ("the normal thing") scrolls at 2.2× (note lead time
    1.8 s → 0.8 s), the song runs at 1.25× tempo (music `bpm` of the show state × 1.25; pitch preserved
    by the score generator, i.e. re-scheduled not resampled), hit windows stay the same in ms
    (perfect ±60, good ±120).
  - **More buttons:** 8 trick buttons instead of 4: the four of normal plus `spin`, `flip`, `splash`,
    `wave` (B3 adds the four animations to the player and Pip). Keys `1–8` and the existing keys for 1–4;
    each button shows its key.
  - **Buttons all over the screen, fixed:** `ui.setTricks(list, { layout: "scatter" })` places the 8
    buttons at fixed screen fractions (they never move during the show): `(0.12,0.30) (0.88,0.30)
    (0.22,0.55) (0.78,0.55) (0.35,0.22) (0.65,0.22) (0.08,0.72) (0.92,0.72)` of the safe area, clamped to
    keep 56 px buttons inside, never over the lane, the coin counter or the centre 30% where the pool
    show is. Each lane note is coloured and labelled like its button; the button flashes ("want") as its
    note approaches, as in normal.
  - Charts: hard charts per act are generated from the normal charts with the extra lanes interleaved
    (deterministic, seeded), ≥ 1.6× the notes, never two notes closer than 0.18 s, never two notes on
    the same beat for touch; Pip's duet keeps call-and-response.
  - **More coins:** each hit pays ×3, a perfect ×4, the combo multiplier caps at ×5 (normal ×3), the
    finale coin rain doubles. Target: a perfect hard show ≈ 2200 coins (cap in `coin_rules` 2600), a
    perfect normal show ≈ 550 (cap 700). The L4 builder measures both and updates `coin_rules` + this
    line at release.
  - Missing in hard costs excitement 1.5× faster; a failed show replays the act (as normal) — no game over.
- Coins go to `progress.setL4Coins` and `online.submitCoins(coins, hard)`; the board marks `HARD`.

## A8. Global "ultracode" polish (engine builder; small, safe, measured)

Realism, sound and feel improvements that apply to all levels without changing any level's logic:
- Renderer: ACES tone mapping exposure per world kept; add a cheap screen-space vignette + film grain
  (one fullscreen pass merged into the existing final pass, ≤ 0.3 ms on UHD 620), and soft contact
  shadows (blob decals already used) under every character that lacks one.
- Camera: a gentle spring follow with look-ahead in the move direction, landing dip, and no zoom on
  double click (A0).
- Audio: footstep variety (4 variants per surface, ±6% pitch, never the same twice in a row), a light
  room reverb send per world kind (`open`, `forest`, `cave`, `dream`), UI clicks for every menu button.
- Input: buffered jump (0.12 s) and coyote time (0.1 s) for every level that has a jump; held keys are
  released on blur.
Each item has a settings toggle only if it costs > 0.2 ms. Nothing here may change a level's timing.

--------------------------------------------------------------------------------------------------

# Part B — new modules (contracts)

Every world module follows the LEVELS.md A4b world interface (`name`, `group`, `P`, `colliders`,
`confine`, `env`, `heightAt`, `surfaceAt`, `waterAt`, `update(dt)`, `enter()`, `exit()`, `dispose()`)
and the LEVELS2.md conventions (`sight`, `hidden`, `lit`, `cover`). Points in `P` are `{ x, z, yaw? }`.

## B1. `src/music.js` — EXTENSIONS

New states (all 4/4, home pitch D unless stated, ≥ 16-bar forms, same layering rules):

| state | bpm | key | character | layers 0 → 1 |
|---|---|---|---|---|
| `volcano` | 88 | D phrygian | approach: low drone, hand drum heartbeat, distant rumbles in time, duduk-like lead | drone → + drum → + bass ostinato → + lead → + choir |
| `inferno` | 168 | D phrygian → E phrygian | MAGMOR: taiko, anvils, distorted low brass, choir, organ; phase 1 half-time, 2 full, 3 double-time hats + key lift | as `boss`, harder; `setPhase(0..2)` |
| `wind` | 120 | D lydian | the wind duet / flight home: airy pads, plucked arps, pipe lead, claps on 2/4 that the duet notes sit on | pad → + arp → + kick → + lead → + strings |
| `woods` | 92 | D minor | the dark woods: low strings col legno, owl-like flute, sparse; becomes `combat` for wolves | pad → + ticks → + pizz → + swell → + drum |
| `farlands` | 70 | F♯ lydian over D, slightly detuned | the illusion: everything as `chill` but the tuning drifts 8–15 cents and the reverb is too long | as chill; at intensity 1 a reversed cymbal every 8 bars |
| `lullaby` | 60 | D major | bedtime: music box + soft pad, Pip's theme, the house theme | box → + pad → + cello → + glock |
| `build` | 104 | D major | building the house: marimba, woodblocks, whistle, a hammer that lands on beat 1 | marimba → + bass → + perc → + whistle |
| `chase` | 150 | D minor | robot babies: synth arps, glitchy toy-piano version of Pip's theme, 808 kick | arp → + kick → + bass → + glitch lead → + risers |

New motifs: `"magmor"` `1 . ♭2 . | ♭5 . 4 ♭3 | 1 . . .` (low brass + anvil), `"home"` `1 5 6 5 | 3 . 2 3 |
1 . . .` (the house theme, warm). New stingers: `"eruption"`, `"illusion"` (a tape-stop + reverse swell,
≤ 2 s), `"babies"`, `"glitch"`. `music.setDetune(cents, seconds)` (used by `farlands`; 0 restores).

## B2. `src/audio.js` — EXTENSIONS (all procedural, through the existing buses)

`lavaBubble(x,z)`, `lavaAmbience(level 0..1)` (a looped crackle/hiss bed + low roar), `eruption(x,z,size)`
(sub boom + debris rattle), `rockCrack()`, `rockGrind(level)`, `magmorRoar(size)`, `magmorStep()`,
`spellChime(i)` (i = rune 0..4, ascending), `dreamWake()`, `windGust(level)`, `windWhoosh(pan)`,
`flightRush(level)`, `campFire(level)`, `eatCrunch()`, `splashSmall()`, `firefly()`, `owl()`,
`cricketNight(level)`, `forestNight(level)`, `wolfHowl(x,z,n)`, `wolfGrowl()`, `wolfBark()`, `wolfYelp()`,
`pawRun(level)`, `stoneTurn()`, `runeHum(i,on)`, `portalHum(level)`, `portalOpen()`, `portalKnock()`,
`babyChirp(i)`, `babyCry(i)`, `robotServo()`, `robotLaser()`, `robotBeep(i)`, `rocketBurst()`,
`hammer(material)`, `sawWood()`, `placeLog()`, `placeStone()`, `thatchRustle()`, `snore(who)`,
`morningBirds(level)`, `clockTick()`. Each ≤ 12 voices, nodes released after use, all `level` beds have
`x.stop()` via the existing bed handle convention.

## B3. `src/platypus.js` — EXTENSIONS

- `createPlatypus({ scale })` already exists; babies use `scale: 0.42` plus `opts.baby = true` (bigger head
  ratio 1.25, shorter bill, higher-pitched chirps via the caller). `p.setRobot(k 0..1)`: blends in a
  metal panel shader (brushed grey with seams), glowing cyan eyes and a tiny back antenna (one extra
  child mesh), all in the same draw call as the body (uniform + vertex attribute mask).
- Poses: `"sleep"` (curled, tail over bill, breathing), `"sleepSide"`, `"wake"` (stretch + yawn),
  `"cuddle"` (for two platypuses side by side), `"cast"` (front paws up, for the dream spell),
  `"carry"` (logs/stones on the back).
- Tricks for hard mode and the wind duet: `spin`, `flip`, `splash`, `wave` (plus existing ones). Pip
  (`friend`) gets the same four.

## B4. `src/fx.js` — EXTENSIONS (pooled; ≤ 8 extra draw calls in total)

`lava(mesh, opts)` — a material helper: flowing lava (scrolling noise, crust cracks, emissive pulse, heat
falloff) any world can put on its own meshes. `embers(on, x,z, radius)` (instanced, 600 max),
`ashFall(on, density)`, `heatHaze(on, strength)` (one screen pass, merged into the A8 pass),
`lavaSplash(x,y,z,size)`, `rockDebris(x,y,z,n)`, `windRibbons(on, dirX, dirZ)` (instanced ribbon strips
around the player), `portalSwirl(obj, on, k)` (shader on a disc), `sparks(x,y,z,n,hex)`, `laserLine(id,
x0,y0,z0,x1,y1,z1, on)` (8 pooled beams), `fireflies(on, x,z, radius, n)`, `dustMotes(on)`.

## B5. `src/volcano.js` — the volcano

`createVolcano(ctx) -> world` (key `"volcano"`, `name: "volcano"`, `env.dark` per scene). Scenes via
`setScene(name)` (behind black):
- `"slope"`: a black-basalt mountain rising 180 m (far mesh + walkable lower flank), ash sky with an orange
  underglow, lava rivers (fx.lava) in channels, steam vents, the path up `P.path[0..n]`. Points `spawn`
  (the landing spot after the trip), `shrine` (the DREAM SHRINE: a ring of five obsidian runestones
  `runes[0..4]` around a flat warm stone, `bed` on it), `camSlope`, `camShrine`.
- `"cell"`: the crater rim at the top, Pip's cage hanging on chains over the lava lake (`P.cage`, the
  cage `cage.open(seconds)`, `cage.lower(k)`), `P.rim`, `P.cageWalk` (a narrow stone bridge that rises
  when the boss is beaten).
- `"arena"`: the crater floor: a lava lake r 40 with 7 basalt islands `islands[0..6] {x,z,r,y, sink(k),
  raise(k)}`, connected by crust bridges `bridges[i].crack(seconds)`, rising lava `setLava(y, seconds)`,
  `lavaY`, walkable test `heightAt` honours sinking islands; `surfaceAt` returns `"lava"` on lava (the
  level kills on it: `ctx.health.kill({kind:"fall"})`). Updrafts `updrafts[0..3] {x,z,r, on}` (for the
  wind in phase 3). Cameras `camArena`, `camBoss`.
- `"cool"`: the same crater after the fight: crust grey, steam, morning light, the lava gone dark.
Methods: `setGlow(0..1, s)`, `quake(strength, seconds)` (camera shake + `rockGrind`), `erupt(x, z, size)`
(fx + audio + falling `bombs` that `ctx.level` can damage with — `bombs.onLand = (x,z,r) => …`),
`runes.light(i, on)`, `runes.lit` (bitmask). Budget: ≤ 30 draw calls, ≤ 110k tris for any scene.

## B6. `src/magmor.js` — MAGMOR, the heart of the mountain (INSANE)

`createMagmor(ctx, volcano) -> boss` (key `"magmor"`). A colossal lava golem rising from the lake: 38 m
tall when standing, arms 20 m long, a cracked basalt hide over glowing magma, a molten CORE in the chest
(`core`, opens only when stunned), four knuckle CRYSTALS (`crystals[0..3]`, one per hand/forearm side),
skinned with ≤ 22 bones, ≤ 40k tris, 3 draw calls (body, glow, rocks). It never walks onto the islands;
it stands in the lake and reaches.

```js
boss.start(phase 0|1|2); boss.stop(); boss.reset(phase)
boss.phase, boss.hp (0..1 per phase), boss.stunned, boss.defeated
boss.hit(part "crystal"|"core", i, power) -> bool
boss.onPhase = null; boss.onDefeat = null; boss.onAttack = null // (name, x, z, t)
boss.update(dt)
boss.coolDown(seconds)   // the ending: magma darkens to stone, it slowly settles and crumbles (bloodless)
```

Phases (each its own checkpoint; telegraphs ≥ 0.8 s with `fx.dangerZone` + sound + its eyes flaring):
1. **FISTS** (hp: 4 crystals): SLAM (a fist falls on your island, r 5 circle), SWEEP (an arm drags across a
   line, jump it), GRAB (a hand closes on an island; run). After a slam the fist rests 2.5 s: a crystal
   glows — Tail Slap ×3 or 2 Stings shatter it (`fx.glassShards`, orange). 4 crystals → stunned, roars.
2. **ERUPTION** (hp: 3 vents): the lava rises in steps (`setLava`), islands sink (only 4 stay up), lava
   bombs rain (`erupt`), lava WAVES roll from it (jump), and it spits fireballs at you (strafe). Three
   vents on its shoulders open in turn: throw the potion (Q) into an open vent to plug it with frost
   (the potion slot is refilled by glowing ice flowers that grow on the islands). 3 plugged → it
   staggers, the core cracks.
3. **CORE** (hp: the core, 3 screams): the crater wall collapses, islands become a ring; it reaches for
   you with both hands at once, the screen shakes constantly, `inferno` at full. Updrafts appear: stand in
   one and jump → you are lifted (vehicle-like glide via `ctx.vehicle` with a wind glider, 5 s) up to its
   chest height; the core opens for 3 s: SCREAM (R) into it. Three screams (each from a different updraft;
   between them it slams the ring and breathes fire across half the arena). On the 3rd it freezes, the
   magma goes dark, it cools to stone (`coolDown(6)`), the lava lake crusts — and Pip's cage lowers.
Difficulty: "just INSANE" but fair: hearts 6, regen off in phase, every attack learnable, generous
checkpoints, after 4 deaths in one phase the next attempt gets +2 hearts and slower bombs (silent).

## B7. `src/winddance.js` — the wind duet and the flight home

`createWindDance(ctx) -> world` (key `"winddance"`): an open sky world: cloud sea below, the volcano
behind (far mesh, now dark, steam), the jungle far ahead (far mesh of `jungle`'s silhouette), a distance
`dist` 0..1 that moves the far meshes (`setProgress(k)`), golden-hour light. Platypus and Pip ride the
wind side by side (both posed "glide", `fx.windRibbons` on).
`dance.start(chart, onNote, onEnd)` — a rhythm duet like level 4 but in the air: notes come down the
same `ui` note lane (reuse level 4's lane API) for 4 lanes = `spin flip splash(→ "dive") wave`; Pip
calls a phrase, you answer it; each good answer = a gust that pushes you both forward (`dist` += …),
misses only slow you (no fail). 3 phrases sets (≈ 90 s) on `wind`. `dance.progress`, `dance.stop()`.
Ends with the jungle below: `onEnd()`.

## B8. `src/woods.js` — the dark woods and the wolves

`createWoods(ctx) -> world` (key `"woods"`): north of the jungle camp, night, moonlight through tall
pines and twisted oaks (instanced, 3 LODs), fog 8–40 m, mossy rocks, a stream, fireflies, a wolf DEN
clearing (`P.den`) with Pip tied with vines to a dead tree (`P.pipTree`, `vines.cut(i)` 0..2). Points
`enter` (from camp), `path[0..n]`, `ambush[0..2]`, `den`, `camDen`, `exit`. `setMoon(k)`.
Wolves (instanced, ≤ 12, own skinned mesh ≤ 4k tris, 1 draw call, grey/brown/black coats):
`wolves.spawn(n, at, { alpha })`, `wolves.reset()`, `wolves.alive`, `wolves.onKO`. AI: circle the player,
one at a time lunges (0.7 s crouch + `dangerZone`), packs flank, the ALPHA (bigger, scar) has a howl
that summons 2 more and a charge. A wolf takes 2 Stings / 3 Slaps; scream (R) scares all wolves within 8 m
(they flee 3 s). KO: they yelp, cower, run off into the dark (never hurt on screen). `wolves.update(dt)`.

## B9. `src/farlands.js` — the restricted grove, the portal, the puzzle, the illusion

`createFarlands(ctx, jungle) -> world` (key `"farlands"`): the ANCIENT GROVE beyond the camp's red-thread
stones (`P.threads` — the restricted line Burra forbids), giant old trees, a sunken stone court
(`P.court`), and in it the ROCK: a tall grey menhir with glowing carved letters **FAR LANDS PORTAL**
(`rock`; text carved in its own atlas, readable). Around it the PUZZLE:
- Four rune STONES (`stones[0..3]`) on turntables at the court's corners, each with 4 faces (sun, moon,
  star, wave). Tail Slap (or E) turns a stone 90° (`stones[i].turn()`, `stones[i].face`).
- The rock's base shows the riddle line as pictures: *"the sun sleeps, the moon wakes, the stars dance,
  the river runs home"* → correct faces: stone 0 sun, 1 moon, 2 star, 3 wave (stone order is the
  sunset direction: W → N → E → S; a hint shows the order with a light trail after 45 s).
- When all four match, light lines run along the court floor to the rock; one last step: STAND ON THE
  CENTRE STONE AND SCREAM (R) — the rock splits and the PORTAL opens (`portal.open(seconds)`; a vertical
  swirling disc 3 m high, `fx.portalSwirl`, `portalHum`).
`puzzle.reset()`, `puzzle.solved`, `puzzle.onSolved`, `portal.open(s)`, `portal.close(s)`,
`portal.knock(dir)` (bright flash + you are thrown back 6 m, the "nothing happens" moment),
`portal.isOpen`. The ILLUSION: `setIllusion(k 0..1, seconds)` affects the shared jungle/camp look
(a uniform on jungle's materials provided read-only by jungle's existing `setTint`/env, or a screen pass):
colours 6% too saturated, shadows a hair too soft, the river sound slightly delayed, the music detuned
(`music.setDetune(12)`); a faint seam shimmer at the screen edge when the player turns fast. Subtle
enough not to spoil, visible on a second play. `setIllusion(0)` snaps back to real.
`clock(on, text)` — a big stone sundial overlay prop used in the reveal ("3 SECONDS").

## B10. `src/babies.js` — Pip's babies, care and the robot chase

`createBabies(ctx) -> group` (key `"babies"`): three babies: **PEBBLE** (grey), **FERN** (green tint),
**DOT** (spotted). Each `createPlatypus({ scale: 0.42, baby: true })`, followers with simple steering.
Care (`care.start(onDone)`): needs per baby — `hunger`, `clean`, `sleepy`, `happy` — shown as small
icons above them. Actions with E near a baby: feed (carry a grub from the food basket), wash (carry
it to the river edge), rock to sleep (hold E 3 s, lullaby notes), play (tickle → giggle). Bloodless and
cute; the day ends when all three are full on all four (≈ 3 min).
Robot form: `setRobot(k, seconds)` blends all three to robots (B3 `setRobot`), red-cyan eyes.
Chase (`chase.start(route, onCaught, onEnd)`): the robots hunt you along `route` with superpowers —
LASER EYES (a sweeping red beam `fx.laserLine`, 1 heart, jump/duck it), ROCKET HOP (flies over you and
slams a ring, `dangerZone` 1 s), MAGNET (pulls you back 3 m, mash forward), BLINK (teleports ahead of you
onto the path; you must take the side branch). They never truly catch you mid-run (on 0 hearts:
`checkpoint.respawn`). `chase.stop()`, `chase.reset(segment)`, `update(dt)`. The babies only
ever exist inside the illusion: after the reveal (level 13 beat 14) there are NO babies, and
`babies.hide()` removes them for good.

## B11. `src/house.js` — the platypus house (a real building mechanic)

`createHouse(ctx, jungle) -> group` (key `"house"`): a round platypus lodge on stilts at the riverbank
(`P.site` in the jungle camp): stone footings, log walls, a door frame, a domed roof of bent poles and
leaf thatch, mud sealing, a little porch, moss beds inside for everyone (≥ 10 + the babies' tiny ones
NOT included).
- `blueprint` — 6 STAGES, each a set of SLOTS shown as glowing ghosts: 1 footings (8 stones), 2 floor (6
  planks), 3 walls (12 logs, two rings), 4 roof poles (8) and the door frame, 5 thatch (10 leaf bundles,
  bottom to top), 6 seal & furnish (4 mud patches, 10 moss beds, 1 lantern).
- Materials come from piles (`piles.stone/log/plank/pole/leaf/mud/moss`, at fixed places around the camp:
  quarry, log pile, palms, river mud, moss bank). Pick up with E (carry 1, `platypus.pose("carry")`),
  bring to a matching ghost, E to place: a 1-beat hammer timing mini-moment (press E again on the
  `build` beat for "Perfect!" — speed bonus, never a fail).
- Helpers: Rok, Tika, Nib, Moss, Burra and 6 of the many: `helpers.assign(stage)`: they fetch and place
  slower than you (one piece each 8 s), so the house is a joint effort (~4 min total, ≈ 60% by you). Tika
  calls the next stage.
- `house.stage`, `house.progress (0..1)`, `house.onStage`, `house.onDone`, `house.skipToStage(n)`,
  `house.interior(on)` (cutaway roof for the ending, warm lantern light, fire).
Merged per stage into one mesh as pieces are placed (attribute "built" per vertex group, no rebuilds;
ghosts are a second material on the same geometry). ≤ 6 draw calls, ≤ 30k tris.

## B12. `src/playtime.js` — games with Pip

`createPlaytime(ctx, jungle) -> games` (key `"playtime"`). Each game: `start(onDone)`, `stop()`, ≈ 60–90 s,
a counter on the HUD (`ui.setQuests`), nothing can be lost.
- `"tag"` (morning, level 12, `jungle.setTime("morning")`): chase Pip around the camp (Pip dodges, giggles);
  tag her 3 times, then she chases you for 20 s.
- `"pebbles"` (noon, level 12, `"day"`): dive in the river for shiny pebbles (6) before Pip does; splash fights.
- `"fireflies"` (night, level 12, `"night"`): catch 10 fireflies in your paws by jumping; each lands in a
  leaf lantern Pip holds; the lantern lights the camp.
- `"hide"` (morning, level 13): hide-and-seek in the camp, Pip hides 3 times (giggles as audio clues).
- `"follow"` (afternoon, level 13): follow-the-leader with Pip through the jungle, over logs, across the
  red-thread stones into the restricted grove (Pip: "Shh, just a peek!") — ends at dusk at the rock.

--------------------------------------------------------------------------------------------------

# Part C — the storyboards (binding, beat by beat)

Each beat lists: **objective** (`ui.setObjective`), **mechanics**, **world/props**, **music**, **test hook**
(`skipTo(name)` — every name must exist and start that beat from a clean state, with health / abilities /
gear as a fair playthrough would have them). Both levels: Sting, Electro Pulse, Tail Slap, Hold, Scream and
the potion are available (as at the end of level 11); `ctx.gear.wear(...)` re-applies the gear of level 10.

## Level 12 — THE VOLCANO (≈ 20 min; story + one INSANE boss with a checkpoint per phase)

Recap card (2 lines): "The LIVING POTION is in your paws. Pip is in a cage, over lava, in a volcano."

1. **`travel`** — Wobble's map glows; a short flight cutscene (skippable once seen) from the jungle to
   the volcano (winddance world reversed, dusk, ash clouds ahead). Lands on `volcano.slope`. Objective
   **"Climb to the dream shrine"**. Mechanics: walk/jump up the path, lava channels to hop (lava = kill →
   checkpoint), steam vents that puff on a 3 s rhythm (wait). Music `volcano` 0.3 → 0.6. Ambience
   `lavaAmbience`, `fx.embers`, `ashFall`.
2. **`spell`** — at the shrine. Objective **"Do the dream spell"**. Wobble's voice (caption): [Light the
   stones in the order of the song.] Each runestone hums a note (`spellChime(i)`); a 5-note phrase plays
   (Wobble's motif); touch the stones (E) in that order; wrong = soft fizzle, phrase replays. Then lie on
   the warm stone (prompt "Sleep (E)") → `platypus.pose("sleep")`, fade. Music: `volcano` → `dream`.
3. **`dream`** — `dream` world, a NEW scene `"ember"` (an orange-violet version of the quilt, floating
   cushion islands drifting over a soft glowing lava "sea" of light; the dream module builder adds it as
   `setScene("ember")` with `P.spawn`, `P.pip`, `P.path[0..6]`). Objective **"Find Pip in the dream"**.
   Hop the drifting islands toward a distant cage-shaped light; Pip's theme gets closer. Pip is asleep on
   the last island inside a cage of light. Prompt **"Wake up Pip! (E)"** ×3 — captions [Wake up, Pip.]
   [Wake up!] [Pip… wake up.] Pip opens her eyes, the light cage dissolves; she whispers [You came.]
   Music `dream` 0.4 → 1, motif "pip".
4. **`wake`** — white flash; you wake on the shrine stone (`wake` pose), the mountain trembles
   (`quake`). Objective **"Climb to the crater"**. A short climb, stronger quakes, falling rocks
   (dangerZone circles). At the rim: Pip's cage hangs over the lava (`cell` scene), Pip awake now,
   pressing her paws to the bars. The lake bubbles — MAGMOR rises (cutscene, 8 s, `magmorRoar`,
   `music.stinger("danger")`, title "MAGMOR — HEART OF THE MOUNTAIN").
5. **`boss1`** — arena, phase 1 FISTS. Objective **"Shatter the crystals 0/4"**. Health 6 hearts.
   Music `inferno` phase 0. Checkpoint "boss1".
6. **`boss2`** — phase 2 ERUPTION. Objective **"Freeze the vents 0/3 (Q)"**. Music phase 1. Checkpoint.
7. **`boss3`** — phase 3 CORE. Objective **"Ride the wind — scream into its heart 0/3"**. Music phase 2,
   key lift for the last hit. Checkpoint. On defeat: `coolDown(6)`, slow motion 1 s, silence, then
   `music.stinger("victory")`; scene `cool`.
8. **`potion`** — the bridge rises to the cage; `cage.open`. Objective **"Give Pip the potion"**. Walk to Pip,
   prompt "Give (E)". Cutscene: Pip drinks the LIVING POTION; golden light, she rises, colour returns to
   her fur, she spins in the air (`friend.trick("spin")`), hugs you. Motif "pip" in major, full.
9. **`winddance`** — the crater's updraft lifts you both: winddance world. Objective **"Dance with Pip on
   the wind!"** (B7, 3 phrase sets, rhythm duet, cannot fail). Music `wind`. Ends over the jungle.
10. **`dinner`** — jungle camp, dusk → evening (`jungle.setTime("dusk")`), the tribe cheers (`tribe`
   music, chatter). Objective **"Eat with Pip"**: carry food from the store to the fire log where Pip
   sits (3 items: crayfish, berries, grubs), then sit (E) — eating cutscene, both munch (`eatCrunch`).
   Then a sleep cut to morning.
11. **`morning`** — `setTime("morning")`, birds. Objective **"Play tag with Pip"** (`playtime.tag`). Music `chill`.
12. **`noon`** — `setTime("day")`. Objective **"Dive for shiny pebbles 0/6"** (`playtime.pebbles`). Music `chill` 0.8.
13. **`night`** — `setTime("night")`. Objective **"Catch fireflies 0/10"** (`playtime.fireflies`). Music `lullaby` 0.4.
14. **`bed`** — objective **"Go to bed"**: walk to the moss beds, Pip curls up next to you (`cuddle`),
   snores; fade; music `lullaby` → silence.
15. **`missing`** — middle of the night (`setTime("night")`, darker, moon low). You wake (`wake` pose).
   The bed beside you is empty; a trail of pawprints into the dark woods; far away, a wolf howl
   (`wolfHowl`). Caption [Pip?] … [PIP?] Objective flashes **"Pip is missing…"**. `music.motif("pipSad")`.
   Hard cut to black → `win()` → main screen (end card "LEVEL 12 COMPLETE").

Test hooks: `travel spell dream wake boss1 boss2 boss3 potion winddance dinner morning noon night bed missing`.
Draw calls: arena scene + MAGMOR + player + fx ≤ 120.

## Level 13 — THE FAR LANDS (≈ 25 min; forgiving except the wolves and the chase; ends TO BE CONTINUED)

Recap card: "In the middle of the night, Pip was gone. Wolves howled in the woods."

1. **`woods`** — you go into the woods ALONE (the tribe asleep; Moss stirs but you let him sleep).
   `woods` world, night. Objective **"Follow Pip's trail"**: pawprints glow faintly in the moonlight; owl,
   crickets, branches creak; two scares (eyes in the dark that vanish). Music `woods` 0.3. Health 5 hearts,
   regen 0.25. Checkpoint "woods".
2. **`ambush`** — three wolves block the path (`wolves.spawn(3, ambush)`). Objective **"Drive off the
   wolves 0/3"**. Hint: "Scream to scare them (R)". Music `combat` 0.6. Checkpoint "ambush".
3. **`den`** — the wolf den clearing; Pip tied to the dead tree with vines; the ALPHA and 4 wolves hold her.
   Objective **"Save Pip from the wolves"**: wolves in 2 waves (4, then the alpha + 2 summoned). When
   the alpha flees: **"Free Pip 0/3"** — Tail Slap the vines. Pip falls into your arms. Music `combat` 1 →
   `woods` → motif "pip".
4. **`sleep`** — walk back together (Pip leaning on you, slow walk), into the camp, sleep in the moss beds
   together (cuddle), fade, `lullaby`.
5. **`morning`** — `setTime("morning")`. Objective **"Play hide and seek with Pip 0/3"** (`playtime.hide`).
   Music `chill`.
6. **`grove`** — afternoon → dusk. Objective **"Follow Pip!"** (`playtime.follow`), past the red-thread
   stones into the restricted grove (Burra's earlier warning shows as a caption memory [Never past the red
   threads.]). Music `chill` → `farlands` 0.2 (detune starts very small — it is a hint, not yet the illusion).
   At the end of the day: the court and THE ROCK. Camera reveal; letters glow: **FAR LANDS PORTAL**.
7. **`show`** — Objective **"Show the rock to the tribe"**: run back to camp (marker), "Call (E)" at the
   fire; the whole tribe follows you to the grove (the instanced many + named characters, lanterns, dusk).
   They murmur. OLD BURRA, the oldest, steps forward, touches the letters: [The Far Lands. Only a god can
   go there and come back alive.] Rok laughs nervously; Nib hides behind Tika. Music `farlands` 0.4.
8. **`puzzle`** — Objective **"Solve the rock's puzzle"** (B9: turn the four stones to sun, moon, star,
   wave; then **"Stand in the centre and SCREAM"**). Tribe watches; Nib cheers each correct stone. Hints
   at 20 s and 45 s; after 90 s Pip nudges the next wrong stone. The portal opens. Music `farlands` 0.7,
   `stinger("discover")`.
9. **`enter`** — Objective **"Enter the portal"**. You walk in… a flash — **nothing happens**: you are knocked
   back out onto the grass (`portal.knock`), dazed, birds circling stars. The tribe gasps. Caption [Nothing
   happened?] Burra: [Hm. Not a god, then.] Everyone goes home; sleep. **From this moment the player is
   inside the illusion**: `farlands.setIllusion(1, 3)` (subtle, B9), `music.setDetune(10)`. The player
   must NOT be told. Night falls a little too fast.
10. **`babies`** — the next day (morning): Pip has BABIES — Pebble, Fern and Dot (cutscene: Pip proud in
   the nest, three tiny chirps; tribe celebrates). Objective **"Take care of the babies"** (B10 care: feed,
   wash, rock to sleep, play; ≈ 3 min). Music `lullaby` → `chill`. Small wrongness: the babies' chirps
   sometimes have a tiny electronic click (one in eight).
11. **`robots`** — the next day: morning, but the birds stop. The babies stand in a row with their backs to
   you, turn — metal faces, glowing eyes (`setRobot(1, 2)`, `robotServo`, `stinger("glitch")`). They are
   EVIL ROBOTS WITH SUPERPOWERS. Pip: [Those aren't my babies!] Objective **"RUN!"**. Music `chase` 1.
12. **`chase`** — the chase through the camp, along the river, over the log bridge, into the jungle (B10
   route, 3 checkpoints "chase1..3", ≈ 2 min). Halfway: you stop behind a rock, panting — objective
   changes to **"Run… but where?"** — then the idea (a lightbulb flash, caption [The portal!]) →
   **"Run back to the FAR LANDS PORTAL!"** with a marker to the grove; the robots close in.
13. **`back`** — the portal still swirls; dive through it (prompt "Jump in! (Space)" when near).
   A flash — you are knocked back OUT again…
14. **`reveal`** — …onto the grass in the grove, at DUSK, exactly where you landed the first time. The whole
   tribe is standing there exactly as before, mid-murmur, nobody has moved; Pip beside you — no babies.
   `setIllusion(0)` snaps back (colours correct, music in tune — you can hear the difference),
   `stinger("illusion")`. Everyone stares: [...You just went in.] Burra peers at the sundial stone
   (`farlands.clock`): a shadow has barely moved. Big card text: **"ONLY 3 SECONDS HAD PASSED."** then
   **"IT FELT LIKE 3 DAYS."** Burra: [The Far Lands show you what is not there. An illusion.] Pip: [They
   never even came in after you!] (they were just standing there the whole time). Music: silence → motif
   "pip", soft.
15. **`close`** — Objective **"Close the portal"**: turn the four stones back (each turn dims the portal),
   then Tail Slap the rock: it closes, the letters fade to plain stone (`portal.close(3)`). Burra nods.
   Rok: [We need somewhere safe. All of us.] Tika: [A house.]
16. **`build`** — next morning at the river site. Objective **"Build the platypus house"** with stage
   sub-objectives from `house.onStage` ("Footings 0/8", "Floor 0/6", "Walls 0/12", "Roof poles 0/8 + door",
   "Thatch 0/10", "Seal & beds 0/15"). Helpers work beside you (B11). Day passes over the build: morning →
   noon → dusk across the six stages (`jungle.setTime` per stage). Music `build`, intensity rising with
   progress, motif "home" on each finished stage. Checkpoints per stage (`build1..6` = skipTo names too).
17. **`cozy`** — finished: the tribe cheers, the lantern is lit, night. Objective **"Go to sleep"**: inside
   (`house.interior(true)`, cutaway roof), everyone finds a moss bed; you and Pip in the middle; the fire
   crackles; the camera rises slowly through the roof to the stars. Music `lullaby`, motif "home". Card:
   **"Everyone got to sleep somewhere safe and cozy."** → **"TO BE CONTINUED…"** → `win()` → main screen.

Test hooks: `woods ambush den sleep morning grove show puzzle enter babies robots chase chase2 chase3 back
reveal close build build2 build3 build4 build5 build6 cozy`. `skipTo("babies" … "back")` sets the illusion on.

--------------------------------------------------------------------------------------------------

# Part D — performance, testing and release

## D1. Budget per scene (UHD 620, 60 fps, < 150 draw calls, < 250k tris, no per-frame allocations)

| scene | draw calls | tris | notes |
|---|---|---|---|
| volcano slope / shrine | ≤ 70 | ≤ 160k | lava = 1 material, embers instanced |
| MAGMOR arena | ≤ 120 | ≤ 220k | boss 3 calls; bombs pooled (24); haze merged pass |
| wind dance | ≤ 50 | ≤ 90k | far meshes + clouds instanced |
| woods + 12 wolves | ≤ 90 | ≤ 200k | trees 3 LODs instanced, wolves 1 call |
| grove + tribe crowd | ≤ 110 | ≤ 220k | crowd is the existing instanced many |
| chase | ≤ 110 | ≤ 210k | 3 robot babies, 8 laser beams pooled |
| house build | ≤ 100 | ≤ 200k | house ≤ 6 calls |

Measured by `tools/playtest.cjs` style runs (`renderer.info`) at each skipTo name; any over budget blocks release.

## D2. Tests

- `tools/playtest-engine3.cjs`: A0 bug tests, `checkName` suites, JS/SQL fold parity, online with an empty
  config (no fetch made, boards show "coming soon", no console errors), online against a mocked fetch
  (claim, taken, rude, rename-keeps-old-name-reserved, submit, implausible, rank), runtimer pause/assist,
  progress migration from 5-, 11-level saves, level 4 hard unlock after 5 wins and a scripted hard show.
- Level builders: every skipTo name loads in < 2 s and has its objective, marker and hint; each level is
  played start to finish by the bot path; fastest-run times measured → `level_rules.min_ms` set to 70% of
  the fastest bot run (with all cutscenes skipped) and updated in schema.sql before release.

## D3. Release order (one at a time to platyfy.com; LIVE_RELEASED raised only per level)

1. A0 bugs (scream, double-tap zoom) — alone, straight away.
2. A1–A5, A7, A8 (13 circles with 12–13 still locked live, names, timer, boards in offline "coming soon"
   mode, Level 4 hard mode) + `supabase/schema.sql` + `SETUP.md`.
3. Level 12 (`LIVE_RELEASED = 12`). 4. Level 13 (`LIVE_RELEASED = 13`).
Each release: `timetravel/history.json` entry as for earlier levels.
