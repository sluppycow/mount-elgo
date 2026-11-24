// The old ranger cabin NW of Elgo Tower and the lantern trail down to it: board-and-batten walls on a fieldstone
// foundation (built into the slope), cedar-shake gable roof over a covered porch, stone chimney + hearth, cracked
// windows, a hinged plank door, a furnished interior (table + oil lantern, cot, shelves, crates, gun rack with the
// rifle), claw gouges and old blood. Outside: a dirt trail with lantern posts, bone totems, clawed snags, an abandoned
// campsite, a small grove, ground mist, moths and embers. Everything is grounded on height(); full player collision.
import * as THREE from 'three';
import { height } from '../geo.js';
import { mulberry32 } from '../noise.js';
import { fabricMaps, barkMaps, texOf, smokeAtlas } from '../procedural.js';
import { radialSprite } from '../textures.js';
import { sidingMaps, panelMaps, shingleMaps, stoneMaps, timberMaps, glassCrack, gougeDecal, bloodDecal, paperTex, tex } from './cabintex.js';
import { buildRifle, buildRifleRound, rifleMaterials } from '../rifle.js';
import { buildDeerSkull } from '../skinwalker.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W2 = 2.8, D2 = 2.2, T = 0.14, HW = 2.35, RID = 3.75, PZ = 4.05, SLOPE = (RID - HW) / W2, TH = Math.atan(SLOPE);
export const CABIN_DIM = { W2, D2, T, HW, RID, PZ };

// ---------- geometry kit: boxes / any geometry split per face into material buckets, merged at the end ----------
function boxUV(g) { const p = g.attributes.position, n = g.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i) * Math.sign(n.getX(i) || 1); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = -p.getX(i) * Math.sign(n.getZ(i) || 1); v = p.getY(i); }
    uv[i * 2] = u; uv[i * 2 + 1] = v; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g; }
class Kit {
  constructor() { this.b = {}; }
  push(key, g) { if (window.__dbgNaN && g.attributes.position.array.some(v => !isFinite(v))) console.warn('[T] NaN ' + key + ' ' + new Error().stack.split('\n').slice(2, 5).join(' | ')); (this.b[key] ||= []).push(g); }
  // keys: one material key or [px, nx, py, ny, pz, nz]; q: quaternion; pre: uv in the box's own frame (roof shakes)
  box(keys, w, h, d, x, y, z, { q = null, rx = 0, ry = 0, rz = 0, pre = false } = {}) {
    let g = new THREE.BoxGeometry(w, h, d); if (pre) boxUV(g);
    const qq = q || new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)); g.applyMatrix4(new THREE.Matrix4().compose(V(x, y, z), qq, V(1, 1, 1)));
    if (!pre) boxUV(g); g = g.toNonIndexed();
    for (let gi = 0; gi < g.groups.length; gi++) { const key = Array.isArray(keys) ? keys[g.groups[gi].materialIndex] : keys; if (!key) continue; const { start, count } = g.groups[gi];
      const s = new THREE.BufferGeometry(); for (const a of ['position', 'normal', 'uv']) { const src = g.attributes[a]; s.setAttribute(a, new THREE.BufferAttribute(src.array.slice(start * src.itemSize, (start + count) * src.itemSize), src.itemSize)); } this.push(key, s); }
  }
  geo(key, g, m = null, uv = true) { g = g.index ? g.toNonIndexed() : g.clone(); if (m) g.applyMatrix4(m); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.normal) g.computeVertexNormals(); if (uv || !g.attributes.uv) boxUV(g); this.push(key, g); }
  build(parent, mats, { shadow = true } = {}) { const out = {}; for (const [k, list] of Object.entries(this.b)) { if (!mats[k]) { console.warn('[cabin] no material', k); continue; }
    const n = list.reduce((a, g) => a + g.attributes.position.count, 0); const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
    for (const g of list) { const c = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); U.set(g.attributes.uv.array, o * 2); o += c; }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(P, 3)); bg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); bg.setAttribute('uv', new THREE.BufferAttribute(U, 2)); bg.computeBoundingSphere();
    const m = new THREE.Mesh(bg, mats[k]); m.castShadow = shadow; m.receiveShadow = true; m.name = 'cabin-' + k; parent.add(m); out[k] = m; } this.b = {}; return out; }
}
const M4 = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), typeof s === 'number' ? V(s, s, s) : s);

// moss creeping up from the ground / damp stain near the foundation line (object-space y; y = 0 is the floor)
function mossy(mat, { lo = -0.2, hi = 0.6, wet = true } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvCP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vCP; float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float mn = vn2(vCP.xz * 3.1 + vCP.y * 2.3) * 0.6 + vn2(vCP.xz * 11.0 - vCP.y * 7.0) * 0.4;
      float moss = (1.0 - smoothstep(${lo.toFixed(2)} + mn * 0.3, ${hi.toFixed(2)} + mn * 0.5, vCP.y)) * smoothstep(0.35, 0.6, mn + 0.15);
      vec3 mc = mix(vec3(0.075, 0.095, 0.035), vec3(0.15, 0.17, 0.06), vn2(vCP.xz * 30.0 + vCP.y * 30.0));
      diffuseColor.rgb = mix(diffuseColor.rgb, mc, clamp(moss, 0.0, 0.85));
      ${wet ? 'diffuseColor.rgb *= 1.0 - 0.35 * (1.0 - smoothstep(-0.9, 0.25, vCP.y));' : ''}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, clamp(moss, 0.0, 1.0));');
  }; return mat;
}
function stdMat(m, rep, opts = {}) { return new THREE.MeshStandardMaterial({ map: tex(m.map, { srgb: true, rep: [rep, rep], rot: opts.rot || 0 }), normalMap: tex(m.normal, { rep: [rep, rep], rot: opts.rot || 0 }), normalScale: new THREE.Vector2(opts.ns ?? 1, opts.ns ?? 1), roughnessMap: tex(m.rough, { rep: [rep, rep], rot: opts.rot || 0 }), roughness: 1, color: opts.color ?? 0xffffff, side: opts.side ?? THREE.FrontSide }); }
function photoMat(W, a, n, r, rep, color = 0xffffff) { const c = (t) => { if (!t) return null; const k = t.clone(); k.wrapS = k.wrapT = THREE.RepeatWrapping; k.repeat.set(rep, rep); const chk = () => { const im = t.image; if (im && (im.width || im.videoWidth)) k.needsUpdate = true; else setTimeout(chk, 150); }; chk(); return k; }; return new THREE.MeshStandardMaterial({ map: c(W.tex[a]), normalMap: c(W.tex[n]), roughnessMap: c(W.tex[r]), roughness: r ? 1 : 0.92, color }); }
function canvasT(w, h, draw, srgb = true) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// ---------- hurricane lantern (red Dietz-style) ----------
const LANT = { tin: new THREE.MeshStandardMaterial({ color: 0x6a2016, roughness: 0.55, metalness: 0.45 }), wire: new THREE.MeshStandardMaterial({ color: 0x2a2624, roughness: 0.5, metalness: 0.7 }) };
function lanternGeos() {
  const L = (pts, seg = 20) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
  const tin = [L([[0.0, 0.0], [0.07, 0.0], [0.074, 0.012], [0.072, 0.05], [0.06, 0.062], [0.046, 0.066], [0.0, 0.066]]), L([[0.0, 0.226], [0.05, 0.226], [0.058, 0.236], [0.05, 0.26], [0.03, 0.272], [0.018, 0.29], [0.0, 0.292]])];
  for (const sx of [-1, 1]) { const t = new THREE.CylinderGeometry(0.0065, 0.0065, 0.22, 8); t.translate(sx * 0.078, 0.14, 0); tin.push(t); const b = new THREE.CylinderGeometry(0.009, 0.009, 0.03, 8); b.rotateZ(Math.PI / 2); b.translate(sx * 0.064, 0.25, 0); tin.push(b); }
  const wire = []; for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + Math.PI / 4; const c = new THREE.CylinderGeometry(0.0018, 0.0018, 0.16, 5); c.translate(Math.cos(a) * 0.061, 0.146, Math.sin(a) * 0.061); wire.push(c); }
  for (const y of [0.1, 0.19]) { const t = new THREE.TorusGeometry(0.062, 0.0018, 5, 24); t.rotateX(Math.PI / 2); t.translate(0, y, 0); wire.push(t); }
  const bail = new THREE.TorusGeometry(0.082, 0.0028, 6, 24, Math.PI); bail.translate(0, 0.24, 0); wire.push(bail);
  const glass = L([[0.036, 0.066], [0.05, 0.085], [0.06, 0.13], [0.056, 0.18], [0.04, 0.215], [0.032, 0.228]], 24);
  return { tin, wire, glass, flameY: 0.115, h: 0.32 };
}
export function makeLantern({ lit = true, glassMat } = {}) {
  const g = new THREE.Group(); const G = lanternGeos();
  for (const t of G.tin) { const m = new THREE.Mesh(t, LANT.tin); m.castShadow = true; g.add(m); } for (const t of G.wire) g.add(new THREE.Mesh(t, LANT.wire));
  const gm = glassMat || new THREE.MeshStandardMaterial({ color: 0xffe6c0, emissive: 0xff9a40, emissiveIntensity: lit ? 0.5 : 0, roughness: 0.08, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const gl = new THREE.Mesh(G.glass, gm); gl.renderOrder = 2; g.add(gl);
  const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(255,236,190,1)', 'rgba(255,130,40,0)', 64), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  fl.position.y = G.flameY; fl.scale.set(0.045, 0.075, 1); fl.visible = lit; g.add(fl);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(255,170,80,0.55)', 'rgba(255,120,40,0)', 64), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, opacity: 0.55 }));
  halo.position.y = G.flameY; halo.scale.set(0.5, 0.5, 1); halo.visible = lit; g.add(halo);
  g.userData = { flame: fl, halo, glass: gm, lit }; return g;
}
// flame flicker: incommensurate sines + the odd gutter
export function flick(t, seed = 0) { return 0.82 + 0.1 * Math.sin(t * 7.3 + seed) + 0.06 * Math.sin(t * 17.1 + seed * 3) + 0.04 * Math.sin(t * 31.7 + seed * 7) - (Math.sin(t * 1.3 + seed) > 0.97 ? 0.3 : 0); }

