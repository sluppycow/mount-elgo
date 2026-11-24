// The thing in the pines: a towering, starved, hunched wendigo-like walker wearing a bleached elk skull.
// One GPU-skinned body mesh (sculpted lofts: arched spine with serrated vertebrae, starved ribcage, sinewy limbs, clawed hands/feet)
// driven by the procedural joint rig, plus a rigid sculpted skull (deep sockets, pinpoint eyeshine, jagged teeth, hinged jaw,
// torn blackened flesh at the neck) and branching weathered antlers. Animated in code: lurk, stalk-walk, all-fours crawl, bipedal sprint, gallop, flinch + the hunting AI.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { height } from './geo.js';
import { fbmField, hfNormal, texOf } from './procedural.js';
import { radialSprite } from './textures.js';
import { mulberry32 } from './noise.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2, PI = Math.PI;
const c01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const sst = (a, b, x) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const gs = (x) => Math.exp(-x * x);
const win = (a0, a1, b1, b0, x) => sst(a0, a1, x) * (1 - sst(b1, b0, x));
const ad = (a, b) => { let d = (a - b) % TAU; if (d > PI) d -= TAU; if (d < -PI) d += TAU; return d; };
const mix3 = (c, d, k) => [c[0] + (d[0] - c[0]) * k, c[1] + (d[1] - c[1]) * k, c[2] + (d[2] - c[2]) * k];
function h3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vn(x, y, z) { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); let u = x - X, v = y - Y, w = z - Z; u = u * u * (3 - 2 * u); v = v * v * (3 - 2 * v); w = w * w * (3 - 2 * w);
  const L = (a, b, t) => a + (b - a) * t; const c = (i, j, k) => h3(X + i, Y + j, Z + k);
  return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w); }
// Catmull-Rom through keyframe rows [x, v1, v2, ...]
function kf(T, x) { const n = T.length; if (x <= T[0][0]) return T[0].slice(1); if (x >= T[n - 1][0]) return T[n - 1].slice(1);
  let i = 0; while (x > T[i + 1][0]) i++; const u = (x - T[i][0]) / (T[i + 1][0] - T[i][0]); const p0 = T[Math.max(0, i - 1)], p1 = T[i], p2 = T[i + 1], p3 = T[Math.min(n - 1, i + 2)]; const o = [];
  for (let k = 1; k < p1.length; k++) { const a = p0[k], b = p1[k], c = p2[k], d = p3[k]; o.push(0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u)); } return o; }
// two-bone blend weight
const wb = (a, b, t0, t1, x) => { const s = sst(t0, t1, x); return s <= 0 ? [[a, 1]] : s >= 1 ? [[b, 1]] : [[a, 1 - s], [b, s]]; };

// ---------- sculpted loft: stations along a path, radius/colour shaped per vertex by f(i, angle, t) -> [k, r, g, b] ----------
function loft(st, o = {}) {
  const n = st.length, seg = o.seg || 12, R = seg + 1; const T = [], F = [], S = [];
  for (let i = 0; i < n; i++) T[i] = st[Math.min(i + 1, n - 1)].p.clone().sub(st[Math.max(i - 1, 0)].p).normalize();
  let h = o.hint; if (!h) { const t = T[0]; h = [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)].reduce((m, v) => Math.abs(v.dot(t)) < Math.abs(m.dot(t)) ? v : m); }
  for (let i = 0; i < n; i++) { const f = (i ? F[i - 1] : h).clone(); f.addScaledVector(T[i], -f.dot(T[i])).normalize(); F[i] = f; S[i] = T[i].clone().cross(f).normalize(); }
  const pos = [], uv = [], col = [], si = [], sw = [], idx = []; let L = 0; const q = V(0, 0, 0); const vs = o.vScale || 2, ur = o.uRep || 1;
  const W = (w) => { for (let k = 0; k < 4; k++) { si.push(w && w[k] ? w[k][0] : 0); sw.push(w && w[k] ? w[k][1] : (k ? 0 : 1)); } };
  for (let i = 0; i < n; i++) { if (i) L += st[i].p.distanceTo(st[i - 1].p); const t = n > 1 ? i / (n - 1) : 0;
    for (let j = 0; j < R; j++) { const a = (j % seg) / seg * TAU; const sh = o.shape ? o.shape(a) : [Math.cos(a), Math.sin(a)]; const r = o.f ? o.f(i, a, t, st[i]) : null; const k = r ? r[0] : 1;
      q.copy(st[i].p).addScaledVector(S[i], sh[0] * st[i].rs * k).addScaledVector(F[i], sh[1] * st[i].rf * k);
      pos.push(q.x, q.y, q.z); uv.push(j / seg * ur, L * vs); col.push(r && r.length > 1 ? r[1] : 1, r && r.length > 1 ? r[2] : 1, r && r.length > 1 ? r[3] : 1); W(st[i].w); } }
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < seg; j++) { const a = i * R + j, b = a + R; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const poles = [];
  const cap = (i, dir) => { const c = st[i].p.clone().addScaledVector(T[i], dir * (o.ext || 0)); const ci = pos.length / 3; poles.push([ci, T[i].clone().multiplyScalar(dir)]);
    pos.push(c.x, c.y, c.z); uv.push(0.5, (i ? L : 0) * vs); const r = o.f ? o.f(i, 0, i ? 1 : 0, st[i]) : null; col.push(r && r.length > 1 ? r[1] : 1, r && r.length > 1 ? r[2] : 1, r && r.length > 1 ? r[3] : 1); W(st[i].w);
    for (let j = 0; j < seg; j++) { const a = i * R + j; if (dir < 0) idx.push(ci, a, a + 1); else idx.push(ci, a + 1, a); } };
  if (o.cap0 !== false) cap(0, -1); if (o.cap1 !== false) cap(n - 1, 1);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx); g.computeVertexNormals(); if (pos.some(Number.isNaN)) console.warn('NaN loft', n, o.seg);
  const N = g.attributes.normal; for (let i = 0; i < n; i++) { const a = i * R, b = a + seg; const x = N.getX(a) + N.getX(b), y = N.getY(a) + N.getY(b), z = N.getZ(a) + N.getZ(b), l = Math.hypot(x, y, z) || 1; N.setXYZ(a, x / l, y / l, z / l); N.setXYZ(b, x / l, y / l, z / l); }
  for (const [ci, d] of poles) N.setXYZ(ci, d.x, d.y, d.z);
  return g;
}
// a stock primitive turned into a mergeable part: transform, flat vertex colour, one bone
function prim(g, m, bone, c = [1, 1, 1]) { g = g.index ? g : g; g.applyMatrix4(m); const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n * 3 }, (_, i) => c[i % 3]), 3));
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4); for (let i = 0; i < n; i++) { si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4)); return g; }
const rigid = (gs_) => { const g = mergeGeometries(gs_.map(x => { x.deleteAttribute('skinIndex'); x.deleteAttribute('skinWeight'); return x; })); return g; };
const M4 = (p, q, s) => new THREE.Matrix4().compose(p, q || new THREE.Quaternion(), s || V(1, 1, 1));
const qFromTo = (dir) => new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());

// ---------- procedural PBR maps ----------
function px2f(c) { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const o = new Float32Array(c.width * c.height); for (let i = 0; i < o.length; i++) o[i] = d[i * 4] / 255; return o; }
function strokes(N, seed, count, steps, wid, turn, branch = 0) { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, N, N);
  const r = mulberry32(seed); x.strokeStyle = '#fff'; x.lineCap = 'round';
  const walk = (px, py, a, s, w) => { const P = [[px, py]]; for (let k = 0; k < s; k++) { a += (r() - 0.5) * turn; px += Math.cos(a) * 3; py += Math.sin(a) * 3; P.push([px, py]); if (branch && r() < branch) walk(px, py, a + (r() - 0.5) * 2.2, s * 0.4 | 0, w * 0.6); }
    x.lineWidth = w; for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { x.beginPath(); x.moveTo(P[0][0] + ox, P[0][1] + oy); for (const p of P) x.lineTo(p[0] + ox, p[1] + oy); x.stroke(); } };
  for (let i = 0; i < count; i++) { x.globalAlpha = 0.35 + r() * 0.65; walk(r() * N, r() * N, r() * TAU, steps * (0.4 + r()), wid * (0.5 + r())); }
  return px2f(c); }
