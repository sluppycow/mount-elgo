// Procedural PBR maps (albedo / normal / roughness / AO-ish) drawn on canvases at load time: no extra downloads.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const cv = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
export function texOf(c, { srgb = false, rep = [1, 1], aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// tileable value-noise fbm on an N x N grid
export function fbmField(N, seed, oct = 5, base = 4, gain = 0.5) {
  const r = mulberry32(seed); const H = new Float32Array(N * N); let amp = 1, tot = 0;
  for (let o = 0; o < oct; o++) {
    const G = base << o; const g = new Float32Array(G * G); for (let i = 0; i < G * G; i++) g[i] = r();
    for (let y = 0; y < N; y++) { const fy = y / N * G, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < N; x++) { const fx = x / N * G, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const a = g[(iy % G) * G + ix % G], b = g[(iy % G) * G + (ix + 1) % G], c = g[((iy + 1) % G) * G + ix % G], d = g[((iy + 1) % G) * G + (ix + 1) % G];
        H[y * N + x] += amp * ((a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy); } }
    tot += amp; amp *= gain;
  }
  for (let i = 0; i < N * N; i++) H[i] /= tot; return H;
}
export function hfNormal(H, N, s) {
  const c = cv(N); const x = c.getContext('2d'); const im = x.createImageData(N, N); const d = im.data; const at = (i, j) => H[((j + N) % N) * N + ((i + N) % N)];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const dx = (at(i - 1, j) - at(i + 1, j)) * s, dy = (at(i, j - 1) - at(i, j + 1)) * s; const l = Math.hypot(dx, dy, 1), k = (j * N + i) * 4;
    d[k] = (dx / l * 0.5 + 0.5) * 255; d[k + 1] = (-dy / l * 0.5 + 0.5) * 255; d[k + 2] = (1 / l * 0.5 + 0.5) * 255; d[k + 3] = 255; }
  x.putImageData(im, 0, 0); return c;
}
function gray(V, N, f) { const c = cv(N); const x = c.getContext('2d'); const im = x.createImageData(N, N); for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(255, f(V[i], i))); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; } x.putImageData(im, 0, 0); return c; }
function rgb(N, f) { const c = cv(N); const x = c.getContext('2d'); const im = x.createImageData(N, N); for (let i = 0; i < N * N; i++) { const [r, g, b, a] = f(i); im.data[i * 4] = r; im.data[i * 4 + 1] = g; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = a ?? 255; } x.putImageData(im, 0, 0); return c; }
const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

