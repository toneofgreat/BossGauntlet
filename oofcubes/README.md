# OofCubes — published build

This directory is a **copy of the runtime**, not the source of truth. Editing files here
will be overwritten the next time the build is republished.

- **Source repo:** `C:\Users\krist\Desktop\OofCubes` (own git repo, branch `main`)
- **What is copied:** `index.html`, `src/`, `assets/vendor/` — nothing else. The specs
  (`docs/specs/`), the work plan (`TASKS.md`), `ARCHITECTURE.md`, `SLICE.md` and the
  `tools/` gates stay in the source repo. **`tools/relay.js` deliberately stays behind
  too**: the multiplayer relay is a server you run, not part of the static site.
- **Live at:** https://www.platyfy.com/oofcubes/

## Republish

Commit in the source repo first — this copies the working tree, so anything uncommitted
there is what ships.

```sh
SRC=/c/Users/krist/Desktop/OofCubes
DST=/c/Users/krist/Desktop/BossGauntlet/oofcubes
rm -rf "$DST/src" "$DST/assets" "$DST/index.html"
mkdir -p "$DST/src" "$DST/assets"
cp -r "$SRC/src/."    "$DST/src/"
cp -r "$SRC/assets/." "$DST/assets/"
cp    "$SRC/index.html" "$DST/index.html"
```

Then commit and push in `BossGauntlet` — the Pages workflow deploys `main` to platyfy.

Two traps, both hit for real on 2026-08-27:

- **Copy in bulk, not file-by-file.** The old `git ls-files | while read` loop spawned a
  `mkdir` and a `cp` per file and took over two minutes on this machine — long enough to
  be killed partway, which left the published tree missing half the engine.
- **Use `cp -r src/. dst/`, not `cp -r src dst`.** If the destination directory survives
  the `rm` (or was recreated first), the second form nests the copy as `dst/src/src/…`
  and the site 404s on every module.

Verify before pushing — the file lists must match exactly:

```sh
diff <(cd "$SRC" && git ls-files index.html src assets | sort) \
     <(cd "$DST" && find . -type f | sed 's|^\./||' | grep -v '^README.md$' | sort)
```

Every path in the build is relative (`./src/...`, `../../assets/vendor/three.module.js`)
and routing is hash-based, so hosting under the `/oofcubes/` subpath needs no rewrites.

## What is in this build

The full platform: the Hub plaza with portals, the Catalog door and Oof Studio workshop;
the avatar rig with the Catalog and editor; Oofbux, badges and localStorage saves with
export codes; and three Places — a 90-stage Difficulty Chart Obby, the Weight Lifting
Simulator, and Boss Tycoon.

**Multiplayer is built and shipped here, but off by default.** It stays off — and the
page opens no sockets at all — until a relay is configured in Settings → MULTIPLAYER or
via `?relay=`. Running one is a step you take deliberately; see the source repo's README.
Note that this site is HTTPS, so it can only use a `wss://` relay; a plain `ws://` one
works when the game is opened over `http://` (on a LAN, for instance).

There are no NPCs anywhere in this build. `ARCHITECTURE.md` §9 forbids inventing a
player, so the Hub's simulated wanderers and the lifting leaderboard's invented rivals
were deleted when real multiplayer landed rather than kept alongside it.