export function buildCabinSite(scene, { T: TWR, W, GR, at = { bearing: 315, dist: 68 } } = {}) {
  const CB = { group: new THREE.Group(), interact: [], obstacles: [], windows: [], lights: [], moths: [], t: 0 }; scene.add(CB.group);
  const b = at.bearing * Math.PI / 180; const cx = Math.sin(b) * at.dist, cz = -Math.cos(b) * at.dist; const yaw = Math.atan2(-cx, -cz); // front (+z local) faces the tower
  const cy_ = Math.cos(yaw), sy_ = Math.sin(yaw);
  const toW = (lx, lz) => ({ x: cx + lx * cy_ + lz * sy_, z: cz - lx * sy_ + lz * cy_ });
  const toL = (x, z) => { const dx = x - cx, dz = z - cz; return { x: dx * cy_ - dz * sy_, z: dx * sy_ + dz * cy_ }; };
  // level the floor 0.32 m above the highest ground under the house + porch; the downhill side stands on a tall stone foundation
  let hMax = -1e9, hMin = 1e9; for (let lx = -W2 - 0.4; lx <= W2 + 0.4; lx += 0.4) for (let lz = -D2 - 0.8; lz <= PZ + 0.4; lz += 0.4) { const p = toW(lx, lz); const h = height(p.x, p.z); hMax = Math.max(hMax, h); hMin = Math.min(hMin, h); }
  const FY = hMax + 0.32; CB.floorY = FY; CB.center = V(cx, FY, cz); CB.yaw = yaw; CB.toW = toW; CB.toL = toL;
  const root = new THREE.Group(); root.position.set(cx, FY, cz); root.rotation.y = yaw; CB.group.add(root); CB.root = root;
  const gl = (lx, lz) => { const p = toW(lx, lz); return height(p.x, p.z) - FY; }; // ground height in local y
  const yBot = hMin - FY - 0.45;
  const mats = {
    siding: mossy(stdMat(sidingMaps(), 0.5, { ns: 1.1 }), { lo: -0.3, hi: 0.55 }), panel: stdMat(panelMaps(), 1 / 1.6, { ns: 0.8, color: 0xb8a898 }),
    board: stdMat(panelMaps(), 1 / 1.6, { ns: 0.6, color: 0x6a5c50 }), shingle: stdMat(shingleMaps(), 0.5, { rot: Math.PI / 2, ns: 1.3 }),
    stone: mossy(stdMat(stoneMaps(), 1 / 1.4, { ns: 1.2 }), { lo: -1.2, hi: -0.2 }), hearth: stdMat(stoneMaps('stone2', { seed: 137, n: 46, mortar: [70, 64, 58] }), 1 / 1.1, { ns: 1.3, color: 0xc8bcb0 }),
    soot: stdMat(stoneMaps('stone2', { seed: 137, n: 46, mortar: [70, 64, 58] }), 1 / 1.1, { ns: 1.3, color: 0x2a2420 }),
    timber: mossy(stdMat(timberMaps(), 1, { ns: 0.9, color: 0x9a8a7a }), { lo: -0.4, hi: 0.25 }), dark: stdMat(timberMaps(), 1, { ns: 0.9, color: 0x5a4a3c }),
    floor: photoMat(W, 'brown', 'brownN', 'brownR', 0.55, 0x8a7a68), deck: mossy(photoMat(W, 'planks', 'planksN', 'planksR', 0.6, 0x9a9488), { lo: -0.3, hi: 0.1 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x1e1c1a, roughness: 0.62, metalness: 0.8 }), tin: LANT.tin, wire: LANT.wire,
  };
  CB.mats = mats; const K = new Kit();
  // ---------- floor, foundation, sill logs ----------
  K.box(['timber', 'timber', 'floor', 'timber', 'timber', 'timber'], W2 * 2, 0.15, D2 * 2, 0, -0.075, 0);
  K.box('stone', W2 * 2 + 0.12, -0.15 - yBot, 0.34, 0, (yBot - 0.15) / 2, D2 - 0.11); K.box('stone', W2 * 2 + 0.12, -0.15 - yBot, 0.34, 0, (yBot - 0.15) / 2, -D2 + 0.11);
  K.box('stone', 0.34, -0.15 - yBot, D2 * 2 - 0.4, W2 - 0.11, (yBot - 0.15) / 2, 0); K.box('stone', 0.34, -0.15 - yBot, D2 * 2 - 0.4, -W2 + 0.11, (yBot - 0.15) / 2, 0);
  K.box('dark', W2 * 2 + 0.06, 0.16, 0.2, 0, -0.2, D2 - 0.07); K.box('dark', W2 * 2 + 0.06, 0.16, 0.2, 0, -0.2, -D2 + 0.07); K.box('dark', 0.2, 0.16, D2 * 2, W2 - 0.07, -0.2, 0); K.box('dark', 0.2, 0.16, D2 * 2, -W2 + 0.07, -0.2, 0);
  // ---------- walls with openings ----------
  const holes = { front: [{ a0: -0.47, a1: 0.47, y0: 0, y1: 2.04, door: true }, { a0: 1.15, a1: 1.95, y0: 0.95, y1: 1.7 }], back: [], left: [{ a0: -0.05, a1: 0.75, y0: 0.95, y1: 1.7 }], right: [{ a0: -0.4, a1: 0.4, y0: 0.95, y1: 1.7 }] };
  const pieces = (a0, a1, hs) => { const cuts = [a0, a1]; for (const h of hs) cuts.push(h.a0, h.a1); cuts.sort((p, q) => p - q); const out = [];
    for (let i = 0; i < cuts.length - 1; i++) { const p = cuts[i], q = cuts[i + 1]; if (q - p < 1e-4) continue; const h = hs.find(h => h.a0 <= p + 1e-4 && h.a1 >= q - 1e-4);
      if (!h) out.push([p, q, 0, HW]); else { if (h.y0 > 0) out.push([p, q, 0, h.y0]); if (h.y1 < HW) out.push([p, q, h.y1, HW]); } } return out; };
  for (const [p, q, y0, y1] of pieces(-W2, W2, holes.front)) K.box(['timber', 'timber', 'timber', 'timber', 'siding', 'panel'], q - p, y1 - y0, T, (p + q) / 2, (y0 + y1) / 2, D2 - T / 2);
  for (const [p, q, y0, y1] of pieces(-W2, W2, holes.back)) K.box(['timber', 'timber', 'timber', 'timber', 'panel', 'siding'], q - p, y1 - y0, T, (p + q) / 2, (y0 + y1) / 2, -D2 + T / 2);
  for (const [p, q, y0, y1] of pieces(-D2 + T, D2 - T, holes.left)) K.box(['panel', 'siding', 'timber', 'timber', 'timber', 'timber'], T, y1 - y0, q - p, -W2 + T / 2, (y0 + y1) / 2, (p + q) / 2);
  for (const [p, q, y0, y1] of pieces(-D2 + T, D2 - T, holes.right)) K.box(['siding', 'panel', 'timber', 'timber', 'timber', 'timber'], T, y1 - y0, q - p, W2 - T / 2, (y0 + y1) / 2, (p + q) / 2);
  // gables: outer siding layer + inner paneling layer (front, back) and a sided gable over the porch header
  const tri = (ext = 0) => new THREE.Shape([new THREE.Vector2(-W2 - ext, HW), new THREE.Vector2(W2 + ext, HW), new THREE.Vector2(0, RID + ext * SLOPE)]);
  const ext = (z0, d, key) => { const g = new THREE.ExtrudeGeometry(tri(), { depth: d, bevelEnabled: false }); g.translate(0, 0, z0); K.geo(key, g); };
  ext(D2 - T / 2, T / 2, 'siding'); ext(D2 - T, T / 2, 'panel'); ext(-D2, T / 2, 'siding'); ext(-D2 + T / 2, T / 2, 'panel');
  ext(PZ - 0.15, 0.05, 'siding');
  // battens over the board seams (real relief), corner boards
  const topAt = (x) => RID - Math.abs(x) * SLOPE;
  for (let x = -W2 + 0.25; x < W2 - 0.1; x += 0.25) for (const [z, sgn, hs] of [[D2, 1, holes.front], [-D2, -1, holes.back], [PZ - 0.1, 1, null]]) { const top = topAt(x) - 0.05; let segs;
    if (!hs) segs = [[HW + 0.02, top]]; else { const h = hs.find(h => x > h.a0 - 0.03 && x < h.a1 + 0.03); segs = h ? [[-0.18, h.y0 - 0.06], [h.y1 + 0.06, top]] : [[-0.18, top]]; }
    for (const [y0, y1] of segs) if (y1 - y0 > 0.05) K.box('siding', 0.055, y1 - y0, 0.024, x, (y0 + y1) / 2, z + sgn * 0.012); }
  for (let z = -D2 + 0.25; z < D2 - 0.1; z += 0.25) for (const [x, sgn, hs] of [[W2, 1, holes.right], [-W2, -1, holes.left]]) { const h = hs.find(h => z > h.a0 - 0.03 && z < h.a1 + 0.03); const segs = h ? [[-0.18, h.y0 - 0.06], [h.y1 + 0.06, HW - 0.02]] : [[-0.18, HW - 0.02]];
    for (const [y0, y1] of segs) if (y1 - y0 > 0.05) K.box('siding', 0.024, y1 - y0, 0.055, x + sgn * 0.012, (y0 + y1) / 2, z); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { K.box('timber', 0.13, HW + 0.2, 0.035, sx * (W2 - 0.05), HW / 2 - 0.1, sz * (D2 + 0.018)); K.box('timber', 0.035, HW + 0.2, 0.13, sx * (W2 + 0.018), HW / 2 - 0.1, sz * (D2 - 0.05)); }
  // ---------- roof: two shake slabs (porch included), fascia, barge boards, ridge, rafters, tie beams ----------
  const OV = 0.45, zA = -D2 - OV, zB = PZ + 0.25, L = (W2 + OV) / Math.cos(TH) + 0.04;
  for (const s of [1, -1]) { const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), s > 0 ? 0 : Math.PI).multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -TH));
    const d = V(s * Math.cos(TH), -Math.sin(TH), 0), n = V(s * Math.sin(TH), Math.cos(TH), 0); const c = V(0, RID, 0).addScaledVector(d, L / 2 - 0.04).addScaledVector(n, 0.055);
    K.box(['timber', 'timber', 'shingle', 'board', 'timber', 'timber'], L, 0.11, zB - zA, c.x, c.y, (zA + zB) / 2, { q, pre: true });
    const e = V(0, RID, 0).addScaledVector(d, L - 0.05); K.box('timber', 0.035, 0.2, zB - zA + 0.04, e.x + s * 0.02, e.y - 0.02, (zA + zB) / 2);
    for (const z of [zA - 0.02, zB + 0.02]) K.box('timber', L, 0.2, 0.035, c.x + n.x * 0.02, c.y - 0.03, z, { q });
    for (let z = -D2 + 0.25; z < PZ; z += 0.6) { const rl = (W2 + 0.1) / Math.cos(TH); const rc = V(0, RID, 0).addScaledVector(d, rl / 2).addScaledVector(n, -0.07); K.box('dark', rl, 0.14, 0.06, rc.x, rc.y, z, { q }); } }
  K.box('timber', 0.17, 0.17, zB - zA + 0.08, 0, RID + 0.06, (zA + zB) / 2, { rz: Math.PI / 4 }); K.box('dark', 0.12, 0.22, PZ + D2, 0, RID - 0.18, (PZ - D2) / 2);
  for (const z of [-1.1, 0.7]) K.box('dark', W2 * 2 - 0.2, 0.15, 0.12, 0, HW - 0.08, z);
  // ---------- porch: deck boards over joists, posts, header, railing, piers, steps ----------
  const DECK = -0.06; CB.DECK = DECK; for (let z = D2 + 0.08, i = 0; z < PZ - 0.05; z += 0.145, i++) K.box(['timber', 'timber', 'deck', 'dark', 'dark', 'dark'], W2 * 2 + 0.08 + (i % 3) * 0.02, 0.045, 0.13, (i % 2) * 0.01, DECK - 0.0225, z + 0.065);
  for (const x of [-W2 + 0.08, -1.0, 1.0, W2 - 0.08]) K.box('dark', 0.07, 0.18, PZ - D2, x, DECK - 0.14, (PZ + D2) / 2);
  K.box('dark', W2 * 2 + 0.1, 0.2, 0.08, 0, DECK - 0.12, PZ - 0.04);
  const yPorchBot = Math.min(gl(-W2, PZ), gl(W2, PZ), gl(0, PZ), gl(-W2, D2), gl(W2, D2)) - 0.3;
  for (const x of [-W2 + 0.1, -1.0, 1.0, W2 - 0.1]) K.box('stone', 0.34, DECK - 0.2 - yPorchBot, 0.34, x, (DECK - 0.2 + yPorchBot) / 2, PZ - 0.12);
  const postTop = HW + 0.02; for (const sx of [-1, 1]) K.box('timber', 0.12, postTop - DECK, 0.12, sx * (W2 - 0.1), (postTop + DECK) / 2, PZ - 0.12);
  K.box('dark', W2 * 2 + 0.1, 0.18, 0.14, 0, HW - 0.07, PZ - 0.12);
  const rail = (x0, z0, x1, z1) => { const Lr = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0); const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    K.box('timber', 0.06, 0.05, Lr, mx, 0.92, mz, { ry: ang }); K.box('timber', 0.05, 0.04, Lr, mx, 0.1, mz, { ry: ang });
    const n = Math.floor(Lr / 0.14); for (let i = 1; i < n; i++) { const t = i / n; K.box('timber', 0.034, 0.78, 0.034, x0 + (x1 - x0) * t, 0.51, z0 + (z1 - z0) * t, { ry: ang }); } };
  for (const sx of [-1, 1]) { rail(sx * (W2 - 0.1), D2 + 0.05, sx * (W2 - 0.1), PZ - 0.18); rail(sx * (W2 - 0.16), PZ - 0.12, sx * 0.62, PZ - 0.12); K.box('timber', 0.1, 1.0, 0.1, sx * 0.62, 0.44, PZ - 0.12); }
  const stepG = gl(0, PZ + 0.6); const drop = Math.max(0.1, DECK - stepG); const nS = Math.max(1, Math.round(drop / 0.19)); const rise = drop / nS; const run = 0.29; CB.steps = { n: nS, rise, run, z0: PZ, drop };
  for (let i = 1; i < nS; i++) { const y = DECK - i * rise; K.box(['timber', 'timber', 'deck', 'dark', 'dark', 'dark'], 1.14, 0.05, run + 0.02, 0, y - 0.025, PZ + (i - 0.5) * run + 0.02); K.box('dark', 1.1, rise, 0.03, 0, y - rise / 2 + 0.0, PZ + (i - 1) * run + 0.02); }
  for (const sx of [-1, 1]) { const len = Math.hypot(nS * run, drop) + 0.1; K.box('dark', 0.05, 0.22, len, sx * 0.58, DECK - drop / 2 - 0.08, PZ + nS * run / 2, { rx: Math.atan2(drop, nS * run) }); }
  // ---------- chimney (outside the back wall, left of centre) ----------
  { const x0 = -1.85, x1 = -0.75, zb0 = -D2 - 0.72, zb1 = -D2 + 0.02; K.box('stone', x1 - x0, 1.95 - yBot, zb1 - zb0, (x0 + x1) / 2, (1.95 + yBot) / 2, (zb0 + zb1) / 2);
    const fr = new THREE.CylinderGeometry(0.7 / Math.SQRT2, 1.1 / Math.SQRT2, 0.5, 4, 1); fr.rotateY(Math.PI / 4); fr.scale(1, 1, 0.72); K.geo('stone', fr, M4(-1.3, 2.2, -D2 - 0.36));
    K.box('stone', 0.7, 2.0, 0.5, -1.3, 3.45, -D2 - 0.36); K.box('hearth', 0.86, 0.09, 0.66, -1.3, 4.49, -D2 - 0.36); K.box('soot', 0.34, 0.02, 0.22, -1.3, 4.545, -D2 - 0.36);
    CB.chimneyTop = V(-1.3, 4.6, -D2 - 0.36); }
  // ---------- windows: casings, sill, 4-pane sash, cracked / broken glass ----------
  const glassMats = [1, 2, 3, 4, 5].map(s => new THREE.MeshStandardMaterial({ map: tex(glassCrack(s, s === 3), { srgb: true }), transparent: true, roughness: 0.08, metalness: 0, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.4 }));
  const win = (wall, h, si) => {
    const along = wall === 'front' ? 'x' : 'z'; const w = h.a1 - h.a0, hh = h.y1 - h.y0, ac = (h.a0 + h.a1) / 2, yc = (h.y0 + h.y1) / 2;
    const P = (a, y, o) => wall === 'front' ? V(a, y, D2 + o) : wall === 'left' ? V(-W2 - o, y, a) : V(W2 + o, y, a); // o = outward offset from the outer face
    const bx = (key, wa, hy, dn, a, y, o) => { const p = P(a, y, o); if (along === 'x') K.box(key, wa, hy, dn, p.x, p.y, p.z); else K.box(key, dn, hy, wa, p.x, p.y, p.z); };
    for (const o of [0.018, -T - 0.012]) { bx('timber', w + 0.18, 0.09, 0.03, ac, h.y1 + 0.045, o); bx('timber', 0.09, hh, 0.03, h.a0 - 0.045, yc, o); bx('timber', 0.09, hh, 0.03, h.a1 + 0.045, yc, o); }
    bx('timber', w + 0.22, 0.045, 0.1, ac, h.y0 - 0.02, 0.03); bx('timber', w + 0.1, 0.03, 0.12, ac, h.y0 + 0.01, -T + 0.03);
    const so = -T / 2; bx('dark', w, 0.04, 0.04, ac, h.y0 + 0.02, so); bx('dark', w, 0.04, 0.04, ac, h.y1 - 0.02, so); bx('dark', 0.04, hh, 0.04, h.a0 + 0.02, yc, so); bx('dark', 0.04, hh, 0.04, h.a1 - 0.02, yc, so); bx('dark', w, 0.024, 0.03, ac, yc, so); bx('dark', 0.024, hh, 0.03, ac, yc, so);
    const pw = (w - 0.1) / 2, ph = (hh - 0.1) / 2; let k = 0;
    for (const da of [-1, 1]) for (const dy of [-1, 1]) { const pane = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), glassMats[(si * 2 + k++) % glassMats.length]); const p = P(ac + da * (pw / 2 + 0.012), yc + dy * (ph / 2 + 0.012), so);
      pane.position.copy(p); pane.rotation.y = wall === 'front' ? 0 : Math.PI / 2; pane.renderOrder = 3; root.add(pane); }
    const n = wall === 'front' ? V(0, 0, 1) : wall === 'left' ? V(-1, 0, 0) : V(1, 0, 0); const c = P(ac, yc, 0);
    CB.windows.push({ wall, local: c.clone(), n, out: c.clone().addScaledVector(n, 0.55), in: c.clone().addScaledVector(n, -0.9) }); };
  win('front', holes.front[1], 0); win('left', holes.left[0], 1); win('right', holes.right[0], 2);
  for (const o of [0.02, -T - 0.012]) { K.box('timber', 1.16, 0.1, 0.035, 0, 2.09, D2 + o); for (const sx of [-1, 1]) K.box('timber', 0.1, 2.1, 0.035, sx * 0.525, 1.03, D2 + o); }
  K.box('dark', 0.94, 0.03, T + 0.04, 0, 0.012, D2 - T / 2);
  CB._ctx = { root, K, mats, gl, toW, toL, FY, DECK, nS, run, drop };
  buildInterior(CB); buildExterior(CB); K.build(root, mats);
  finishCabin(CB);
  buildTrail(CB, { T: TWR, W, GR, mats, toW, toL, FY, frontLocal: V(0, 0, PZ + nS * run + 0.6) });
  return CB;
}

