# OofCubes — published build

This directory is a **copy of the runtime**, not the source of truth. Editing files here
will be overwritten the next time the build is republished.

- **Source repo:** `C:\Users\krist\Desktop\OofCubes` (own git repo, branch `main`)
- **What is copied:** `index.html`, `src/`, `assets/vendor/` — nothing else. The specs
  (`docs/specs/`), the work plan (`TASKS.md`), `ARCHITECTURE.md`, `SLICE.md` and the
  `tools/` gates stay in the source repo.
- **Live at:** https://www.platyfy.com/oofcubes/

## Republish

From the source repo, copy the tracked runtime files over this directory:

```sh
cd /c/Users/krist/Desktop/OofCubes
rm -rf /c/Users/krist/Desktop/BossGauntlet/oofcubes/{index.html,src,assets}
git ls-files index.html src assets | while read -r f; do
  mkdir -p "/c/Users/krist/Desktop/BossGauntlet/oofcubes/$(dirname "$f")"
  cp "$f" "/c/Users/krist/Desktop/BossGauntlet/oofcubes/$f"
done
```

Then commit and push in `BossGauntlet` — the Pages workflow deploys `main` to platyfy.

Every path in the build is relative (`./src/...`, `../../assets/vendor/three.module.js`)
and routing is hash-based, so hosting under the `/oofcubes/` subpath needs no rewrites.

## What is in this build

The **playable slice** (see `SLICE.md` in the source repo): hub plaza with portals and
the Catalog door, avatar rig + 7-row catalog + editor, Oofbux economy with localStorage
saves, an 8-stage Difficulty Chart Obby, and a Boss Tycoon with 5 buyables (dropper -> conveyor ->
collector). The lifting sim, Oof Studio and hub ghosts are specced but not built.