function rgbC(N, f) { const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); const im = x.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = f(i); im.data[i * 4] = v[0]; im.data[i * 4 + 1] = v[1]; im.data[i * 4 + 2] = v[2]; im.data[i * 4 + 3] = 255; } x.putImageData(im, 0, 0); return c; }
let _mats = null;
function swMats() {
  if (_mats) return _mats;
  const N = 512;
  // skin: ashy slate-grey, bruised / raw pink-red mottling, scratches & scars, veins; wet-to-dry roughness
  const A = fbmField(N, 77, 6, 4, 0.55), B = fbmField(N, 131, 5, 8, 0.5), C = fbmField(N, 19, 4, 32, 0.5), D = fbmField(N, 7, 4, 3, 0.6);
  const SC = strokes(N, 5, 70, 9, 1.3, 0.35), VE = strokes(N, 9, 40, 22, 0.9, 0.9, 0.04);
  const HS = new Float32Array(N * N);
  const skinAlb = rgbC(N, (i) => { const t = sst(0.3, 0.72, A[i]); const raw = sst(0.56, 0.78, B[i]) * 0.75, bruise = sst(0.42, 0.25, D[i]) * 0.6;
    let c = mix3([74, 80, 84], [112, 118, 121], t); c = mix3(c, [124, 84, 82], raw); c = mix3(c, [50, 46, 54], bruise); c = mix3(c, [150, 104, 98], SC[i] * 0.8); c = mix3(c, [46, 48, 62], VE[i] * 0.45);
    const p = (C[i] - 0.5) * 22; HS[i] = B[i] * 0.45 + C[i] * 0.35 + D[i] * 0.2 - SC[i] * 0.35 + VE[i] * 0.25; return [c[0] + p, c[1] + p, c[2] + p]; });
  const W = fbmField(N, 51, 4, 6, 0.55);
  const skinRgh = rgbC(N, (i) => { const v = 255 * (0.72 - 0.34 * sst(0.45, 0.75, W[i]) + SC[i] * 0.12); return [v, v, v]; });
  const skinNrm = hfNormal(HS, N, 7);
  // bone: bleached ivory to grey-tan, dark hairline fissures and grime in the low spots
  const E = fbmField(N, 301, 6, 4, 0.55), F = fbmField(N, 303, 4, 24, 0.5), CR = strokes(N, 11, 28, 22, 0.9, 0.7, 0.05);
  const HB = new Float32Array(N * N);
  const boneAlb = rgbC(N, (i) => { const g = sst(0.62, 0.3, E[i]); let c = mix3([200, 196, 184], [141, 136, 125], g * 0.85); c = mix3(c, [92, 80, 64], sst(0.32, 0.18, E[i]) * 0.7);
    c = mix3(c, [70, 60, 50], CR[i] * 0.6); const p = (F[i] - 0.5) * 26; HB[i] = E[i] * 0.5 + F[i] * 0.5 - CR[i] * 0.9; return [c[0] + p, c[1] + p, c[2] + p]; });
  const boneRgh = rgbC(N, (i) => { const v = 255 * (0.62 + F[i] * 0.2 + CR[i] * 0.15); return [v, v, v]; });
  const boneNrm = hfNormal(HB, N, 6);
  const rim = (key, s) => (m) => { m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `float rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.4);
    outgoingLight += vec3(0.07, 0.085, 0.11) * ${s} * rimF;
    #include <opaque_fragment>`); }; m.customProgramCacheKey = () => key; return m; };
  const skin = rim('sw2-skin', '1.0')(new THREE.MeshStandardMaterial({ map: texOf(skinAlb, { srgb: true }), normalMap: texOf(skinNrm), normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: texOf(skinRgh), roughness: 1, vertexColors: true }));
  const bone = rim('sw2-bone', '0.8')(new THREE.MeshStandardMaterial({ map: texOf(boneAlb, { srgb: true }), normalMap: texOf(boneNrm), normalScale: new THREE.Vector2(1.4, 1.4), roughnessMap: texOf(boneRgh), roughness: 1, vertexColors: true }));
  const flesh = rim('sw2-flesh', '0.6')(new THREE.MeshStandardMaterial({ color: 0xffffff, map: skin.map, normalMap: skin.normalMap, normalScale: new THREE.Vector2(2, 2), roughness: 0.42, vertexColors: true }));
  const eye = new THREE.MeshBasicMaterial({ color: 0xffffff });
  return (_mats = { skin, bone, flesh, eye });
}

// ---------- the body field: torso + neck sculpt (rest pose, root space, y up, facing +z) ----------
const TORSO = [ // y, z-centre, half-width, half-depth
  [1.0, 0.0, 0.04, 0.04], [1.05, 0.0, 0.12, 0.095], [1.13, -0.005, 0.168, 0.122], [1.24, -0.012, 0.165, 0.116], [1.33, -0.02, 0.118, 0.088], [1.42, -0.022, 0.112, 0.086],
  [1.53, -0.012, 0.148, 0.112], [1.65, 0.0, 0.174, 0.138], [1.77, -0.005, 0.186, 0.148], [1.88, -0.018, 0.19, 0.15], [1.97, -0.03, 0.188, 0.14], [2.04, -0.025, 0.168, 0.11],
  [2.1, -0.008, 0.098, 0.084], [2.16, 0.005, 0.07, 0.07], [2.24, 0.012, 0.064, 0.067], [2.33, 0.018, 0.057, 0.061], [2.41, 0.022, 0.056, 0.06], [2.47, 0.025, 0.062, 0.066], [2.52, 0.02, 0.046, 0.05], [2.55, 0.02, 0.02, 0.025]];
function torsoField(y, a) {
  const s = Math.sin(a), c = Math.cos(a), sd = Math.abs(c), front = Math.max(0, s), back = Math.max(0, -s);
  let k = 1, raw = 0, ao = 0;
  // starved ribcage: 7 ribs sloping down toward the sternum, deep intercostal grooves
  const ribZone = win(1.47, 1.56, 1.94, 2.02, y); const yE = y + 0.075 * s - 0.015 * sd; const ph = (yE - 1.5) / 0.064;
  const rib = Math.pow(0.5 + 0.5 * Math.cos(ph * TAU), 4); const rm = ribZone * (1 - gs(ad(a, -PI / 2) / 0.34)) * (1 - 0.8 * gs(ad(a, PI / 2) / 0.2)) * (0.55 + 0.45 * sd);
  k += rm * (0.08 * rib - 0.03); raw += rm * rib * 0.9; ao += rm * (1 - rib) * 0.55;
  // costal arch and the sucked-in belly beneath it
  const arch = 1.5 + 0.17 * Math.pow(front, 2.2); const archR = gs((y - arch) / 0.02) * (0.4 + front) * (1 - gs(ad(a, -PI / 2) / 0.9));
  k += 0.045 * archR; raw += archR * 0.5;
  const hol = sst(arch + 0.01, arch - 0.13, y) * sst(1.27, 1.37, y); k -= hol * (0.24 * front + 0.1 * sd); ao += hol * (0.5 * front + 0.2);
  // jutting iliac crests / hip bones
  for (const ac of [PI / 2 - 1.0, PI / 2 + 1.0]) { const b = gs(ad(a, ac) / 0.3) * gs((y - 1.25) / 0.035); k += 0.14 * b; raw += b * 0.6; }
  ao += gs((y - 1.19) / 0.04) * front * 0.3;
  // spinous ridge, lumbar ropes, shoulder blades, the hump
  const dB = ad(a, -PI / 2); const spn = gs(dB / 0.13) * win(1.12, 1.28, 2.08, 2.18, y); k += 0.075 * spn; raw += spn * 0.7;
  const lum = (gs((dB - 0.5) / 0.22) + gs((dB + 0.5) / 0.22)) * win(1.2, 1.3, 1.55, 1.75, y); k += 0.06 * lum; ao += gs(dB / 0.25) * win(1.2, 1.3, 1.55, 1.75, y) * 0.3;
  const sca = (gs((dB - 0.75) / 0.32) + gs((dB + 0.75) / 0.32)) * gs((y - 1.93) / 0.085); k += 0.13 * sca; raw += sca * 0.35;
  k += 0.16 * back * gs((y - 1.9) / 0.16);
  // clavicles + collar hollows
  const clv = front * sd * gs((y - 2.045) / 0.014); k += 0.08 * clv; raw += clv * 0.6; ao += front * gs((y - 2.075) / 0.02) * 0.35;
  // neck: rope-like sinew and the two sternomastoid cords
  const nz = sst(2.1, 2.2, y) * (1 - sst(2.44, 2.5, y));
  const cord = Math.pow(Math.abs(Math.cos(4 * a + 0.5)), 8) * 0.1 + 0.1 * (gs(ad(a, PI / 2 - 0.55) / 0.2) + gs(ad(a, PI / 2 + 0.55) / 0.2)); k += nz * cord; raw += nz * cord * 4;
  ao += nz * (1 - Math.pow(Math.abs(Math.cos(4 * a + 0.5)), 2)) * 0.25;
  k *= 1 + 0.035 * (vn(c * 3 + 5, y * 9, s * 3) - 0.5);
  // colour: slate base, raw pink-red over the ridges, cavity darkening, black rotten flesh where the skull is worn
  let col = [1, 1, 1]; col = mix3(col, [1.55, 1.0, 0.95], c01(raw) * 0.75); col = mix3(col, [0.42, 0.4, 0.42], c01(ao));
  const rot = sst(2.32, 2.46, y + 0.04 * (vn(a * 2, y * 20, 1) - 0.5)); col = mix3(col, [0.42, 0.19, 0.16], rot * 0.85);
  return [k, col[0], col[1], col[2]];
}
function torsoAt(y, a) { const [z, rs, rf] = kf(TORSO, y); const k = torsoField(y, a)[0]; return V(Math.cos(a) * rs * k, y, z + Math.sin(a) * rf * k); }

// ---------- the skull (head-local, snout along +z) ----------
const SKULL = [ // z, top, bottom, half-width
  [-0.125, 0.07, 0.025, 0.02], [-0.11, 0.108, 0.0, 0.058], [-0.08, 0.132, -0.014, 0.074], [-0.04, 0.145, -0.02, 0.08], [0.0, 0.142, -0.03, 0.086], [0.05, 0.128, -0.04, 0.096],
  [0.09, 0.108, -0.045, 0.086], [0.13, 0.088, -0.046, 0.062], [0.18, 0.072, -0.046, 0.05], [0.24, 0.056, -0.043, 0.043], [0.3, 0.043, -0.039, 0.036], [0.35, 0.031, -0.033, 0.03], [0.39, 0.018, -0.026, 0.024], [0.415, 0.004, -0.02, 0.01]];
