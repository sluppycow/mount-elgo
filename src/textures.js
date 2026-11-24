import * as THREE from 'three';
import { mulberry32 } from './noise.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// Height canvas -> normal map canvas
export function heightToNormal(hc, strength = 2) {
  const w = hc.width, h = hc.height; const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = canvas(w, h); const ctx = out.getContext('2d'); const img = ctx.createImageData(w, h); const d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x - 1, y) - H(x + 1, y)) * strength, dy = (H(x, y - 1) - H(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * w + x) * 4;
    d[i] = (dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return out;
}
function tex(c, rep = 1, srgb = false) {
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep);
  t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Fine stipple for polymer grips
export function stippleNormal(rep = 1) {
  const c = canvas(256, 256); const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  const r = mulberry32(7);
  for (let i = 0; i < 2600; i++) { const x = r() * 256, y = r() * 256, s = 1 + r() * 2.2; const v = 120 + r() * 135 | 0;
    g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath(); g.arc(x, y, s, 0, 6.283); g.fill(); }
  return tex(heightToNormal(c, 3.5), rep);
}
// Skin pores / micro wrinkles
export function skinNormal(rep = 1) {
  const c = canvas(256, 256); const g = c.getContext('2d'); g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  const r = mulberry32(11);
  for (let i = 0; i < 5000; i++) { const x = r() * 256, y = r() * 256; const v = 100 + r() * 40 | 0;
    g.fillStyle = `rgba(${v},${v},${v},0.7)`; g.beginPath(); g.arc(x, y, 0.6 + r() * 0.9, 0, 6.283); g.fill(); }
  g.strokeStyle = 'rgba(90,90,90,0.35)'; g.lineWidth = 0.8;
  for (let i = 0; i < 160; i++) { const x = r() * 256, y = r() * 256, a = r() * 3.14; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14); g.stroke(); }
  return tex(heightToNormal(c, 1.2), rep);
}
// subtle skin albedo variation (freckle/blotch), sRGB
export function skinColor(rep = 1) {
  const c = canvas(256, 256); const g = c.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 256);
  const r = mulberry32(5);
  for (let i = 0; i < 700; i++) { const x = r() * 256, y = r() * 256, s = 2 + r() * 10;
    const gr = g.createRadialGradient(x, y, 0, x, y, s); const red = r() < 0.6;
    gr.addColorStop(0, red ? 'rgba(235,190,185,0.22)' : 'rgba(215,200,190,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
  return tex(c, rep, true);
}
// Brushed/knurled metal normal
export function knurlNormal(rep = 1) {
  const c = canvas(128, 128); const g = c.getContext('2d');
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const v = 128 + 70 * Math.sin((x + y) * 0.39) * Math.sin((x - y) * 0.39); g.fillStyle = `rgb(${v | 0},${v | 0},${v | 0})`; g.fillRect(x, y, 1, 1); }
  return tex(heightToNormal(c, 2), rep);
}
// Soft radial sprite
export function radialSprite(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = canvas(size, size); const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, inner); gr.addColorStop(0.25, inner.replace(/[\d.]+\)$/, '0.55)')); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, size, size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Muzzle flash star
export function flashSprite() {
  const s = 256, c = canvas(s, s), g = c.getContext('2d'); const r = mulberry32(3);
  g.translate(s / 2, s / 2); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) { const a = r() * Math.PI * 2, L = 50 + r() * 70; g.rotate(a);
    const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,120,30,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, -7); g.lineTo(L, 0); g.lineTo(0, 7); g.fill(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s * 0.32);
  gr.addColorStop(0, 'rgba(255,255,235,1)'); gr.addColorStop(0.3, 'rgba(255,200,110,0.8)'); gr.addColorStop(1, 'rgba(255,90,20,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- numeric height field -> normal / roughness canvases (tileable) ----
function hfToNormal(H, N, strength) {
  const out = canvas(N, N); const ctx = out.getContext('2d'); const img = ctx.createImageData(N, N); const d = img.data;
  const at = (x, y) => H[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x - 1, y) - at(x + 1, y)) * strength, dy = (at(x, y - 1) - at(x, y + 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * N + x) * 4;
    d[i] = (dx / l * 0.5 + 0.5) * 255; d[i + 1] = (-dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return out;
}
function grayCanvas(V, N) {
  const c = canvas(N, N); const ctx = c.getContext('2d'); const img = ctx.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = Math.max(0, Math.min(255, V[i])); img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  ctx.putImageData(img, 0, 0); return c;
}
// Deep polymer grip stipple: dense, irregular raised pyramids/craters on a jittered grid (seamless). Returns {normal, rough}.
let _stip = null;
export function stippleMaps(rep = 1) {
  if (!_stip) {
    const N = 512, K = 26, cell = N / K; const H = new Float32Array(N * N); const r = mulberry32(31);
    for (let cy = 0; cy < K; cy++) for (let cx = 0; cx < K; cx++) for (let m = 0; m < 2; m++) {
      const px = (cx + 0.2 + r() * 0.6) * cell, py = (cy + 0.2 + r() * 0.6) * cell; const rad = cell * (0.45 + r() * 0.35) * (m ? 0.7 : 1);
      const hgt = (0.6 + r() * 0.4) * (m ? 0.7 : 1), crater = r() < 0.35; const rot = r() * 6.28, cs = Math.cos(rot), sn = Math.sin(rot);
      const R = Math.ceil(rad) + 1;
      for (let oy = -R; oy <= R; oy++) for (let ox = -R; ox <= R; ox++) {
        const qx = (ox * cs - oy * sn) / rad, qy = (ox * sn + oy * cs) / rad; const dd = Math.max(Math.abs(qx), Math.abs(qy)) * 0.6 + Math.hypot(qx, qy) * 0.4; if (dd >= 1) continue;
        let v = (1 - dd) ** 1.3 * hgt; if (crater) v = hgt * 0.55 * (1 - Math.abs(dd - 0.55) / 0.45) - 0.15 * Math.max(0, 0.4 - dd);
        const X = ((Math.round(px) + ox) % N + N) % N, Y = ((Math.round(py) + oy) % N + N) % N; const k = Y * N + X; if (v > H[k]) H[k] = v;
      }
    }
    for (let i = 0; i < N * N; i++) H[i] += (r() - 0.5) * 0.06;
    const R = new Float32Array(N * N); for (let i = 0; i < N * N; i++) R[i] = 238 - H[i] * 55; // tips slightly polished, valleys dead-matte
    _stip = { n: hfToNormal(H, N, 6.0), r: grayCanvas(R, N) };
  }
  const n = tex(_stip.n, rep), ro = tex(_stip.r, rep); n.anisotropy = ro.anisotropy = 8; return { normal: n, rough: ro };
}
// Fine diamond knurl for an aluminium flashlight body (seamless)
export function diamondKnurl(rep = 1) {
  const N = 256, P = 16; const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = ((x + y) % P) / P, v = ((x - y + N * 4) % P) / P; const a = 1 - Math.abs(u - 0.5) * 2, b = 1 - Math.abs(v - 0.5) * 2;
    H[y * N + x] = Math.min(a, b);
  }
  return tex(hfToNormal(H, N, 4.0), rep);
}
// orange-peel reflector bumps
export function peelNormal(rep = 1) {
  const N = 128; const H = new Float32Array(N * N); const r = mulberry32(77);
  for (let i = 0; i < 260; i++) { const cx = r() * N, cy = r() * N, rad = 3 + r() * 5;
    for (let y = -8; y <= 8; y++) for (let x = -8; x <= 8; x++) { const d = Math.hypot(x, y) / rad; if (d < 1) { const k = ((Math.round(cy) + y + N) % N) * N + ((Math.round(cx) + x + N) % N); H[k] += (1 - d * d) * 0.5; } } }
  return tex(hfToNormal(H, N, 3.0), rep);
}
