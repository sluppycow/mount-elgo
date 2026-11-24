// Mount Elgo geography: one height function used by terrain, trees, roads, events.
import { fbm, ridged, smoothstep, lerp, noise2 } from './noise.js';

// Bearing convention: 0 = North (-Z), 90 = East (+X).
export function polar(bearingDeg, dist) {
  const b = bearingDeg * Math.PI / 180;
  return { x: Math.sin(b) * dist, z: -Math.cos(b) * dist };
}
export function bearingOf(x, z) { let b = Math.atan2(x, -z) * 180 / Math.PI; return (b + 360) % 360; }

export const TOWER = {
  ground: 0,            // terrain height at tower base
  floor: 20.4,          // cab floor height (seven stories of timber)
  half: 2.5,            // cab half size (5 x 5 m)
  balc: 1.35,           // balcony depth
  wall: 0.1,
  eye: 1.62,
};

export const LAKE = { ...polar(266, 1250), r: 330, level: 0 };
export const MEADOW = { ...polar(315, 800), r: 120 };
export const HALE = { ...polar(130, 470) };
export const LOT = { x: 7.5, z: 26 };

// ridge arcs (for silhouettes the events use)
const ARCS = [
  { b: 15, span: 55, d: 1850, w: 260, a: 460 },   // north ridge (campfire ev15)
  { b: 92, span: 50, d: 2150, w: 300, a: 360 },   // east ridge (silhouette ev10)
  { b: 320, span: 40, d: 2600, w: 400, a: 260 },
  { b: 210, span: 70, d: 3300, w: 500, a: 420 },
  { b: 150, span: 60, d: 3800, w: 600, a: 480 },
];
function angDiff(a, b) { let d = ((a - b + 540) % 360) - 180; return Math.abs(d); }

// Main road control points (south, winding up to the lot)
export const ROAD_PTS = [
  [600, 6400], [380, 5200], [-260, 4300], [300, 3500], [-180, 2700], [240, 2050],
  [-80, 1500], [190, 1150], [-40, 860], [170, 640], [-120, 470], [120, 330],
  [-70, 210], [60, 120], [-10, 70], [LOT.x, LOT.z + 6], [LOT.x, LOT.z],
];
export const SPUR_PTS = [[170, 640], [260, 520], [HALE.x - 12, HALE.z + 18], [HALE.x - 4, HALE.z + 6]];

function catmull(pts, seg) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const L = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]); const n = Math.max(2, Math.ceil(L / seg));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export const ROAD = catmull(ROAD_PTS, 6);
export const SPUR = catmull(SPUR_PTS, 6);

function rawH(x, z) {
  const r = Math.hypot(x, z);
  let h = -250 * smoothstep(25, 1600, r) - 40 * smoothstep(900, 2400, r);
  h += fbm(x / 700 + 3.1, z / 700 - 1.7, 5) * 70 * smoothstep(40, 500, r);
  h += fbm(x / 160, z / 160, 3) * 9 * smoothstep(20, 160, r);
  const rid = ridged(x / 2600 + 10, z / 2600 - 4, 5);
  h += smoothstep(1500, 5200, r) * (120 + 620 * rid);
  const b = Math.atan2(x, -z) * 180 / Math.PI;
  for (const a of ARCS) {
    const ad = angDiff(b, a.b); if (ad > a.span) continue;
    const win = 1 - smoothstep(a.span * 0.55, a.span, ad);
    const dd = (r - a.d) / a.w;
    h += a.a * Math.exp(-dd * dd) * win * (0.85 + 0.3 * noise2(x / 400, z / 400));
  }
  // SW valley floor
  { const c = polar(215, 1850); const d = Math.hypot(x - c.x, z - c.z); h -= 90 * Math.exp(-((d / 650) ** 2)); }
  // summit pad: flat-ish rock top around tower
  h = lerp(0 + fbm(x / 30, z / 30, 2) * 0.6, h, smoothstep(14, 60, r));
  return h;
}
// lake level is computed from the raw basin
const lakeRaw = rawH(LAKE.x, LAKE.z);
LAKE.level = lakeRaw - 22;
const meadowH = rawH(MEADOW.x, MEADOW.z);