const SE = (a) => { const c = Math.cos(a), s = Math.sin(a); return [Math.sign(c) * Math.pow(Math.abs(c), 0.78), Math.sign(s) * Math.pow(Math.abs(s), 0.78)]; };
const aOrb = (sx) => sx > 0 ? PI - 0.7 : 0.7, aZyg = (sx) => sx > 0 ? PI + 0.32 : -0.32;
const OZ = 0.06;
function skullField(z, a) {
  let k = 1, dark = 0, grime = 0;
  for (const sx of [1, -1]) {
    const r = Math.hypot((z - OZ) / 0.058, ad(a, aOrb(sx)) / 0.6);
    const bowl = Math.pow(Math.max(0, 1 - r * r), 0.5); k -= 0.58 * bowl; dark = Math.max(dark, sst(1.28, 0.85, r));
    const up = Math.max(0, -Math.cos(ad(a, aOrb(sx)) + PI * 0.0)) ; k += (0.16 + 0.08 * up) * gs((r - 1.12) / 0.2); grime += gs((r - 1.25) / 0.15) * 0.5;
    k += 0.13 * gs(ad(a, aZyg(sx)) / 0.2) * win(-0.03, 0.0, 0.1, 0.16, z); grime += gs(ad(a, aZyg(sx) + (sx > 0 ? 0.3 : -0.3)) / 0.2) * win(-0.03, 0.0, 0.1, 0.16, z) * 0.6;
    k -= 0.07 * gs(ad(a, sx > 0 ? PI - 0.75 : 0.75) / 0.35) * win(-0.09, -0.07, -0.02, 0.0, z); // temporal hollow
    k -= 0.08 * gs(ad(a, sx > 0 ? PI - 0.15 : 0.15) / 0.35) * win(0.14, 0.18, 0.28, 0.33, z); grime += gs(ad(a, sx > 0 ? PI - 0.15 : 0.15) / 0.35) * win(0.14, 0.18, 0.28, 0.33, z) * 0.4;
  }
  k += 0.045 * gs(ad(a, PI / 2) / 0.22) * win(0.11, 0.15, 0.33, 0.37, z);
  const nas = gs(ad(a, PI / 2) / 0.55) * sst(0.31, 0.39, z); k -= 0.22 * nas; dark = Math.max(dark, nas * 0.95);
  const nos = sst(0.38, 0.41, z) * (1 - gs(ad(a, -PI / 2) / 0.6)); dark = Math.max(dark, nos * 0.8);
  k *= 1 + 0.04 * (vn(Math.cos(a) * 4, z * 30, Math.sin(a) * 4) - 0.5);
  let col = [1, 0.98, 0.94]; col = mix3(col, [0.55, 0.47, 0.38], c01(grime)); col = mix3(col, [0.035, 0.02, 0.02], c01(dark));
  col = mix3(col, [0.72, 0.68, 0.62], sst(0.0, -0.11, z) * 0.6);
  return [k, col[0], col[1], col[2]];
}
function skullPt(z, a, kOverride) { const [top, bot, w] = kf(SKULL, z); const yc = (top + bot) / 2, hh = (top - bot) / 2; const sh = SE(a); const k = kOverride ?? skullField(z, a)[0]; return V(-sh[0] * w * k, yc + sh[1] * hh * k, z); }
function stationsZ(z0, z1, dz) { const out = []; for (let z = z0; z <= z1 + 1e-6; z += dz) out.push(z); return out; }

function buildHead(M) {
  const bone = [], flesh = [], jaw = [];
  const zs = stationsZ(-0.125, 0.415, 0.0095);
  const skSt = zs.map(z => { const [top, bot, w] = kf(SKULL, z); return { p: V(0, (top + bot) / 2, z), rs: w, rf: (top - bot) / 2, z }; });
  bone.push(loft(skSt, { seg: 26, hint: V(0, 1, 0), shape: SE, f: (i, a) => skullField(skSt[i].z, a), uRep: 1, vScale: 2.5 }));
  // jagged upper teeth along the maxilla
  const r = mulberry32(17); const eyes = [];
  for (const sx of [1, -1]) {
    for (let i = 0; i < 11; i++) { const z = 0.015 + i * 0.03 + (r() - 0.5) * 0.008; const [, bot, w] = kf(SKULL, z); const L = (i > 7 ? 0.034 : 0.018) + r() * 0.016;
      const d = V(sx * (0.15 + r() * 0.2), -1, 0.2 + r() * 0.3).normalize();
      bone.push(prim(new THREE.ConeGeometry(0.0055 + r() * 0.002, L, 5), M4(V(sx * w * 0.72, bot + 0.004 - L * 0.45, z), qFromTo(d)), 0, [0.92, 0.84, 0.66])); }
    // pinpoint eyeshine set deep in each socket
    const e = skullPt(OZ, aOrb(sx), 0.5); eyes.push(e);
  }
  // antlers: thick curved main beam, burr at the pedicle, four tapered tines each
  for (const sx of [1, -1]) {
    const P = [[0.04, 0.115, -0.035], [0.1, 0.18, -0.12], [0.19, 0.25, -0.24], [0.27, 0.33, -0.36], [0.32, 0.42, -0.48], [0.33, 0.52, -0.58], [0.3, 0.6, -0.64]].map(p => V(sx * p[0], p[1], p[2]));
    const cv = new THREE.CatmullRomCurve3(P); const NS = 28; const st = [];
    for (let i = 0; i <= NS; i++) { const t = i / NS; const rr = 0.034 * (1 - 0.72 * t) + 0.002; st.push({ p: cv.getPoint(t), rs: rr, rf: rr * 0.88 }); }
    bone.push(loft(st, { seg: 10, hint: V(1, 0, 0), uRep: 1, vScale: 3, f: (i, a, t) => { const burr = gs((t - 0.05) / 0.028) * (0.35 + 0.35 * vn(a * 3, sx, 0)); const kk = (1 + burr) * (1 + 0.1 * (vn(Math.cos(a) * 2, t * 30, sx * 5) - 0.5) + 0.05 * Math.pow(Math.abs(Math.cos(3 * a + t * 8)), 4));
      let col = mix3([0.66, 0.63, 0.57], [0.95, 0.92, 0.85], sst(0.2, 1, t)); col = mix3(col, [0.42, 0.37, 0.32], c01(burr * 1.6)); return [kk, ...col]; } }));
    const tines = [[0.13, 0.24, [0.22, 0.75, 0.62]], [0.32, 0.27, [0.18, 0.95, 0.15]], [0.53, 0.24, [0.22, 0.9, -0.1]], [0.74, 0.18, [0.1, 0.9, -0.25]]];
    for (const [tb, len, d0] of tines) { const b = cv.getPoint(tb); const d = V(sx * d0[0], d0[1], d0[2]).normalize(); const up = V(0, 0.66, -0.75);
      const p1 = b.clone().addScaledVector(d, len * 0.5), p2 = b.clone().addScaledVector(d, len * 0.85).addScaledVector(up, len * 0.28);
      const c2 = new THREE.CatmullRomCurve3([b.clone().addScaledVector(d, -0.01), p1, p2]); const r0 = (0.03 * (1 - 0.72 * tb) + 0.002) * 0.62; const ts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; const rr = r0 * (1 - 0.9 * Math.pow(t, 0.9)) + 0.0012; ts.push({ p: c2.getPoint(t), rs: rr, rf: rr }); }
      bone.push(loft(ts, { seg: 7, uRep: 1, vScale: 3, f: (i, a, t) => [1 + 0.08 * (vn(a, t * 20, tb * 9) - 0.5), ...mix3([0.68, 0.65, 0.59], [1.0, 0.97, 0.9], t)] })); }
  }
  // torn blackened flesh over the back of the skull, temples and jaw hinge, ragged front edge
  const edge = (a) => { const s = Math.sin(a); const base = s > 0 ? -0.03 - 0.035 * s : 0.03 + 0.06 * (-s); return base + 0.03 * (vn(Math.cos(a) * 3, Math.sin(a) * 3, 4) - 0.5) + 0.01 * Math.sin(a * 23); };
  const fz = stationsZ(-0.13, 0.11, 0.008);
  const fSt = fz.map(z => { const [top, bot, w] = kf(SKULL, Math.max(-0.125, z)); return { p: V(0, (top + bot) / 2 - 0.004, z), rs: w + 0.004, rf: (top - bot) / 2 + 0.004, z }; });
  flesh.push(loft(fSt, { seg: 24, hint: V(0, 1, 0), shape: SE, cap1: false, f: (i, a) => { const z = fSt[i].z; const e = edge(a); const on = z < e; const sk = skullField(Math.max(-0.125, z), a)[0];
    const kk = on ? Math.max(sk, 0.95) * (1.035 + 0.035 * vn(Math.cos(a) * 6, z * 40, 2)) : sk * 0.8; const v = vn(Math.cos(a) * 5, z * 50, Math.sin(a) * 5);
    return [kk, ...mix3([0.11, 0.06, 0.055], [0.32, 0.1, 0.08], v * (sst(e - 0.04, e, z)))]; } }));
  // hanging strips of torn skin and sinew around the hinge and under the skull
  for (let i = 0; i < 9; i++) { const sx = i % 2 ? 1 : -1; const a = sx > 0 ? PI + 0.2 + r() * 0.9 : -0.2 - r() * 0.9; const z0 = 0.0 + r() * 0.07; const base = skullPt(Math.min(z0, 0.08), a, 1.0).add(V(0, 0, 0));
    const L = 0.06 + r() * 0.08; const st = []; for (let j = 0; j <= 6; j++) { const t = j / 6; st.push({ p: base.clone().add(V(sx * 0.008 * t, -L * t, -0.02 * t + (r() - 0.5) * 0.008)), rs: 0.012 * (1 - 0.85 * t) + 0.001, rf: 0.0025 }); }
    flesh.push(loft(st, { seg: 6, hint: V(0, 0, 1), f: (j, aa, t) => [1, 0.16, 0.07, 0.06] })); }
  // dark wet flesh inside the sockets and nasal cavity
  for (const sx of [1, -1]) { const c = skullPt(OZ, aOrb(sx), 0.25); flesh.push(prim(new THREE.SphereGeometry(0.026, 10, 8), M4(c, null, V(0.7, 1, 1.1)), 0, [0.02, 0.01, 0.01])); }
  flesh.push(prim(new THREE.SphereGeometry(0.02, 8, 6), M4(V(0, 0.0, 0.37), null, V(1, 0.8, 2)), 0, [0.05, 0.02, 0.02]));
  // lower jaw (hinged at the condyle): mandible bodies, rami, jagged teeth
  const JP = V(0, -0.028, -0.032);
  for (const sx of [1, -1]) {
    const st = []; for (let i = 0; i <= 22; i++) { const t = i / 22; const z = -0.035 + t * 0.415; const [, bot] = kf(SKULL, Math.min(0.41, z)); const x = sx * (0.074 * Math.pow(1 - t, 0.85) + 0.011 * t); const hh = 0.024 * (1 - 0.45 * t) + 0.004;
      st.push({ p: V(x, bot - 0.001 - hh - 0.004 * Math.sin(t * PI), z).sub(JP), rs: 0.0095 * (1 - 0.3 * t), rf: hh, t }); }
    jaw.push(loft(st, { seg: 10, hint: V(0, 1, 0), f: (i, a, t) => { const fl = sst(0.25, 0.0, t); return [1 + 0.05 * (vn(a * 2, t * 20, sx) - 0.5), ...mix3([0.95, 0.92, 0.86], [0.3, 0.13, 0.11], fl * 0.85)]; } }));
    const rs = []; for (let i = 0; i <= 8; i++) { const t = i / 8; rs.push({ p: V(sx * 0.073, -0.085 + t * 0.065, -0.038 + t * 0.006).sub(JP), rs: 0.008, rf: 0.024 * (1 - 0.5 * t) }); }
    jaw.push(loft(rs, { seg: 8, hint: V(0, 0, 1), f: () => [1, 0.3, 0.13, 0.11] }));
    for (let i = 0; i < 10; i++) { const t = 0.08 + i * 0.085 + (r() - 0.5) * 0.02; const s0 = st[Math.round(t * 22)]; const L = (i > 6 ? 0.03 : 0.017) + r() * 0.014;
      const d = V(sx * (0.1 + r() * 0.2), 1, 0.25 + r() * 0.3).normalize(); jaw.push(prim(new THREE.ConeGeometry(0.0052 + r() * 0.002, L, 5), M4(s0.p.clone().add(V(0, s0.rf + L * 0.42, 0)), qFromTo(d)), 0, [0.9, 0.82, 0.64])); }
  }
  return { bone: rigid(bone), flesh: rigid(flesh), jaw: rigid(jaw), eyes, jawPivot: JP };
}