// leather / padded vinyl: pebbled grain (cellular) + soft wrinkles
export function leatherMaps() { return once('leather', () => {
  const N = 512, r = mulberry32(3); const H = new Float32Array(N * N); const pts = [];
  for (let i = 0; i < 2200; i++) pts.push([r() * N, r() * N]);
  const cell = 16, grid = {}; for (const p of pts) { const k = (p[0] / cell | 0) + ',' + (p[1] / cell | 0); (grid[k] ||= []).push(p); }
  const G = N / cell;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let d1 = 1e9, d2 = 1e9; const cx = x / cell | 0, cy = y / cell | 0;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const kx = (cx + ox + G) % G, ky = (cy + oy + G) % G; const L = grid[kx + ',' + ky]; if (!L) continue;
      for (const p of L) { let dx = Math.abs(p[0] - x), dy = Math.abs(p[1] - y); dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy); const d = dx * dx + dy * dy; if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; } }
    H[y * N + x] = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / 5); }
  const w = fbmField(N, 9, 4, 3); for (let i = 0; i < N * N; i++) H[i] = H[i] * 0.7 + w[i] * 0.6;
  return { n: hfNormal(H, N, 2.2), r: gray(H, N, (v) => 150 + (1 - v) * 70), H, N };
}); }
// woven fabric (headliner / seat / blanket)
export function fabricMaps() { return once('fabric', () => {
  const N = 256; const H = new Float32Array(N * N); const w = fbmField(N, 21, 3, 8);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const u = (x % 8) / 8, v = (y % 8) / 8; const a = Math.sin(u * Math.PI) * (((y / 8 | 0) + (x / 8 | 0)) % 2 ? 1 : 0.4), b = Math.sin(v * Math.PI) * (((y / 8 | 0) + (x / 8 | 0)) % 2 ? 0.4 : 1); H[y * N + x] = Math.max(a, b) * 0.8 + w[y * N + x] * 0.4; }
  return { n: hfNormal(H, N, 1.6), H, N };
}); }
// painted wood/metal with chips & grime: returns albedo (sRGB), rough, normal
export function paintMaps(key, paint, under, { seed = 5, chips = 0.6, grime = 0.5, N = 512 } = {}) { return once('paint' + key, () => {
  const n1 = fbmField(N, seed, 6, 4), n2 = fbmField(N, seed + 1, 5, 8), n3 = fbmField(N, seed + 2, 3, 2);
  const P = new THREE.Color(paint), U = new THREE.Color(under); const H = new Float32Array(N * N); const R = new Float32Array(N * N);
  const alb = rgb(N, (i) => { const chip = n1[i] > 1 - 0.32 * chips ? 1 : 0; const gr = Math.max(0, n3[i] - 0.45) * 2 * grime; const tone = 0.88 + n2[i] * 0.24;
    H[i] = chip ? 0 : 0.6 + n2[i] * 0.05; R[i] = chip ? 235 : 150 + n2[i] * 60 + gr * 50;
    const c = chip ? U : P; const k = tone * (1 - gr * 0.5); return [Math.min(255, c.r * 255 * k), Math.min(255, c.g * 255 * k), Math.min(255, c.b * 255 * k)]; });
  return { map: alb, rough: gray(R, N, v => v), normal: hfNormal(H, N, 3) };
}); }
// rusty steel: albedo / rough / normal
export function rustMaps() { return once('rust', () => {
  const N = 512; const a = fbmField(N, 41, 6, 4), b = fbmField(N, 42, 6, 16), c = fbmField(N, 43, 4, 2);
  const H = new Float32Array(N * N), R = new Float32Array(N * N), M = new Float32Array(N * N);
  const alb = rgb(N, (i) => { const rust = Math.min(1, Math.max(0, (a[i] * 0.7 + c[i] * 0.5 - 0.42) * 3)); const pit = b[i];
    H[i] = rust * (0.5 + pit * 0.5); R[i] = 120 + rust * 120; M[i] = 255 * (1 - rust);
    const steel = [70 + pit * 30, 72 + pit * 30, 76 + pit * 30], rc = [120 + pit * 60, 55 + pit * 30, 25 + pit * 12], dk = [60, 32, 18];
    const t = rust, d = Math.max(0, b[i] - 0.6) * 2; return steel.map((s, k) => (s * (1 - t) + (rc[k] * (1 - d) + dk[k] * d) * t)); });
  return { map: alb, rough: gray(R, N, v => v), metal: gray(M, N, v => v), normal: hfNormal(H, N, 4) };
}); }
// window-pane dust / condensation: alpha map dense near the frame (uv edges), speckled
export function grimeAlpha() { return once('grime', () => {
  const N = 256; const n = fbmField(N, 77, 5, 4); const r = mulberry32(8);
  const c = rgb(N, (i) => { const x = (i % N) / N, y = (i / N | 0) / N; const e = Math.min(x, 1 - x, y, 1 - y); const edge = Math.pow(1 - Math.min(1, e / 0.22), 2.2); const bottom = Math.pow(1 - Math.min(1, y / 0.35), 2) * 0.0 + Math.pow(Math.max(0, y - 0.7) / 0.3, 2) * 0.5;
    const v = Math.min(1, (edge * 0.75 + bottom) * (0.6 + n[i] * 0.8) + (r() < 0.004 ? 0.5 : 0) + n[i] * 0.08); const g = v * 255; return [g, g, g]; });
  return c;
}); }
// cork board
export function corkMaps() { return once('cork', () => {
  const N = 256, r = mulberry32(12); const H = fbmField(N, 13, 5, 16, 0.6);
  for (let i = 0; i < N * N; i++) H[i] += (r() - 0.5) * 0.35;
  const alb = rgb(N, (i) => { const v = 0.7 + H[i] * 0.45; return [168 * v, 118 * v, 70 * v]; });
  return { map: alb, normal: hfNormal(H, N, 2.5) };
}); }
// pine bough card: one drooping branch, side twigs and dense needles (alpha), tip at u=1
export function boughTexture() { return once('bough', () => {
  const W = 256, Hh = 128; const c = cv(W, Hh); const x = c.getContext('2d'); const r = mulberry32(17);
  const needles = (px, py, ang, L, dens) => { for (const s of [-1, 1]) for (let q = 0; q < dens; q++) { const a = ang + s * (0.7 + r() * 0.7); const g = 46 + r() * 58 | 0; const l = L * (0.6 + r() * 0.5);
      x.strokeStyle = `rgba(${g * 0.52 | 0},${g},${g * 0.42 | 0},1)`; x.lineWidth = 0.9 + r() * 0.9; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); } };
  const twig = (x0, y0, x1, y1, w, nl) => { const len = Math.hypot(x1 - x0, y1 - y0), ang = Math.atan2(y1 - y0, x1 - x0); x.strokeStyle = 'rgba(64,46,32,1)'; x.lineWidth = w; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
    for (let k = 0; k < len; k += 1.6) { const t = k / len; needles(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ang, nl * (1 - t * 0.4), 1); } };
  // soft dark core so the card never reads as sticks
  const gr = x.createLinearGradient(0, 0, 0, Hh); gr.addColorStop(0, 'rgba(20,36,18,0)'); gr.addColorStop(0.5, 'rgba(20,36,18,0.0)'); gr.addColorStop(1, 'rgba(20,36,18,0)');
  for (let i = 0; i < 26; i++) { const t = 0.05 + i * 0.036; const sx = 4 + (W - 10) * t; const L = ((1 - t) * 52 + 14); const s = i % 2 ? 1 : -1; const a = s * (0.5 + r() * 0.35) + (r() - 0.5) * 0.2;
    twig(sx, Hh / 2, sx + Math.cos(a) * L, Hh / 2 + Math.sin(a) * L * 0.95, 1.3, 9); }
  twig(2, Hh / 2, W - 4, Hh / 2, 2.6, 11);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}); }