// road heights precomputed & smoothed
function roadHeights(path) {
  let hs = path.map(p => rawH(p[0], p[1]));
  for (let it = 0; it < 12; it++) hs = hs.map((h, i) => (i === 0 || i === hs.length - 1) ? h : (hs[i - 1] + 2 * h + hs[i + 1]) / 4);
  return hs;
}
export const ROAD_H = roadHeights(ROAD);
export const SPUR_H = roadHeights(SPUR);

// coarse grid acceleration for road distance queries
const CELL = 60; const grid = new Map();
function addPath(path, hs, id) {
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const minx = Math.floor((Math.min(ax, bx) - 40) / CELL), maxx = Math.floor((Math.max(ax, bx) + 40) / CELL);
    const minz = Math.floor((Math.min(az, bz) - 40) / CELL), maxz = Math.floor((Math.max(az, bz) + 40) / CELL);
    for (let gx = minx; gx <= maxx; gx++) for (let gz = minz; gz <= maxz; gz++) {
      const k = gx + ',' + gz; if (!grid.has(k)) grid.set(k, []); grid.get(k).push([ax, az, bx, bz, hs[i], hs[i + 1]]);
    }
  }
}
addPath(ROAD, ROAD_H, 0); addPath(SPUR, SPUR_H, 1);
export function roadInfo(x, z) {
  const segs = grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL));
  let best = 1e9, bh = 0;
  if (segs) for (const [ax, az, bx, bz, ha, hb] of segs) {
    const dx = bx - ax, dz = bz - az; const L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t; const d = Math.hypot(x - px, z - pz);
    if (d < best) { best = d; bh = ha + (hb - ha) * t; }
  }
  return { d: best, h: bh };
}

export function height(x, z) {
  if (MAPD) return mapHeight(x, z);
  let h = rawH(x, z);
  // lake basin
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  if (dl < LAKE.r * 1.9) {
    const n = noise2(x / 120, z / 120) * 50;
    const t = smoothstep(LAKE.r * 0.55 + n, LAKE.r * 1.9, dl);
    const bowl = LAKE.level - 14 * (1 - dl / (LAKE.r * 1.9));
    h = lerp(Math.min(h, bowl), h, t);
  }
  const dm = Math.hypot(x - MEADOW.x, z - MEADOW.z);
  if (dm < MEADOW.r * 2) h = lerp(meadowH + fbm(x / 60, z / 60, 2) * 2, h, smoothstep(MEADOW.r * 0.6, MEADOW.r * 2, dm));
  const ri = roadInfo(x, z);
  if (ri.d < 26) h = lerp(ri.h - 0.12, h, smoothstep(4.0, 26, ri.d));
  // Hale cabin pad
  const dh = Math.hypot(x - HALE.x, z - HALE.z);
  if (dh < 40) h = lerp(rawH(HALE.x, HALE.z), h, smoothstep(10, 40, dh));
  return h;
}

// forest density 0..1
export function forest(x, z) {
  if (MAPD) return mapForest(x, z);
  const r = Math.hypot(x, z);
  if (r < 95) return 0;
  let f = 0.55 + 0.6 * fbm(x / 900 + 7, z / 900 - 3, 4) + 0.25 * fbm(x / 140, z / 140, 2);
  f *= smoothstep(95, 170, r);
  const h = height(x, z);
  f *= 1 - smoothstep(170, 320, h);                // treeline on high ridges
  if (h < LAKE.level + 1.5 && Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r * 1.3) return 0;
  f *= smoothstep(LAKE.r * 0.9, LAKE.r * 1.25, Math.hypot(x - LAKE.x, z - LAKE.z));
  f *= smoothstep(MEADOW.r * 0.8, MEADOW.r * 1.6, Math.hypot(x - MEADOW.x, z - MEADOW.z));
  const ri = roadInfo(x, z); if (ri.d < 9) return 0; f *= smoothstep(9, 16, ri.d);
  f *= smoothstep(22, 45, Math.hypot(x - HALE.x, z - HALE.z));
  return Math.max(0, Math.min(1, f));
}