export function buildSkinwalker() {
  const M = swMats(); const root = new THREE.Group(); root.name = 'skinwalker';
  const J = {}; const hitMeshes = []; const bones = []; const BI = {};
  const joint = (name, parent, x, y, z) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); J[name] = g; BI[name] = bones.length; bones.push(g); return g; };
  const pelvis = joint('pelvis', root, 0, 1.22, 0); const spine = joint('spine', pelvis, 0, 0.05, 0); const chest = joint('chest', spine, 0, 0.62, -0.02);
  const neck = joint('neck', chest, 0, 0.2, 0.02); const head = joint('head', neck, 0, 0.36, 0.02);
  const LA = 0.62, LF = 0.6, FL = [0.15, 0.175, 0.17, 0.145];
  for (const sx of [-1, 1]) { const S = sx < 0 ? 'L' : 'R';
    const sh = joint('sh' + S, chest, sx * 0.215, 0.13, -0.03); const el = joint('el' + S, sh, 0, -LA, 0); const wr = joint('wr' + S, el, 0, -LF, 0);
    for (let f = 0; f < 4; f++) { const a = joint(`f${S}${f}a`, wr, sx * (f - 1.5) * 0.019, -0.115, 0.004); joint(`f${S}${f}b`, a, 0, -FL[f], 0); } }
  for (const sx of [-1, 1]) { const S = sx < 0 ? 'L' : 'R'; const th = joint('th' + S, pelvis, sx * 0.12, -0.04, 0); const kn = joint('kn' + S, th, 0, -0.56, 0); const an = joint('an' + S, kn, 0, -0.56, 0); joint('ft' + S, an, 0, -0.34, 0); }
  root.updateMatrixWorld(true); const WP = (n) => J[n].getWorldPosition(V(0, 0, 0));
  const parts = [];
  // torso + neck, one continuous sculpted tube (pelvis -> spine -> chest -> neck -> head weights)
  { const ys = []; for (let y = 1.0; y < 2.555; y += (y > 1.44 && y < 2.06) ? 0.012 : 0.024) ys.push(y); if (ys[ys.length - 1] < 2.554) ys.push(2.555);
    const tw = (y) => y < 1.36 ? wb(BI.pelvis, BI.spine, 1.18, 1.36, y) : y < 1.99 ? wb(BI.spine, BI.chest, 1.79, 1.99, y) : y < 2.2 ? wb(BI.chest, BI.neck, 2.06, 2.2, y) : wb(BI.neck, BI.head, 2.37, 2.48, y);
    const st = ys.map(y => { const [z, rs, rf] = kf(TORSO, y); return { p: V(0, y, z), rs, rf, y, w: tw(y) }; });
    parts.push(loft(st, { seg: 28, hint: V(0, 0, 1), uRep: 2, vScale: 1.6, f: (i, a) => torsoField(st[i].y, a) }));
    // serrated vertebral spines along the arched back and neck: jagged, bony, pale where they strain the skin
    const r = mulberry32(3); let i = 0;
    for (let y = 1.3; y < 2.36; y += (y > 2.1 ? 0.052 : 0.046), i++) { const p = torsoAt(y, -PI / 2); const hump = gs((y - 1.9) / 0.22); const sz = (1.1 + 1.3 * hump) * (y > 2.12 ? 0.7 : 1) * (i % 2 ? 0.7 : 1.15) * (0.85 + r() * 0.3);
      const d = V((r() - 0.5) * 0.15, -0.45, -1).normalize(); const hgt = 0.048 * sz; p.addScaledVector(d, -0.008);
      parts.push(prim(new THREE.ConeGeometry(0.02 * sz, hgt, 6, 1), M4(p.clone().addScaledVector(d, hgt * 0.45), qFromTo(d), V(0.55, 1, 1.25)), 0, [1.75, 1.45, 1.35]));
      const w = tw(y); const g = parts[parts.length - 1]; const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight; for (let v = 0; v < SI.count; v++) { SI.setXYZW(v, w[0][0], w[1] ? w[1][0] : 0, 0, 0); SW.setXYZW(v, w[0][1], w[1] ? w[1][1] : 0, 0, 0); } }
  }
  // arms: hunched deltoids, gaunt corded biceps/triceps, bony elbows, tendon-strung forearms, long gnarled clawed hands
  const ARM = [[-0.08, 0.02], [-0.06, 0.046], [-0.03, 0.062], [0.03, 0.066], [0.12, 0.054], [0.2, 0.045], [0.35, 0.041], [0.5, 0.033], [0.6, 0.035], [0.66, 0.04], [0.78, 0.036], [0.95, 0.026], [1.1, 0.02], [1.2, 0.021], [1.25, 0.018]];
  for (const sx of [-1, 1]) { const S = sx < 0 ? 'L' : 'R'; const sh = WP('sh' + S), wr = WP('wr' + S); const lat = sx > 0 ? PI : 0;
    const ds = []; for (let d = -0.08; d <= 1.25; d += 0.025) ds.push(d);
    const aw = (d) => d < 0.9 ? wb(BI['sh' + S], BI['el' + S], 0.53, 0.68, d) : wb(BI['el' + S], BI['wr' + S], 1.16, 1.24, d);
    const st = ds.map(d => { const r0 = kf(ARM, d)[0]; return { p: V(sh.x, sh.y - d, sh.z + 0.012 * Math.sin(d * 5)), rs: r0 * 0.95, rf: r0 * 1.05, d, w: aw(d) }; });
    parts.push(loft(st, { seg: 12, hint: V(0, 0, 1), uRep: 1, vScale: 2, f: (i, a) => { const d = st[i].d; const sd = Math.abs(Math.cos(a)); let k = 1, raw = 0, ao = 0;
      const del = gs((d - 0.04) / 0.07) * (0.55 + 0.45 * Math.cos(ad(a, lat))); k += 0.16 * del; raw += del * 0.45;
      const bi = gs((d - 0.3) / 0.09) * gs(ad(a, PI / 2) / 0.7); k += 0.2 * bi; const tri = gs((d - 0.22) / 0.1) * gs(ad(a, -PI / 2) / 0.8); k += 0.15 * tri;
      const grv = sd * win(0.14, 0.24, 0.44, 0.54, d); k -= 0.08 * grv; ao += grv * 0.4;
      const olc = gs((d - 0.62) / 0.03) * gs(ad(a, -PI / 2) / 0.5); k += 0.38 * olc; raw += olc; const epi = gs((d - 0.6) / 0.025) * sd; k += 0.15 * epi; raw += epi * 0.6;
      const fa = gs((d - 0.73) / 0.07) * (gs(ad(a, lat) / 0.9) + 0.5); k += 0.16 * fa;
      const td = Math.pow(Math.abs(Math.cos(3 * a)), 6) * win(0.85, 0.95, 1.12, 1.18, d); k += 0.08 * td; ao += (1 - td) * win(0.85, 0.95, 1.12, 1.18, d) * 0.15;
      const wk = gs((d - 1.2) / 0.02) * sd; k += 0.14 * wk; raw += wk * 0.6;
      k *= 1 + 0.03 * (vn(a * 1.5, d * 12, sx) - 0.5);
      let col = mix3([1, 1, 1], [1.5, 1.0, 0.95], c01(raw) * 0.7); col = mix3(col, [0.45, 0.43, 0.45], c01(ao)); return [k, ...col]; } }));
    // palm + thumb
    const ps = []; for (let i = 0; i <= 8; i++) { const t = i / 8; ps.push({ p: V(wr.x, wr.y + 0.02 - t * 0.135, wr.z + 0.004), rs: 0.022 + 0.017 * Math.sin(Math.min(1, t * 1.6) * PI / 2), rf: 0.012 + 0.003 * Math.sin(t * PI), w: [[BI['wr' + S], 1]] }); }
    parts.push(loft(ps, { seg: 12, hint: V(0, 0, 1), f: (i, a, t) => { const kn = gs((t - 0.92) / 0.08) * Math.max(0, -Math.sin(a)); return [1 + 0.25 * kn, ...mix3([1, 1, 1], [1.45, 1.0, 0.95], kn)]; } }));
    const th = []; for (let i = 0; i <= 12; i++) { const t = i / 12; const p = V(wr.x - sx * (0.03 + 0.02 * t), wr.y - 0.03 - 0.13 * t, wr.z + 0.012 + 0.035 * t + 0.03 * t * t); th.push({ p, rs: (0.011 * (1 - 0.6 * t) + 0.002) * (t > 0.75 ? 1 - (t - 0.75) * 3.4 : 1) + 0.0006, rf: 0.0105 * (1 - 0.5 * t) * (t > 0.75 ? 1 - (t - 0.75) * 3.4 : 1) + 0.0006, w: [[BI['wr' + S], 1]], t }); }
    parts.push(loft(th, { seg: 8, f: (i, a, t) => [1, ...(t > 0.72 ? [0.22, 0.18, 0.15] : [1, 1, 1])] }));
    for (let f = 0; f < 4; f++) { const fa = WP(`f${S}${f}a`); const la = FL[f]; const e1 = la + 0.12, e2 = e1 + 0.07; const RF = [[-0.03, 0.011], [0, 0.0115], [0.02, 0.0094], [la * 0.5, 0.0076], [la - 0.012, 0.0092], [la, 0.0106], [la + 0.016, 0.0084], [la + 0.07, 0.0066], [e1 - 0.006, 0.0073], [e1, 0.0068], [e1 + 0.025, 0.0048], [e1 + 0.05, 0.0024], [e2, 0.0005]];
      const es = []; for (let e = -0.03; e < e2; e += 0.016) es.push(e); if (es[es.length - 1] < e2 - 0.001) es.push(e2);
      const fw = (e) => e < la * 0.5 ? wb(BI['wr' + S], BI[`f${S}${f}a`], -0.015, 0.012, e) : wb(BI[`f${S}${f}a`], BI[`f${S}${f}b`], la - 0.012, la + 0.012, e);
      const st = es.map(e => { const r0 = kf(RF, e)[0]; const hk = Math.max(0, e - e1); return { p: V(fa.x + sx * (f - 1.5) * 0.006 * e / 0.3, fa.y - e + hk * hk * 3, fa.z + 0.002 + hk * 0.55 + hk * hk * 6), rs: r0, rf: r0 * 0.95, e, w: fw(e) }; });
      parts.push(loft(st, { seg: 6, vScale: 3, f: (i, a) => { const e = st[i].e; const kn = gs((e - la) / 0.012) + gs((e - e1 + 0.004) / 0.01) * 0.7; const cl = sst(e1 - 0.002, e1 + 0.01, e);
        let col = mix3([1, 1, 1], [1.45, 1.02, 0.96], kn * 0.6); col = mix3(col, [0.2, 0.16, 0.13], cl); return [1 + 0.06 * kn * Math.max(0, -Math.sin(a)) + 0.05 * (vn(a, e * 40, f + sx) - 0.5), ...col]; } })); }
  }
  // legs: crouched, corded thighs, bony knees, long raked shins, a heel-hock and a long metatarsal ending in clawed toes
  const LEG = [[-0.12, 0.05], [-0.09, 0.096], [-0.02, 0.108], [0.1, 0.098], [0.25, 0.08], [0.4, 0.062], [0.5, 0.052], [0.56, 0.054], [0.6, 0.05], [0.68, 0.052], [0.8, 0.042], [0.95, 0.032], [1.08, 0.029], [1.12, 0.033], [1.18, 0.026], [1.32, 0.022], [1.42, 0.024], [1.47, 0.02], [1.49, 0.008]];
  for (const sx of [-1, 1]) { const S = sx < 0 ? 'L' : 'R'; const th = WP('th' + S), ft = WP('ft' + S); const med = sx > 0 ? 0 : PI;
    const ds = []; for (let d = -0.12; d <= 1.49; d += 0.03) ds.push(d); if (ds[ds.length - 1] < 1.489) ds.push(1.49);
    const lw = (d) => d < 0.3 ? wb(BI.pelvis, BI['th' + S], -0.1, 0.08, d) : d < 0.85 ? wb(BI['th' + S], BI['kn' + S], 0.5, 0.62, d) : d < 1.3 ? wb(BI['kn' + S], BI['an' + S], 1.06, 1.16, d) : wb(BI['an' + S], BI['ft' + S], 1.42, 1.47, d);
    const st = ds.map(d => { const r0 = kf(LEG, d)[0]; return { p: V(th.x, th.y - d, th.z), rs: r0 * 0.95, rf: r0 * 1.06, d, w: lw(d) }; });
    parts.push(loft(st, { seg: 14, hint: V(0, 0, 1), uRep: 1, vScale: 2, f: (i, a) => { const d = st[i].d; const sd = Math.abs(Math.cos(a)); let k = 1, raw = 0, ao = 0;
      const q = gs((d - 0.2) / 0.12) * gs(ad(a, PI / 2) / 0.9); k += 0.16 * q; const vm = gs((d - 0.44) / 0.05) * gs(ad(a, PI / 2 + (sx > 0 ? 0.6 : -0.6)) / 0.5); k += 0.14 * vm;
      const hm = gs((d - 0.25) / 0.12) * gs(ad(a, -PI / 2) / 0.8); k += 0.1 * hm; const it = sd * win(0.05, 0.15, 0.4, 0.5, d) * gs(ad(a, med) / 0.6); k -= 0.06 * it; ao += it * 0.4;
      const pat = gs((d - 0.565) / 0.03) * gs(ad(a, PI / 2) / 0.6); k += 0.3 * pat; raw += pat;
      const calf = gs((d - 0.72) / 0.07) * gs(ad(a, -PI / 2) / 0.9); k += 0.22 * calf; const tib = gs(ad(a, PI / 2) / 0.25) * win(0.62, 0.7, 1.0, 1.08, d); k += 0.07 * tib; raw += tib * 0.5;
      const ach = gs(ad(a, -PI / 2) / 0.3) * win(0.85, 0.92, 1.05, 1.1, d); k += 0.12 * ach; const hock = gs((d - 1.12) / 0.025) * gs(ad(a, -PI / 2) / 0.6); k += 0.4 * hock; raw += hock * 0.8;
      const mt = Math.pow(Math.abs(Math.cos(2 * a)), 6) * win(1.18, 1.22, 1.38, 1.42, d); k += 0.08 * mt;
      k *= 1 + 0.03 * (vn(a * 1.5, d * 12, sx + 3) - 0.5);
      let col = mix3([1, 1, 1], [1.5, 1.0, 0.95], c01(raw) * 0.7); col = mix3(col, [0.45, 0.43, 0.45], c01(ao)); return [k, ...col]; } }));
    for (let t = 0; t < 3; t++) { const yaw = (t - 1) * 0.32 * 1 + sx * 0.06; const dir = V(Math.sin(yaw), -0.12, Math.cos(yaw)).normalize(); const L = t === 1 ? 0.15 : 0.12; const st = [];
      for (let i = 0; i <= 12; i++) { const u = i / 12, e = u * (L + 0.05); const hk = Math.max(0, e - L); const p = ft.clone().add(V(0, 0.01, 0)).addScaledVector(dir, e).add(V(0, -hk * 0.5 - hk * hk * 4, 0));
        const r0 = e < L ? 0.014 * (1 - 0.35 * e / L) + 0.003 * gs((e - L * 0.55) / 0.015) : 0.0085 * (1 - hk / 0.05) + 0.0006; st.push({ p, rs: r0, rf: r0 * 0.85, w: [[BI['ft' + S], 1]], cl: e > L - 0.004 }); }
      parts.push(loft(st, { seg: 7, hint: V(0, 1, 0), f: (i) => [1, ...(st[i].cl ? [0.2, 0.16, 0.13] : [1, 1, 1])] })); }
  }
  const bodyGeo = mergeGeometries(parts); bodyGeo.computeBoundingSphere();
  const body = new THREE.SkinnedMesh(bodyGeo, M.skin); body.name = 'sw-body'; body.castShadow = true; body.frustumCulled = false; root.add(body);
  const skel = new THREE.Skeleton(bones); body.bind(skel, new THREE.Matrix4());
  // skull, antlers, jaw, flesh, eyes ride the head joint rigidly
  const H = buildHead(M); const add = (g, mat, parent) => { const m = new THREE.Mesh(g, mat); m.castShadow = true; m.frustumCulled = false; parent.add(m); return m; };
  const skull = add(H.bone, M.bone, head); add(H.flesh, M.flesh, head); hitMeshes.push(skull);
  const jaw = new THREE.Group(); jaw.position.copy(H.jawPivot); head.add(jaw); J.jaw = jaw; add(H.jaw, M.bone, jaw);
  const eyeMat = new THREE.SpriteMaterial({ map: radialSprite('rgba(255,255,250,1)', 'rgba(210,230,255,0)', 64), color: 0xf4f8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false });
  J.eyes = []; const dots = [];
  for (const e of H.eyes) { const s = new THREE.Sprite(eyeMat); s.scale.set(0.03, 0.03, 1); s.position.copy(e); head.add(s); J.eyes.push(s); dots.push(new THREE.SphereGeometry(0.0055, 8, 6).translate(e.x, e.y, e.z)); }
  const dot = new THREE.Mesh(mergeGeometries(dots), M.eye); head.add(dot); J.eyeDot = dot; J.eyeMat = eyeMat;
  // generous invisible hit volumes (body + head) so a 9mm at night actually connects
  const proxyM = new THREE.MeshBasicMaterial({ visible: false });
  const px = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 1.4, 3, 8), proxyM); px.position.y = 1.3; root.add(px); J.proxy = px; hitMeshes.push(px);
  const hp = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), proxyM); hp.position.set(0, 0.06, 0.12); head.add(hp); hitMeshes.push(hp);
  root.scale.setScalar(1.08);
  let tris = 0; root.traverse(o => { if (o.isMesh && o.geometry.index && o.material.visible !== false) tris += o.geometry.index.count / 3; });
  root.userData = { J, hitMeshes, stats: { tris, bones: bones.length } };
  return root;
}

