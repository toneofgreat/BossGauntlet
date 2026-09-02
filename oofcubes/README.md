# OofCubes

**A browser-native game platform.** Many games, one avatar, one currency, one engine — the Roblox idea, rebuilt cleanroom for the open web. No installs, no moderation walls, no 30% cut. Open a link, you're playing.

OofCubes is not "a game." It is a **platform** that ships with games:

- **One engine** — parts, physics, avatars, and a game API, so every new game is content, not code-from-scratch.
- **Places** — each game is a Place: a JSON world + scripts running on the shared engine.
- **One avatar** — your blocky character (with gear, faces, and auras from the Catalog) walks between every Place.
- **Oofbux** — one currency earned across all Places, spent in the Catalog and in-game shops.
- **Oof Studio** — the endgame: build Places *in the browser* and share them. That's the moat.

## Launch titles

Three proven designs, ported from their Roblox originals:

1. **Difficulty Chart Obby** — 90 stages, 13 towers, checkpoints, stage select.
2. **Weight Lifting Simulator** — 28 items, rebirths, 3 worlds, titles and auras that grow with you.
3. **Boss Tycoon** — droppers, upgrades, codes, the full tycoon loop.

Plus the **Hub** — the social space you spawn into, with portals to every Place.

## Status

**Built and playable**, live at <https://www.platyfy.com/oofcubes/>. Three Places (a 93-stage difficulty-chart obby, a weight-lifting simulator, a boss tycoon), the Hub, Oof Studio, the Catalog and Avatar Editor, badges, save codes — and, since 2026-08-27, real multiplayer. The specification suite (`docs/specs/`), the binding architecture decisions (`ARCHITECTURE.md`) and the work plan (`TASKS.md`) remain the documents everything conforms to.

## How this gets built

- `ARCHITECTURE.md` — binding decisions. Every spec and every task obeys it.
- `docs/specs/` — one deep spec per subsystem, written so an implementing agent needs zero additional design decisions.
- `TASKS.md` — the work broken into agent-sized packages with dependencies and acceptance criteria.

## Hosting

Static hosting via GitHub Pages (same pipeline as platyfy.com). Saves are local, with
export codes to move them between devices — there is no accounts backend and no cloud
save.

## Multiplayer

Up to **20 real players** in a Place at once, seeing each other move. Presence only:
no chat, no server-side game logic, and nothing that makes a player richer or further
along than they would be alone. Every avatar that is not yours is a live person —
`ARCHITECTURE.md` §9 forbids inventing, replaying or padding players, which is why the
hub's fake wanderers and the leaderboard's fake rivals were deleted rather than kept.

**It is off until you point it at a relay**, and a fresh install opens no sockets at
all. To play together you need one small server running somewhere both players can
reach.

### Run the server

```sh
node tools/relay.js                       # port 8787, all interfaces
node tools/relay.js --port 9000           # or pick one
node tools/relay.js --data /some/file.json  # where accounts and games are kept
node tools/relay.js --reset               # everybody starts new (clears accounts + games)
```

It has **no dependencies** — it implements WebSocket itself and hashes passwords with
`node:crypto`, so it runs on a clean checkout with an empty `node_modules`.

It stores exactly three things, in one JSON file: accounts, games people chose to
publish, and which accounts have visited them. **It never stores anyone's game
progress** — Oofbux, badges, obby stages and tycoon purchases live in the browser, so
losing that file costs accounts and published games and nothing anybody earned.

### Point the game at it

Either put the URL in **Settings → MULTIPLAYER → Relay server**, or add `?relay=` to
the page URL:

```
https://www.platyfy.com/oofcubes/?relay=ws://192.168.1.20:8787#/place/obby
```

Two caveats worth knowing before you try it with someone:

- **Same network is easy; over the internet needs a public host.** On one LAN, run the
  relay on any machine and give the others its local IP. Over the internet the relay
  needs to be somewhere with a public address — any host that runs Node will do, since
  it is one file with no dependencies.
