# Platyfy Time Machine

The time machine lets anyone visit platyfy exactly as it was at any commit:
`https://www.platyfy.com/tt/<full-40-char-sha>/<path>`.

## Before every push

```
node timetravel/build-history.mjs
```

This regenerates `timetravel/history.json` from local git. Commit it with your changes.
The JSON is always one push behind, since it can't include the commit that contains it.
The GUI makes up for that by asking the GitHub API for newer commits.

## Files

| File | What it does |
|---|---|
| `/tt-sw.js` | Root-scope service worker. It only handles time-travel requests (see below). |
| `/404.html` | GitHub Pages serves this for every unknown path. For `/tt/<sha>/...` it installs the worker and reloads (cold start). It resolves `/tt/<short-sha>/` and `/tt/YYYY-MM-DD/`, and otherwise shows a friendly 404. |
| `/timemachine.js` | The present-day GUI (button and panel). Every snapshot page loads the latest copy. |
| `timetravel/build-history.mjs` | Builds `history.json` with `git log --first-parent main` and author dates, grouped into America/New_York days. |
| `timetravel/history.json` | `{ generated, tz:"America/New_York", born:"2026-03-10", commits:[{sha, t, msg, day}] }`, oldest first. |
| `timetravel/tt-sw.killswitch.js` | Ready-made kill switch: copy it over `/tt-sw.js` to remove the time machine from every browser (see Rollback). |
| `timetravel/dev-server.mjs` | Local GitHub Pages stand-in: `node timetravel/dev-server.mjs [port]` serves http://localhost:8787 with a 404.html fallback. |

## How a snapshot is served

1. A request for `/tt/<sha>/<path>` reaches `tt-sw.js`. The worker strips the query, maps `""` and `dir/` to `index.html`, and checks Cache Storage (`tt-files-v1`).
2. On a miss, the worker fetches `raw.githubusercontent.com/toneofgreat/BossGauntlet/<sha>/<path>`.
   - If raw has not answered within 1.5 s, or fails with 5xx, 429 or a network error, the worker also races `cdn.jsdelivr.net/gh/...@<sha>/<path>`.
   - Media files never go to jsDelivr, because it caps files at 20 MB.
   - A raw 404 is final.
   - At most 12 upstream fetches run at once, and one retry is allowed.
3. The worker builds a new response with a Content-Type chosen by file extension and `Cache-Control: no-store`. Raw's own headers (text/plain, nosniff, CSP sandbox) are never copied.
4. Caching follows the LRU rules:
   - Only 200 responses of 5 MB or less are cached.
   - The cache is capped at about 150 MB, and the least recently used snapshots are evicted whole.
   - Larger files, such as the 53 MB `arcade_jazz.wav`, are streamed. Media `Range` requests get real 206 responses.
5. Missing paths are handled like this:
   - An extensionless path whose `<path>/index.html` exists gets a 301 to `<path>/`.
   - A missing document gets the styled "NOT IN THIS TIMELINE" page, with the time machine, and status 404.
   - A missing subresource gets a plain 404.
6. HTML documents (navigations and iframes) get two scripts injected first in `<head>`:
   - an inline shim, described in the next section;
   - `<script src="/timemachine.js" data-tt-sha="<sha>" defer>`.
7. Root-absolute URLs from inside a snapshot are kept in that snapshot:
   - A navigation to `/oofworld/` whose referrer is `/tt/<sha>/...` gets a 302 to `/tt/<sha>/oofworld/`. Query strings are kept.
   - A subresource `/x.js` requested by a snapshot page is served from the snapshot.
   - `/timemachine.js`, `/tt-sw.js`, `/404.html`, `/timetravel/*` and `/tt/*` always stay in the present.
8. **Everything else is untouched.** The worker returns without `respondWith`, so present-day pages go to the network byte-for-byte and are never cached.

## What the injected shim does in every snapshot page

- It sets `window.__TT__` (see the contract below) and fires a `tt:ready` event on `window`.
- **Storage sandbox:** `localStorage` and `sessionStorage` are replaced by per-snapshot stores, so old game builds can never read or overwrite present-day saves.
  - The stores are kept in the real `sessionStorage` under `tt:<sha>:L:` and `tt:<sha>:S:`.
  - They are tab-scoped and disappear when the tab closes.
  - The real stores are still available as `__TT__.realStorage.local` and `__TT__.realStorage.session`.
- **Live backends are read-only:**
  - fetch, XHR and sendBeacon writes (non-GET) to `plays.platyfy.com`, `relay.platyfy.com` and `*.firebaseio.com` are answered with a fake `{"ok":true,"timeTravel":true}`.
  - WebSockets to the relay or Firebase are pointed at an `.invalid` host, so old OofWorld builds fall back to offline mode.
  - The worker also fakes those POSTs for clients it knows are snapshots.
