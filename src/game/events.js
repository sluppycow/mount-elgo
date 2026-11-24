// Night events (mychief-events.json), watchers, far lights, sound-only scares, and the wildfire spot-and-report loop.
import * as THREE from 'three';
import { polar, height, bearingOf, TOWER, LAKE, HALE, ROAD } from '../geo.js';
import { radialSprite } from '../textures.js';
import { smokeAtlas } from '../procedural.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const rr = (a) => Array.isArray(a) ? a[0] + Math.random() * (a[1] - a[0]) : a;
function parseBearing(s) { const m = /(\d+)\s*-\s*(\d+)/.exec(s || ''); return m ? [+m[1], +m[2]] : null; }
const glowTex = radialSprite('rgba(255,240,210,1)', 'rgba(255,200,120,0)', 128);
const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  for (let i = 0; i < 26; i++) { const r = 18 + Math.random() * 34, px = 64 + (Math.random() - 0.5) * 50, py = 64 + (Math.random() - 0.5) * 50; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();

// ---------- watcher figure ----------
const figMats = {};
function figMat(pale) { const k = pale ? 'p' : 'd'; if (figMats[k]) return figMats[k];
  const m = new THREE.MeshStandardMaterial({ color: pale ? 0xb3aea2 : 0x0d0d0f, roughness: 0.92, emissive: pale ? 0x34322e : 0x000000 });
  // faint cold rim so the silhouette separates from the dark treeline without looking lit
  m.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `float rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 3.0);
    outgoingLight += vec3(0.05, 0.065, 0.09) * rimF;
    #include <opaque_fragment>`); };
  m.customProgramCacheKey = () => 'fig-rim' + k;
  return (figMats[k] = m); }
export function makeFigure(opts = {}) {
  // too-tall, too-thin humanoid: lathed torso with sloped shoulders, small head pushed forward, arms that hang past the knees
  const g = new THREE.Group(); const m = figMat(opts.pale); const H = opts.h || 2.25; const s = H / 2.25;
  const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0] * s, p[1] * s)), seg);
  const torso = new THREE.Mesh(lathe([[0.0, 0.95], [0.11, 0.97], [0.14, 1.1], [0.13, 1.3], [0.16, 1.55], [0.19, 1.68], [0.12, 1.76], [0.05, 1.8], [0.045, 1.86], [0.0, 1.87]], 16), m);
  torso.scale.set(1, 1, 0.62); g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1 * s, 18, 14), m); head.scale.set(0.85, 1.3, 0.95); head.position.set(0, 1.98 * s, 0.05 * s); g.add(head); g.userData.head = head;
  const limb = (a, b, r0, r1) => { const v = new THREE.Vector3().subVectors(b, a); const L = v.length(); const c = new THREE.Mesh(new THREE.CapsuleGeometry((r0 + r1) / 2, L, 4, 10), m); c.position.copy(a).addScaledVector(v, 0.5); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); g.add(c); return c; };
  const P = (x, y, z) => new THREE.Vector3(x * s, y * s, z * s);
  for (const sx of [-1, 1]) {
    limb(P(sx * 0.2, 1.68, 0), P(sx * 0.25, 1.2, 0.03), 0.045, 0.04); limb(P(sx * 0.25, 1.2, 0.03), P(sx * 0.27, 0.72, 0.06), 0.038, 0.032);
    for (let f = 0; f < 3; f++) limb(P(sx * 0.27, 0.71, 0.06), P(sx * (0.26 + f * 0.012), 0.55, 0.05 + f * 0.015), 0.009, 0.007); // long fingers
    limb(P(sx * 0.08, 0.96, 0), P(sx * 0.09, 0.5, 0.02), 0.065, 0.055); limb(P(sx * 0.09, 0.5, 0.02), P(sx * 0.1, 0.06, 0), 0.05, 0.04);
  }
  // eyes: faint pinpricks that catch light (always face the tower)
  const em = new THREE.SpriteMaterial({ map: glowTex, color: 0xdde6ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: opts.eyes ?? 0.8, fog: false });
  for (const sx of [-1, 1]) { const e = new THREE.Sprite(em); e.scale.set(0.045 * s, 0.045 * s, 1); e.position.set(sx * 0.035 * s, 2.0 * s, 0.14 * s); g.add(e); }
  // ground mist pooling round the feet
  const mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex(), color: 0x8a96a8, transparent: true, opacity: 0.18, depthWrite: false })); mist.scale.set(2.6 * s, 0.9 * s, 1); mist.position.y = 0.25 * s; g.add(mist);
  g.traverse(o => { o.castShadow = false; });
  return g;
}
let _mist = null; function mistTex() { if (_mist) return _mist; const S = smokeAtlas(); _mist = S.clone(); _mist.repeat.set(0.5, 0.5); _mist.offset.set(0.5, 0); _mist.needsUpdate = true; return _mist; }
function makeElk() {
  const g = new THREE.Group(); const m = figMat(false);
  const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.3, 3, 8), m); b.rotation.z = Math.PI / 2; b.position.y = 1.45; g.add(b);
  for (const [x, z] of [[-0.6, -0.22], [-0.6, 0.22], [0.6, -0.22], [0.6, 0.22]]) { const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.0, 2, 6), m); l.position.set(x, 0.6, z); g.add(l); }
  const neck = new THREE.Group(); neck.position.set(0.9, 1.7, 0); g.add(neck); const n = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 2, 6), m); n.rotation.z = -0.9; n.position.set(0.3, 0.25, 0); neck.add(n);
  const hd = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.4, 2, 6), m); hd.rotation.z = -1.6; hd.position.set(0.68, 0.45, 0); neck.add(hd); g.userData.neck = neck;
  for (const sz of [-1, 1]) { const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.9, 2, 5), m); a.position.set(0.62, 1.0, sz * 0.3); a.rotation.set(sz * 0.6, 0, 0.5); neck.add(a); }
  return g;
}
function glow(color, size, opacity = 1, depthTest = true) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, depthTest, transparent: true, opacity, fog: false })); s.renderOrder = depthTest ? 0 : 5; s.scale.set(size, size, 1); s.userData.base = size; return s; }