- **A page served over `https:` can only use a `wss:` relay.** Browsers refuse a plain
  `ws://` socket from an HTTPS page, so platyfy (which is HTTPS) needs a relay behind
  TLS. The game refuses that combination up front with a readable reason instead of
  failing silently as mixed content. Opening the game over `http://` — on a LAN, say —
  works with a plain `ws://` relay.

### Rooms

One room per Place, keyed by its slug, capped at 20. Walking a portal from the Hub into
the obby leaves one room and joins another. The 21st player to arrive is told the Place
is full and keeps playing single-player.

### Chat

Press **Enter** to chat with the people in your Place. 140 characters, four messages
every five seconds, and **no history at all** — messages are forwarded and forgotten, so
arriving in a room shows an empty log because that is the truth, not a loading failure.

Bad words are filtered out of chat, out of text put on a built part, and out of names at
sign-up. The filter runs on the **server**, so it cannot be turned off by a modified
client, and it matches whole words — "Scunthorpe" and "classic" are safe. It is a floor,
not a solution: somebody determined will get something past it, and there is no way to
block or report a player yet.

## Accounts

Pick a name (up to 20 characters) and a password the first time you open the game with a
server configured. **You do this once.** The session does not expire, so that device
stays signed in until you log out.

Signing in is **required** when a server is set up — there is no guest option, because
chat, the player list, friends and visits all need to point at somebody. With no server
configured there is no sign-in at all and everything still plays.

**There is no password reset.** There is no email address to send one to, and nothing of
value is stored behind an account — it exists so a published game has an author and a
visit has somebody to count. The sign-in screen says this before you choose, not after
you forget. Passwords are salted and hashed with scrypt; the plaintext is never stored,
logged, or sent back.

**You never have to sign in.** "Play as guest" is right there on the dialog, and a guest
keeps every bit of their progress — progress is local either way. What a guest gives up
is publishing games and being counted as a visit.

## Games

The 🎮 button opens the catalogue: search by name, or scroll the **top 100 by visits**.

Publish one of your own from the Oof Studio shelf with 🌍. Publishing again updates the
same listing rather than making a second one, so fixing your level does not split its
visits.

**Visits count people, not clicks.** One person opening a game a hundred times is one
visit; two people opening it once each is two. A guest is not counted, because there is
nobody to count.

## Overtime

A Place where you get **one point per second** for as long as you stay, and lose all of
it the moment you leave. Everyone's time hangs above their head — the leader's in yellow,
everyone else's in black.

### OofTools

**Whoever has the yellow number gets 🛠 OofTools**, and loses them the moment somebody
passes them. Place parts (box, sphere, cylinder, wedge), move/resize/turn them on each
axis, change material and colour, make them see-through or walk-through, put text on
them, and give them an effect (spin, bob, pulse) or an aura (ring, glow, sparks).

**Everyone in the room sees it as it happens**, including people who arrive after you
started. Permission is enforced by the server, not the button.

The build belongs to the room and is **not saved** — when the last player leaves it is
gone. Oof Studio is where you make something that lasts.

### Tests

```sh
node tools/relay.test.mjs      # the socket protocol: capacity, refusal, eviction, isolation
node tools/net.test.mjs        # presence: throttling, interpolation, offline, reconnect
node tools/server.test.mjs     # accounts, sessions, publishing, visit counting, chat caps
node tools/account.test.mjs    # the client half of sign-in and the games catalogue
node tools/smoke.js multiplayer  # a real browser drawing real remote players
node tools/smoke.js overtime     # scoring, the yellow/black leader labels, chat
node tools/censor.test.mjs     # the word filter, including the false-positive cases
node tools/friends.test.mjs    # requests, presence, invites
node tools/build.test.mjs      # OofTools: who may build, and what a part may contain
node tools/smoke.js ooftools     # a browser rendering what the room built
node tools/smoke.js friends      # the player list, friends grid and invite prompt
```