export function barkMaps() { return once('bark', () => {
  const N = 256; const a = fbmField(N, 51, 5, 4), b = fbmField(N, 52, 4, 8); const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const i = y * N + x; const ridge = Math.abs(Math.sin((x / N * 9 + a[i] * 2.5) * Math.PI)); H[i] = ridge * 0.7 + b[i] * 0.3; }
  return { map: rgb(N, i => { const v = 0.55 + H[i] * 0.6; return [92 * v, 66 * v, 48 * v]; }), normal: hfNormal(H, N, 4) };
}); }
// soft billowing smoke puffs (several variants in a 2x2 atlas)
export function smokeAtlas() { return once('smoke', () => {
  const S = 256, c = cv(S * 2); const x = c.getContext('2d');
  for (let q = 0; q < 4; q++) { const n = fbmField(S, 90 + q, 5, 3, 0.55); const im = x.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const dx = (i - S / 2) / (S / 2), dy = (j - S / 2) / (S / 2); const d = Math.hypot(dx, dy); const v = n[j * S + i];
      const a = Math.max(0, Math.min(1, (1 - d * (1.15 - v * 0.6)) * 1.6)) * (0.35 + v * 0.9); const k = (j * S + i) * 4; const sh = 200 + v * 55 - Math.max(0, dy) * 40;
      im.data[k] = im.data[k + 1] = im.data[k + 2] = Math.min(255, sh); im.data[k + 3] = Math.min(255, a * a * 255); }
    x.putImageData(im, (q % 2) * S, (q >> 1) * S); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}); }
// ---- geometry helpers ----
// smooth any geometry: weld + recompute normals (+ simple box-projected uv if missing)
export function smooth(g, uvScale = 1) {
  g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
  g = mergeVertices(g, 1e-4); g.computeVertexNormals(); boxUV(g, uvScale); return g;
}
export function boxUV(g, s = 1) { const p = g.attributes.position, n = g.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * s; uv[i * 2 + 1] = v * s; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
export function rbox(w, h, d, r = 0.01, seg = 2) { const m = Math.min(w, h, d); return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, m * 0.45)); }
// cheap baked ambient occlusion for interiors: darkens toward floor/ceiling/wall corners (local-space box)
export function addBoxAO(mat, center, half, { floorY = 0, ceilY = 2.6, strength = 0.55, key = 'cab' } = {}) {
  const prev = mat.onBeforeCompile; const c = center.clone();
  mat.onBeforeCompile = (sh, r) => { prev && prev(sh, r);
    sh.uniforms.uAOc = { value: c }; sh.uniforms.uAOh = { value: half }; sh.uniforms.uAOy = { value: new THREE.Vector3(floorY, ceilY, strength) };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vAOw;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvAOw = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vAOw; uniform vec3 uAOc; uniform float uAOh; uniform vec3 uAOy;')
      .replace('#include <aomap_fragment>', `#include <aomap_fragment>
      { vec3 q = vAOw - uAOc; float dw = uAOh - max(abs(q.x), abs(q.z)); float inside = step(-0.05, dw);
        float dyF = q.y - uAOy.x, dyC = uAOy.y - q.y;
        float aoF = smoothstep(0.0, 0.55, dyF), aoW = smoothstep(0.0, 0.5, abs(dw)), aoC = smoothstep(0.0, 0.35, dyC);
        float corner = (1.0 - aoW) * (1.0 - aoF);
        float ao = mix(1.0, aoF * 0.55 + 0.45, 0.5) * mix(1.0, aoW * 0.5 + 0.5, 0.6) * mix(1.0, aoC * 0.5 + 0.5, 0.6) * (1.0 - corner * 0.35);
        ao = mix(1.0, ao, uAOy.z * inside * step(-0.2, dyF) * step(-0.1, dyC));
        reflectedLight.indirectDiffuse *= ao; reflectedLight.directDiffuse *= mix(1.0, ao, 0.5); }`);
  };
  mat.customProgramCacheKey = () => 'ao-' + key + (mat.map ? 'm' : '') + (mat.normalMap ? 'n' : '');
  return mat;
}
