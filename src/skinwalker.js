// The thing in the pines: a tall, gaunt, wrongly-proportioned humanoid with a stretched deer-like skull.
// Procedural rig (pelvis / spine / chest / neck / skull, long arms with hooked fingers, digitigrade legs) animated in code:
// run (fast lope), stalk (crouched, deliberate), idle (twitching watch), flinch (hit), plus the AI that hunts a walker on the ground.
import * as THREE from 'three';
import { height } from './geo.js';
import { fbmField, hfNormal, texOf } from './procedural.js';
import { radialSprite } from './textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let _mats = null;
function skinMats() {
  if (_mats) return _mats;
  const N = 256, H = fbmField(N, 77, 6, 4, 0.55), H2 = fbmField(N, 131, 4, 8, 0.5);
  const c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); const im = x.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const v = H[i], w = H2[i]; const blot = Math.max(0, (v - 0.55) * 3.2), pale = Math.max(0, (0.42 - w) * 2.4);
    // ashy grey-pale skin: mottled bruise-grey blotches, pallid patches, faint vein darkening
    let r = 150 - blot * 70 + pale * 40 + (w - 0.5) * 30, g = 146 - blot * 72 + pale * 38 + (w - 0.5) * 26, b = 138 - blot * 60 + pale * 36 + (w - 0.5) * 20;
    const vein = Math.abs(Math.sin((v * 31 + w * 17))) < 0.05 ? 18 : 0; r -= vein; g -= vein * 1.1; b -= vein * 0.6;
    im.data[i * 4] = r; im.data[i * 4 + 1] = g; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
  x.putImageData(im, 0, 0);
  const HN = new Float32Array(N * N); for (let i = 0; i < N * N; i++) HN[i] = H[i] * 0.6 + H2[i] * 0.4;
  const skin = new THREE.MeshStandardMaterial({ map: texOf(c, { srgb: true, rep: [2, 3] }), normalMap: texOf(hfNormal(HN, N, 5), { rep: [2, 3] }), normalScale: new THREE.Vector2(1.1, 1.1), roughness: 0.78, color: 0xd8d2c8, emissive: 0x16140f });
  // cold moonlit rim + a little wet sheen so the silhouette reads against black pines without looking lit
  skin.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `float rimF = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.6);
    outgoingLight += vec3(0.075, 0.085, 0.105) * rimF;
    #include <opaque_fragment>`); };
  skin.customProgramCacheKey = () => 'skinwalker-rim';
  const dark = new THREE.MeshStandardMaterial({ color: 0x0b0a09, roughness: 0.6 });
  const claw = new THREE.MeshStandardMaterial({ color: 0x2a241c, roughness: 0.35, metalness: 0.1 });
  const bone = new THREE.MeshStandardMaterial({ color: 0xcfc6b2, roughness: 0.7, map: skin.map, emissive: 0x141210 });
  bone.onBeforeCompile = skin.onBeforeCompile; bone.customProgramCacheKey = () => 'skinwalker-bone';
  return (_mats = { skin, dark, claw, bone });
}
// tapered limb hanging along -y from its joint: knobby at both ends, gaunt in the middle
function limbGeo(L, r0, r1, seg = 10) {
  const pts = [[0.0001, -L], [r1 * 0.75, -L + 0.012], [r1 * 1.05, -L + 0.045], [r1 * 0.78, -L * 0.82], [(r0 + r1) * 0.36, -L * 0.5], [r0 * 0.8, -L * 0.2], [r0 * 1.05, -0.04], [r0 * 0.8, -0.008], [0.0001, 0.01]];
  return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
}
export function buildSkinwalker() {
  const M = skinMats(); const root = new THREE.Group(); root.name = 'skinwalker';
  const J = {}; const hitMeshes = [];
  const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); if (mat !== M.dark) hitMeshes.push(m); return m; };
  const joint = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); J[name] = g; return g; };
  const pelvis = joint('pelvis', root, 0, 1.22, 0);
  mesh(new THREE.SphereGeometry(0.15, 14, 10), M.skin, pelvis).scale.set(1.15, 0.7, 0.8);
  // spine + ribcage: lathed, flattened front-to-back, rib ridges and a starved belly
  const spine = joint('spine', pelvis, 0, 0.05, 0);
  const torsoPts = []; for (let i = 0; i <= 28; i++) { const t = i / 28, y = t * 0.78; let r = 0.1 + 0.05 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.5) + (t > 0.45 ? 0.05 * Math.sin((t - 0.45) / 0.55 * Math.PI * 0.75) : 0) - (t > 0.92 ? (t - 0.92) * 1.6 : 0);
    if (t > 0.4 && t < 0.86) r += 0.009 * Math.max(0, Math.sin(t * 92)); if (t < 0.35) r -= 0.02 * Math.sin(t / 0.35 * Math.PI); torsoPts.push(new THREE.Vector2(Math.max(0.02, r), y)); }
  const torso = mesh(new THREE.LatheGeometry(torsoPts, 18), M.skin, spine); torso.scale.set(1.05, 1, 0.66);
  for (let i = 0; i < 12; i++) { const v = mesh(new THREE.SphereGeometry(0.018, 8, 6), M.skin, spine, 0, 0.1 + i * 0.058, -0.098 - Math.sin(i / 11 * Math.PI) * 0.02); v.scale.set(1, 0.8, 1.2); } // vertebrae through the skin
  const chest = joint('chest', spine, 0, 0.74, 0);
  // shoulder blades / clavicles: sharp, hunched forward
  for (const sx of [-1, 1]) { const sc = mesh(new THREE.SphereGeometry(0.07, 10, 8), M.skin, chest, sx * 0.13, -0.06, -0.07); sc.scale.set(1.1, 1.4, 0.45); sc.rotation.z = sx * 0.4;
    const cl = mesh(limbGeo(0.2, 0.016, 0.014, 7), M.skin, chest, sx * 0.02, 0.01, 0.05); cl.rotation.z = sx * 1.35; }
  // long neck, pushed forward
  const neck = joint('neck', chest, 0, 0.02, 0.05); const nk = mesh(limbGeo(0.36, 0.045, 0.05, 10), M.skin, neck); nk.rotation.x = Math.PI; // grows up
  const head = joint('head', neck, 0, 0.34, 0.02);
  { // stretched deer-like skull: narrow cranium, a long tapering muzzle, deep dark sockets, a slack jaw, two broken antler stubs
    const cr = mesh(new THREE.SphereGeometry(0.1, 18, 14), M.bone, head, 0, 0.04, -0.02); cr.scale.set(0.95, 1.08, 1.3);
    const mz = mesh(new THREE.CylinderGeometry(0.028, 0.068, 0.27, 14, 1), M.bone, head, 0, -0.005, 0.17); mz.rotation.x = Math.PI / 2 + 0.12; mz.scale.set(1, 1, 0.75);
    const nose = mesh(new THREE.SphereGeometry(0.03, 10, 8), M.bone, head, 0, -0.025, 0.3); nose.scale.set(1, 0.7, 1.2);
    for (const sx of [-1, 1]) { const nos = mesh(new THREE.SphereGeometry(0.008, 6, 4), M.dark, head, sx * 0.012, -0.03, 0.326); }
    const jaw = joint('jaw', head, 0, -0.05, 0.03); const jw = mesh(new THREE.BoxGeometry(0.06, 0.018, 0.24), M.bone, jaw, 0, -0.012, 0.11); jw.rotation.x = 0.06;
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) mesh(new THREE.ConeGeometry(0.0045, 0.018, 4), M.claw, jaw, sx * 0.022, 0.006, 0.05 + i * 0.033).rotation.x = Math.PI;
    for (const sx of [-1, 1]) {
      const so = mesh(new THREE.SphereGeometry(0.03, 10, 8), M.dark, head, sx * 0.052, 0.03, 0.07); so.scale.set(0.9, 0.7, 0.6);
      const st = mesh(new THREE.ConeGeometry(0.014, 0.16, 6), M.bone, head, sx * 0.045, 0.14, -0.06); st.rotation.set(-0.7, 0, sx * -0.5);
      const ear = mesh(new THREE.ConeGeometry(0.02, 0.11, 6), M.skin, head, sx * 0.085, 0.07, -0.08); ear.rotation.set(-1.1, 0, sx * -1.0); ear.scale.set(1, 1, 0.35);
    }
    // eyeshine: pale reflective pinpoints deep in the sockets (brightened when a light points at them)
    const eyeMat = new THREE.SpriteMaterial({ map: radialSprite('rgba(255,255,240,1)', 'rgba(220,235,190,0)', 64), color: 0xe9f2cf, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5, fog: false });
    J.eyes = []; for (const sx of [-1, 1]) { const e = new THREE.Sprite(eyeMat); e.scale.set(0.05, 0.05, 1); e.position.set(sx * 0.054, 0.03, 0.095); head.add(e); J.eyes.push(e); }
    J.eyeMat = eyeMat;
  }
  // arms: far too long, hooked fingers with dark claws
  for (const sx of [-1, 1]) { const S = sx < 0 ? 'L' : 'R';
    const sh = joint('sh' + S, chest, sx * 0.2, -0.04, -0.01); mesh(new THREE.SphereGeometry(0.045, 10, 8), M.skin, sh);
    mesh(limbGeo(0.68, 0.045, 0.034), M.skin, sh);
    const el = joint('el' + S, sh, 0, -0.68, 0); mesh(limbGeo(0.66, 0.036, 0.026), M.skin, el);
    const wr = joint('wr' + S, el, 0, -0.66, 0); const palm = mesh(new THREE.BoxGeometry(0.06, 0.1, 0.025), M.skin, wr, 0, -0.05, 0);
    for (let f = 0; f < 4; f++) { const fx = (f - 1.5) * 0.017; const f1 = joint(`f${S}${f}a`, wr, fx, -0.095, 0.004); f1.rotation.x = -0.25; mesh(limbGeo(0.13 + (f === 1 || f === 2 ? 0.03 : 0), 0.0085, 0.007, 6), M.skin, f1);
      const f2 = joint(`f${S}${f}b`, f1, 0, -(0.13 + (f === 1 || f === 2 ? 0.03 : 0)), 0); f2.rotation.x = -0.5; mesh(limbGeo(0.1, 0.007, 0.005, 6), M.skin, f2);
      const cl = mesh(new THREE.ConeGeometry(0.0055, 0.05, 5), M.claw, f2, 0, -0.12, 0.006); cl.rotation.x = Math.PI + 0.35; }
  }
  // digitigrade legs: thigh forward, shin raked back, a long metatarsal, splayed toes
  for (const sx of [-1, 1]) { const S = sx < 0 ? 'L' : 'R';
    const th = joint('th' + S, pelvis, sx * 0.12, -0.04, 0); mesh(limbGeo(0.56, 0.07, 0.045), M.skin, th);
    const kn = joint('kn' + S, th, 0, -0.56, 0); mesh(limbGeo(0.56, 0.044, 0.03), M.skin, kn);
    const an = joint('an' + S, kn, 0, -0.56, 0); mesh(limbGeo(0.34, 0.03, 0.025), M.skin, an);
    const ft = joint('ft' + S, an, 0, -0.34, 0);
    for (let t = 0; t < 3; t++) { const toe = mesh(limbGeo(0.12, 0.014, 0.01, 6), M.skin, ft, (t - 1) * 0.025, 0, 0); toe.rotation.set(-Math.PI / 2 + 0.1, (t - 1) * 0.3, 0); const tc = mesh(new THREE.ConeGeometry(0.006, 0.04, 5), M.claw, ft, (t - 1) * 0.036, -0.01, 0.13); tc.rotation.x = Math.PI / 2 + 0.6; }
  }
  // generous invisible hit volume (torso + head) so a 9mm at night actually connects
  const proxyM = new THREE.MeshBasicMaterial({ visible: false });
  const px = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.5, 3, 8), proxyM); px.position.y = 1.3; root.add(px); J.proxy = px; hitMeshes.push(px);
  root.userData = { J, hitMeshes };
  root.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
  return root;
}