// ---------- animation ----------
// Every mode is a function of the shared stride phase that returns a full joint-angle set; the rig blends the outgoing and
// incoming modes, smooths the result, grounds the feet on the terrain (and, on all fours, IK-plants the hands on it).
const LEGL = [0.56, 0.56, 0.34], ARM_U = 0.62, ARM_F = 0.6;
const _v = new THREE.Vector3();
const clampU = (x) => Math.max(-1, Math.min(1, x));
const legA = (ph, A, tb, kn, kl, an, al) => { const s = A * Math.sin(ph), lf = Math.max(0, Math.cos(ph)); return [-tb - s, kn + kl * lf, -an - al * lf]; };
function poseRig(J, a, gnd) {
  const tot = a.lean + a.hunch;
  J.spine.rotation.set(a.lean, a.twist || 0, (a.roll || 0) * -0.6);
  J.chest.rotation.set(a.hunch, (a.twist || 0) * 0.6, 0); J.chest.scale.setScalar(1 + (a.breath || 0));
  J.neck.rotation.set(a.neckP, -(a.twist || 0) * 0.8, 0); J.head.rotation.set(a.headP, a.headY || 0, a.headR || 0); J.jaw.rotation.x = Math.max(0.02, a.jaw ?? 0.15);
  const lo = a.legOut || 0.05;
  for (const S of ['L', 'R']) { const sg = S === 'L' ? -1 : 1; const t1 = a['th' + S], t2 = a['kn' + S], t3 = a['an' + S];
    J['th' + S].rotation.set(t1, 0, sg * lo); J['kn' + S].rotation.set(t2, 0, 0); J['an' + S].rotation.set(t3, 0, 0); J['ft' + S].rotation.set(-(t1 + t2 + t3) - 0.04, 0, 0); }
  // ground the feet exactly: solve the leg chain with the pelvis at 0, then lift it so the lowest foot (on its own patch of terrain) touches down
  J.pelvis.position.y = 0; J.pelvis.rotation.set(0, 0, a.roll || 0); J.root.updateMatrixWorld(true); let py = -1e9;
  for (const S of ['L', 'R']) { J['ft' + S].getWorldPosition(_v); J.root.worldToLocal(_v); py = Math.max(py, -_v.y + 0.05 + (gnd ? gnd(_v.x, _v.z) : 0)); }
  J.pelvis.position.y = py + (a.hipH || 0);
  const q = a.quad || 0; if (q > 0.001) J.root.updateMatrixWorld(true);
  for (const S of ['L', 'R']) { const sg = S === 'L' ? -1 : 1;
    let shL = a['sh' + S] - tot, sz = sg * (a['sz' + S] ?? 0.1), elL = -a['el' + S], wrL = a['wr' + S];
    if (q > 0.001) { // two-bone IK: plant the wrist on the ground ahead of the shoulder, elbow pointing back
      J['sh' + S].getWorldPosition(_v); J.root.worldToLocal(_v);
      const tx = _v.x + sg * 0.13, tz = _v.z + (a.reach || 0.2) + (a['hf' + S] || 0), ty = (gnd ? gnd(tx, tz) : 0) + 0.15 + (a['hl' + S] || 0);
      const dx = tx - _v.x, dy = ty - _v.y, dz = tz - _v.z; const D = Math.min(ARM_U + ARM_F - 0.03, Math.max(0.35, Math.hypot(dx, dy, dz)));
      const g = Math.asin(Math.max(-0.8, Math.min(0.8, dx / D))), phi = Math.atan2(-dz, -dy);
      const al = Math.acos(clampU((ARM_U * ARM_U + D * D - ARM_F * ARM_F) / (2 * ARM_U * D))), e = PI - Math.acos(clampU((ARM_U * ARM_U + ARM_F * ARM_F - D * D) / (2 * ARM_U * ARM_F)));
      const thu = phi + al; shL += (thu - tot - shL) * q; sz += (g - sz) * q; elL += (-e - elL) * q; wrL += ((a['pw' + S] ?? -1.2) - (thu - e) - wrL) * q; }
    J['sh' + S].rotation.set(shL, 0, sz); J['el' + S].rotation.set(elL, 0, 0); J['wr' + S].rotation.set(wrL, 0, 0);
    const cu = a['cu' + S] ?? 0.6; for (let f = 0; f < 4; f++) { J[`f${S}${f}a`].rotation.x = -cu * (0.8 + f * 0.1); J[`f${S}${f}b`].rotation.x = -cu * 1.3; } }
}
// stride length per cycle (m) and the slowest cycle rate, per mode
const CYCLE = { idle: null, stalk: { len: 1.8, min: 0.45 }, crawl: { len: 1.05, min: 0.5 }, run: { len: 4.2, min: 1.4 }, gallop: { len: 4.6, min: 1.6 }, flinch: null };
const LIMB = { // contact phase offsets: hind legs L/R, fore (hands) L/R
  stalk: [0, PI], run: [0, PI], crawl: [0, PI, PI, 0], gallop: [0, 0.45, PI + 0.2, PI + 0.65] };
