// Procedural PBR maps for the old ranger cabin, its trail and the rifle: weathered board-and-batten siding, cedar shakes,
// fieldstone, walnut, cracked glass, claw gouges, dried blood. Drawn on canvases at load (no downloads), cached.
import * as THREE from 'three';
import { mulberry32 } from '../noise.js';
import { fbmField, hfNormal } from '../procedural.js';

const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const cache = {}; const once = (k, f) => cache[k] || (cache[k] = f());
export function tex(c, { srgb = false, rep = [1, 1], rot = 0, aniso = 8 } = {}) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = aniso; if (rot) { t.rotation = rot; t.center.set(0.5, 0.5); } if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function img(N, M, f) { const c = cv(N, M); const x = c.getContext('2d'); const im = x.createImageData(N, M); const d = im.data; for (let i = 0; i < N * M; i++) { const v = f(i, i % N, (i / N) | 0); d[i * 4] = v[0]; d[i * 4 + 1] = v[1]; d[i * 4 + 2] = v[2]; d[i * 4 + 3] = v[3] ?? 255; } x.putImageData(im, 0, 0); return c; }
const cl = (v) => Math.max(0, Math.min(255, v));
function maps(N, H, alb, R, s) { return { map: alb, normal: hfNormal(H, N, s), rough: img(N, N, (i) => { const r = cl(R[i]); return [r, r, r]; }) }; }