// ---------- animation ----------
function poseRig(J, a) {
  const s = Math.sin, c = Math.cos, p = a.phase;
  J.pelvis.position.y = a.hipH; J.pelvis.rotation.set(0, 0, a.roll || 0);
  J.spine.rotation.set(a.lean, a.twist || 0, (a.roll || 0) * -0.6);
  J.chest.rotation.set(a.hunch, (a.twist || 0) * 0.6, 0); J.chest.scale.setScalar(1 + (a.breath || 0));
  J.neck.rotation.set(a.neckP, 0, 0); J.head.rotation.set(a.headP, a.headY || 0, a.headR || 0); J.jaw.rotation.x = a.jaw || 0.08;
  for (const [S, k] of [['L', 0], ['R', Math.PI]]) {
    const ph = p + k; const tot = a.lean + a.hunch;
    J['sh' + S].rotation.set(-tot + a.armBase + a.armSwing * s(ph + Math.PI), 0, (S === 'L' ? 1 : -1) * (a.armOut || 0.12));
    J['el' + S].rotation.set(-(a.elbow + a.elbowSwing * Math.max(0, s(ph + Math.PI))), 0, 0);
    J['wr' + S].rotation.set(a.wrist || -0.2, 0, 0);
    for (let f = 0; f < 4; f++) { J[`f${S}${f}a`].rotation.x = -(a.curl ?? 0.35); J[`f${S}${f}b`].rotation.x = -(a.curl ?? 0.35) * 1.5; }
    const swing = a.legSwing * s(ph), lift = Math.max(0, c(ph));
    J['th' + S].rotation.set(-a.thighBase - swing, 0, 0);
    J['kn' + S].rotation.set(a.knee + a.kneeLift * lift, 0, 0);
    J['an' + S].rotation.set(-a.ankle - a.ankleLift * lift, 0, 0);
    J['ft' + S].rotation.set(a.ankle * 0.4 + a.thighBase * 0.3 + swing * 0.3, 0, 0);
  }
}
const POSE = {
  run:   { hipH: 1.12, lean: 0.62, hunch: 0.25, neckP: 0.15, headP: -0.75, armBase: -0.15, armSwing: 1.05, elbow: 0.55, elbowSwing: 0.7, legSwing: 0.95, thighBase: 0.25, knee: 0.85, kneeLift: 0.9, ankle: 0.7, ankleLift: 0.5, curl: 0.5 },
  stalk: { hipH: 0.92, lean: 0.95, hunch: 0.35, neckP: 0.35, headP: -1.25, armBase: 0.3, armSwing: 0.25, elbow: 0.15, elbowSwing: 0.2, legSwing: 0.38, thighBase: 0.75, knee: 1.5, kneeLift: 0.5, ankle: 1.1, ankleLift: 0.3, curl: 0.8 },
  idle:  { hipH: 1.18, lean: 0.3, hunch: 0.42, neckP: 0.28, headP: -0.55, armBase: 0.05, armSwing: 0, elbow: 0.12, elbowSwing: 0, legSwing: 0, thighBase: 0.28, knee: 0.72, kneeLift: 0, ankle: 0.62, ankleLift: 0, curl: 0.55 },
  flinch:{ hipH: 1.1, lean: -0.25, hunch: 0.1, neckP: -0.3, headP: 0.2, armBase: -1.9, armSwing: 0, elbow: 1.2, elbowSwing: 0, legSwing: 0, thighBase: 0.2, knee: 0.9, kneeLift: 0, ankle: 0.7, ankleLift: 0, curl: 1.0, jaw: 0.55 },
};
const lerpPose = (a, b, k) => { const o = {}; for (const key in b) o[key] = (a[key] ?? b[key]) + (b[key] - (a[key] ?? b[key])) * k; return o; };

