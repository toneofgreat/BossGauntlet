// levels/index.js - the main-game area registry (frozen; CONTRACT.md section 7).
// Each area is ONE long level (several screens) with checkpoints, in ./<id>.js (default export = level object).
export const AREAS = [
  { id: "area1", num: 1, title: "Sunlit Forest", theme: "forest", music: "area1", target: [1, 3] },
  { id: "area2", num: 2, title: "Golden Highlands", theme: "highlands", music: "area2", target: [4, 6] },
  { id: "area3", num: 3, title: "Storm Peaks", theme: "storm", music: "area3", target: [8, 9] },
];
export const areaInfo = (id) => AREAS.find((a) => a.id === id) || null;
// loadArea(id) -> Promise<level>
export function loadArea(id) {
  if (!areaInfo(id)) return Promise.reject(new Error("unknown area " + id));
  return import(`./${id}.js`).then((m) => m.default);
}
