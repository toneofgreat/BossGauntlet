/* platyfy TIME MACHINE kill switch.
 *
 * To switch the time machine off for every visitor: copy THIS file over /tt-sw.js and push.
 * (Never delete /tt-sw.js: a 404 on the update check leaves the old worker installed forever.)
 * On their next visit each browser fetches the new /tt-sw.js, installs this, and it deletes the
 * time machine caches and unregisters itself. Pages it controlled keep working (it has no fetch
 * handler, so every request goes straight to the network) and are free of it after a reload.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith("tt-")) await caches.delete(k);
  await self.registration.unregister();
})()));