export class Skinwalker {
  constructor(scene, hooks = {}) {
    this.scene = scene; this.hooks = hooks; this.model = buildSkinwalker(); this.J = this.model.userData.J; this.model.visible = false; scene.add(this.model);
    this.state = 'off'; this.pos = V(0, 0, 0); this.heading = 0; this.speed = 0; this.phase = 0; this.t = 0; this.cool = 0; this.stateT = 0;
    this.cur = { ...POSE.idle }; this.anim = 'idle'; this.twitchT = 0; this.headTw = { y: 0, r: 0 }; this.stepAcc = 0; this.scareCount = 0; this.eye = 0.4;
  }
  get meshes() { return this.model.userData.hitMeshes; }
  sfx(id, vol = 1, o = {}) { this.hooks.sound && this.hooks.sound(id, this.model.position.clone().add(V(0, 1.6, 0)), vol, o); }
  place(p, heading) { this.pos.copy(p); this.heading = heading ?? this.heading; this.pos.y = height(p.x, p.z); this.model.position.copy(this.pos); this.model.rotation.y = this.heading; }
  show(on) { this.model.visible = on; }
  setState(s) { this.state = s; this.stateT = 0; this.hooks.state && this.hooks.state(s); }
  hide() { this.setState('off'); this.show(false); }
  // scripted path for the tutorial cutscene: bolt from p0 to p1
  bolt(p0, p1, speed = 13) { this.place(p0, Math.atan2(p1.x - p0.x, p1.z - p0.z)); this.show(true); this.path = { a: p0.clone(), b: p1.clone(), speed }; this.setState('bolt'); this.anim = 'run'; this.speed = speed; }
  // a 9mm hit: shriek, flinch, then sprint for the trees and stay away 25-40 s
  scare() { if (this.state === 'off' || this.state === 'flinch' || this.state === 'flee') return false; this.scareCount++; this.setState('flinch'); this.anim = 'flinch'; this.speed = 0;
    this.sfx('far-scream-' + (1 + (this.scareCount % 3)), 1.4, { ref: 14 }); this.hooks.scared && this.hooks.scared(); return true; }
  // AI: ctx = { player: Vector3 (feet), active: bool (player is on the ground), aggr: 0..1, lit: 0..1 light on it }
  update(dt, ctx = {}) {
    this.t += dt; this.stateT += dt; const P = ctx.player; let target = 'idle';
    const toP = P ? V(P.x - this.pos.x, 0, P.z - this.pos.z) : V(0, 0, 1); const dist = toP.length();
    switch (this.state) {
      case 'off': this.cool -= dt; if (ctx.active && this.cool <= 0 && P) this.spawnStalk(P, ctx); break;
      case 'bolt': { const d = V(this.path.b.x - this.pos.x, 0, this.path.b.z - this.pos.z); const L = d.length(); if (L < 1) { this.hide(); break; } d.normalize(); this.heading = Math.atan2(d.x, d.z); this.pos.addScaledVector(d, Math.min(L, this.speed * dt)); target = 'run'; break; }
      case 'stalk': { // circle at the edge of the light, closing slowly; rustle + twig snaps; then charge
        if (!ctx.active) { this.retreat(); break; }
        const want = 20 - Math.min(10, this.stateT * 0.6); const tang = V(-toP.z, 0, toP.x).normalize().multiplyScalar(this.side || 1); const radial = toP.clone().normalize().multiplyScalar(dist - want);
        const mv = tang.multiplyScalar(1.6).add(radial.multiplyScalar(0.25)); const sp = Math.min(2.4, mv.length()); if (sp > 0.05) { mv.normalize(); this.pos.addScaledVector(mv, sp * dt); }
        this.heading = Math.atan2(toP.x, toP.z); this.speed = sp; target = sp > 0.3 ? 'stalk' : 'idle';
        if (Math.random() < dt * 0.25) this.sfx('far-branch-snap-' + (1 + Math.floor(Math.random() * 4)), 0.8, { ref: 10 });
        if (this.stateT > (this.stalkFor || 9) && (ctx.aggr ?? 1) > 0) { this.setState('charge'); this.sfx('stinger-' + (1 + Math.floor(Math.random() * 3)), 0.9); this.hooks.growl && this.hooks.growl(this.model.position); this.hooks.charge && this.hooks.charge(); }
        else if (this.stateT > (this.stalkFor || 9) + 6) this.retreat();
        break; }
      case 'charge': { if (!ctx.active) { this.retreat(); break; } const sp = 6.2 + 2.2 * (ctx.aggr ?? 0.5); const d = toP.clone().normalize(); this.heading = Math.atan2(d.x, d.z);
        this.pos.addScaledVector(d, Math.min(dist, sp * dt)); this.speed = sp; target = 'run'; if (dist < 1.25) { this.setState('caught'); this.speed = 0; this.hooks.caught && this.hooks.caught(); } break; }
      case 'flinch': target = 'flinch'; if (this.stateT > 0.55) { this.setState('flee'); const away = toP.clone().normalize().negate(); this.fleeDir = away; } break;
      case 'flee': { const d = this.fleeDir || V(1, 0, 0); this.heading = Math.atan2(d.x, d.z); this.speed = 13; this.pos.addScaledVector(d, this.speed * dt); target = 'run'; if (this.stateT > 4 || dist > 70) { this.hide(); this.cool = 25 + Math.random() * 15; } break; }
      case 'retreat': { const d = toP.clone().normalize().negate(); this.heading = Math.atan2(d.x, d.z); this.speed = 9; this.pos.addScaledVector(d, this.speed * dt); target = 'run'; if (this.stateT > 3 || dist > 60) { this.hide(); this.cool = 12 + Math.random() * 10; } break; }
      case 'caught': target = 'idle'; break;
      case 'watch': target = 'idle'; this.heading = Math.atan2(toP.x, toP.z); break;
    }
    if (this.state === 'off') return;
    this.pos.y = height(this.pos.x, this.pos.z); this.model.position.copy(this.pos);
    let dh = this.heading - this.model.rotation.y; dh = Math.atan2(Math.sin(dh), Math.cos(dh)); this.model.rotation.y += dh * Math.min(1, dt * 10);
    // footfalls: heavy, quick padding thuds while it runs
    if (this.speed > 0.4) { this.stepAcc += this.speed * dt; const stride = target === 'run' ? 2.4 : 0.9; if (this.stepAcc > stride) { this.stepAcc = 0; this.hooks.step && this.hooks.step(this.model.position, target === 'run' ? 1 : 0.4); } }
    this.animate(dt, target, ctx);
  }
  spawnStalk(P, ctx) {
    // appear out of sight: behind / beside the player, 26-32 m out, at the treeline
    const back = ctx.viewDir ? Math.atan2(-ctx.viewDir.x, -ctx.viewDir.z) : Math.random() * 6.28; const a = back + (Math.random() - 0.5) * 1.8; const r = 26 + Math.random() * 6;
    this.place(V(P.x + Math.sin(a) * r, 0, P.z + Math.cos(a) * r), a + Math.PI); this.show(true); this.side = Math.random() < 0.5 ? -1 : 1; this.stalkFor = 6 + Math.random() * 6 - (ctx.aggr || 0) * 3;
    this.setState('stalk'); this.sfx('far-branch-snap-' + (1 + Math.floor(Math.random() * 4)), 1.0, { ref: 12 }); this.hooks.spotted && this.hooks.spotted();
  }
  retreat() { if (this.state === 'off') return; this.setState('retreat'); }
  animate(dt, target, ctx) {
    if (target !== this.anim) { this.anim = target; this.blend = 0; }
    this.blend = Math.min(1, (this.blend ?? 1) + dt * (target === 'flinch' ? 9 : 4));
    const freq = target === 'run' ? Math.max(1.6, this.speed * 0.2) : target === 'stalk' ? 0.75 : 0.0;
    this.phase += dt * freq * Math.PI * 2;
    const goal = { ...POSE[target] };
    // unsettling idle: head snaps to new angles, a breath that is too slow
    this.twitchT -= dt; if (this.twitchT <= 0) { this.twitchT = 0.4 + Math.random() * 1.8; this.headTw = { y: (Math.random() - 0.5) * 0.9, r: (Math.random() - 0.5) * 1.1 }; }
    goal.headY = this.headTw.y * (target === 'run' ? 0.15 : 1); goal.headR = this.headTw.r * (target === 'run' ? 0.1 : 1); goal.breath = Math.sin(this.t * 1.1) * 0.02;
    if (target === 'run') goal.hipH += Math.abs(Math.sin(this.phase)) * 0.1;
    goal.phase = this.phase;
    const k = 1 - Math.exp(-dt * (target === 'flinch' ? 18 : 8)); for (const key in goal) if (key !== 'phase') this.cur[key] = (this.cur[key] ?? goal[key]) + (goal[key] - (this.cur[key] ?? goal[key])) * k;
    this.cur.phase = this.phase; poseRig(this.J, this.cur);
    // eyeshine: a dim glint, flaring when a light is on it
    const e = 0.35 + 1.4 * (ctx.lit || 0); this.eye += (e - this.eye) * Math.min(1, dt * 6); this.J.eyeMat.opacity = Math.min(1, this.eye); for (const s of this.J.eyes) s.scale.setScalar(0.04 + 0.05 * Math.min(1, this.eye));
  }
}