// ---------- wildfire: glow under a moonlit smoke column ----------
export class Wildfire {
  constructor(scene, pos, opts = {}) {
    this.g = new THREE.Group(); this.g.position.copy(pos); scene.add(this.g); this.t = 0; this.pos = pos.clone(); this.top = pos.clone().add(V(0, 160, 0));
    const k = opts.scale || 1;
    // fire line: a hot core and a ragged string of flickering glows along the ridge
    this.glows = []; for (let i = 0; i < 9; i++) { const core = i === 0; const s = glow(core ? 0xffb050 : (i % 2 ? 0xff5a14 : 0xff7a26), (core ? 70 : 26 + Math.random() * 22) * k, core ? 1 : 0.8);
      s.position.set(core ? 0 : (Math.random() - 0.5) * 70, 4 + Math.random() * 7, core ? 0 : (Math.random() - 0.5) * 40); this.g.add(s); this.glows.push(s); }
    // underlit glow on the smoke base + a wide dim halo on the terrain
    const halo = glow(0xff6a20, 180 * k, 0.25); halo.position.y = 18; this.g.add(halo); this.halo = halo;
    // billowing smoke column: soft noise puffs from a 2x2 atlas, orange-lit low down, cold moonlit grey above, drifting downwind
    const S = smokeAtlas(); const atl = [0, 1, 2, 3].map(q => { const t = S.clone(); t.repeat.set(0.5, 0.5); t.offset.set((q % 2) * 0.5, (q >> 1) * 0.5); t.needsUpdate = true; return t; });
    this.puffs = []; for (let i = 0; i < 34; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: atl[i % 4], color: 0xa9adb6, transparent: true, opacity: 0.6, depthWrite: false, fog: true })); s.userData.u = i / 34; s.userData.r0 = Math.random() * 6.28; s.userData.j = Math.random(); this.g.add(s); this.puffs.push(s); }
    // embers lofted above the flames
    const eg = new THREE.BufferGeometry(); this.nE = 60; this.ep = new Float32Array(this.nE * 3); this.eu = new Float32Array(this.nE).map(() => Math.random()); eg.setAttribute('position', new THREE.BufferAttribute(this.ep, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa040, size: 2.2 * k, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true })); this.embers.frustumCulled = false; this.g.add(this.embers);
    this.reported = false; this.spotted = 0; this.id = opts.id || 'fire';
  }
  update(dt) {
    this.t += dt; const t = this.t;
    this.glows.forEach((s, i) => { const f = 0.7 + 0.3 * Math.sin(t * (6 + i) + i * 2.1) * Math.sin(t * (2.3 + i * 0.7)); s.material.opacity = (i ? 0.55 : 0.85) * f; const k = s.userData.base * (0.85 + 0.25 * f); s.scale.set(k, k, 1); });
    this.halo.material.opacity = 0.2 + 0.05 * Math.sin(t * 1.7);
    const lo = new THREE.Color(0xc0703a), hi = new THREE.Color(0x8a909c), c = new THREE.Color();
    for (const s of this.puffs) { const d = s.userData; const u = (d.u + t * 0.011) % 1; const h = 8 + u * 430; const w = 40 + u * 240 + d.j * 30;
      s.position.set(Math.sin(u * 7 + d.r0 + t * 0.05) * (18 + u * 30) + u * 150, h, Math.cos(u * 5 + d.r0) * (14 + u * 20) + u * 60); s.scale.set(w, w * 0.85, 1);
      c.copy(lo).lerp(hi, Math.min(1, u * 3.5)); s.material.color.copy(c); s.material.opacity = 0.5 * Math.min(1, u * 8) * (1 - u) ** 1.2; s.material.rotation = d.r0 + u * 2.5; }
    for (let i = 0; i < this.nE; i++) { const u = (this.eu[i] + t * 0.08) % 1; this.ep[i * 3] = Math.sin(i * 7.1 + u * 4) * 30 + u * 20; this.ep[i * 3 + 1] = 6 + u * 90; this.ep[i * 3 + 2] = Math.cos(i * 3.3) * 20; }
    this.embers.geometry.attributes.position.needsUpdate = true; this.embers.material.opacity = 0.7 + 0.3 * Math.sin(t * 9);
  }
  dispose() { this.g.parent && this.g.parent.remove(this.g); }
}