// a placeholder light: CB.pickLight moves the single real PointLight to whichever of these matters most
function vlight(color, intensity, distance, decay) { const o = new THREE.Object3D(); o.intensity = intensity; o.distance = distance; o.decay = decay; o.userData.color = color; return o; }
// ---------- decals: alpha planes pushed slightly off a surface ----------
function decal(parent, canvas, w, h, pos, rotY = 0, rotX = 0, { opacity = 1, rough = 0.55, color = 0xffffff } = {}) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvas.isTexture ? canvas : tex(canvas, { srgb: true }), transparent: true, opacity, depthWrite: false, roughness: rough, color, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.position.copy(pos); m.rotation.set(rotX, rotY, 0, 'YXZ'); m.renderOrder = 1; m.receiveShadow = true; parent.add(m); return m;
}
function buildInterior(CB) {
  const { root, K, mats } = CB._ctx; const r = mulberry32(4242);
  mats.cloth = new THREE.MeshStandardMaterial({ map: canvasT(256, 256, (x, w, h) => { x.fillStyle = '#5a1a16'; x.fillRect(0, 0, w, h); // red/black buffalo plaid
    for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(12,10,10,0.55)'; x.fillRect(i * 32, 0, 16, h); x.fillRect(0, i * 32, w, 16); }
    for (let i = 0; i < 2000; i++) { x.fillStyle = `rgba(${r() * 40 | 0},${r() * 20 | 0},10,0.15)`; x.fillRect(r() * w, r() * h, 2, 1); } }), roughness: 1, normalMap: texOf(fabricMaps().n, { rep: [4, 4] }), normalScale: new THREE.Vector2(0.4, 0.4) });
  mats.ticking = new THREE.MeshStandardMaterial({ map: canvasT(128, 128, (x, w, h) => { x.fillStyle = '#8a8270'; x.fillRect(0, 0, w, h); for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? 'rgba(50,60,80,0.5)' : 'rgba(0,0,0,0)'; x.fillRect(i * 8, 0, 3, h); }
    const g = x.createRadialGradient(80, 60, 5, 80, 60, 60); g.addColorStop(0, 'rgba(70,50,20,0.55)'); g.addColorStop(1, 'rgba(70,50,20,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }), roughness: 1 });
  mats.can = new THREE.MeshStandardMaterial({ color: 0x8a8478, roughness: 0.45, metalness: 0.8 }); mats.label = new THREE.MeshStandardMaterial({ color: 0x7a2a1a, roughness: 0.8 });
  mats.jar = new THREE.MeshStandardMaterial({ color: 0x6a7a5a, roughness: 0.15, transparent: true, opacity: 0.55, depthWrite: false });
  mats.ammo = new THREE.MeshStandardMaterial({ map: canvasT(128, 64, (x, w, h) => { x.fillStyle = '#a8321e'; x.fillRect(0, 0, w, h); x.fillStyle = '#e8dcc0'; x.fillRect(0, 18, w, 26); x.fillStyle = '#1a1a1a'; x.font = 'bold 18px Arial'; x.fillText('.308 WIN', 18, 38); x.font = '9px Arial'; x.fillText('20 CENTERFIRE CARTRIDGES', 8, 58); }), roughness: 0.8 });
  mats.crate = new THREE.MeshStandardMaterial({ map: canvasT(256, 256, (x, w, h) => { x.fillStyle = '#7a6a4c'; x.fillRect(0, 0, w, h); for (let i = 0; i < 5; i++) { x.fillStyle = `rgba(0,0,0,${0.15 + r() * 0.1})`; x.fillRect(0, i * 51, w, 2); }
    for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(40,30,20,${r() * 0.2})`; x.fillRect(r() * w, r() * h, 6 + r() * 20, 1); } x.fillStyle = 'rgba(25,30,25,0.8)'; x.font = 'bold 36px Courier New'; x.fillText('U.S.F.S.', 40, 120); x.font = 'bold 20px Courier New'; x.fillText('FIRE TOOLS', 62, 152); }), roughness: 0.95 });
  mats.ash = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 }); mats.char = new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 0.95, emissive: 0xff4a10, emissiveIntensity: 0, emissiveMap: canvasT(256, 256, (x, w, h) => { x.fillStyle = '#000'; x.fillRect(0, 0, w, h); x.lineCap = 'round'; for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(255,${70 + r() * 90 | 0},10,${0.4 + r() * 0.6})`; x.lineWidth = 0.8 + r() * 1.6; x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let k = 0; k < 4; k++) { px += (r() - 0.5) * 30; py += (r() - 0.5) * 12; x.lineTo(px, py); } x.stroke(); } for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,${120 + r() * 80 | 0},30,${r() * 0.8})`; x.fillRect(r() * w, r() * h, 1.5, 1.5); } }) });
  mats.enamel = new THREE.MeshStandardMaterial({ color: 0x2a4a6a, roughness: 0.35, metalness: 0.1 }); mats.paper = new THREE.MeshStandardMaterial({ map: tex(paperTex(2), { srgb: true }), roughness: 0.95, side: THREE.DoubleSide });

  // floor: rag rug
  { const rug = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), new THREE.MeshStandardMaterial({ map: canvasT(256, 256, (x, w, h) => { const cols = ['#5a4030', '#3a4a5a', '#6a5a3a', '#4a2a2a', '#5a5a4a']; for (let k = 16; k > 0; k--) { x.fillStyle = cols[k % 5]; x.beginPath(); x.arc(128, 128, k * 8, 0, 7); x.fill(); } }), roughness: 1, normalMap: texOf(fabricMaps().n, { rep: [6, 6] }) }));
    rug.rotation.x = -Math.PI / 2; rug.scale.set(1, 0.7, 1); rug.position.set(-0.2, 0.006, 0.55); rug.receiveShadow = true; root.add(rug); }
  // table (0.95, -0.62): plank top, breadboard ends, splayed legs, stretchers
  const TX = 0.95, TZ = -0.62; CB.tableTop = V(TX, 0.77, TZ);
  for (let i = 0; i < 4; i++) K.box('board', 1.2, 0.04, 0.17, TX, 0.75, TZ - 0.27 + i * 0.18 + (i % 2) * 0.004);
  for (const sx of [-1, 1]) K.box('dark', 0.06, 0.045, 0.74, TX + sx * 0.6, 0.75, TZ);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box('dark', 0.06, 0.73, 0.06, TX + sx * 0.5, 0.365, TZ + sz * 0.28, { rz: sx * 0.05, rx: -sz * 0.05 });
  K.box('dark', 1.0, 0.05, 0.04, TX, 0.2, TZ); for (const sx of [-1, 1]) K.box('dark', 0.04, 0.05, 0.56, TX + sx * 0.5, 0.2, TZ);
  // tipped-over chair
  { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.15, 0.6, Math.PI / 2 - 0.12)); const c = V(0.3, 0.23, 0.15); const pt = (x, y, z) => V(x, y, z).applyQuaternion(q).add(c);
    const bxq = (w, h, d, x, y, z) => { const p = pt(x, y, z); K.box('dark', w, h, d, p.x, p.y, p.z, { q }); };
    bxq(0.42, 0.035, 0.4, 0, 0, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) bxq(0.035, 0.45, 0.035, sx * 0.18, -0.22, sz * 0.17); for (const sx of [-1, 1]) bxq(0.035, 0.5, 0.035, sx * 0.18, 0.26, -0.18);
    bxq(0.38, 0.09, 0.025, 0, 0.42, -0.18); bxq(0.38, 0.06, 0.025, 0, 0.24, -0.18); }
  // cot along the left wall: frame, canvas sag, mattress, plaid blanket, pillow
  { const x0 = -W2 + T + 0.4; for (const sx of [-1, 1]) K.box('dark', 0.05, 0.06, 1.95, x0 + sx * 0.36, 0.42, 0.22); for (const z of [-0.73, 1.17]) K.box('dark', 0.78, 0.06, 0.05, x0, 0.42, z);
    for (const sx of [-1, 1]) for (const z of [-0.73, 0.22, 1.17]) K.box('dark', 0.05, 0.42, 0.05, x0 + sx * 0.36, 0.21, z);
    const mg = new THREE.BoxGeometry(0.7, 0.11, 1.86, 6, 1, 12); const p = mg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, p.getY(i) - 0.05 * Math.cos(x / 0.35 * Math.PI / 2) * Math.cos((z) / 0.93 * Math.PI / 2) + (r() - 0.5) * 0.006); } mg.computeVertexNormals();
    const mm = new THREE.Mesh(mg, mats.ticking); mm.position.set(x0, 0.5, 0.22); mm.castShadow = mm.receiveShadow = true; root.add(mm);
    const bg = new THREE.PlaneGeometry(0.95, 1.2, 12, 14); const bp = bg.attributes.position; for (let i = 0; i < bp.count; i++) { const u = bp.getX(i), v = bp.getY(i); const over = Math.abs(u) > 0.35 ? (Math.abs(u) - 0.35) : 0; bp.setZ(i, -over * 1.4 + Math.sin(v * 9 + u * 4) * 0.018 + (r() - 0.5) * 0.01); bp.setX(i, Math.sign(u) * Math.min(Math.abs(u), 0.38) + Math.sign(u) * over * 0.1); }
    bg.computeVertexNormals(); const bl = new THREE.Mesh(bg, mats.cloth); bl.rotation.x = -Math.PI / 2; bl.rotation.z = 0.06; bl.position.set(x0, 0.565, 0.55); bl.castShadow = bl.receiveShadow = true; root.add(bl); mats.cloth.side = THREE.DoubleSide;
    const pg = new THREE.SphereGeometry(0.2, 16, 10); pg.scale(1.35, 0.32, 0.8); const pl = new THREE.Mesh(pg, mats.ticking); pl.position.set(x0, 0.58, -0.55); pl.castShadow = true; root.add(pl); }
  // shelves on the right wall with tins, jars, .308 boxes
  { const xs = W2 - T - 0.14; for (const y of [1.05, 1.45, 1.85]) { K.box('board', 0.26, 0.03, 1.1, xs, y, -1.2); for (const z of [-1.65, -0.75]) K.box('dark', 0.24, 0.12, 0.03, xs + 0.01, y - 0.075, z, { rx: 0 }); }
    const can = new THREE.CylinderGeometry(0.042, 0.042, 0.115, 16), jar = new THREE.CylinderGeometry(0.05, 0.05, 0.16, 16), lid = new THREE.CylinderGeometry(0.046, 0.046, 0.02, 16);
    const items = [[1.05, -1.6, 'can'], [1.05, -1.5, 'can'], [1.05, -1.4, 'can'], [1.05, -0.95, 'jar'], [1.45, -1.62, 'jar'], [1.45, -1.48, 'jar'], [1.45, -1.05, 'can'], [1.85, -1.55, 'can'], [1.85, -1.3, 'jar']];
    for (const [y, z, k] of items) { if (k === 'can') { K.geo('can', can, M4(xs - 0.02, y + 0.072, z)); K.geo('label', new THREE.CylinderGeometry(0.0425, 0.0425, 0.07, 16, 1, true), M4(xs - 0.02, y + 0.072, z)); } else { const m = new THREE.Mesh(jar, mats.jar); m.position.set(xs - 0.03, y + 0.095, z); m.renderOrder = 2; root.add(m); K.geo('can', lid, M4(xs - 0.03, y + 0.185, z)); } }
    for (const [y, z, rz] of [[1.45, -1.28, 0], [1.45, -1.2, 0], [1.05, -1.2, 0.3]]) K.box(['ammo', 'ammo', 'ammo', 'ammo', 'ammo', 'ammo'], 0.07, 0.08, 0.12, xs - 0.04, y + 0.055, z, { rx: rz }); }
  // USFS crates front-right
  { K.box('crate', 0.7, 0.5, 0.45, 1.95, 0.25, 1.65); K.box('crate', 0.55, 0.4, 0.4, 1.9, 0.7, 1.62, { ry: 0.12 }); K.box('crate', 0.5, 0.42, 0.42, 2.25, 0.21, 1.1, { ry: -0.3 }); }
  // hearth: stone surround, firebox, mantel, hearth slab, charred logs, ash, embers, poker, coffee pot
  { const hz = -D2 + T; const x0 = -1.95, x1 = -0.65, xc = (x0 + x1) / 2; K.box('hearth', x1 - x0 + 0.3, 0.12, 0.65, xc, 0.06, hz + 0.32);
    K.box('hearth', 0.3, 1.25, 0.32, x0 + 0.15, 0.63, hz + 0.16); K.box('hearth', 0.3, 1.25, 0.32, x1 - 0.15, 0.63, hz + 0.16); K.box('hearth', x1 - x0, 0.5, 0.32, xc, 1.5, hz + 0.16);
    K.box('soot', x1 - x0 - 0.6, 1.05, 0.04, xc, 0.65, hz - 0.02); K.box('soot', x1 - x0 - 0.6, 0.04, 0.36, xc, 1.22, hz + 0.16);
    K.box('dark', x1 - x0 + 0.45, 0.1, 0.24, xc, 1.8, hz + 0.12); K.box('hearth', x1 - x0 + 0.7, 2.6, 0.05, xc, 1.3, hz - 0.02);
    const logG = new THREE.CylinderGeometry(0.06, 0.07, 0.5, 9); for (const [a, dx] of [[0.25, -0.08], [-0.3, 0.08], [1.3, 0]]) { const m = new THREE.Mesh(logG, mats.char); m.rotation.set(Math.PI / 2 - 0.1, 0, Math.PI / 2 + a); m.position.set(xc + dx, 0.19 + (a > 1 ? 0.09 : 0), hz + 0.2); m.castShadow = true; root.add(m); }
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.3, 20), mats.ash); ash.rotation.x = -Math.PI / 2; ash.scale.set(1, 0.6, 1); ash.position.set(xc, 0.125, hz + 0.18); root.add(ash);
    CB.hearthPos = V(xc, 0.3, hz + 0.25); K.geo('iron', new THREE.CylinderGeometry(0.008, 0.008, 0.8, 6), M4(x1 + 0.05, 0.42, hz + 0.45, 0, 0, 0.25));
    const pot = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.07, 0], [0.075, 0.02], [0.06, 0.16], [0.045, 0.19], [0.05, 0.2], [0, 0.2]].map(([a, b]) => new THREE.Vector2(a, b)), 18), mats.enamel); pot.position.set(x0 + 0.1, 0.12, hz + 0.5); pot.castShadow = true; root.add(pot); }
  // gun rack on the back wall: two pegged arms, the rifle across them, two loose rounds on the shelf, mounted deer skull above
  { const zb = -D2 + T; const rx = 1.3; for (const dx of [-0.42, 0.42]) { K.box('dark', 0.08, 0.3, 0.06, rx + dx, 1.32, zb + 0.03); K.box('dark', 0.06, 0.06, 0.18, rx + dx, 1.26, zb + 0.1); K.box('dark', 0.05, 0.08, 0.04, rx + dx, 1.31, zb + 0.18); }
    K.box('board', 1.1, 0.03, 0.16, rx, 1.08, zb + 0.08);
    const rifle = buildRifle(rifleMaterials(), { light: true }); rifle.rotation.y = -Math.PI / 2; rifle.position.set(rx + 0.12, 1.37, zb + 0.1); root.add(rifle); CB.rifle = rifle; CB.rifleLocal = rifle.position.clone();
    const RM = rifleMaterials(); for (const dx of [-0.1, -0.03]) { const rd = buildRifleRound(RM); rd.rotation.set(0, 0.7 + dx * 4, Math.PI / 2); rd.position.set(rx + dx, 1.1, zb + 0.08); root.add(rd); (CB.rackRounds ||= []).push(rd); }
    const sk = buildDeerSkull(); sk.scale.setScalar(0.85); sk.rotation.set(-0.15, 0, 0); sk.position.set(rx, 1.95, zb + 0.12); root.add(sk); K.box('dark', 0.28, 0.36, 0.03, rx, 1.92, zb + 0.015); }
  // oil lantern on the table + its light, the ranger's note under it
  { const L = makeLantern({ lit: true }); L.position.set(TX + 0.3, 0.77, TZ + 0.05); root.add(L); CB.tableLantern = L;
    const pl = vlight(0xffa860, 2.2, 7.5, 1.6); pl.position.set(TX + 0.3, 0.9, TZ + 0.05); pl.castShadow = false; root.add(pl); CB.tableLight = pl;
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.26), mats.paper); note.rotation.set(-Math.PI / 2, 0, 0.35); note.position.set(TX - 0.15, 0.772, TZ + 0.02); root.add(note); CB.noteLocal = note.position.clone();
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.09, 16), mats.enamel); mug.position.set(TX - 0.42, 0.815, TZ - 0.15); mug.castShadow = true; root.add(mug); }
  // claw gouges, blood, a tally scratched into the wall
  decal(root, gougeDecal(1), 0.5, 1.0, V(-W2 + T + 0.003, 1.25, -1.3), Math.PI / 2, 0.15);
  decal(root, gougeDecal(2), 0.45, 0.9, V(0.25, 1.35, D2 - T - 0.003), Math.PI, -0.2); // inside the front wall beside the door
  decal(root, gougeDecal(3), 0.5, 0.95, V(-0.4, 0.008, 1.2), 0.6, -Math.PI / 2, { rough: 0.8 });
  decal(root, bloodDecal(1, 'pool'), 1.0, 1.0, V(0.15, 0.007, 0.95), 0.3, -Math.PI / 2, { rough: 0.25 });
  decal(root, bloodDecal(2, 'drag'), 0.9, 1.6, V(0.05, 0.008, 1.85), 0.0, -Math.PI / 2, { rough: 0.3 });
  decal(root, bloodDecal(3, 'hand'), 0.45, 0.6, V(-0.55, 1.05, D2 - T - 0.004), Math.PI, 0, { rough: 0.4 });
  decal(root, canvasT(512, 256, (x) => { x.strokeStyle = 'rgba(24,16,10,0.92)'; x.lineWidth = 5; x.lineCap = 'round'; x.font = 'bold 54px Courier New'; x.fillStyle = 'rgba(24,14,10,0.9)';
    x.save(); x.translate(20, 90); x.rotate(-0.03); x.fillText('IT KNOWS MY NAME', 0, 0); x.restore();
    for (let i = 0; i < 17; i++) { const px = 30 + i * 18 + (i % 5 === 4 ? 0 : 0); if (i % 5 === 4) { x.beginPath(); x.moveTo(px - 80, 200); x.lineTo(px + 6, 140); x.stroke(); continue; } x.beginPath(); x.moveTo(px, 140); x.lineTo(px + 3, 205); x.stroke(); } }), 1.0, 0.5, V(-W2 + T + 0.004, 1.6, 0.55), Math.PI / 2, 0, { rough: 0.9 });
}
function buildExterior(CB) {
  const { root, K, mats, gl } = CB._ctx; const r = mulberry32(777);
  // hinged plank door (Z-braced), iron strap hinges, latch; pivot on the left jamb, opens inward
  const door = new THREE.Group(); door.position.set(-0.46, 0, D2 - T / 2); root.add(door); const dk = new Kit();
  for (let i = 0; i < 6; i++) dk.box(['timber', 'timber', 'timber', 'timber', 'siding', 'panel'], 0.148, 2.02, 0.05, 0.08 + i * 0.152, 1.02, 0);
  dk.box('dark', 0.86, 0.12, 0.03, 0.46, 0.35, -0.04); dk.box('dark', 0.86, 0.12, 0.03, 0.46, 1.7, -0.04); dk.box('dark', 1.5, 0.11, 0.03, 0.46, 1.03, -0.04, { rz: Math.atan2(1.35, 0.78) });
  for (const y of [0.35, 1.7]) dk.box('iron', 0.42, 0.045, 0.012, 0.2, y, 0.03); dk.box('iron', 0.11, 0.03, 0.04, 0.82, 1.05, 0.04); dk.box('iron', 0.03, 0.12, 0.03, 0.85, 1.05, 0.065);
  dk.build(door, mats); CB.door = { g: door, a: 0, target: 0, open: false };
  decal(door, gougeDecal(4), 0.38, 0.9, V(0.5, 1.2, 0.03), 0, 0.12);
  // porch lantern hanging from the header + flickering light
  { const L = makeLantern({ lit: true }); L.position.set(0.9, HW - 0.55, PZ - 0.45); root.add(L); CB.porchLantern = L; K.geo('wire', new THREE.CylinderGeometry(0.003, 0.003, 0.4, 4), M4(0.9, HW - 0.04 - 0.2, PZ - 0.45)); K.box('iron', 0.05, 0.05, 0.36, 0.9, HW - 0.08, PZ - 0.3);
    const pl = vlight(0xffa860, 3.0, 11, 1.6); pl.position.set(0.9, HW - 0.42, PZ - 0.45); root.add(pl); CB.porchLight = pl; }
  // woodpile against the right wall, chopping block + axe, galvanised bucket
  { const lg = new THREE.CylinderGeometry(0.075, 0.08, 0.42, 7); const bark = barkMaps(); mats.log = new THREE.MeshStandardMaterial({ map: texOf(bark.map, { srgb: true, rep: [1, 1] }), normalMap: texOf(bark.normal), roughness: 0.95, color: 0xb0a090 });
    for (let row = 0; row < 5; row++) for (let i = 0; i < 9 - row; i++) K.geo('log', lg, M4(W2 + 0.3, gl(W2 + 0.3, -1.0) + 0.08 + row * 0.14, -1.7 + i * 0.16 + row * 0.08, Math.PI / 2, 0, (r() - 0.5) * 0.1));
    const bx = 2.1, bz = PZ + 1.2, by = gl(bx, bz); K.geo('log', new THREE.CylinderGeometry(0.24, 0.26, 0.45, 12), M4(bx, by + 0.2, bz)); K.geo('timber', new THREE.CylinderGeometry(0.235, 0.235, 0.01, 12), M4(bx, by + 0.43, bz));
    K.geo('dark', new THREE.CylinderGeometry(0.016, 0.02, 0.7, 7), M4(bx + 0.05, by + 0.62, bz + 0.05, 0.3, 0, 0.4)); K.box('iron', 0.17, 0.08, 0.02, bx - 0.05, by + 0.46, bz, { rz: 0.4 });
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.28, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a8c88, roughness: 0.5, metalness: 0.85, side: THREE.DoubleSide })); bucket.position.set(-2.2, DECK_SAFE(CB) + 0.14, PZ - 0.5); bucket.castShadow = true; root.add(bucket); }
}
const DECK_SAFE = (CB) => CB._ctx.DECK;

// ---------- collision, interactions, per-frame update ----------
function finishCabin(CB) {
  const { root, toW, toL, FY, DECK, nS, run, drop } = CB._ctx; const PR = 0.26; // player radius
  const IX = W2 - T - PR, IZ = D2 - T - PR, stepEnd = PZ + nS * run;
  // furniture blockers inside (local rects x0,x1,z0,z1)
  const furn = [[0.3, 1.6, -0.97, -0.27], [-W2 + T, -W2 + T + 0.8, -0.8, 1.25], [W2 - T - 0.3, W2 - T, -1.8, -0.6], [1.55, W2 - T, 1.3, D2 - T], [2.0, 2.5, 0.85, 1.35], [-2.2, -0.4, -D2 + T, -D2 + T + 0.45], [0.05, 0.55, -0.1, 0.4]];
  const inRect = (lx, lz, [x0, x1, z0, z1], m = PR) => lx > x0 - m && lx < x1 + m && lz > z0 - m && lz < z1 + m;
  CB.zone = (x, z) => { const { x: lx, z: lz } = toL(x, z);
    if (Math.abs(lx) < IX && Math.abs(lz) < IZ) return furn.some(f => inRect(lx, lz, f)) ? 'blocked' : 'in';
    if (Math.abs(lx) < 0.42 - 0.1 && lz >= IZ - 0.01 && lz < D2 + PR + 0.03) return 'door';
    if (Math.abs(lx) < W2 - 0.1 - PR && lz >= D2 + PR && lz < PZ - 0.12 - PR) return 'porch';
    if (Math.abs(lx) < 0.62 - PR + 0.05 && lz >= PZ - 0.4 && lz < stepEnd + 0.2) return 'steps';
    if (lx > -1.95 - PR && lx < -0.65 + PR && lz > -D2 - 0.72 - PR && lz < -D2) return 'blocked';
    if (lx > W2 && lx < W2 + 0.4 + PR && lz > -1.85 && lz < -0.2) return 'blocked';
    if (Math.abs(lx) < W2 + 0.12 + PR && lz > -D2 - 0.12 - PR && lz < PZ + PR - 0.05) return 'blocked';
    return null; };
  CB.doorPassable = () => Math.abs(CB.door.a) > 1.0;
  CB.blocked = (x, z) => { const k = CB.zone(x, z); return k === 'blocked' || (k === 'door' && !CB.doorPassable()); };
  CB.floorAt = (x, z) => { const k = CB.zone(x, z); if (k === 'in' || k === 'door') return FY + 0.0; if (k === 'porch') return FY + DECK;
    if (k === 'steps') { const lz = toL(x, z).z; const t = Math.max(0, Math.min(1, (lz - PZ) / Math.max(0.01, stepEnd - PZ))); const i = Math.min(nS, Math.floor(t * nS + 0.5)); return Math.max(height(x, z), FY + DECK - i * (drop / nS)); }
    return null; };
  CB.indoors = (x, z) => CB.zone(x, z) === 'in' || (CB.zone(x, z) === 'blocked' && (() => { const l = toL(x, z); return Math.abs(l.x) < W2 - T && Math.abs(l.z) < D2 - T; })());
  CB.onPorch = (x, z) => CB.zone(x, z) === 'porch';
  CB.pushOut = (p) => { const l = toL(p.x, p.z); const ex = W2 + 0.9, ez0 = -D2 - 1.1, ez1 = stepEnd + 0.6; if (Math.abs(l.x) > ex || l.z < ez0 || l.z > ez1) return false;
    const dx = ex - Math.abs(l.x), dz0 = l.z - ez0, dz1 = ez1 - l.z; let nl;
    if (dx < dz0 && dx < dz1) nl = { x: Math.sign(l.x || 1) * ex, z: l.z }; else if (dz0 < dz1) nl = { x: l.x, z: ez0 }; else nl = { x: l.x, z: ez1 }; const w = toW(nl.x, nl.z); p.x = w.x; p.z = w.z; return true; };
  const W3 = (lx, ly, lz) => { const w = toW(lx, lz); return V(w.x, FY + ly, w.z); };
  CB.W3 = W3; CB.doorOut = W3(0, DECK, D2 + 0.7); CB.doorIn = W3(0, 0, D2 - 0.9); CB.porchFront = W3(0, 0, stepEnd + 0.9); CB.porchFront.y = height(CB.porchFront.x, CB.porchFront.z);
  CB.inside = W3(0, 0, 0); CB.rifleWorld = W3(CB.rifleLocal.x, CB.rifleLocal.y, CB.rifleLocal.z); CB.noteWorld = W3(CB.noteLocal.x, CB.noteLocal.y, CB.noteLocal.z);
  for (const w of CB.windows) { w.outW = W3(w.out.x, w.out.y, w.out.z); w.inW = W3(w.in.x, w.in.y, w.in.z); w.cW = W3(w.local.x, w.local.y, w.local.z); w.yaw = CB.yaw + (w.wall === 'front' ? 0 : w.wall === 'left' ? -Math.PI / 2 : Math.PI / 2); }
  CB.doorLatch = W3(0, 1.05, D2 - T / 2);
  CB.interact.push(
    { id: 'cabinDoor', pos: W3(0, 1.1, D2 - T / 2), r: 2.3, use: () => CB.door.open ? 'CLOSE' : 'OPEN', label: () => CB.door.open ? 'Close the cabin door' : 'Open the cabin door', press: () => { CB.door.open = !CB.door.open; CB.door.target = CB.door.open ? 1.72 : 0; CB.onDoor && CB.onDoor(CB.door.open, CB.doorLatch); } },
    { id: 'rifle', pos: CB.rifleWorld.clone(), r: 2.0, use: () => 'TAKE', label: () => 'Take the rifle (.308, scoped)', avail: () => !CB.rifleTaken, press: () => { CB.rifle.visible = false; CB.rifleTaken = true; for (const rd of CB.rackRounds || []) rd.visible = false; CB.onTakeRifle && CB.onTakeRifle(); } },
    { id: 'cabinNote', pos: CB.noteWorld.clone(), r: 1.8, use: () => 'READ', label: () => 'Read the note on the table', press: () => CB.onNote && CB.onNote('ranger') });
  CB.resetRifle = () => { CB.rifleTaken = false; CB.rifle.visible = CB.detailOn !== false; for (const rd of CB.rackRounds || []) rd.visible = true; };
  // every mesh under the cabin root gets its world matrix once; static from here on
  root.updateMatrixWorld(true);
  CB.detail = root.children.filter(o => !/^cabin-/.test(o.name) && o !== CB.door.g && o !== CB.porchLantern && !(o.isMesh && o.material && o.material.transparent && o.renderOrder === 3)); CB.detailOn = true;
  // embers in the hearth: glow sprite + very dim warm light (fixed light count; intensity driven by distance)
  const emb = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(255,120,40,0.9)', 'rgba(255,60,10,0)', 64), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  emb.position.copy(CB.hearthPos); emb.scale.set(0.6, 0.25, 1); root.add(emb); CB.emberSprite = emb; CB.mats.char.emissiveIntensity = 0.9;
  CB.lights.push(CB.tableLight, CB.porchLight);
  // ONE real point light serves every lantern / campfire (whichever matters most to the player) and the rifle's muzzle flash:
  // a fixed light count keeps the shaders stable and the iPhone fast
  CB.light = new THREE.PointLight(0xffa860, 0, 10, 1.6); CB.light.castShadow = false; CB.group.add(CB.light); CB.flashT = 0;
  CB.flashAt = (pos) => { CB.flashT = 0.06; CB.flashPos = pos.clone(); };
  const _wp = V(0, 0, 0);
  CB.pickLight = (player, dt) => { const L = CB.light; if (CB.flashT > 0) { CB.flashT -= dt; L.position.copy(CB.flashPos); L.color.setHex(0xffb060); L.distance = 18; L.intensity = 30 * Math.max(0, CB.flashT / 0.06); return; }
    let best = null, bs = 0; const cands = [CB.tableLight, CB.porchLight, CB.trail && CB.trail.light, CB.trail && CB.trail.campLight];
    const inside = player && CB.indoors(player.x, player.z);
    for (const c of cands) { if (!c || c.intensity <= 0) continue; c.getWorldPosition(_wp); const d2 = player ? (_wp.x - player.x) ** 2 + (_wp.z - player.z) ** 2 : 0; let sc = c.intensity / (1 + d2 / (c.distance * c.distance));
      if (inside) sc *= c === CB.tableLight ? 4 : 0.05; if (sc > bs) { bs = sc; best = c; } }
    if (!best) { L.intensity = 0; return; } best.getWorldPosition(L.position); L.color.setHex(best.userData.color); L.distance = best.distance; L.decay = best.decay; L.intensity = best.intensity; };
  CB.update = (dt, { player, t }) => { CB.t += dt; const tt = CB.t;
    const d = CB.door; const k = 1 - Math.exp(-dt * 3.2); const prev = d.a; d.a += (d.target - d.a) * k; d.g.rotation.y = -d.a; // opens inward (toward -z)
    const dist = player ? Math.hypot(player.x - CB.center.x, player.z - CB.center.z) : 0; const near = dist < 60 ? 1 : 0;
    const want = dist < 40; if (want !== CB.detailOn) { CB.detailOn = want; for (const o of CB.detail) o.visible = want && !(CB.rifleTaken && (o === CB.rifle || (CB.rackRounds || []).includes(o))); }
    const f1 = flick(tt, 1), f2 = flick(tt * 1.1, 4.2); CB.tableLight.intensity = near * 2.2 * f1; CB.porchLight.intensity = near * (CB.porchLantern.userData.lit ? 3.0 * f2 : 0);
    for (const [L, f] of [[CB.tableLantern, f1], [CB.porchLantern, f2]]) { const u = L.userData; u.flame.scale.set(0.045 * (0.9 + f * 0.15), 0.075 * f, 1); u.halo.material.opacity = 0.45 * f; u.glass.emissiveIntensity = 0.45 * f; }
    CB.porchLantern.rotation.z = Math.sin(tt * 1.3) * 0.05 + Math.sin(tt * 0.37) * 0.04; CB.porchLantern.rotation.x = Math.sin(tt * 0.9 + 1) * 0.04;
    CB.emberSprite.material.opacity = 0.6 + 0.3 * Math.sin(tt * 2.1) * Math.sin(tt * 0.7); CB.mats.char.emissiveIntensity = 0.55 + 0.35 * Math.sin(tt * 1.7) ** 2;
    if (CB.trail) CB.trail.update(dt, player, tt);
    CB.pickLight(player, dt);
    return { doorMoving: Math.abs(d.a - prev) > 1e-3 }; };
}

// ---------- the lantern trail from the tower stairs, totems, clawed snags, abandoned camp, grove, mist, moths ----------
function buildTrail(CB, { T: TWR, W, GR, mats, toW, frontLocal }) {
  const g = new THREE.Group(); CB.group.add(g); const r = mulberry32(9090); const TR = { lanterns: [], sparks: [], mist: [], moths: [] }; CB.trail = TR;
  const sb = T && T.stairs ? T.stairs.bottom : V(-5.85, 0, -2.7); const end = toW(frontLocal.x, frontLocal.z);
  const a = V(sb.x - 0.6, 0, sb.z - 1.5), e = V(end.x, 0, end.z); const dv = e.clone().sub(a); const L0 = dv.length(); const nrm = V(-dv.z, 0, dv.x).normalize();
  const ctrl = [a, a.clone().lerp(e, 0.12).addScaledVector(nrm, -1.5), a.clone().lerp(e, 0.38).addScaledVector(nrm, 4.5), a.clone().lerp(e, 0.66).addScaledVector(nrm, -3.5), a.clone().lerp(e, 0.88).addScaledVector(nrm, 1.2), e];
  for (const p of ctrl) p.y = height(p.x, p.z); const curve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal'); const len = curve.getLength(); CB.trailLen = len;
  const pts = curve.getSpacedPoints(Math.ceil(len / 0.5)); CB.trailPts = pts;
  CB.trailAt = (t) => { const p = curve.getPointAt(Math.max(0, Math.min(1, t))); p.y = height(p.x, p.z); return p; };
  CB.trailDist = (x, z) => { let m = 1e9; for (let i = 0; i < pts.length; i += 2) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < m) m = d; } return Math.sqrt(m); };
  // dirt ribbon (soft alpha edges, worn darker centre line, roots)
  { const dirt = canvasT(256, 512, (x, w, h) => { const im = x.createImageData(w, h); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const u = i / w; const edge = Math.min(u, 1 - u); const n = (Math.sin(j * 0.11 + i * 0.03) + Math.sin(j * 0.37 - i * 0.07) * 0.5) * 0.06 + r() * 0.12;
      const a = Math.max(0, Math.min(1, (edge - 0.04 - n * 0.5) * 5.5)); const c = 0.55 + n + (0.5 - Math.abs(u - 0.5)) * 0.25 - (Math.abs(u - 0.38) < 0.05 || Math.abs(u - 0.62) < 0.05 ? 0.08 : 0); const k = (j * w + i) * 4;
      im.data[k] = 92 * c; im.data[k + 1] = 72 * c; im.data[k + 2] = 54 * c; im.data[k + 3] = a * 235; } x.putImageData(im, 0, 0);
      for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(${120 + r() * 50 | 0},${110 + r() * 40 | 0},${100 + r() * 30 | 0},0.9)`; x.beginPath(); x.ellipse(40 + r() * 176, r() * h, 2 + r() * 4, 1.5 + r() * 3, r() * 3, 0, 7); x.fill(); }
      x.strokeStyle = 'rgba(48,34,24,0.85)'; x.lineCap = 'round'; for (let k = 0; k < 6; k++) { x.lineWidth = 3 + r() * 4; x.beginPath(); let px = r() * w, py = r() * h; x.moveTo(px, py); for (let s = 0; s < 5; s++) { px += 20 + r() * 30; py += (r() - 0.5) * 30; x.lineTo(px, py); } x.stroke(); } });
    dirt.wrapT = THREE.RepeatWrapping; const Wd = 1.5; const pos = [], uv = [], idx = [];
    pts.forEach((p, i) => { const t = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).setY(0).normalize(); const s = V(-t.z, 0, t.x); const wv = Wd * (0.85 + 0.3 * Math.sin(i * 0.23));
      for (const k of [-1, 1]) { const q = p.clone().addScaledVector(s, k * wv / 2); pos.push(q.x, height(q.x, q.z) + 0.045, q.z); uv.push(k < 0 ? 0 : 1, i * 0.5 / 3); } if (i) { const o = (i - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); } });
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    const rib = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: dirt, transparent: true, roughness: 0.97, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); rib.receiveShadow = true; rib.renderOrder = 1; g.add(rib); TR.ribbon = rib; }
  const K = new Kit(); const local = (p) => p; // trail parts are built in world space
  const side = (t, off) => { const p = CB.trailAt(t); const q = CB.trailAt(Math.min(1, t + 0.01)); const d = q.clone().sub(p).setY(0).normalize(); const s = V(-d.z, 0, d.x); const w = p.clone().addScaledVector(s, off); w.y = height(w.x, w.z); return { p: w, yaw: Math.atan2(d.x, d.z), s }; };
  // lantern posts every ~10 m, alternating sides; one dead, one smashed on the ground
  const nPosts = Math.max(4, Math.floor(len / 10)); for (let i = 0; i < nPosts; i++) { const t = (i + 0.6) / (nPosts + 0.4); const sd = i % 2 ? 1 : -1; const { p, yaw, s } = side(t, sd * 1.25); const smashed = i === Math.floor(nPosts * 0.62), dead = i === Math.floor(nPosts * 0.35);
    const tilt = smashed ? 0 : (r() - 0.5) * 0.08; const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, yaw, (r() - 0.5) * 0.06));
    if (!smashed) { const top = V(0, 1.55, 0).applyQuaternion(q).add(p); K.box('timber', 0.1, 1.75, 0.1, p.x, p.y + 0.8, p.z, { q }); const armEnd = top.clone().addScaledVector(s, -sd * 0.42); K.box('dark', 0.05, 0.05, 0.5, (top.x + armEnd.x) / 2, top.y, (top.z + armEnd.z) / 2, { ry: Math.atan2(s.x, s.z) });
      const lan = makeLantern({ lit: !dead }); lan.position.set(armEnd.x, armEnd.y - 0.36, armEnd.z); g.add(lan); K.geo('wire', new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4), M4(armEnd.x, armEnd.y - 0.04, armEnd.z)); TR.lanterns.push({ g: lan, lit: !dead, seed: i * 1.7, pos: lan.position.clone() }); }
    else { K.box('timber', 0.1, 1.75, 0.1, p.x + s.x * 0.5, p.y + 0.06, p.z + s.z * 0.5, { rz: Math.PI / 2 - 0.05, ry: yaw }); const lan = makeLantern({ lit: false }); lan.rotation.set(1.35, 0, 0.4); lan.position.set(p.x - s.x * 0.3, p.y + 0.07, p.z - s.z * 0.3); g.add(lan);
      decal(g, glassCrack(9, true), 0.5, 0.5, V(p.x - s.x * 0.2, p.y + 0.06, p.z - s.z * 0.2), 0, -Math.PI / 2, { opacity: 0.6 }); }
    GR && GR.obstacles.push({ x: p.x, z: p.z, r: 0.18 }); }
  TR.light = vlight(0xffa860, 0, 9, 1.7); g.add(TR.light);
  // bone totems: stick tripod lashed at the top, a deer skull crowning it, small bones hanging on twine
  CB.totems = []; for (const [t, off] of [[0.3, 1.9], [0.58, -2.1], [0.86, 2.3]]) { const { p, yaw } = side(t, off); const H = 1.9;
    for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + yaw; const foot = V(p.x + Math.cos(a) * 0.55, p.y, p.z + Math.sin(a) * 0.55); const top = V(p.x, p.y + H, p.z); const mid = foot.clone().lerp(top, 0.5); const d = top.clone().sub(foot); const ln = d.length() + 0.25;
      const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.normalize()); K.geo('log', new THREE.CylinderGeometry(0.025, 0.04, ln, 6), new THREE.Matrix4().compose(mid, q, V(1, 1, 1))); }
    const sk = buildDeerSkull(); sk.scale.setScalar(0.7); sk.position.set(p.x, p.y + H + 0.05, p.z); sk.rotation.y = yaw + Math.PI; sk.rotation.x = 0.25; g.add(sk);
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; const hx = p.x + Math.cos(a) * 0.18, hz = p.z + Math.sin(a) * 0.18, hl = 0.25 + r() * 0.35; K.geo('wire', new THREE.CylinderGeometry(0.0025, 0.0025, hl, 3), M4(hx, p.y + H - 0.15 - hl / 2, hz));
      const bn = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.09 + r() * 0.07, 3, 6), sk.children[0].material); bn.position.set(hx, p.y + H - 0.2 - hl, hz); bn.rotation.z = (r() - 0.5) * 0.6; g.add(bn); }
    CB.totems.push(V(p.x, p.y + H, p.z)); GR && GR.obstacles.push({ x: p.x, z: p.z, r: 0.55 }); }
  // dead snags with fresh claw gouges facing the trail
  const barkM = (() => { const b = barkMaps(); return new THREE.MeshStandardMaterial({ map: texOf(b.map, { srgb: true, rep: [2, 3] }), normalMap: texOf(b.normal, { rep: [2, 3] }), roughness: 1, color: 0x8a8278 }); })(); mats.snag = barkM;
  for (const [t, off] of [[0.2, -2.6], [0.47, 2.8], [0.74, -2.7]]) { const { p, s } = side(t, off); const h = 4.5 + r() * 3; K.geo('snag', new THREE.CylinderGeometry(0.12, 0.24, h, 9, 4), M4(p.x, p.y + h / 2 - 0.1, p.z, (r() - 0.5) * 0.06, r() * 6, (r() - 0.5) * 0.06));
    const face = V(-s.x * Math.sign(off), 0, -s.z * Math.sign(off)); const dp = V(p.x, p.y + 1.6, p.z).addScaledVector(face, 0.2); decal(g, gougeDecal(5 + Math.round(t * 10)), 0.32, 1.3, dp, Math.atan2(face.x, face.z), 0); GR && GR.obstacles.push({ x: p.x, z: p.z, r: 0.35 }); }
  // abandoned campsite off the trail: collapsed tent, sleeping bag, fire ring with live embers, pack, pot, note on a stump, blood
  { const { p: tp, s } = side(0.52, 0); const dir = s.clone().multiplyScalar(-1); const c = tp.clone().addScaledVector(dir, 7.5); c.y = height(c.x, c.z); CB.campPos = c.clone();
    const at = (dx, dz) => { const q = c.clone().addScaledVector(dir, dz).addScaledVector(s, dx); q.y = height(q.x, q.z); return q; };
    const tentM = new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.9, side: THREE.DoubleSide, normalMap: texOf(fabricMaps().n, { rep: [6, 6] }), normalScale: new THREE.Vector2(0.5, 0.5) });
    const tg = new THREE.PlaneGeometry(2.2, 1.8, 16, 14); const tpp = tg.attributes.position; for (let i = 0; i < tpp.count; i++) { const x = tpp.getX(i), y = tpp.getY(i); const ridge = Math.max(0, 1 - Math.abs(x) / 1.1) * (x > 0.2 ? 0.85 : 0.25) * Math.max(0, 1 - Math.abs(y) / 0.9); tpp.setZ(i, ridge * 0.8 + Math.sin(x * 7 + y * 5) * 0.04 + (r() - 0.5) * 0.03); }
    tg.computeVertexNormals(); const tent = new THREE.Mesh(tg, tentM); tent.rotation.x = -Math.PI / 2; tent.rotation.z = Math.atan2(dir.x, dir.z); const tpos = at(-1.6, 1.4); tent.position.set(tpos.x, tpos.y + 0.04, tpos.z); tent.castShadow = tent.receiveShadow = true; g.add(tent);
    K.geo('iron', new THREE.CylinderGeometry(0.008, 0.008, 1.2, 5), M4(tpos.x + 0.5, tpos.y + 0.5, tpos.z, 0.6, 0, 0.3));
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.4, 4, 10).scale(1, 1, 0.35).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x6a2a1a, roughness: 0.85, normalMap: texOf(fabricMaps().n, { rep: [3, 6] }) })); const bp = at(0.6, 1.8); bag.position.set(bp.x, bp.y + 0.1, bp.z); bag.rotation.y = Math.atan2(dir.x, dir.z) + 0.4; bag.castShadow = true; g.add(bag);
    const ring = at(0, -0.3); for (let k = 0; k < 11; k++) { const a = k / 11 * 6.28; const q = ring.clone().add(V(Math.cos(a) * 0.48, 0, Math.sin(a) * 0.48)); const st = new THREE.DodecahedronGeometry(0.1 + r() * 0.05, 0); st.scale(1.2, 0.7, 1); K.geo('stone', st, M4(q.x, height(q.x, q.z) + 0.04, q.z, r() * 3, r() * 3, 0)); }
    const logG = new THREE.CylinderGeometry(0.045, 0.05, 0.5, 7); for (let k = 0; k < 3; k++) { const m = new THREE.Mesh(logG, CB.mats.char); m.rotation.set(Math.PI / 2, k * 2.1, 0.2); m.position.set(ring.x, ring.y + 0.08, ring.z); g.add(m); }
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(255,110,30,0.9)', 'rgba(255,50,10,0)', 64), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); glow.position.set(ring.x, ring.y + 0.12, ring.z); glow.scale.set(0.9, 0.35, 1); g.add(glow); TR.campGlow = glow;
    TR.campLight = vlight(0xff6a20, 0, 6, 1.8); TR.campLight.position.set(ring.x, ring.y + 0.35, ring.z); g.add(TR.campLight);
    const spM = new THREE.SpriteMaterial({ map: radialSprite('rgba(255,200,120,1)', 'rgba(255,90,20,0)', 32), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false });
    for (let k = 0; k < 14; k++) { const sp = new THREE.Sprite(spM); sp.scale.setScalar(0.025); g.add(sp); TR.sparks.push({ s: sp, o: ring.clone(), t: r() * 3, v: 0.4 + r() * 0.5, dx: (r() - 0.5) * 0.3, dz: (r() - 0.5) * 0.3 }); }
    const pk = at(1.3, 0.4); K.geo('crate', new RoundedBox(0.35, 0.5, 0.22), M4(pk.x, pk.y + 0.2, pk.z, 0.0, 0.8, 1.2)); const pot = at(0.55, -0.4); K.geo('iron', new THREE.CylinderGeometry(0.09, 0.08, 0.12, 12), M4(pot.x, pot.y + 0.05, pot.z, 0.2, 0, 1.4));
    const stp = at(-0.9, -1.1); K.geo('log', new THREE.CylinderGeometry(0.22, 0.25, 0.42, 11), M4(stp.x, stp.y + 0.18, stp.z)); K.geo('timber', new THREE.CylinderGeometry(0.215, 0.215, 0.01, 11), M4(stp.x, stp.y + 0.395, stp.z));
    const note = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({ map: tex(paperTex(5), { srgb: true }), roughness: 0.95, side: THREE.DoubleSide })); note.rotation.set(-Math.PI / 2, 0, 0.7); note.position.set(stp.x, stp.y + 0.405, stp.z); g.add(note);
    K.box('iron', 0.012, 0.004, 0.16, stp.x + 0.05, stp.y + 0.41, stp.z + 0.03, { ry: 0.4 }); CB.campNotePos = V(stp.x, stp.y + 0.45, stp.z);
    decal(g, bloodDecal(6, 'drag'), 1.0, 2.6, V(at(-0.3, 2.6).x, at(-0.3, 2.6).y + 0.05, at(-0.3, 2.6).z), Math.atan2(dir.x, dir.z), -Math.PI / 2, { rough: 0.4 });
    CB.interact.push({ id: 'campNote', pos: CB.campNotePos.clone(), r: 2.0, use: () => 'READ', label: () => 'Read the note on the stump', press: () => CB.onNote && CB.onNote('camp') });
    if (GR) GR.obstacles.push({ x: stp.x, z: stp.z, r: 0.3 }, { x: ring.x, z: ring.z, r: 0.45 }); }
  K.build(g, mats);
  // a grove of pines around the cabin (same tree asset as the forest), kept off the trail and the clearing
  if (W && W.treesNear) { const src = W.treesNear; const im = new THREE.InstancedMesh(src.geometry, src.material, 46); const o = new THREE.Object3D(); const col = new THREE.Color(); let n = 0, guard = 0;
    while (n < 46 && guard++ < 2000) { const a = r() * 6.28, d = 10 + r() * 26; const x = CB.center.x + Math.cos(a) * d, z = CB.center.z + Math.sin(a) * d; if (Math.hypot(x, z) < 22) continue; { const l = CB.toL(x, z); if (Math.abs(l.x) < W2 + 5 && l.z > -D2 - 5 && l.z < PZ + 10) continue; } if (CB.trailDist(x, z) < 3.2) continue; if (CB.campPos && Math.hypot(x - CB.campPos.x, z - CB.campPos.z) < 5) continue;
      const H = 13 + r() * 12; o.position.set(x, height(x, z) - 0.2, z); o.rotation.set(0, r() * 6.28, 0); o.scale.set(H * (0.85 + r() * 0.3), H, H * 0.95); o.updateMatrix(); im.setMatrixAt(n, o.matrix); col.setHSL(0.22 + 0.08 * r(), 0.28, 0.62 + 0.3 * r()); im.setColorAt(n, col); if (GR) GR.obstacles.push({ x, z, r: 0.45 }); n++; }
    im.count = n; im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); g.add(im); TR.grove = im; }
  // low ground mist drifting through the clearing and along the trail
  { const sm = smokeAtlas(); for (let k = 0; k < 12; k++) { const t = k < 7 ? k / 7 : 1; const base = k < 7 ? CB.trailAt(0.15 + t * 0.8) : CB.center.clone().add(V((r() - 0.5) * 16, 0, (r() - 0.5) * 16)); base.y = height(base.x, base.z);
      const m = new THREE.SpriteMaterial({ map: sm.clone(), color: 0x6a7480, transparent: true, opacity: 0.0, depthWrite: false, fog: true }); m.map.repeat.set(0.5, 0.5); m.map.offset.set((k % 2) * 0.5, ((k >> 1) % 2) * 0.5); m.map.needsUpdate = true;
      const s = new THREE.Sprite(m); s.scale.set(9 + r() * 5, 2.4, 1); s.position.set(base.x, base.y + 0.9, base.z); g.add(s); TR.mist.push({ s, o: base.clone(), ph: r() * 6, op: 0.08 + r() * 0.06 }); } }
  // moths circling the porch lantern
  { const mm = new THREE.SpriteMaterial({ map: radialSprite('rgba(230,220,200,1)', 'rgba(200,190,170,0)', 16), transparent: true, depthWrite: false, opacity: 0.9 }); const c = CB.W3(0.9, HW - 0.42, PZ - 0.45);
    for (let k = 0; k < 7; k++) { const s = new THREE.Sprite(mm); s.scale.setScalar(0.018); g.add(s); TR.moths.push({ s, c, ph: r() * 6, rr: 0.12 + r() * 0.25, sp: 3 + r() * 4, h: (r() - 0.5) * 0.25 }); } }
  const tmp = V(0, 0, 0);
  TR.update = (dt, player, t) => { if (!player) return; const px = player.x, pz = player.z; const dC = Math.hypot(px - CB.center.x, pz - CB.center.z), close = dC < 110;
    let best = null, bd = 1e9; for (const L of TR.lanterns) { if (!L.lit) continue; const d = (L.pos.x - px) ** 2 + (L.pos.z - pz) ** 2; if (d < bd) { bd = d; best = L; } const f = flick(t, L.seed); const u = L.g.userData; u.flame.scale.set(0.045, 0.075 * f, 1); u.halo.material.opacity = 0.5 * f; u.glass.emissiveIntensity = 0.5 * f; }
    if (best && bd < 40 * 40) { TR.light.position.copy(best.pos).add(V(0, 0.1, 0)); TR.light.intensity = 2.2 * flick(t, best.seed); } else TR.light.intensity = 0;
    const fc = 0.75 + 0.25 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1); TR.campGlow.material.opacity = fc; TR.campLight.intensity = CB.campPos && Math.hypot(px - CB.campPos.x, pz - CB.campPos.z) < 35 ? 1.4 * fc : 0;
    for (const s of TR.sparks) { s.t += dt * s.v; if (s.t > 1.6) s.t = 0; s.s.position.set(s.o.x + s.dx * s.t + Math.sin(t * 3 + s.v * 9) * 0.05, s.o.y + 0.15 + s.t * 0.9, s.o.z + s.dz * s.t); s.s.material.opacity = 1; s.s.visible = close; s.s.scale.setScalar(0.025 * (1 - s.t / 1.7)); }
    const show = player.y < CB.floorY + 12 && !CB.indoors(player.x, player.z); for (const m of TR.mist) { m.s.visible = show && close && Math.hypot(m.o.x - CB.center.x, m.o.z - CB.center.z) > 7.5; if (!m.s.visible) continue; m.s.position.set(m.o.x + Math.sin(t * 0.05 + m.ph) * 2.5, m.o.y + 0.8 + Math.sin(t * 0.13 + m.ph) * 0.15, m.o.z + Math.cos(t * 0.04 + m.ph) * 2.5); m.s.material.opacity = m.op * (0.7 + 0.3 * Math.sin(t * 0.2 + m.ph)); }
    for (const m of TR.moths) { m.s.visible = dC < 30; if (!m.s.visible) continue; const a = t * m.sp + m.ph; m.s.position.set(m.c.x + Math.cos(a) * m.rr + Math.sin(a * 2.7) * 0.04, m.c.y + m.h + Math.sin(a * 1.9) * 0.08, m.c.z + Math.sin(a * 1.3) * m.rr); } };
}
class RoundedBox extends THREE.BoxGeometry { constructor(w, h, d) { super(w, h, d, 2, 2, 2); const p = this.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i) / (w / 2), y = p.getY(i) / (h / 2), z = p.getZ(i) / (d / 2); const k = 1 - 0.12 * (Math.abs(x * y) + Math.abs(y * z) + Math.abs(x * z)) / 3; p.setXYZ(i, p.getX(i) * k, p.getY(i) * (0.94 + 0.06 * (1 - Math.abs(x * z))), p.getZ(i) * k); } this.computeVertexNormals(); } }

// moths around any light (the tower floodlight uses this too)
export function addMoths(parent, center, n = 9) { const mm = new THREE.SpriteMaterial({ map: radialSprite('rgba(230,220,200,1)', 'rgba(200,190,170,0)', 16), transparent: true, depthWrite: false, opacity: 0.9 }); const r = mulberry32(55); const list = [];
  for (let k = 0; k < n; k++) { const s = new THREE.Sprite(mm); s.scale.setScalar(0.02); parent.add(s); list.push({ s, ph: r() * 6, rr: 0.15 + r() * 0.35, sp: 3 + r() * 4, h: (r() - 0.5) * 0.3 }); }
  return { update(t, on = true) { for (const m of list) { m.s.visible = on; if (!on) continue; const a = t * m.sp + m.ph; m.s.position.set(center.x + Math.cos(a) * m.rr + Math.sin(a * 2.7) * 0.05, center.y + m.h + Math.sin(a * 1.9) * 0.1, center.z + Math.sin(a * 1.3) * m.rr); } } }; }