function armsFK(o, S, ph, base, amp, el, elAmp, cu) { const s = Math.sin(ph); o['sh' + S] = base + amp * s; o['el' + S] = el + elAmp * Math.max(0, -s); o['wr' + S] = -0.25; o['cu' + S] = cu; o['sz' + S] = 0.1; }
function legsOf(o, phL, phR, P) { const L = legA(phL, ...P), R = legA(phR, ...P); o.thL = L[0]; o.knL = L[1]; o.anL = L[2]; o.thR = R[0]; o.knR = R[1]; o.anR = R[2]; }
const MODES = {
  // lurk: heavy slow breathing through the ribs, the head snapping to new tilts, fingers twitching, jaw clicks
  idle(ph, s) { const br = Math.sin(s.t * 1.1), o = { lean: 0.42 + 0.02 * br, hunch: 0.82 + 0.06 * br, neckP: 0.66 - 0.04 * br, headP: -1.02 + s.tw.p, headY: s.tw.y + s.look * 0.5, headR: s.tw.r, jaw: 0.12 + 0.03 * br, twist: 0, roll: 0, breath: 0.035 * br, hipH: 0, legOut: 0.06, quad: 0 };
    armsFK(o, 'L', 0, -0.12 + 0.04 * br + 0.04 * Math.sin(s.t * 0.7), 0, 0.62, 0, 0.6 + 0.2 * Math.sin(s.t * 2.3)); armsFK(o, 'R', 0, -0.1 + 0.04 * br + 0.04 * Math.sin(s.t * 0.6 + 2), 0, 0.6, 0, 0.6 + 0.2 * Math.sin(s.t * 1.9 + 1));
    legsOf(o, 0, 0, [0, 0.6, 1.25, 0, 0.9, 0]); return o; },
  // stalk: loping hunched bipedal walk, spine swaying, long arms swinging low, head scanning toward the player
  stalk(ph, s) { const sn = Math.sin(ph), o = { lean: 0.6 + 0.04 * Math.sin(2 * ph), hunch: 0.8, neckP: 0.5, headP: -0.95 + s.tw.p * 0.5, headY: s.look + 0.35 * Math.sin(s.t * 0.8) * (1 - Math.abs(s.look)), headR: s.tw.r * 0.5, jaw: 0.18, twist: 0.14 * sn, roll: 0.05 * sn, breath: 0.02 * Math.sin(s.t * 1.6), hipH: 0.025 * Math.cos(2 * ph), legOut: 0.08, quad: 0 };
    armsFK(o, 'L', ph, -0.12, 0.32, 0.6, 0.3, 0.8); armsFK(o, 'R', ph + PI, -0.12, 0.32, 0.6, 0.3, 0.8);
    legsOf(o, ph, ph + PI, [0.4, 0.85, 1.6, 0.55, 1.15, 0.3]); return o; },
  // crawl: hips dropped, spine level, splayed legs folding/pulling, clawed hands reaching and planting, head craned up at the player
  crawl(ph, s) { const o = { lean: 1.42, hunch: 0.2 + 0.06 * Math.sin(2 * ph), neckP: -0.5, headP: -1.12 + s.tw.p * 0.3, headY: s.look * 0.9, headR: s.tw.r * 0.25, jaw: 0.32 + 0.05 * Math.sin(s.t * 9), twist: 0.12 * Math.sin(ph), roll: 0.06 * Math.sin(ph), breath: 0.02 * Math.sin(s.t * 6), hipH: -0.02, legOut: 0.5, quad: 1, reach: 0.12 };
    legsOf(o, ph, ph + PI, [0.3, 1.55, 2.5, 0.3, 1.6, 0.15]);
    for (const [S, p] of [['L', ph + PI], ['R', ph]]) { o['hf' + S] = 0.3 * Math.sin(p); o['hl' + S] = 0.14 * Math.max(0, Math.cos(p)); o['pw' + S] = -1.15; o['cu' + S] = 0.45 + 0.4 * Math.max(0, Math.cos(p)); }
    armsFK(o, 'L', 0, -1.2, 0, 0.5, 0, 0.5); armsFK(o, 'R', 0, -1.2, 0, 0.5, 0, 0.5); o.cuL = 0.45; o.cuR = 0.45; return o; },
  // run: hunched bipedal sprint, lunging arms, spine pumping, jaw snapping wide
  run(ph, s) { const sn = Math.sin(ph), s2 = Math.sin(2 * ph), o = { lean: 0.8 + 0.06 * s2, hunch: 0.45 + 0.1 * s2, neckP: 0.3, headP: -0.8, headY: s.look * 0.5, headR: 0, jaw: 0.35 + 0.3 * Math.max(0, s2), twist: 0.2 * sn, roll: 0.04 * sn, breath: 0, hipH: 0.08 * Math.abs(sn), legOut: 0.06, quad: 0 };
    armsFK(o, 'L', ph, -0.4, 1.1, 0.75, 0.6, 0.7); armsFK(o, 'R', ph + PI, -0.4, 1.1, 0.75, 0.6, 0.7);
    legsOf(o, ph, ph + PI, [0.95, 0.45, 1.0, 1.0, 0.8, 0.55]); return o; },
  // gallop: frantic low-slung bound on all fours, spine flexing and extending, hands lunging out, jaws gaping
  gallop(ph, s) { const sn = Math.sin(ph), o = { lean: 1.18 - 0.1 * sn, hunch: 0.38 + 0.3 * sn, neckP: -0.38 - 0.1 * sn, headP: -1.0 + 0.05 * Math.sin(2 * ph), headY: s.look * 0.6, headR: 0, jaw: 0.45 + 0.35 * Math.max(0, Math.sin(2 * ph + 1)), twist: 0.05 * sn, roll: 0, breath: 0, hipH: 0.03 + 0.08 * Math.max(0, -Math.cos(ph)), legOut: 0.22, quad: 1, reach: 0.34 };
    legsOf(o, ph, ph + 0.45, [0.8, 1.0, 1.85, 0.8, 1.2, 0.45]);
    for (const [S, p] of [['L', ph + PI + 0.2], ['R', ph + PI + 0.65]]) { o['hf' + S] = 0.5 * Math.sin(p); o['hl' + S] = 0.32 * Math.max(0, Math.cos(p)); o['pw' + S] = -1.3; o['cu' + S] = 0.5 + 0.4 * Math.max(0, Math.cos(p)); }
    armsFK(o, 'L', 0, -1.3, 0, 0.6, 0, 0.6); armsFK(o, 'R', 0, -1.3, 0, 0.6, 0, 0.6); o.cuL = 0.5; o.cuR = 0.5; return o; },
  // flinch: whiplash recoil from the hit, head thrown back shrieking, claws flung up, a staggering step
  flinch(ph, s) { const k = Math.exp(-s.fT * 5), w = Math.sin(s.fT * 16) * k, o = { lean: 0.1 - 0.4 * k, hunch: 0.3 - 0.2 * k, neckP: -0.1 - 0.45 * k, headP: -0.2 + 0.55 * k, headY: 0.3 * w, headR: 0.35 * w, jaw: 0.85, twist: 0.3 * k, roll: 0.15 * w, breath: 0.03 * k, hipH: -0.04 * k, legOut: 0.12, quad: 0 };
    armsFK(o, 'L', 0, -1.75, 0, 1.0, 0, 1.0); armsFK(o, 'R', 0, -1.4 + 0.3 * w, 0, 1.15, 0, 1.0); o.szL = 0.35; o.szR = 0.3;
    const L = legA(0, 0, 0.15 + 0.2 * k, 0.7, 0, 0.6, 0), R = legA(0, 0, 0.55, 1.1, 0, 0.8, 0); o.thL = L[0]; o.knL = L[1]; o.anL = L[2]; o.thR = R[0]; o.knR = R[1]; o.anR = R[2]; return o; },
};
const lerpPose = (a, b, k) => { const o = {}; for (const key in b) o[key] = (a[key] ?? b[key]) + (b[key] - (a[key] ?? b[key])) * k; return o; };