// ---------- event director ----------
export class EventDirector {
  constructor(game, data, mapJson) {
    this.game = game; this.data = data; this.mj = mapJson; this.active = []; this.done = new Set(); this.nextAt = 50; this.night = 1; this.t = 0;
    this.byId = Object.fromEntries((data.events || []).map(e => [e.id, e])); this.mapEv = Object.fromEntries(((mapJson && mapJson.events) || []).map(e => [e.id, e]));
  }
  startNight(n) { this.night = n; this.clear(); this.done.clear(); this.t = 0; this.nextAt = 35 + Math.random() * 25; this.watcherDone = false; this.belowDone = false; this.belowAt = 0; }
  clear() { for (const a of this.active) a.end(true); this.active = []; }
  tiers() { const e = (this.data.escalation && this.data.escalation.across_nights || []).find(x => x.night === this.night); return e ? e.tiers : [1, 2]; }
  // where an event happens: MyChief map positions first, else parse bearing + distance
  place(id) {
    const me = this.mapEv[id], ev = this.byId[id] || {};
    if (me && me.pos) return V(me.pos.x, me.pos.y, me.pos.z);
    if (me && me.path && me.path.length) return V(me.path[0].x, me.path[0].y, me.path[0].z);
    const br = parseBearing(ev.bearing) || [0, 360]; const d = rr(ev.distance_m || [300, 800]); const p = polar(rr(br), d); return V(p.x, height(p.x, p.z), p.z);
  }
  pick(clock) {
    const tiers = this.tiers(); const W = { 1: 5, 2: 3, 3: 2, 4: 1 };
    const pool = (this.data.events || []).filter(e => tiers.includes(e.tier) && !this.done.has(e.id) && e.id !== 'ev18' && e.id !== 'ev14' || (e.id === 'ev14' && this.night >= 4 && !this.done.has('ev14')));
    if (!pool.length) return null; let sum = pool.reduce((a, e) => a + (W[e.tier] || 1), 0), r = Math.random() * sum;
    for (const e of pool) { r -= W[e.tier] || 1; if (r <= 0) return e; } return pool[0];
  }
  update(dt, ctx) {
    this.t += dt;
    if (!this.watcherDone && this.night >= 2 && this.t > 20) { this.watcherDone = true; this.spawn(this.byId.ev10 || { id: 'ev10', tier: 1 }, true); }
    if (!this.belowDone && this.t > (this.belowAt ||= 150 + Math.random() * 120)) { this.belowDone = true; this.spawn({ id: 'wb', tier: 1, name: 'Watcher below' }); }
    if (this.t > this.nextAt && this.active.filter(a => !a.persistent).length < (ctx.deep ? 2 : 1)) {
      const e = this.pick(); if (e) this.spawn(e); this.nextAt = this.t + (ctx.deep ? 55 : 75) + Math.random() * 40;
    }
    for (const a of this.active) a.update(dt, ctx);
    this.active = this.active.filter(a => !a.dead);
  }
  spawn(ev, persistent = false) { this.done.add(ev.id); const a = new Ev(this, ev, persistent); this.active.push(a); this.game.log && this.game.log('event ' + ev.id + ' ' + (ev.name || '')); return a; }
  shotAt(obj) { for (const a of this.active) if (a.hits(obj)) { a.onShot(); return true; } return false; }
  targets() { const out = []; for (const a of this.active) for (const m of a.meshes) out.push(m); return out; }
}

