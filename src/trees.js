// Conifers built from drooping, needle-textured bough cards around a barked trunk.
// Soft "volume" normals (pointing out of the crown) make them shade like a real tree instead of faceted cones.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { boughTexture, barkMaps, texOf } from './procedural.js';

// returns BufferGeometry with groups: 0 = trunk, 1 = foliage (unit height, base at y=0)
export function pineGeometry({ whorls = 13, per = 6, segs = 2, across = 3, radius = 0.22, seed = 1, trunkSides = 7, cardW = 0.8, core = 0 } = {}) {
  const r = mulberry32(seed); const P = [], N = [], U = [], C = [], I = [];
  // trunk
  const ts = trunkSides, th = 1; let base = 0;
  for (let j = 0; j <= 4; j++) { const y = j / 4 * 0.98, rad = 0.016 * (1 - y) + 0.003; for (let i = 0; i <= ts; i++) { const a = i / ts * Math.PI * 2; P.push(Math.cos(a) * rad, y, Math.sin(a) * rad); N.push(Math.cos(a), 0.15, Math.sin(a)); U.push(i / ts * 2, y * 10); C.push(0.75, 0.75, 0.75); } }
  for (let j = 0; j < 4; j++) for (let i = 0; i < ts; i++) { const a = j * (ts + 1) + i, b = a + 1, c = a + ts + 1, d = c + 1; I.push(a, c, b, b, c, d); }
  const trunkCount = I.length; base = P.length / 3;
  // boughs
  for (let k = 0; k < whorls; k++) {
    const t = k / (whorls - 1); const y = 0.1 + t * 0.86 + (r() - 0.5) * 0.02; const L = Math.pow(1 - t, 0.85) * radius + 0.025; const n = t > 0.82 ? Math.max(3, per - 2) : per;
    for (let j = 0; j < n; j++) {
      const a = k * 2.39996 + j * Math.PI * 2 / n + (r() - 0.5) * 0.5; const dir = [Math.cos(a), Math.sin(a)]; const side = [-dir[1], dir[0]];
      const len = L * (0.8 + r() * 0.35); const w = len * cardW * (0.85 + r() * 0.3); const droop = (0.25 + 0.35 * (1 - t)) * len; const lift = t > 0.85 ? 0.35 * len : 0.06 * len;
      const roll = (r() - 0.5) * 1.6; const b0 = P.length / 3;
      for (let s = 0; s <= segs; s++) { const u = s / segs; const rr = 0.01 + u * len; const yy = y + lift * u - droop * u * u;
        for (let q = 0; q < across; q++) { const v = across === 1 ? 0.5 : q / (across - 1); const off = (v - 0.5) * w * (0.35 + 0.65 * Math.sin(Math.min(1, u * 1.3 + 0.2) * Math.PI * 0.5));
          const fold = across >= 3 ? -Math.abs(v - 0.5) * w * 0.35 : 0; // V-shaped cross-section
          const px = dir[0] * rr + side[0] * off, pz = dir[1] * rr + side[1] * off, py = yy + fold + off * roll;
          P.push(px, py, pz);
          // volume normal: out from the crown axis, tipped up; mixed with the card's up normal
          const cr = Math.max(0.03, L); let nx = px / cr, nz = pz / cr, ny = 0.55 + (py - y) / cr * 0.3 + t * 0.4; const l = Math.hypot(nx, ny, nz); N.push(nx / l, ny / l, nz / l);
          U.push(0.06 + 0.88 * u - (v - 0.5) * 0.5 * 0.63, 0.12 + 0.74 * u + (v - 0.5) * 0.5 * 0.776); const ao = (0.42 + 0.58 * Math.min(1, u * 1.2)) * (0.72 + 0.28 * t); const tip = Math.max(0, u - 0.75) * 0.6;
          C.push(ao * (1 + tip * 0.3), ao * (1 + tip * 0.5), ao * (1 + tip * 0.15)); } }
      for (let s = 0; s < segs; s++) for (let q = 0; q < across - 1; q++) { const a0 = b0 + s * across + q, a1 = a0 + 1, c0 = a0 + across, c1 = c0 + 1; I.push(a0, c0, a1, a1, c0, c1); }
    }
  }
  // inner crown shell: a jagged needle cone that fills the gaps between boughs
  if (core) { const rows = 6; const b0 = P.length / 3;
    for (let j = 0; j <= rows; j++) { const t = j / rows; const y = 0.12 + t * 0.86; const rad = Math.pow(1 - t, 0.9) * radius * 0.62 + 0.008;
      for (let i = 0; i <= core; i++) { const a = i / core * Math.PI * 2 + j * 0.4; const jit = 0.8 + r() * 0.4; const px = Math.cos(a) * rad * jit, pz = Math.sin(a) * rad * jit; const py = y - (j > 0 && j < rows ? 0.02 * r() : 0);
        P.push(px, py, pz); const l = Math.hypot(px, 0.5 * rad, pz) || 1; N.push(px / l, 0.5 * rad / l + 0.3, pz / l); U.push((i % 2), (j % 2)); const ao = 0.35 + 0.35 * t; C.push(ao, ao, ao); } }
    for (let j = 0; j < rows; j++) for (let i = 0; i < core; i++) { const a = b0 + j * (core + 1) + i, b = a + 1, c = a + core + 1, d = c + 1; I.push(a, c, b, b, c, d); } }
  // leader: three short boughs angled up out of the crown top (no solid filler anywhere)
  for (let j = 0; j < 3; j++) { const a = j * 2.094 + 0.3; const dx = Math.cos(a), dz = Math.sin(a); const b0 = P.length / 3; const w = 0.022;
    for (const [u, v] of [[0, 0], [0, 1], [1, 0], [1, 1]]) { const rr = 0.004 + u * 0.03, off = (v - 0.5) * w * (0.4 + 0.6 * u); P.push(dx * rr - dz * off, 0.955 + u * 0.06, dz * rr + dx * off); N.push(dx * 0.5, 0.85, dz * 0.5); U.push(0.06 + 0.88 * u - (v - 0.5) * 0.5 * 0.63, 0.12 + 0.74 * u + (v - 0.5) * 0.5 * 0.776); C.push(0.85, 0.9, 0.8); }
    I.push(b0, b0 + 2, b0 + 1, b0 + 1, b0 + 2, b0 + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I);
  g.addGroup(0, trunkCount, 0); g.addGroup(trunkCount, I.length - trunkCount, 1); g.computeBoundingSphere(); return g;
}
let _bough = null;
function boughMap() { if (_bough) return _bough; const t = new THREE.TextureLoader().load('assets/tex/mychief/mychief-pine-bough.png'); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (_bough = t); }
export function pineMaterials({ dense = false } = {}) {
  const bark = barkMaps(); const barkMat = new THREE.MeshStandardMaterial({ map: texOf(bark.map, { srgb: true }), normalMap: texOf(bark.normal), roughness: 0.95, vertexColors: true });
  const fol = new THREE.MeshStandardMaterial({ map: boughMap(), alphaTest: dense ? 0.3 : 0.45, side: THREE.DoubleSide, roughness: 0.85, vertexColors: true, color: 0xffffff });
  // double-sided cards keep the crown's volume normal on both faces; add a little backlit translucency for low sun
  fol.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
      .replace('#include <alphatest_fragment>', dense ? 'diffuseColor.a = smoothstep(0.02, 0.35, diffuseColor.a);\n#include <alphatest_fragment>' : '#include <alphatest_fragment>');
  };
  fol.customProgramCacheKey = () => 'pine-fol' + (dense ? 'd' : '');
  return [barkMat, fol];
}
export function impostorTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); const r = mulberry32(9);
  for (let i = 0; i < 160; i++) { const t = r(); const y = 120 - t * 112; const w = (1 - t) * 26 + 3; const x = 32 + (r() - 0.5) * 2 * w; const v = 22 + r() * 26 | 0;
    g.fillStyle = `rgba(${v * 0.6 | 0},${v},${v * 0.55 | 0},0.9)`; g.beginPath(); g.ellipse(x, y, 3 + r() * 4, 2 + r() * 2, (r() - 0.5) * 0.6, 0, 7); g.fill(); }
  g.fillStyle = '#3a2a1c'; g.fillRect(31, 112, 3, 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