export class Skinwalker {
  constructor(scene, hooks = {}) {
    this.scene = scene; this.hooks = hooks; this.model = buildSkinwalker(); this.J = this.model.userData.J; this.J.root = this.model; this.model.visible = false; scene.add(this.model);
    this.state = 'off'; this.pos = V(0, 0, 0); this.heading = 0; this.speed = 0; this.phase = 0; this.t = 0; this.cool = 0; this.stateT = 0;
    this.anim = 'idle'; this.prevAnim = 'idle'; this.blend = 1; this.cur = null; this.twitchT = 0; this.tw = { y: 0, r: 0, p: 0 }; this.twGoal = { y: 0, r: 0, p: 0 }; this.headTw = this.twGoal;
    this.stepAcc = 0; this.scareCount = 0; this.eye = 0.4; this.look = 0; this.seenT = 0; this.dist = 12; this.side = 1; this.contact = [0, 0, 0, 0];
    this.breathT = 1; this.jawT = 3; this.clickT = 0; this.crashT = 0; this.terrain = height; this.freeze = false;
  }
  get meshes() { return this.model.userData.hitMeshes; }
  sfx(id, vol = 1, o = {}) { this.hooks.sound && this.hooks.sound(id, this.model.position.clone().add(V(0, 1.6, 0)), vol, o); }
  // procedural creature foley (game/sfx.js), only when it is out and within earshot
  syn(name, maxD, ...args) { if (!this.hooks.synth || !this.model.visible || this.dist > maxD) return; this.hooks.synth(name, this.model.position.clone().add(V(0, 0.9, 0)), ...args); }
  place(p, heading) { this.pos.copy(p); this.heading = heading ?? this.heading; this.pos.y = height(p.x, p.z); this.model.position.copy(this.pos); this.model.rotation.y = this.heading; }
  show(on) { this.model.visible = on; }
  setState(s) { this.state = s; this.stateT = 0; this.hooks.state && this.hooks.state(s); }
  hide() { this.setState('off'); this.show(false); }
  // scripted path for the tutorial cutscene: it bursts out of the brush and gallops off on all fours
  bolt(p0, p1, speed = 13) { this.place(p0, Math.atan2(p1.x - p0.x, p1.z - p0.z)); this.show(true); this.path = { a: p0.clone(), b: p1.clone(), speed }; this.setState('bolt'); this.anim = 'gallop'; this.speed = speed; this.dist = 15;
    this.syn('swBugle', 400, 1.0); this.syn('swCrash', 400, 1.0, 1.4); }
  // a 9mm hit: shriek, flinch, then scramble for the trees and stay away 25-40 s
  scare() { if (this.state === 'off' || this.state === 'flinch' || this.state === 'flee') return false; this.scareCount++; this.setState('flinch'); this.speed = 0;
    this.sfx('far-scream-' + (1 + (this.scareCount % 3)), 1.1, { ref: 14 }); this.syn('swShriek', 200, 1.2); this.hooks.scared && this.hooks.scared(); return true; }
  startCharge() { this.setState('charge'); this.sfx('stinger-' + (1 + Math.floor(Math.random() * 3)), 0.9); this.syn('swBugle', 300, 1.1); this.hooks.growl && this.hooks.growl(this.model.position); this.hooks.charge && this.hooks.charge(); }
  // AI: ctx = { player: Vector3 (feet), active: bool (player is on the ground), aggr: 0..1, lit: 0..1 light on it, viewDir }
  update(dt, ctx = {}) {
    this.t += dt; this.stateT += dt; const P = ctx.player; let target = 'idle';
    const toP = P ? V(P.x - this.pos.x, 0, P.z - this.pos.z) : V(0, 0, 1); const dist = toP.length(); this.dist = P ? dist : 15;
    // is the player looking straight at it? (held gaze + a light on it = it breaks cover)
    if (P && ctx.viewDir && this.model.visible) { const d = V(this.pos.x - P.x, this.pos.y + 1.0 - (P.y + 1.6), this.pos.z - P.z); const L = d.length(); const seen = L < 30 && d.dot(ctx.viewDir) / L > 0.96;
      this.seenT = seen ? this.seenT + dt : Math.max(0, this.seenT - dt * 2); } else this.seenT = 0;
    const lit = (ctx.lit || 0) > 0.9;
    switch (this.state) {
      case 'off': this.cool -= dt; if (ctx.active && this.cool <= 0 && P) this.spawnStalk(P, ctx); break;
      case 'bolt': { const d = V(this.path.b.x - this.pos.x, 0, this.path.b.z - this.pos.z); const L = d.length(); if (L < 1) { this.hide(); break; } d.normalize(); this.heading = Math.atan2(d.x, d.z); this.pos.addScaledVector(d, Math.min(L, this.speed * dt)); target = 'gallop'; break; }
      case 'creep': { // low crawl out of the brush / through low cover, drifting sideways, nearly silent
        if (!ctx.active) { this.retreat(); break; }
        const dir = toP.clone().normalize(); const mv = dir.clone().addScaledVector(V(-dir.z, 0, dir.x), this.side * 0.45).normalize(); const sp = this.closing ? 2.1 : 1.2;
        this.pos.addScaledVector(mv, sp * dt); this.heading = Math.atan2(toP.x, toP.z); this.speed = sp; target = 'crawl';
        if (this.seenT > 1.1 && lit && this.stateT > 1) { this.startCharge(); break; }
        if (this.closing ? (dist < 10 || this.stateT > this.creepFor) : (dist < 17 || this.stateT > this.creepFor)) { if (this.closing && (ctx.aggr ?? 1) > 0) this.startCharge(); else { this.setState('stalk'); this.stalkFor = 6 + Math.random() * 5 - (ctx.aggr || 0) * 3; } }
        break; }
      case 'stalk': { // pace the tree line at the edge of the light, pausing to stare; then drop low and close in, or charge
        if (!ctx.active) { this.retreat(); break; }
        if (this.pauseT > 0) this.pauseT -= dt; else if (Math.random() < dt * 0.12 || (this.seenT > 0.3 && !lit && Math.random() < dt * 2)) this.pauseT = 1.2 + Math.random() * 1.6;
        const want = 20 - Math.min(10, this.stateT * 0.6); const tang = V(-toP.z, 0, toP.x).normalize().multiplyScalar(this.side || 1); const radial = toP.clone().normalize().multiplyScalar(dist - want);
        const mv = tang.multiplyScalar(1.6).add(radial.multiplyScalar(0.25)); let sp = Math.min(2.4, mv.length()); if (this.pauseT > 0) sp = 0; if (sp > 0.05) { mv.normalize(); this.pos.addScaledVector(mv, sp * dt); }
        this.heading = Math.atan2(toP.x, toP.z); this.speed = sp; target = sp > 0.3 ? 'stalk' : 'idle';
        if (Math.random() < dt * 0.25) this.sfx('far-branch-snap-' + (1 + Math.floor(Math.random() * 4)), 0.8, { ref: 10 });
        if (this.seenT > 1.4 && lit && this.stateT > 1.5 && (ctx.aggr ?? 1) > 0) { this.startCharge(); break; }
        if (this.stateT > (this.stalkFor || 9) && (ctx.aggr ?? 1) > 0) { if (dist > 13) { this.setState('creep'); this.closing = true; this.creepFor = 5 + Math.random() * 2; } else this.startCharge(); }
        else if (this.stateT > (this.stalkFor || 9) + 6) this.retreat();
        break; }
      case 'charge': { if (!ctx.active) { this.retreat(); break; } const gal = this.stateT > 1.3 && dist > 3; const sp = 6.2 + 2.2 * (ctx.aggr ?? 0.5) + (gal ? 1.2 : 0); const d = toP.clone().normalize(); this.heading = Math.atan2(d.x, d.z);
        this.pos.addScaledVector(d, Math.min(dist, sp * dt)); this.speed = sp; target = gal ? 'gallop' : 'run'; if (dist < 1.25) { this.setState('caught'); this.speed = 0; this.hooks.caught && this.hooks.caught(); } break; }
      case 'flinch': target = 'flinch'; if (this.stateT > 0.6) { this.setState('flee'); this.fleeDir = toP.clone().normalize().negate(); this.syn('swCrash', 200, 1.0, 1.8); this.crashT = 0.7; } break;
      case 'flee': { const d = this.fleeDir || V(1, 0, 0); this.heading = Math.atan2(d.x, d.z); this.speed = 13; this.pos.addScaledVector(d, this.speed * dt); target = 'gallop';
        this.crashT -= dt; if (this.crashT < 0 && this.stateT < 3) { this.crashT = 0.6 + Math.random() * 0.5; this.syn('swCrash', 120, 0.7, 0.9); }
        if (this.stateT > 4 || dist > 70) { this.hide(); this.cool = 25 + Math.random() * 15; } break; }
      case 'retreat': { const d = toP.clone().normalize().negate(); this.heading = Math.atan2(d.x, d.z); this.speed = 9; this.pos.addScaledVector(d, this.speed * dt); target = 'gallop'; if (this.stateT > 3 || dist > 60) { this.hide(); this.cool = 12 + Math.random() * 10; } break; }
      case 'caught': target = 'idle'; break;
      case 'watch': target = 'idle'; this.heading = Math.atan2(toP.x, toP.z); break;
    }
    if (this.state === 'off') return;
    this.pos.y = height(this.pos.x, this.pos.z); this.model.position.copy(this.pos);
    let dh = this.heading - this.model.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.model.rotation.y += dh * Math.min(1, dt * (target === 'crawl' ? 5 : 10));
    // head tracks the player (relative to the body), within the neck's reach
    if (P) { let ly = Math.atan2(toP.x, toP.z) - this.model.rotation.y; ly = Math.atan2(Math.sin(ly), Math.cos(ly)); this.lookGoal = Math.max(-1, Math.min(1, ly)); } else this.lookGoal = 0;
    this.animate(dt, target, ctx);
  }
  spawnStalk(P, ctx) {
    // appear out of sight: behind / beside the player, 26-32 m out, at the treeline; often crawling out of the brush first
    const back = ctx.viewDir ? Math.atan2(-ctx.viewDir.x, -ctx.viewDir.z) : Math.random() * 6.28; const a = back + (Math.random() - 0.5) * 1.8; const r = 26 + Math.random() * 6;
    this.place(V(P.x + Math.sin(a) * r, 0, P.z + Math.cos(a) * r), a + Math.PI); this.show(true); this.side = Math.random() < 0.5 ? -1 : 1; this.stalkFor = 6 + Math.random() * 6 - (ctx.aggr || 0) * 3; this.closing = false; this.pauseT = 0;
    if (Math.random() < 0.6) { this.setState('creep'); this.creepFor = 4 + Math.random() * 3; this.anim = this.prevAnim = 'crawl'; } else { this.setState('stalk'); this.anim = this.prevAnim = 'stalk'; }
    this.blend = 1; this.cur = null; this.sfx('far-branch-snap-' + (1 + Math.floor(Math.random() * 4)), 1.0, { ref: 12 }); this.hooks.spotted && this.hooks.spotted();
  }
  retreat() { if (this.state === 'off') return; this.setState('retreat'); }
  animate(dt, target, ctx = {}) {
    if (target !== this.anim) { this.prevAnim = this.anim; this.anim = target; this.blend = 0; }
    this.blend = Math.min(1, this.blend + dt * (target === 'flinch' ? 9 : 2.6));
    const cy = CYCLE[target]; const f = cy ? Math.max(cy.min, this.speed / cy.len) : 0; if (!this.freeze) this.phase += dt * f * TAU;
    this.fT = target === 'flinch' ? (this.fT || 0) + dt : 0;
    // unsettling idle: head snaps to new angles; a too-slow breath
    this.twitchT -= dt; if (this.twitchT <= 0) { this.twitchT = 0.35 + Math.random() * 1.7; this.twGoal = { y: (Math.random() - 0.5) * 0.8, r: (Math.random() - 0.5) * 1.0, p: (Math.random() - 0.5) * 0.3 }; this.headTw = this.twGoal; }
    const kt = 1 - Math.exp(-dt * 22); for (const k of ['y', 'r', 'p']) this.tw[k] += ((this.headTw[k] ?? 0) - this.tw[k]) * kt;
    this.look += ((this.lookGoal ?? 0) - this.look) * Math.min(1, dt * 4);
    const st = { t: this.t, tw: this.tw, look: this.look, fT: this.fT };
    const b = this.blend * this.blend * (3 - 2 * this.blend); let goal = MODES[target](this.phase, st); if (b < 1 && MODES[this.prevAnim]) goal = lerpPose(MODES[this.prevAnim](this.phase, st), goal, b);
    // bone-click jaw rattles
    if (this.clickT > 0) { this.clickT -= dt; goal.jaw += 0.3 * Math.abs(Math.sin(this.clickT * 55)); }
    if (!this.cur) this.cur = { ...goal };
    const k = 1 - Math.exp(-dt * (target === 'flinch' ? 26 : 14)); for (const key in goal) this.cur[key] = (this.cur[key] ?? goal[key]) + (goal[key] - (this.cur[key] ?? goal[key])) * k;
    const m = this.model, s = m.scale.x, gnd = this.terrain ? (x, z) => { const c = Math.cos(m.rotation.y), sn = Math.sin(m.rotation.y); return (this.terrain(m.position.x + (x * c + z * sn) * s, m.position.z + (-x * sn + z * c) * s) - m.position.y) / s; } : null;
    poseRig(this.J, this.cur, gnd);
    this.audioTick(dt, target);
    // eyeshine: a dim glint, flaring when a light is on it
    const e = 0.35 + 1.4 * (ctx.lit || 0); this.eye += (e - this.eye) * Math.min(1, dt * 6); this.J.eyeMat.opacity = Math.min(1, this.eye); for (const sp of this.J.eyes) sp.scale.setScalar(0.008 + 0.016 * Math.min(1, this.eye));
  }
  // footfalls/limb scrapes on each touchdown of the stride, breathing/panting and jaw rattles on timers
  audioTick(dt, target) {
    if (!this.hooks.synth || !this.model.visible) return;
    const L = LIMB[target];
    if (L) for (let i = 0; i < L.length; i++) { const c = Math.cos(this.phase + L[i]); const was = this.contact[i]; this.contact[i] = c; if (!(was > 0 && c <= 0)) continue;
      const hand = i > 1;
      if (target === 'stalk') { this.syn('swStep', 45, 0.55); if (Math.random() < 0.35) this.syn('swTwig', 40, 0.6); }
      else if (target === 'crawl') { this.syn('swScrape', 32, hand ? 0.55 : 0.45); if (Math.random() < 0.12) this.syn('swTwig', 30, 0.4); }
      else if (target === 'run') this.syn('swStep', 70, 1.0);
      else if (target === 'gallop') { this.syn('swStep', 70, hand ? 0.75 : 1.1); if (hand) this.syn('swScrape', 40, 0.5); } }
    else this.contact.fill(1);
    this.breathT -= dt; if (this.breathT <= 0) {
      if (target === 'idle' || target === 'stalk') { this.breathT = 2.6 + Math.random() * 1.2; this.syn('swBreath', 30, target === 'idle' ? 0.75 : 0.6, 1); }
      else if (target === 'crawl') { this.breathT = 0.85 + Math.random() * 0.3; this.syn('swPant', 28, 0.55, 1); }
      else if (target === 'run' || target === 'gallop') { this.breathT = 0.5 + Math.random() * 0.15; this.syn('swPant', 45, 0.8, 1.6); }
      else this.breathT = 0.5; }
    this.jawT -= dt; if (this.jawT <= 0) { this.jawT = 3 + Math.random() * 4; if (target === 'idle' || target === 'stalk' || target === 'crawl') { this.clickT = 0.16; this.syn('swJaw', 22, 0.7); } }
  }
}