// ---------------- MyChief map (overrides the procedural geography when loaded) ----------------
export let MAPD = null;   // { heights, n, step, half, json, dens, dn, burn, bn }
// the terrain mesh is a coarser grid (every K-th sample, PlaneGeometry triangulation); height() must return the RENDERED surface or props/roads float above it
let TK = 1; export function setTerrainStride(k) { TK = Math.max(1, k | 0); }
function mapHeight(x, z) {
  if (TK > 1) { const M = MAPD, n = M.n, H = M.heights, st = M.step * TK, seg = Math.floor((n - 1) / TK);
    let fx = (x + M.half) / st, fz = (z + M.half) / st; fx = Math.min(seg - 1e-6, Math.max(0, fx)); fz = Math.min(seg - 1e-6, Math.max(0, fz));
    const c = Math.floor(fx), r = Math.floor(fz); fx -= c; fz -= r; const V = (rr, cc) => H[(rr * TK) * n + cc * TK];
    const ya = V(r, c), yb = V(r + 1, c), yc = V(r + 1, c + 1), yd = V(r, c + 1);
    return fx + fz <= 1 ? ya + (yd - ya) * fx + (yb - ya) * fz : yc + (yb - yc) * (1 - fx) + (yd - yc) * (1 - fz); }
  const M = MAPD, n = M.n; const fj = (x + M.half) / M.step, fi = (z + M.half) / M.step;
  const j = Math.min(n - 2, Math.max(0, Math.floor(fj))), i = Math.min(n - 2, Math.max(0, Math.floor(fi)));
  const a = Math.min(1, Math.max(0, fi - i)), b = Math.min(1, Math.max(0, fj - j)), H = M.heights;
  return H[i * n + j] * (1 - a) * (1 - b) + H[i * n + j + 1] * (1 - a) * b + H[(i + 1) * n + j] * a * (1 - b) + H[(i + 1) * n + j + 1] * a * b;
}
function sampleL(arr, n, x, z) { // bilinear over the map square, arr row 0 = north
  const u = (x + MAPD.half) / (2 * MAPD.half) * (n - 1), v = (z + MAPD.half) / (2 * MAPD.half) * (n - 1);
  const j = Math.min(n - 2, Math.max(0, Math.floor(u))), i = Math.min(n - 2, Math.max(0, Math.floor(v))); const a = Math.min(1, Math.max(0, v - i)), b = Math.min(1, Math.max(0, u - j));
  return arr[i * n + j] * (1 - a) * (1 - b) + arr[i * n + j + 1] * (1 - a) * b + arr[(i + 1) * n + j] * a * (1 - b) + arr[(i + 1) * n + j + 1] * a * b;
}
function mapForest(x, z) {
  if (Math.abs(x) > MAPD.half || Math.abs(z) > MAPD.half) return 0;
  let f = sampleL(MAPD.dens, MAPD.dn, x, z);
  if (MAPD.burn && sampleL(MAPD.burn, MAPD.bn, x, z) > 0.5) f *= 0.15;   // burn scars: mostly dead/open
  if (Math.hypot(x, z) < 40) return 0;
  const ri = roadInfo(x, z); if (ri.d < 7) return 0; f *= smoothstep(7, 13, ri.d);
  f *= smoothstep(14, 30, Math.hypot(x - HALE.x, z - HALE.z));
  return Math.max(0, Math.min(1, f));
}
export function mapBurn(x, z) { return MAPD && MAPD.burn ? sampleL(MAPD.burn, MAPD.bn, x, z) : 0; }
// install a loaded map: positions in mychief-map.json override the procedural ones
export function useMap(M) {
  MAPD = M; const J = M.json;
  Object.assign(HALE, { x: J.cabins[0].x, z: J.cabins[0].z, y: J.cabins[0].y });
  Object.assign(LAKE, { x: J.lake.center.x, z: J.lake.center.z, level: J.lake.level_y, r: Math.sqrt(J.lake.area_m2 / Math.PI), poly: J.lake.shoreline_polygon });
  Object.assign(MEADOW, { x: J.meadow_elk.center.x, z: J.meadow_elk.center.z, r: J.meadow_elk.radius_m });
  Object.assign(LOT, { x: J.parking_lot.center.x, z: J.parking_lot.center.z, y: J.parking_lot.center.y });
  const set = (arr, pts) => { arr.length = 0; for (const p of pts) arr.push(p); };
  set(ROAD, J.road.polyline_main.map(p => [p.x, p.z])); set(ROAD_H, J.road.polyline_main.map(p => p.y));
  set(SPUR, J.road.polyline_hale_spur.map(p => [p.x, p.z])); set(SPUR_H, J.road.polyline_hale_spur.map(p => p.y));
  ROAD.bridge = J.road.polyline_main.map(p => !!p.bridge);
  grid.clear(); addPath(ROAD, ROAD_H, 0); addPath(SPUR, SPUR_H, 1);
}