class Ev {
  constructor(dir, ev, persistent) {
    this.d = dir; this.ev = ev; this.id = ev.id; this.g = dir.game; this.t = 0; this.dur = rr(ev.duration_s || [40, 70]); this.persistent = persistent; if (persistent) this.dur = 99999;
    this.root = new THREE.Group(); this.g.scene.add(this.root); this.meshes = []; this.lookT = 0; this.binoT = 0; this.seen = false; this.wasVisible = false; this.dead = false;
    this.pos = dir.place(ev.id); this.setup();
    const c = (ev.sound_cues || []).find(c => /stinger_soft|stinger_spot/.test(c)); this.stinger = c;
  }
  sfx(id, pos, vol = 1, opts = {}) { this.g.sound(id, pos, vol, opts); }
  addFig(p, opts = {}) { const f = makeFigure(opts); f.position.copy(p); this.root.add(f); f.traverse(o => o.isMesh && this.meshes.push(o)); this.face(f); return f; }
  face(f) { const c = this.g.cabCenter; f.rotation.y = Math.atan2(c.x - f.position.x, c.z - f.position.z); if (f.userData.head) { const dy = c.y - f.position.y - 2, dh = Math.hypot(c.x - f.position.x, c.z - f.position.z); f.userData.head.rotation.x = -Math.atan2(dy, dh) * 0.8; } }
  ground(x, z, dy = 0) { return V(x, height(x, z) + dy, z); }
  setup() {
    const id = this.id, P = this.pos, me = this.d.mapEv[id] || {};
    this.kind = 'sound';
    if (id === 'ev01') { this.kind = 'light'; this.light = glow(0xffd27a, 9, 1, false); this.light.position.copy(P).add(V(0, 1.6, 0)); this.root.add(this.light); this.relights = 0; }
    if (id === 'ev02') { this.kind = 'headlights'; this.path = (me.path || []).map(p => V(p.x, p.y + 1, p.z)); if (!this.path.length) this.path = [P.clone(), P.clone().add(V(-200, 0, 100))]; this.lights = [glow(0xfff2d0, 9, 0.9, false), glow(0xfff2d0, 9, 0.9, false)]; this.lights.forEach(l => this.root.add(l)); }
    if (id === 'ev03') { this.calls = 0; this.next = 1; }
    if (id === 'ev04') { const ring = (this.d.mj && this.d.mj.treeline_points && this.d.mj.treeline_points.tower_clearing_edge) || []; if (ring.length) { const q = ring.reduce((a, b) => Math.abs(b.bearing_deg - 4) < Math.abs(a.bearing_deg - 4) ? b : a); this.pos = P.set(q.x * 0.82, 0, q.z * 0.82); P.y = height(P.x, P.z); } }
    if (id === 'ev04' || id === 'ev10' || id === 'ev13') { this.kind = 'figure'; this.figs = [this.addFig(id === 'ev13' ? P.clone().add(V(-0.35, 0, 0)) : P, { pale: id === 'ev04', h: id === 'ev04' ? 2.6 : 2.2 })]; if (id === 'ev13') this.figs.push(this.addFig(P.clone().add(V(0.35, 0, 0)))); if (id === 'ev13' && me.path && me.path[0]) { const q = me.path[Math.floor(me.path.length / 2)]; this.figs.forEach((f, i) => { f.position.set(q.x + (i - 0.5) * 0.7, q.y, q.z); this.face(f); }); } }
    if (id === 'ev05') { this.kind = 'light'; const p = (this.g.halePos || P).clone().add(V(0, 1.4, 0)); this.light = glow(0xffb060, 6, 0.9, false); this.light.position.copy(p); this.root.add(this.light); this.fig = this.addFig(p.clone().add(V(0, -1.6, 0.3)), { h: 1.9, eyes: 0 }); }
    if (id === 'ev07') { this.kind = 'figure'; const a = me.swim_from ? V(me.swim_from.x, me.swim_from.y, me.swim_from.z) : P.clone().add(V(-200, 0, 0)); const b = me.swim_to ? V(me.swim_to.x, me.swim_to.y, me.swim_to.z) : P; this.a = a; this.b = b; this.figs = [this.addFig(a.clone().add(V(0, -1.55, 0)), { pale: true })]; }
    if (id === 'ev08') { this.kind = 'figure'; this.elk = makeElk(); this.elk.position.copy(P); this.root.add(this.elk); this.elk.traverse(o => o.isMesh && this.meshes.push(o)); this.face(this.elk); this.elk.rotation.y += Math.PI / 2; this.figs = [this.elk]; }
    if (id === 'ev09') { this.stage = 0; }
    if (id === 'ev11') { this.stage = 0; }
    if (id === 'ev12') { this.kind = 'prints'; this.prints = []; const m = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.2, metalness: 0, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const yLand = TOWER.floor * (3 / 7); for (let i = 0; i < 9; i++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.28), m); p.rotation.x = -Math.PI / 2; p.rotation.z = (i < 6 ? 0 : Math.PI) + (i % 2 ? 0.1 : -0.1); p.position.set(-3.3 + (i % 2) * 0.22, yLand + 0.13, 2.6 - Math.min(i, 5) * 0.55 + Math.max(0, i - 5) * 0.55); this.root.add(p); this.prints.push(p); } }
    if (id === 'ev14') { this.kind = 'door'; this.g.tower.door.open = true; this.sfx('door-open', this.g.doorPos, 0.9); this.g.cold(1); }
    if (id === 'ev15') { this.kind = 'light'; this.light = glow(0xff8030, 16, 1); this.light.position.copy(P).add(V(0, 2, 0)); this.root.add(this.light); this.figs = []; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; this.figs.push(this.addFig(P.clone().add(V(Math.cos(a) * 6, 0, Math.sin(a) * 6)), { eyes: 0.5 })); } }
    if (id === 'ev16' || id === 'ev18') { this.kind = 'figure'; this.figs = []; const ring = (this.d.mj && this.d.mj.treeline_points && this.d.mj.treeline_points.tower_clearing_edge) || [];
      const n = id === 'ev18' ? 24 : 6; for (let i = 0; i < n; i++) { let p; if (ring.length) { const q = ring[(i * 7) % ring.length]; const k = id === 'ev16' ? 0.75 + Math.random() * 0.2 : 0.9 + Math.random() * 0.6; p = this.ground(q.x * k, q.z * k); } else { const pp = polar(Math.random() * 360, 90 + Math.random() * 60); p = this.ground(pp.x, pp.z); } this.figs.push(this.addFig(p, { pale: i % 3 === 0 })); } }
    if (id === 'ev17') { this.kind = 'voice'; this.next = 0.5; this.reps = 0; this.figs = [this.addFig(this.ground(P.x || 3, P.z || 10))]; }
    if (id === 'ev19') { this.ang = Math.random() * 6.28; this.next = 0.3; }
    if (id === 'ev06') { this.next = 0.5; this.knocks = 0; }
    if (id === 'wb') { this.kind = 'figure'; this.dur = 150; const b = Math.random() * 360, d = 16 + Math.random() * 14; const q = polar(b, d); this.figs = [this.addFig(this.ground(q.x, q.z), { pale: Math.random() < 0.5, h: 2.3 })]; }
    // the first stinger when something appears
    if (this.kind === 'figure' || this.kind === 'light' || this.kind === 'headlights') this.sfx('stinger-1', null, 0.35);
  }
  hits(obj) { return this.meshes.includes(obj); }
  onShot() { this.sfx('stinger-4', null, 0.7); this.g.scare(); if (this.id === 'ev01') { this.light.position.lerp(this.g.cabCenter, 0.12); return; } this.end(); }
  end(silent) { if (this.dead) return; this.dead = true; this.root.parent && this.root.parent.remove(this.root); if (this.id === 'ev14') { this.g.tower.door.open = false; this.sfx('door-close', this.g.doorPos, 0.9); this.g.cold(0); } }
  visibleInView(p, tol) { return this.g.inView(p, tol); }
  update(dt, ctx) {
    this.t += dt; const t = this.t, id = this.id, g = this.g;
    if (t > this.dur) { this.end(); return; }
    // focus checks: looked at directly (in the middle of the view) and through binoculars
    const focus = this.figs ? this.figs[0].position.clone().add(V(0, 1.6, 0)) : this.light ? this.light.position : this.pos;
    const vis = this.kind !== 'sound' && this.kind !== 'voice' && g.inView(focus, ctx.bino ? 2.5 : 6);
    if (vis) { if (ctx.bino) this.binoT += dt; else this.lookT += dt; if (!this.seen) { this.seen = true; if (this.stinger) this.sfx('stinger-2', null, 0.5); g.scare(0.4); } }
    if (id === 'ev01') { this.fade ??= 1; if (this.binoT > 3 || this.lookT > 1.5) { this.fade *= Math.pow(0.1, dt); if (this.fade < 0.05) { this.end(); return; } }
      else if (Math.floor(t / 16) > this.relights) { this.relights++; const b = bearingOf(this.light.position.x, this.light.position.z) - 1.5; const d = Math.hypot(this.light.position.x, this.light.position.z) - (this.relights > 1 ? 100 : 0); const p = polar(b, d); this.light.position.set(p.x, height(p.x, p.z) + 1.3, p.z); }
      this.light.material.opacity = this.fade * ((t % 16) < 1 && t > 2 ? 0 : 1); }
    if (id === 'ev02') { const u = Math.min(1, t / (this.dur * 0.8)); const n = this.path.length - 1; const x = u * n, i = Math.min(n - 1, Math.floor(x)), f = x - i; const p = this.path[i].clone().lerp(this.path[Math.min(n, i + 1)], f); const d = this.path[Math.min(n, i + 1)].clone().sub(this.path[i]).normalize(); const side = V(-d.z, 0, d.x).multiplyScalar(0.8); this.lights[0].position.copy(p).add(side); this.lights[1].position.copy(p).sub(side); if (u >= 1) this.lights.forEach(l => l.material.opacity *= 0.85); if (this.binoT > 2) this.lights.forEach(l => l.material.opacity *= 0.9); }
    if (id === 'ev03') { if (t > this.next) { this.calls++; this.next = t + 4.2; this.sfx(this.calls >= 6 ? 'far-whistle-3' : 'animal-owl-1', V(-11, 2, 0), 0.8, { rate: this.calls >= 6 ? 0.8 : 1 }); if (this.calls >= 6) this.dur = t + 3; } }
    if (id === 'ev04') { const f = this.figs[0]; if (!vis && this.wasVisible) { const c = g.cabCenter; const dx = c.x - f.position.x, dz = c.z - f.position.z, L = Math.hypot(dx, dz); if (L > 60) { const s = Math.min(18, L - 60); f.position.set(f.position.x + dx / L * s, 0, f.position.z + dz / L * s); f.position.y = height(f.position.x, f.position.z); this.face(f); } } if (this.binoT > 2.5) this.end(); }
    if (id === 'ev05') { this.light.material.opacity = (Math.sin(t * 0.7) > -0.6 ? 0.9 : 0.1); if (this.fig) this.fig.visible = (t % 9) < 5; if (this.lookT > 3) this.end(); }
    if (id === 'ev06') { if (t > this.next) { this.knocks++; this.sfx('far-knocking-' + (1 + (this.knocks % 3)), V(0, TOWER.floor * Math.min(0.85, this.knocks * 0.18), 2), 1.0); this.next = t + 9 + this.knocks * 3; if (this.knocks > 5) this.dur = t + 4; } }
    if (id === 'ev07') { const f = this.figs[0]; const u = Math.min(1, t / (this.dur * 0.7)); f.position.copy(this.a).lerp(this.b, u); f.position.y = this.b.y - 1.55 - Math.max(0, (t - this.dur * 0.8)) * 0.6; this.face(f); if (this.lookT > 2 || this.binoT > 2) { this.dur = Math.min(this.dur, t + 2); f.position.y -= dt * 0.8; } }
    if (id === 'ev08') { const nk = this.elk.userData.neck; nk.rotation.x = vis && !ctx.bino ? nk.rotation.x * 0.9 : Math.min(2.6, nk.rotation.x + dt * 0.05); if (t < 0.1) this.sfx('animal-elk-bugle', this.pos, 0.6, { ref: 300 }); }
    if (id === 'ev09') { if (this.stage === 0) { this.stage = 1; this.sfx('animal-coyote-howl', this.pos, 1, { ref: 600 }); this.sfx('animal-coyote-yips', this.pos, 0.8, { ref: 600, delay: 2.5 }); } if (this.stage === 1 && t > 9) { this.stage = 2; this.sfx('far-scream-2', this.pos, 1, { ref: 800 }); g.scare(0.6); } }
    if (id === 'ev10') { const f = this.figs[0]; if (g.clockHour !== this.lastH) { if (this.lastH !== undefined) { const b = bearingOf(f.position.x, f.position.z) - 1.5, d = Math.hypot(f.position.x, f.position.z); const p = polar(b, d); f.position.set(p.x, height(p.x, p.z), p.z); this.face(f); } this.lastH = g.clockHour; } }
    if (id === 'ev11') { if (this.stage === 0 && g.radioClickT > 0 && g.time - g.radioClickT < 3) { this.stage = 1; this.sfx('far-whistle-1', this.pos, 1, { ref: 200, delay: 1.0 }); this.t2 = t; } if (this.stage === 0 && t > 8) { this.stage = 1; this.sfx('far-whistle-1', this.pos, 1, { ref: 200 }); this.t2 = t; } if (this.stage === 1 && t - this.t2 > 12) { this.stage = 2; const p = this.pos.clone().multiplyScalar(-0.4); this.sfx('far-whistle-2', p, 1, { ref: 60 }); } }
    if (id === 'ev13') { for (const f of this.figs) { f.rotation.x = -Math.min(0.35, t * 0.008); } if (this.lookT > 2) this.figs.forEach(f => f.rotation.y += Math.PI); if (this.lookT > 2) this.dur = Math.min(this.dur, t + 3); }
    if (id === 'ev15') { if (this.lookT > 2 || this.binoT > 4) { this.light.material.opacity *= 0.9; this.dur = Math.min(this.dur, t + 3); if (!this.turned) { this.turned = true; this.figs.forEach(f => this.face(f)); g.scare(0.5); } } else { this.light.material.opacity = 0.8 + 0.2 * Math.sin(t * 9) * Math.sin(t * 3.1); this.figs.forEach((f, i) => { f.rotation.y = Math.atan2(f.position.x - this.pos.x, f.position.z - this.pos.z); }); } }
    if (id === 'ev16') { this.figs.forEach((f) => { if (!g.inView(f.position, 30) && Math.random() < dt * 0.3) { const c = g.cabCenter; const dx = c.x - f.position.x, dz = c.z - f.position.z, L = Math.hypot(dx, dz); if (L > 60) { f.position.x += dx / L * 6; f.position.z += dz / L * 6; f.position.y = height(f.position.x, f.position.z); this.face(f); } } }); }
    if (id === 'ev17') { if (t > this.next && this.reps < 5) { this.reps++; this.next = t + 8; this.sfx(this.reps % 2 ? 'far-knocking-3' : 'far-whistle-3', V(this.pos.x || 3, 1.5, this.pos.z || 10), 0.9, { rate: 0.94, ref: 8 }); if (this.reps === 2) g.radioSay('Elgo... come down. We are at the bottom of the stairs.', { speaker: 'UNKNOWN \u2014 CH 4', dur: 5 }); } if (this.lookT > 1.2 && this.figs[0].visible) { this.figs[0].visible = false; this.dur = Math.min(this.dur, t + 2); } }
    if (id === 'wb') { if (this.lookT > 2.0 && !this.stay) { this.figs[0].visible = false; this.dur = Math.min(this.dur, t + 0.5); } }
    if (id === 'ev18') { if (t > 1.2) this.figs.forEach(f => f.visible = false); }
    if (id === 'ev19') { if (t > this.next) { this.ang += 0.9; this.next = t + 2.8 + Math.random() * 2; const p = V(Math.cos(this.ang) * 16, 0.5, Math.sin(this.ang) * 16); this.sfx('far-branch-snap-' + (1 + Math.floor(Math.random() * 4)), p, 1, { ref: 10 }); } }
    this.wasVisible = vis;
  }
}