// vertical board-and-batten siding, silver-grey weathered pine with brown heartwood, nail rust bleeding, checks and splits.
// one tile = 2 m x 2 m (8 boards); battens are real geometry
export function sidingMaps() { return once('siding', () => {
  const N = 512, r = mulberry32(101); const g1 = fbmField(N, 102, 5, 4), g2 = fbmField(N, 103, 4, 32), g3 = fbmField(N, 104, 3, 2);
  const H = new Float32Array(N * N), R = new Float32Array(N * N); const bw = N / 8; const tone = [], grain = [], split = [];
  for (let b = 0; b < 8; b++) { tone.push(0.78 + r() * 0.3); grain.push(r() * 100); split.push(r() < 0.5 ? [r() * bw, r() * N, 30 + r() * 140] : null); }
  const alb = img(N, N, (i, x, y) => { const b = (x / bw) | 0, u = x - b * bw; const gap = u < 2.2 || u > bw - 2.2; const gx = (u + grain[b]) / bw;
    // long stretched grain lines with wavy figure
    const gr = Math.sin((gx * 14 + g1[i] * 3.2 + Math.sin(y / N * 6.28 * 2 + b) * 0.4) * Math.PI); const fine = g2[(y * N + ((x * 7) % N))] ;
    const sp = split[b]; const sd = sp ? Math.abs(u - sp[0] - (y - sp[1]) * 0.01) < 0.9 && Math.abs(y - sp[1]) < sp[2] : false;
    const weather = g3[i]; const t = tone[b] * (0.86 + gr * 0.06 + fine * 0.12);
    let c0 = [118 * t, 112 * t, 104 * t]; const brown = Math.max(0, weather - 0.48) * 2.2; c0 = [c0[0] + 36 * brown * t, c0[1] + 14 * brown * t, c0[2] - 8 * brown * t];
    // nail rows (two nails per board every 0.5 m) with rust streaks running down
    const nr = ((y + N / 8) % (N / 4)); const nx = Math.min(Math.abs(u - bw * 0.25), Math.abs(u - bw * 0.75));
    if (nx < 2 && nr < 3) { c0 = [52, 34, 24]; } else if (nx < 2.5 && nr > 3 && nr < 3 + 22 * (0.5 + g1[i])) { const k = 1 - (nr - 3) / 30; c0 = [c0[0] * (1 - 0.35 * k) + 40 * k, c0[1] * (1 - 0.4 * k), c0[2] * (1 - 0.45 * k)]; }
    let h = gap ? 0 : 0.55 + gr * 0.05 + fine * 0.18 - (sd ? 0.4 : 0); if (gap || sd) c0 = [c0[0] * 0.28, c0[1] * 0.27, c0[2] * 0.26];
    H[i] = h; R[i] = 205 + fine * 40 - brown * 10; return c0; });
  return maps(N, H, alb, R, 3.2);
}); }
// interior: smoke-darkened tongue-and-groove pine paneling (horizontal boards)
export function panelMaps() { return once('panel', () => {
  const N = 512, r = mulberry32(111); const g1 = fbmField(N, 112, 5, 4), g2 = fbmField(N, 113, 4, 32), g3 = fbmField(N, 114, 3, 2);
  const H = new Float32Array(N * N), R = new Float32Array(N * N); const bh = N / 10; const tone = []; for (let b = 0; b < 10; b++) tone.push(0.75 + r() * 0.35);
  const alb = img(N, N, (i, x, y) => { const b = (y / bh) | 0, v = y - b * bh; const gap = v < 1.6; const gr = Math.sin(((x / N) * 9 + g1[i] * 4 + b * 0.37) * Math.PI * 2);
    const knot = g1[(((y * 3) % N) * N + ((x * 3) % N))]; const k = knot > 0.78 ? (knot - 0.78) * 4 : 0;
    const t = tone[b] * (0.82 + gr * 0.07 + g2[i] * 0.14) * (1 - k * 0.5) * (0.78 + g3[i] * 0.3);
    H[i] = gap ? 0 : 0.6 + gr * 0.04 + g2[i] * 0.1 - (v > bh - 2 ? 0.15 : 0); R[i] = 170 + g2[i] * 50;
    return gap ? [22, 15, 10] : [120 * t, 80 * t, 50 * t]; });
  return maps(N, H, alb, R, 2.5);
}); }
// cedar shake roof: staggered rows of split shakes, tone per shake, moss cushions & lichen, needles caught in the gaps
export function shingleMaps() { return once('shingle', () => {
  const N = 512, r = mulberry32(121); const g1 = fbmField(N, 122, 5, 4), g2 = fbmField(N, 123, 4, 32), moss = fbmField(N, 124, 5, 3, 0.55);
  const H = new Float32Array(N * N), R = new Float32Array(N * N); const rows = 8, rh = N / rows; const cuts = [];
  for (let j = 0; j < rows; j++) { const xs = [0]; let x = r() * 40; while (x < N) { xs.push(x); x += 28 + r() * 46; } xs.push(N); cuts.push(xs.map((v, k) => ({ x: v, t: 0.7 + r() * 0.4, s: r() * 50, l: r() < 0.25 }))); }
  const alb = img(N, N, (i, x, y) => { const j = (y / rh) | 0, v = (y - j * rh) / rh; const row = cuts[j]; let k = 0; const xo = (x + (j % 2) * 23) % N; while (k < row.length - 1 && row[k + 1].x <= xo) k++;
    const c = row[k], nx = row[k + 1] ? row[k + 1].x : N; const edge = Math.min(xo - c.x, nx - xo); const gap = edge < 1.5;
    const gr = Math.sin(((xo + c.s) / 9 + g1[i] * 3) * Math.PI) * 0.5 + 0.5; const t = c.t * (0.78 + gr * 0.14 + g2[i] * 0.16);
    // shake thickens toward its butt (bottom edge, v -> 1) then the next row's shadow line
    const butt = v > 0.93; let h = gap ? 0.05 : 0.25 + v * 0.55 + gr * 0.06; if (butt) h = 0.05;
    let col = [104 * t, 86 * t, 70 * t]; if (c.l) col = [col[0] * 0.8, col[1] * 0.8, col[2] * 0.82];
    if (gap || butt) col = col.map(q => q * 0.25);
    const m = Math.max(0, moss[i] - 0.56) * 5; if (m > 0 && !gap) { const mm = Math.min(1, m); col = [col[0] * (1 - mm) + 58 * mm * (0.7 + g2[i] * 0.6), col[1] * (1 - mm) + 74 * mm * (0.7 + g2[i] * 0.6), col[2] * (1 - mm) + 30 * mm]; h += mm * 0.25 * g2[i]; }
    H[i] = h; R[i] = 220 + g2[i] * 30; return col; });
  return maps(N, H, alb, R, 4);
}); }
// dry-laid / mortared fieldstone (granite + basalt cobbles), 1 tile = 1.5 m
export function stoneMaps(key = 'stone', { seed = 131, n = 70, mortar = [92, 88, 80] } = {}) { return once(key, () => {
  const N = 512, r = mulberry32(seed); const g1 = fbmField(N, seed + 1, 5, 8), g2 = fbmField(N, seed + 2, 4, 32), lich = fbmField(N, seed + 3, 4, 4);
  const pts = []; for (let i = 0; i < n; i++) pts.push({ x: r() * N, y: r() * N, sx: 0.8 + r() * 0.7, c: [r(), r(), r()] });
  const cell = 64, G = N / cell, grid = {}; for (const p of pts) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const k = (((p.x / cell | 0) + ox + G) % G) + ',' + (((p.y / cell | 0) + oy + G) % G); (grid[k] ||= []).push(p); }
  const H = new Float32Array(N * N), R = new Float32Array(N * N);
  const alb = img(N, N, (i, x, y) => { let d1 = 1e9, d2 = 1e9, best = null; const L = grid[((x / cell) | 0) + ',' + ((y / cell) | 0)] || pts;
    for (const p of L) { let dx = Math.abs(p.x - x), dy = Math.abs(p.y - y); dx = Math.min(dx, N - dx) / p.sx; dy = Math.min(dy, N - dy) * p.sx; const d = Math.sqrt(dx * dx + dy * dy * 1.6); if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d; }
    const e = d2 - d1; const m = e < 5 ? 1 - e / 5 : 0; const dome = Math.min(1, e / 22);
    const c = best.c; const g = 0.45 + c[0] * 0.5; let col = [128 * g + c[1] * 30, 124 * g + c[1] * 18, 116 * g + c[2] * 10]; const sp = g2[i];
    col = col.map(q => q * (0.8 + sp * 0.35) * (0.85 + g1[i] * 0.3));
    const li = Math.max(0, lich[i] - 0.6) * 4; if (li > 0) col = [col[0] * (1 - li * 0.5) + 150 * li * 0.5, col[1] * (1 - li * 0.5) + 150 * li * 0.5, col[2] * (1 - li * 0.5) + 110 * li * 0.5];
    if (m > 0) col = col.map((q, k) => q * (1 - m) + mortar[k] * (0.7 + g2[i] * 0.4) * m * 0.9);
    H[i] = m > 0.6 ? 0.05 : 0.25 + Math.sqrt(dome) * 0.6 + sp * 0.12; R[i] = m > 0.5 ? 240 : 185 + sp * 50; return col; });
  return maps(N, H, alb, R, 4.5);
}); }
// rough-sawn dark timber (posts, rails, beams, crates)
export function timberMaps() { return once('timber', () => {
  const N = 256; const g1 = fbmField(N, 141, 5, 4), g2 = fbmField(N, 142, 4, 32);
  const H = new Float32Array(N * N), R = new Float32Array(N * N);
  const alb = img(N, N, (i, x, y) => { const gr = Math.sin((x / N * 10 + g1[i] * 3.5) * Math.PI * 2) * 0.5 + 0.5; const saw = Math.sin(y / N * 6.28 * 40 + g1[i] * 8) * 0.5 + 0.5; const t = 0.7 + gr * 0.12 + g2[i] * 0.2 + saw * 0.05;
    H[i] = gr * 0.3 + g2[i] * 0.5 + saw * 0.15; R[i] = 210 + g2[i] * 40; return [104 * t, 84 * t, 64 * t]; });
  return maps(N, H, alb, R, 2.4);
}); }
// American black walnut stock: dark figured grain, oil finish; optional cut checkering bands (in v ranges)
export function walnutMaps() { return once('walnut', () => {
  const N = 512; const g1 = fbmField(N, 151, 6, 3), g2 = fbmField(N, 152, 4, 48), g3 = fbmField(N, 153, 3, 2);
  const H = new Float32Array(N * N), R = new Float32Array(N * N);
  const alb = img(N, N, (i, x, y) => { const w = y / N * 34 + g1[i] * 9 + Math.sin(x / N * 6.28 * 2) * 0.6; const fig = Math.pow(Math.abs(Math.sin(w * Math.PI)), 3); const fine = Math.sin((y / N * 140 + g1[i] * 20) * Math.PI) * 0.5 + 0.5; const pores = g2[i];
    const k = 0.78 + g3[i] * 0.34 - fig * 0.2 - fine * 0.05 - (pores > 0.74 ? 0.1 : 0);
    H[i] = 0.5 - fig * 0.02 + pores * 0.06; R[i] = 92 + pores * 50 + (1 - g3[i]) * 20;
    return [cl(98 * k), cl(60 * k), cl(38 * k)]; });
  return maps(N, H, alb, R, 1.2);
}); }
// 20-lpi diamond checkering (normal + darker oil-soaked albedo multiplier); tiles finely
export function checkerMaps() { return once('checker', () => {
  const N = 128; const H = new Float32Array(N * N); const p = 16;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = ((x + y) % p) / p, b = ((x - y + N) % p) / p; H[y * N + x] = Math.min(Math.abs(a - 0.5), Math.abs(b - 0.5)) * 2; }
  return { normal: hfNormal(H, N, 6), H, N };
}); }
// cracked, filthy window glass: alpha (dust + cracks opaque white), plus a broken-pane variant with a jagged hole (alpha 0)
export function glassCrack(seed = 1, hole = false) { return once('glass' + seed + hole, () => {
  const N = 256, r = mulberry32(161 + seed); const c = cv(N); const x = c.getContext('2d'); const dust = fbmField(N, 162 + seed, 5, 4);
  const im = x.createImageData(N, N); for (let i = 0; i < N * N; i++) { const px = i % N, py = (i / N) | 0; const e = Math.min(px, N - px, py, N - py) / N; const a = 40 + dust[i] * 70 + (e < 0.12 ? (0.12 - e) * 900 : 0) + (py > N * 0.75 ? (py / N - 0.75) * 260 : 0);
    im.data[i * 4] = 190 + dust[i] * 40; im.data[i * 4 + 1] = 186 + dust[i] * 40; im.data[i * 4 + 2] = 170 + dust[i] * 30; im.data[i * 4 + 3] = cl(a); }
  x.putImageData(im, 0, 0);
  const cx = N * (0.3 + r() * 0.4), cy = N * (0.3 + r() * 0.4);
  if (hole) { x.globalCompositeOperation = 'destination-out'; x.beginPath(); const n = 11; for (let k = 0; k <= n; k++) { const a = k / n * 6.28; const rr = N * (0.12 + r() * 0.3); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.fill(); x.globalCompositeOperation = 'source-over'; }
  x.strokeStyle = 'rgba(235,240,245,0.85)'; x.lineCap = 'round';
  for (let k = 0; k < 9 + (seed % 4); k++) { let a = r() * 6.28, px = cx, py = cy; x.lineWidth = 0.8 + r() * 0.8; x.beginPath(); x.moveTo(px, py); for (let s = 0; s < 8; s++) { a += (r() - 0.5) * 0.5; px += Math.cos(a) * (8 + r() * 18); py += Math.sin(a) * (8 + r() * 18); x.lineTo(px, py); } x.stroke(); }
  x.lineWidth = 0.7; for (let ring = 1; ring <= 2; ring++) { x.beginPath(); for (let k = 0; k <= 14; k++) { const a = k / 14 * 6.28; const rr = ring * (14 + r() * 8); x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.stroke(); }
  return c;
}); }
// four-claw gouges torn through paint/wood: albedo with alpha + normal
export function gougeDecal(seed = 1) { return once('gouge' + seed, () => {
  const W = 256, Hh = 512, r = mulberry32(171 + seed); const c = cv(W, Hh); const x = c.getContext('2d'); x.lineCap = 'round';
  for (let k = 0; k < 4; k++) { const x0 = 40 + k * 46 + r() * 10, y0 = 40 + k * 14 + r() * 20, x1 = x0 + 30 + r() * 20, y1 = Hh - 60 - r() * 50 - (k === 0 || k === 3 ? 60 : 0);
    const path = () => { x.beginPath(); x.moveTo(x0, y0); x.bezierCurveTo(x0 + 6, y0 + (y1 - y0) * 0.35, x1 - 10, y0 + (y1 - y0) * 0.7, x1, y1); };
    x.strokeStyle = 'rgba(18,12,8,0.95)'; x.lineWidth = 15; path(); x.stroke(); x.strokeStyle = 'rgba(176,138,96,1)'; x.lineWidth = 9; path(); x.stroke(); x.strokeStyle = 'rgba(214,180,136,1)'; x.lineWidth = 3.5; path(); x.stroke();
    for (let s = 0; s < 14; s++) { const t = r(); const px = x0 + (x1 - x0) * t + (r() - 0.5) * 18, py = y0 + (y1 - y0) * t; x.strokeStyle = 'rgba(190,150,100,0.9)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 14, py + 6 + r() * 10); x.stroke(); } }
  return c;
}); }
// dried blood: dark brown pools, drips, a smeared hand-drag (alpha)
export function bloodDecal(seed = 1, kind = 'pool') { return once('blood' + seed + kind, () => {
  const N = 256, r = mulberry32(181 + seed); const c = cv(N); const x = c.getContext('2d');
  const blob = (px, py, rr, a) => { const g = x.createRadialGradient(px, py, 0, px, py, rr); g.addColorStop(0, `rgba(46,10,6,${a})`); g.addColorStop(0.7, `rgba(54,14,8,${a * 0.9})`); g.addColorStop(1, 'rgba(54,14,8,0)'); x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, 7); x.fill(); };
  if (kind === 'pool') { for (let i = 0; i < 30; i++) blob(N / 2 + (r() - 0.5) * 110, N / 2 + (r() - 0.5) * 110, 6 + r() * 36, 0.55 + r() * 0.35); for (let i = 0; i < 40; i++) blob(N / 2 + (r() - 0.5) * 220, N / 2 + (r() - 0.5) * 220, 1 + r() * 4, 0.9); }
  else if (kind === 'drag') { for (let k = 0; k < 4; k++) { x.strokeStyle = `rgba(52,12,8,${0.55 + r() * 0.3})`; x.lineWidth = 6 + r() * 10; x.lineCap = 'round'; x.beginPath(); x.moveTo(30 + k * 12, 20 + r() * 20); x.bezierCurveTo(70 + k * 14, 90, 60 + k * 18, 170, 90 + k * 16, N - 20); x.stroke(); } for (let i = 0; i < 12; i++) blob(40 + r() * 120, r() * N, 3 + r() * 9, 0.8); }
  else { for (let k = 0; k < 4; k++) { const px = 60 + k * 36 + r() * 8; blob(px, 60, 18, 0.85); x.strokeStyle = 'rgba(50,12,8,0.85)'; x.lineWidth = 8 - k; x.beginPath(); x.moveTo(px, 60); x.lineTo(px + (r() - 0.5) * 8, 150 + r() * 90); x.stroke(); blob(px, 160 + r() * 80, 5, 0.9); } }
  return c;
}); }
// aged paper with handwriting-like scribble lines
export function paperTex(seed = 1, w = 256, h = 320) { return once('paper' + seed, () => {
  const c = cv(w, h); const x = c.getContext('2d'); const r = mulberry32(191 + seed); x.fillStyle = '#d9cfb1'; x.fillRect(0, 0, w, h);
  const g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.8); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,60,20,0.35)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(30,26,40,0.75)'; x.lineWidth = 1.6; for (let y = 34; y < h - 26; y += 15) { let px = 18 + r() * 10; x.beginPath(); x.moveTo(px, y); while (px < w - 24 - r() * 40) { px += 3 + r() * 3; x.lineTo(px, y + (r() - 0.5) * 5); if (r() < 0.07) { px += 6; x.moveTo(px, y); } } x.stroke(); }
  x.fillStyle = 'rgba(70,30,12,0.3)'; x.beginPath(); x.arc(w * 0.72, h * 0.8, 26, 0, 7); x.fill(); return c;
}); }
