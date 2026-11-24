// The ground around Elgo Tower (v2): the trail to the fire line (reflective marker posts), the generator shed with its fuel
// can, the trailhead fire cache with the hose pack, the brush the thing bursts out of, and the secrets / bodies of the
// lookouts who sat this tower before you. Everything sits on height() so nothing floats.
import * as THREE from 'three';
import { height, LOT } from '../geo.js';
import { rbox, fabricMaps, texOf, barkMaps } from '../procedural.js';
import { pineGeometry, pineMaterials } from '../trees.js';
import { radialSprite } from '../textures.js';
import { SECRETS } from './shifts.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const gy = (x, z) => height(x, z) + (Math.hypot(x, z) < 15 ? 0.07 : 0);
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function box(w, h, d, mat, x, y, z, parent) { const m = new THREE.Mesh(rbox(w, h, d, Math.min(0.012, Math.min(w, h, d) * 0.25), 2), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent && parent.add(m); return m; }
function carveTex(text, wood = '#7a6a58') { return canvasTex(256, 256, (c, w, h) => { c.fillStyle = wood; c.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { c.strokeStyle = `rgba(40,30,20,${0.08 + Math.random() * 0.1})`; c.beginPath(); c.moveTo(0, Math.random() * h); c.bezierCurveTo(w * 0.3, Math.random() * h, w * 0.6, Math.random() * h, w, Math.random() * h); c.stroke(); }
  const lines = text.split('\n'); c.textAlign = 'center'; c.font = 'bold 44px serif'; lines.forEach((l, i) => { const y = h / 2 + (i - (lines.length - 1) / 2) * 56 + 14; c.save(); c.translate(w / 2, y); c.rotate((Math.random() - 0.5) * 0.06);
    c.lineWidth = 6; c.strokeStyle = 'rgba(20,14,8,0.9)'; c.strokeText(l, 2, 2); c.fillStyle = 'rgba(200,180,150,0.95)'; c.fillText(l, 0, 0); c.restore(); }); }); }
function gougeTex() { return canvasTex(128, 512, (c, w, h) => { c.fillStyle = '#6e665c'; c.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { c.strokeStyle = `rgba(30,26,22,${0.1 + Math.random() * 0.15})`; c.beginPath(); const x = Math.random() * w; c.moveTo(x, 0); c.lineTo(x + (Math.random() - 0.5) * 10, h); c.stroke(); }
  for (let k = 0; k < 4; k++) { const x = 30 + k * 20; c.lineCap = 'round'; c.lineWidth = 7; c.strokeStyle = '#2a2218'; c.beginPath(); c.moveTo(x, 90 + k * 6); c.quadraticCurveTo(x + 8, 220, x + 2, 330 + k * 10); c.stroke(); c.lineWidth = 3; c.strokeStyle = '#d8c8a8'; c.beginPath(); c.moveTo(x + 1, 96 + k * 6); c.quadraticCurveTo(x + 9, 220, x + 3, 320 + k * 10); c.stroke(); } }); }
function bloodTex() { return canvasTex(128, 128, (c, w, h) => { for (let i = 0; i < 26; i++) { const r = 4 + Math.random() * 18, x = w / 2 + (Math.random() - 0.5) * 60, y = h / 2 + (Math.random() - 0.5) * 60; const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, 'rgba(48,14,10,0.85)'); g.addColorStop(1, 'rgba(48,14,10,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); } }); }
// slumped dead lookout in a faded forestry jacket: seated against something, legs out, head down under a cap brim (no gore)
const _fab = {};
function fabricMat(col, key) { if (_fab[key]) return _fab[key]; const F = fabricMaps(); const t = canvasTex(128, 128, (c, w, h) => { c.fillStyle = col; c.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,240' : '20,20,10'},${Math.random() * 0.06})`; c.fillRect(Math.random() * w, Math.random() * h, 3 + Math.random() * 12, 2 + Math.random() * 8); } });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return (_fab[key] = new THREE.MeshStandardMaterial({ map: t, normalMap: texOf(F.n, { rep: [6, 6] }), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 0.95 })); }
export function makeBody(name, year) {
  const g = new THREE.Group(); const jacket = fabricMat('#7d8466', 'jacket'), pants = fabricMat('#3a3a32', 'pants'), boot = new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.8 }), skin = new THREE.MeshStandardMaterial({ color: 0x8a7a6c, roughness: 0.85 });
  const cap = fabricMat('#5e6a4c', 'cap');
  const limb = (a, b, r, m) => { const v = new THREE.Vector3().subVectors(b, a); const c = new THREE.Mesh(new THREE.CapsuleGeometry(r, Math.max(0.01, v.length() - r), 4, 10), m); c.position.copy(a).addScaledVector(v, 0.5); c.quaternion.setFromUnitVectors(V(0, 1, 0), v.normalize()); c.castShadow = true; g.add(c); return c; };
  // seated: hips at the ground, torso leaning back ~25 deg against whatever is behind (local -z)
  const hip = V(0, 0.16, 0), sh = V(0, 0.72, -0.24), head = V(0.05, 0.86, -0.08);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.38, 4, 12), jacket); torso.position.copy(hip).lerp(sh, 0.5); torso.quaternion.setFromUnitVectors(V(0, 1, 0), sh.clone().sub(hip).normalize()); torso.scale.set(1.15, 1, 0.8); torso.castShadow = true; g.add(torso);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 16), jacket); collar.position.copy(sh).add(V(0, 0.04, 0.03)); collar.rotation.x = Math.PI / 2 - 0.5; g.add(collar);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 12), skin); hd.position.copy(head); hd.scale.set(0.9, 1.05, 1); g.add(hd);
  const cp = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), cap); cp.position.copy(head).add(V(0, 0.02, 0)); cp.rotation.x = 0.55; g.add(cp);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), cap); brim.position.copy(head).add(V(0, -0.01, 0.07)); brim.rotation.x = 0.55; brim.scale.set(1, 1, 0.9); g.add(brim);
  for (const sx of [-1, 1]) { const s0 = sh.clone().add(V(sx * 0.2, -0.03, 0)), el = V(sx * 0.3, 0.34, -0.08), wr = V(sx * 0.2, 0.16, 0.22); limb(s0, el, 0.055, jacket); limb(el, wr, 0.048, jacket); const hnd = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), skin); hnd.position.copy(wr).add(V(0, -0.02, 0.05)); hnd.scale.set(0.8, 0.5, 1.3); g.add(hnd);
    const k = V(sx * 0.12, 0.2, 0.45), a = V(sx * 0.15, 0.08, 0.86); limb(hip.clone().add(V(sx * 0.1, 0, 0)), k, 0.075, pants); limb(k, a, 0.06, pants); const bt = box(0.11, 0.13, 0.26, boot, sx * 0.15, 0.08, 0.95, g); bt.rotation.x = -0.25; bt.rotation.z = sx * 0.3; }
  // ID tag on the zipper + a faded shoulder patch
  const tagT = canvasTex(128, 64, (c, w, h) => { c.fillStyle = '#ddd8c8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#555'; c.lineWidth = 3; c.strokeRect(2, 2, w - 4, h - 4); c.fillStyle = '#222'; c.font = 'bold 18px monospace'; c.textAlign = 'center'; c.fillText(name, w / 2, 26); c.font = '13px monospace'; c.fillText('ELGO TOWER ' + year, w / 2, 48); });
  const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.045), new THREE.MeshStandardMaterial({ map: tagT, roughness: 0.6 })); const tp = hip.clone().lerp(sh, 0.62); tag.position.copy(tp).add(V(0.05, 0, 0.19)); tag.rotation.x = -0.42; g.add(tag);
  const stain = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), new THREE.MeshStandardMaterial({ map: radialSprite('rgba(18,14,10,0.55)', 'rgba(18,14,10,0)', 64), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 })); stain.rotation.x = -Math.PI / 2; stain.position.set(0, 0.02, 0.25); g.add(stain);
  return g;
}