// ---------- wildfire director: random smoke/glow on the map's spawn zones, spot it in the binoculars, report on the radio ----------
export class FireDirector {
  constructor(game, mapJson) { this.g = game; this.zones = ((mapJson && mapJson.smoke_wildfire_spawn_zones) || []).filter(z => !/tutorial/.test(z.id)); this.fires = []; this.reported = 0; this.missed = 0; this.spawned = 0; }
  zonePos(z) { const a = Math.random() * 6.28, r = Math.random() * (z.radius_m || 100) * 0.6; const x = z.center.x + Math.cos(a) * r, zz = z.center.z + Math.sin(a) * r; return V(x, height(x, zz), zz); }
  spawnAt(pos, id) { const f = new Wildfire(this.g.scene, pos, { id }); f.born = this.g.clockMin; this.fires.push(f); this.spawned++; return f; }
  spawnRandom() { if (this.zones.length) { const z = this.zones[Math.floor(Math.random() * this.zones.length)]; return this.spawnAt(this.zonePos(z), z.id); } const p = polar(Math.random() * 360, 1800 + Math.random() * 1500); return this.spawnAt(V(p.x, height(p.x, p.z), p.z), 'fire'); }
  update(dt, ctx) {
    for (const f of this.fires) { f.update(dt); if (!f.reported && ctx.bino && (this.g.inView(f.top, 4) || this.g.inView(f.pos.clone().add(V(0, 40, 0)), 4))) f.spotted += dt; }
    // a fire nobody reported for 3 game hours burns out and Base mentions it
    for (const f of this.fires) if (!f.reported && this.g.clockMin - f.born > 180 && !f.missedMsg) { f.missedMsg = true; this.missed++; this.g.radioSay('Elgo, Base. Next district called in smoke on your side. You didn\'t see it?'); f.dispose(); f.gone = true; }
    this.fires = this.fires.filter(f => !f.gone);
  }
  // radio report: any fire that has been looked at in the binoculars counts
  report() {
    const f = this.fires.find(f => !f.reported && f.spotted > 0.6); if (!f) return null;
    f.reported = true; this.reported++; const b = Math.round(bearingOf(f.pos.x, f.pos.z)); const d = (Math.hypot(f.pos.x, f.pos.z) / 1000).toFixed(1);
    setTimeout(() => { f.dispose(); f.gone = true; }, 90000); return { bearing: b, km: d, fire: f };
  }
  clear() { this.fires.forEach(f => f.dispose()); this.fires = []; }
}