- `navigator.serviceWorker.register` becomes a no-op that returns `navigator.serviceWorker.ready`. The original is kept at `__TT__._register`.
- The shim does **not** draw a banner any more (it used to sit on top of games' top HUDs). `/timemachine.js` shows a toast that reads "🕰️ You are viewing platyfy on Tuesday, March 10, 2026 · update: …" and hides itself after 6–9 s, plus a date chip next to the button (not on touch game pages, where the button is a slim tab on the left edge so it stays clear of joysticks). `__TT__.banner` is always `null`.
- **Which day is shown** is stored per history entry: the shim writes it into `history.state.ttDay` on arrival (and keeps it there when the page calls `pushState`/`replaceState`), so Reload and Back/Forward keep the right date even when one commit is visited under two different days. The page that sends you writes a one-shot `tt:go:<sha>` = `"YYYY-MM-DD|<ms>"` in the real sessionStorage (it outranks `history.state`, because a same-URL navigation keeps the old entry state; `__TT__.go`, the GUI and 404.html all do this). `tt:day:<sha>` stays as the fallback for other pages of the same snapshot.

## Contract for the GUI (`timemachine.js`)

Inside a snapshot, `window.__TT__` is defined **before any page script runs**:

```js
window.__TT__ = {
  sha:   "edf568d12fc2cc4f2252faef92199dfa7fe987ff", // full commit sha of this snapshot
  date:  "2026-03-10",          // NY-local day of that commit (YYYY-MM-DD)
  day:   "2026-03-10",          // day the user CHOSE (see below); defaults to date
  msg:   "Initial commit: add index.html",          // commit subject
  t:     "2026-03-10T20:00:12-04:00",               // commit author time (ISO)
  label: "Tuesday, March 10, 2026",                 // pretty form of `day`
  path:  "index.html",          // snapshot-relative path of this document
  hub:   "/tt/<sha>/",          // snapshot hub URL
  missing: false,               // true on the "not in this timeline" / error page
  sw: "tt-sw-2",
  url(sha, path),               // -> "/tt/" + sha + "/" + path
  go(sha, path, {day, replace}),// travel to a snapshot (stores `day` for the banner)
  present(path),                // LEAVE the snapshot (no-referrer navigation to "/"+path)
  realStorage: {local, session},
  banner,                       // banner host element (after DOMContentLoaded)
};
```

On present-day pages `window.__TT__` is undefined.

Rules for the GUI author:

- **Snapshot URL** = `"/tt/" + sha + "/"` for the hub, or `"/tt/" + sha + "/" + path`. Always use the full 40-character sha.
- **Showing the chosen day:** "travel to end of day D" uses the last commit at or before the end of D. To make the banner show D rather than that commit's own day, set `sessionStorage.setItem("tt:day:" + sha, "YYYY-MM-DD")` before navigating. In a snapshot, `__TT__.go(sha, "", {day})` does this for you.
- **Leaving a snapshot (Return to the present, or travel to "today") must not send a `/tt/` referrer.** Otherwise the worker treats the root-absolute navigation as coming from the past and redirects it back in time.
  - In a snapshot, use `__TT__.present()`.
  - Or click an `<a href="/" rel="noreferrer" referrerpolicy="no-referrer">`.
  - Do not use plain `location.href = "/"`.
- Moving from one snapshot to another (`/tt/<other>/`) is fine with any navigation method.
- **History:** `fetch("/timetravel/history.json")` works from anywhere, including inside snapshots, because it is never rewritten into the past. It does not need the raw GitHub URL.
- **Registering the worker:** before the first travel from the present, call `navigator.serviceWorker.register("/tt-sw.js", {scope: "/"})` and wait for `navigator.serviceWorker.ready`.
  - The navigation after that is handled by the worker.
  - If the worker never registers, the cold-start path in 404.html still works. It costs one extra reload.
- Optional messages to the worker: `{type:"tt:ping"}` replies `{type:"tt:pong", version}`. `{type:"tt:clear-cache"}` empties the snapshot cache.

## Shortcut URLs (handled by 404.html)

- `/tt/2026-05-01/` goes to the end of that day (NY time). Dates before 2026-03-10 show "platyfy wasn't born yet". Today or any future date goes to the present site (`/`), as in the GUI.
- `/tt/edf568d/` takes a short sha and goes to the full sha.

## Keeping ordinary visitors worker-free

The worker is only registered when someone opens the time machine (or opens a `/tt/` link). Every trip stamps `localStorage["platyfy-tm-last"]`. When a present-day page with `/timemachine.js` (the hub) loads and the last trip was more than 3 days ago, it unregisters `tt-sw.js` and deletes the `tt-*` caches, so people who tried the time machine once don't pay for a worker on every later visit. Opening the time machine registers it again.

## Rollback (switching the time machine off)

**Never delete `/tt-sw.js`.** If its update check gets a 404, browsers keep the old worker installed and in control of every platyfy page, forever.

To switch it off for everyone:

1. `cp timetravel/tt-sw.killswitch.js tt-sw.js`, commit and push. The kill switch installs, deletes the `tt-*` caches and unregisters itself; it has no fetch handler, so nothing is intercepted meanwhile. Browsers pick it up on their next platyfy navigation (each navigation to a controlled page triggers an update check that bypasses the browser HTTP cache; the Pages CDN may serve the old file for up to 10 minutes).
2. Remove the `<script src="/timemachine.js">` line from `index.html` (or keep `timemachine.js` but stop linking it).
3. Leave the kill-switch `tt-sw.js` in place for a few months, until old visitors have all come back once. Only after that may the file go.

To bring the time machine back, restore the real `tt-sw.js` from git and bump `SW_VERSION`.

## Testing locally

```
node timetravel/dev-server.mjs          # http://localhost:8787
# open http://localhost:8787/tt/<sha>/  (service workers work on localhost)
```

Snapshots are fetched from GitHub, so they only include commits that have been pushed.

## After deploying

Run `curl -i https://www.platyfy.com/tt/x/`. It should return status 404 with our 404.html, not GitHub's default page.

Pages caches files for 10 minutes. Browsers check `tt-sw.js` for updates on their own.