export function buildGround(scene, T, opts = {}) {
  const GR = { group: new THREE.Group(), interact: [], obstacles: [], secrets: [], markers: [] }; const g = GR.group; scene.add(g);
  const wood = T.mats.wood, metal = T.mats.metal;
  // ---------- trail: stairs -> round the pad -> the lot -> down the fire road -> the fire line ----------
  const sb = T.stairs.bottom; const lot = V(LOT.x, 0, LOT.z);
  const raw = [[sb.x + 0.2, sb.z - 0.9], [-7.6, 4.5], [-2.6, 14.5], [3.2, 21.5], [lot.x, lot.z], [-1.8, 43.7], [-11.6, 61.6], [-1.0, 77.2], [12.5, 83.4]];
  const trail = []; for (let i = 0; i < raw.length - 1; i++) { const [ax, az] = raw[i], [bx, bz] = raw[i + 1]; const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3)); for (let k = 0; k < n; k++) { const t = k / n; const x = ax + (bx - ax) * t, z = az + (bz - az) * t; trail.push(V(x, gy(x, z), z)); } }
  trail.push(V(raw[raw.length - 1][0], gy(raw[raw.length - 1][0], raw[raw.length - 1][1]), raw[raw.length - 1][1]));
  const cum = [0]; for (let i = 1; i < trail.length; i++) cum.push(cum[i - 1] + trail[i].distanceTo(trail[i - 1]));
  GR.trail = { pts: trail, cum, L: cum[cum.length - 1] };
  GR.trailAt = (t) => { const s = Math.max(0, Math.min(1, t)) * GR.trail.L; let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const f = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]); const p = trail[i - 1].clone().lerp(trail[i], f); const d = trail[i].clone().sub(trail[i - 1]).setY(0).normalize(); return { p, d, n: V(-d.z, 0, d.x) }; };
  // fire site: brush 8 m off the fire road at the end of the trail
  { const e = GR.trailAt(1); GR.firePos = e.p.clone().addScaledVector(e.n, -8).addScaledVector(e.d, 2); GR.firePos.y = height(GR.firePos.x, GR.firePos.z); }
  // reflective trail-marker posts (orange retro-reflective strip on weathered 4x4s), every ~9 m, alternating sides
  { const postG = rbox(0.09, 1.1, 0.09, 0.01, 1), stripG = new THREE.BoxGeometry(0.095, 0.12, 0.095); const n = Math.floor(GR.trail.L / 9);
    const posts = new THREE.InstancedMesh(postG, wood, n), strips = new THREE.InstancedMesh(stripG, new THREE.MeshStandardMaterial({ color: 0xff7a20, emissive: 0xff5a10, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.2 }), n); const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { const a = GR.trailAt((i + 0.5) / n); const p = a.p.clone().addScaledVector(a.n, (i % 2 ? 1 : -1) * 1.6); p.y = height(p.x, p.z); o.position.set(p.x, p.y + 0.5, p.z); o.rotation.set(0, Math.random(), 0); o.updateMatrix(); posts.setMatrixAt(i, o.matrix); o.position.y = p.y + 0.92; o.updateMatrix(); strips.setMatrixAt(i, o.matrix); GR.markers.push(p); }
    posts.castShadow = true; g.add(posts, strips); }
  // ---------- generator shed: open-front lean-to round the generator, fuel can by the plinth ----------
  const gen = T.gen; const shed = new THREE.Group(); gen.add(shed); const plank = T.mats.wallMat; const roofM = new THREE.MeshStandardMaterial({ color: 0x4a4640, roughness: 0.6, metalness: 0.5 });
  box(2.6, 2.1, 0.06, plank, 0, 1.0, 0.9, shed); for (const sx of [-1, 1]) box(0.06, 2.0, 1.9, plank, sx * 1.3, 0.95, 0, shed);
  const rf = box(2.9, 0.05, 2.3, roofM, 0, 2.12, 0.05, shed); rf.rotation.x = -0.1; for (const sx of [-1, 1]) box(0.1, 2.0, 0.1, wood, sx * 1.28, 0.95, -0.9, shed);
  const ss = canvasTex(256, 96, (c, w, h) => { c.fillStyle = '#d8d0b8'; c.fillRect(0, 0, w, h); c.fillStyle = '#8a1a10'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('TOWER GENERATOR', w / 2, 40); c.font = '18px sans-serif'; c.fillText('UNLEADED ONLY \u2022 PULL TO START', w / 2, 74); });
  const sgn = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.3), new THREE.MeshStandardMaterial({ map: ss, roughness: 0.8 })); sgn.position.set(0, 1.55, 0.86); sgn.rotation.y = Math.PI; shed.add(sgn);
  // generator detail: recoil starter, fuel cap, control panel, frame cage
  const yel = new THREE.MeshStandardMaterial({ color: 0xc09020, roughness: 0.5, metalness: 0.3 }), blk = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
  const tankG = box(0.7, 0.22, 0.5, yel, -0.2, 1.0, 0, gen); const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), blk); cap.position.set(-0.3, 1.13, 0); gen.add(cap);
  const starter = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.08, 20), blk); starter.rotation.z = Math.PI / 2; starter.position.set(0.68, 0.55, 0); gen.add(starter);
  const handle = box(0.03, 0.1, 0.03, blk, 0.74, 0.55, 0.0, gen); GR.pullHandle = handle;
  const panel = box(0.02, 0.22, 0.4, new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.5 }), -0.66, 0.6, 0, gen);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshStandardMaterial({ color: 0x103010, emissive: 0x20ff40, emissiveIntensity: 0 })); lamp.position.set(-0.68, 0.66, 0.1); gen.add(lamp); GR.genLamp = lamp;
  // red jerry can
  const canM = new THREE.MeshPhysicalMaterial({ color: 0x9a1008, roughness: 0.45, metalness: 0.2, clearcoat: 0.4 }); const can = new THREE.Group();
  box(0.36, 0.44, 0.16, canM, 0, 0.22, 0, can); box(0.24, 0.035, 0.05, canM, 0.02, 0.48, 0, can); const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.1, 10), blk); sp.position.set(-0.14, 0.49, 0); sp.rotation.z = 0.6; can.add(sp);
  can.position.set(-0.95, 0.0, -0.55); can.rotation.y = 0.4; gen.add(can); GR.can = can;
  gen.updateMatrixWorld(true); GR.genWorld = gen.localToWorld(V(0, 0.9, 0)); GR.genFront = gen.localToWorld(V(0, 0, -1.6));
  GR.obstacles.push({ x: gen.position.x, z: gen.position.z, r: 1.15 });
  // ---------- trailhead fire cache: steel box with the forestry hose pack ----------
  { const a = GR.trailAt(0.24); const cp = a.p.clone().addScaledVector(a.n, 2.2); cp.y = height(cp.x, cp.z); const cache = new THREE.Group(); cache.position.copy(cp); cache.rotation.y = Math.atan2(a.d.x, a.d.z); g.add(cache);
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1810, roughness: 0.55, metalness: 0.4 }); box(1.1, 0.7, 0.6, red, 0, 0.35, 0, cache); const lid = box(1.14, 0.05, 0.64, red, 0, 0.72, -0.2, cache); lid.rotation.x = -1.1; lid.position.y = 0.95;
    const ct = canvasTex(256, 64, (c, w, h) => { c.fillStyle = '#eee'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('FIRE CACHE', w / 2, 42); }); const cl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.18), new THREE.MeshBasicMaterial({ map: ct, transparent: true })); cl.position.set(0, 0.42, 0.302); cache.add(cl);
    // hose pack: coiled yellow hose + nozzle on top
    const pack = new THREE.Group(); pack.position.set(0, 0.72, 0.02); cache.add(pack); const hoseM = new THREE.MeshStandardMaterial({ color: 0xc9a43a, roughness: 0.85 });
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.26 - i * 0.012, 0.03, 8, 24), hoseM); t.rotation.x = Math.PI / 2; t.position.y = 0.03 + i * 0.05; pack.add(t); }
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.3 })); nz.rotation.z = Math.PI / 2; nz.position.y = 0.25; pack.add(nz);
    GR.hosePack = pack; GR.cachePos = cp.clone(); GR.obstacles.push({ x: cp.x, z: cp.z, r: 0.7 });
    const glow = new THREE.PointLight(0xffd8a0, 2.5, 6, 2); glow.position.copy(cp).add(V(0, 1.6, 0)); g.add(glow); // the cache's little work-light so you can find it
  }
  // ---------- brush on the east slope (where it bursts out during the practice shot) ----------
  { const bc = V(29, 0, 9.5); bc.y = height(bc.x, bc.z); GR.bushPos = bc; GR.boltTo = V(64, 0, -24); GR.boltTo.y = height(64, -24); const mats = pineMaterials(); GR.bushes = [];
    for (let i = 0; i < 7; i++) { const geo = pineGeometry({ whorls: 5, per: 6, segs: 2, across: 3, radius: 0.12, seed: 40 + i, cardW: 0.9 }); geo.computeBoundingBox(); const hgt = geo.boundingBox.max.y - geo.boundingBox.min.y;
      const m = new THREE.Mesh(geo, mats); const s = (1.3 + Math.random() * 0.9) / hgt; m.scale.set(s * 1.6, s, s * 1.6); const a = i / 7 * 6.28, r = 0.8 + Math.random() * 1.6; m.position.set(bc.x + Math.cos(a) * r, height(bc.x + Math.cos(a) * r, bc.z + Math.sin(a) * r) - 0.1, bc.z + Math.sin(a) * r); m.rotation.y = Math.random() * 6; m.castShadow = true; g.add(m); GR.bushes.push({ m, r0: m.rotation.clone(), k: 0 }); }
    GR.shakeBushes = (k) => { for (const b of GR.bushes) b.k = Math.max(b.k, k); };
    GR.moon = new THREE.PointLight(0xa8bcdf, 0, 46, 1.5); GR.moon.position.copy(bc).add(V(-6, 10, 4)); g.add(GR.moon); }
  // ---------- secrets & bodies ----------
  const anchors = { tank: T.tankPos, gen: GR.genWorld, out: T.outPos || V(-14, 0, 5), fire: GR.firePos, bush: GR.bushPos, stairs: T.stairs.bottom };
  const paperT = canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#d8d0b4'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(40,40,80,0.55)'; c.lineWidth = 1.4; for (let y = 22; y < h - 10; y += 11) { c.beginPath(); c.moveTo(10, y); for (let x = 10; x < w - 10; x += 6) c.lineTo(x, y + Math.sin(x * 0.7 + y) * 1.2); c.stroke(); } c.fillStyle = 'rgba(70,40,20,0.25)'; c.beginPath(); c.arc(90, 120, 22, 0, 7); c.fill(); });
  const blood = bloodTex(); const gouge = gougeTex();
  for (const def of SECRETS) {
    let p, face = 0; const sg = new THREE.Group();
    if (def.anchor === 'trail') { const a = GR.trailAt(def.t); p = a.p.clone().addScaledVector(a.n, def.side); face = Math.atan2(-a.n.x * Math.sign(def.side), -a.n.z * Math.sign(def.side)); }
    else if (def.anchor === 'tankLeg') { const tp = T.tankPos; p = V(tp.x + 1.14, 0, tp.z - 1.045); face = Math.PI / 2; }
    else if (def.anchor === 'genBack') { p = T.gen.localToWorld(V(0.3, 0, 1.45)); face = T.gen.rotation.y; }
    else if (def.anchor === 'shedWall') { p = T.gen.localToWorld(V(1.34, 0, 0.1)); face = T.gen.rotation.y + Math.PI / 2; }
    else { const A = anchors[def.anchor] || V(0, 0, 0); p = V(A.x + (def.off ? def.off[0] : 0), 0, A.z + (def.off ? def.off[1] : 0)); face = Math.atan2(-p.x, -p.z); }
    p.y = height(p.x, p.z); sg.position.copy(p); sg.rotation.y = face; g.add(sg);
    let ip = p.clone().add(V(0, 0.5, 0));
    if (def.type === 'scratch') { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: carveTex(def.carve), roughness: 0.95, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 })); pl.position.y = def.anchor === 'tankLeg' ? (T.tankPos.y - p.y) + 1.1 : 0.55; if (def.anchor === 'tankLeg') pl.scale.set(0.45, 1, 1); sg.add(pl); ip = p.clone().add(V(0, pl.position.y, 0)); }
    else if (def.type === 'note') { const pl = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({ map: paperT, roughness: 0.9, side: THREE.DoubleSide })); pl.rotation.set(-Math.PI / 2, 0, Math.random()); pl.position.y = 0.03; sg.add(pl); const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 1), new THREE.MeshStandardMaterial({ color: 0x6a665e, roughness: 1 })); rock.position.set(0.03, 0.05, 0.02); rock.scale.set(1, 0.6, 1); sg.add(rock); ip = p.clone().add(V(0, 0.1, 0)); }
    else if (def.type === 'logbook') { const bk = box(0.17, 0.035, 0.23, new THREE.MeshStandardMaterial({ color: 0x2e4030, roughness: 0.8 }), 0, 0.03, 0, sg); bk.rotation.y = 0.5; const pg = box(0.16, 0.03, 0.22, new THREE.MeshStandardMaterial({ color: 0xd8d0b4, roughness: 0.9 }), 0.002, 0.03, 0, sg); pg.rotation.y = 0.5; pg.scale.set(0.97, 0.9, 0.97); ip = p.clone().add(V(0, 0.1, 0)); }
    else if (def.type === 'radio') { const rb = box(0.07, 0.19, 0.045, new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.6 }), 0, 0.03, 0, sg); rb.rotation.set(Math.PI / 2, 0, 0.7); const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0x111111 })); ant.rotation.set(Math.PI / 2, 0, 0.7); ant.position.set(-0.08, 0.03, -0.09); sg.add(ant);
      const bl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: blood, transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 })); bl.rotation.x = -Math.PI / 2; bl.position.y = 0.012; sg.add(bl); ip = p.clone().add(V(0, 0.1, 0)); }
    else if (def.type === 'claw') { const tall = def.anchor === 'stairs' ? 1.8 : 5.5; const bk = barkMaps(); const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, tall, 12), new THREE.MeshStandardMaterial({ map: texOf(bk.map, { srgb: true, rep: [1, 3] }), color: 0x8a8478, roughness: 1 })); tr.position.y = tall / 2 - 0.2; tr.castShadow = true; sg.add(tr);
      const gp = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 1.3), new THREE.MeshStandardMaterial({ map: gouge, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 })); gp.position.set(0, Math.min(tall - 0.7, 1.7), 0.2); sg.add(gp); GR.obstacles.push({ x: p.x, z: p.z, r: 0.4 }); ip = p.clone().add(V(0, 1.4, 0)); }
    else if (def.type === 'body') { const b = makeBody(def.name, def.year); sg.add(b); if (def.anchor !== 'genBack') { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.7, 12), new THREE.MeshStandardMaterial({ map: texOf(barkMaps().map, { srgb: true }), color: 0x7a7268, roughness: 1 })); st.position.set(0, 0.3, -0.5); st.castShadow = true; sg.add(st); GR.obstacles.push({ x: p.x, z: p.z, r: 0.5 }); } if (def.anchor === 'genBack') { const c2 = GR.can.clone(); c2.position.set(0.42, 0, 0.3); c2.rotation.set(0, 1.2, 1.45); sg.add(c2); } ip = p.clone().add(V(0, 0.6, 0)); }
    sg.visible = false; const rec = { def, g: sg, pos: ip }; GR.secrets.push(rec);
    GR.interact.push({ id: 'secret', secret: def.id, pos: ip, r: def.type === 'body' ? 2.6 : 2.1, label: () => 'Inspect: ' + def.title, avail: () => sg.visible, press: () => opts.onSecret && opts.onSecret(def) });
  }
  GR.setNight = (n) => { for (const s of GR.secrets) s.g.visible = n >= s.def.night; };
  // ---------- obstacles on the ground ----------
  for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) GR.obstacles.push({ x: sx * 4.6, z: sz * 4.6, r: 0.7 });
  if (T.tankPos) for (const [sx, sz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) GR.obstacles.push({ x: T.tankPos.x + sx * 1.2, z: T.tankPos.z + sz * 1.2, r: 0.45 });
  if (T.outPos) GR.obstacles.push({ x: T.outPos.x, z: T.outPos.z, r: 0.95 });
  for (const sz of [-1.45, 1.45]) GR.obstacles.push({ x: 18, z: 0.5 + sz, r: 0.3 });
  GR.stairRect = { x0: sb.x - 0.55, x1: sb.x + 0.55, z0: -1.9, z1: 2.3 }; // the low flights you cannot walk under
  GR.update = (dt) => { for (const b of GR.bushes) { if (b.k <= 0.001) continue; b.k = Math.max(0, b.k - dt * 0.9); const t = performance.now() / 1000; b.m.rotation.x = b.r0.x + Math.sin(t * 23 + b.r0.y) * 0.16 * b.k; b.m.rotation.z = b.r0.z + Math.sin(t * 19 + b.r0.y * 2) * 0.16 * b.k; } };
  return GR;
}
