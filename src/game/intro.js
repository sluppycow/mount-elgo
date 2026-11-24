// Morning intro: drive the ranger truck up the last stretch of road while D. Marsh talks on the walkie-talkie.
// Uses the same hand model as the viewmodel (the solved flashlight fist, re-used to hold the wheel and the walkie).
import * as THREE from 'three';
import { ROAD, ROAD_H, LOT, height } from '../geo.js';
import { buildHand, poseHand, aimForearm, skinMaterials } from '../hands.js';
import { buildTruck, buildWalkie, GAUGE } from '../truck.js';
import { solveWalkie } from '../grip.js';
import { fabricMaps, texOf } from '../procedural.js';
import { addSleeve } from './sleeve.js';
let _grip = null; function walkieGrip(h) { return _grip || (_grip = solveWalkie(h)); }

const V = (x, y, z) => new THREE.Vector3(x, y, z);
// copy the solved torch-hand pose (root + every bone) onto a freshly built hand
function cloneHeldHand(vm) {
  const src = vm.torchHand; const h = buildHand('R');
  const a = [], b = []; src.traverse(o => a.push(o)); h.traverse(o => b.push(o));
  for (let i = 0; i < Math.min(a.length, b.length); i++) { b[i].position.copy(a[i].position); b[i].quaternion.copy(a[i].quaternion); b[i].scale.copy(a[i].scale); }
  h.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
  return h;
}
// back-of-hand direction in the torch frame (wrist bone offset from the barrel axis)
function backDir(vm) {
  const t = vm.torch; t.updateWorldMatrix(true, true); let bone = null; vm.torchHand.traverse(o => { if (!bone && o.isBone && /hand|wrist|palm/i.test(o.name)) bone = o; });
  const p = new THREE.Vector3(); if (bone) { bone.getWorldPosition(p); t.worldToLocal(p); } else p.set(0, 1, 0);
  p.z = 0; if (p.lengthSq() < 1e-8) p.set(0, 1, 0); return p.normalize();
}
function rig(vm, item) { const g = new THREE.Group(); g.add(cloneHeldHand(vm)); if (item) g.add(item); return g; }
// orient a torch-frame rig: its +z axis -> axis, its back-of-hand -> back
function orient(g, axis, back, bd) {
  const z = axis.clone().normalize(); const y = back.clone().sub(z.clone().multiplyScalar(back.dot(z))).normalize(); const x = new THREE.Vector3().crossVectors(y, z);
  const m = new THREE.Matrix4().makeBasis(x, y, z); const q = new THREE.Quaternion().setFromRotationMatrix(m);
  // bd is the back direction in rig-local XY; rotate about z so local bd maps to local +y first
  const roll = Math.atan2(bd.x, bd.y); const qr = new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), roll);
  g.quaternion.copy(q).multiply(qr);
}

export class Intro {
  constructor(game, data) {
    this.g = game; this.d = data; this.t = 0; this.done = false; this.cues = new Set();
    const scene = game.scene, vm = game.vm;
    // ----- path: the last ~680 m of the main road, ending at the lot -----
    let pts = ROAD.map((p, i) => V(p[0], ROAD_H.length === ROAD.length ? ROAD_H[i] : height(p[0], p[1]), p[1]));
    if (pts[0].distanceTo(V(LOT.x, pts[0].y, LOT.z)) < pts[pts.length - 1].distanceTo(V(LOT.x, pts[pts.length - 1].y, LOT.z))) pts.reverse(); // drive toward the lot
    let acc = 0; const keep = [pts[pts.length - 1]];
    for (let i = pts.length - 2; i >= 0 && acc < 700; i--) { acc += pts[i].distanceTo(pts[i + 1]); keep.unshift(pts[i]); }
    this.path = keep; this.cum = [0]; for (let i = 1; i < keep.length; i++) this.cum.push(this.cum[i - 1] + keep[i].distanceTo(keep[i - 1])); this.L = this.cum[this.cum.length - 1];
    const arrive = (data.cue_markers.find(c => c.id === 'arrive_lot') || { time_s: 74.43 }).time_s; this.T = arrive; this.v0 = this.L / (arrive - 4);
    // ----- truck: contoured cab (src/truck.js) -----
    const TK = buildTruck(scene); const T = this.truck = TK.group; this.R = TK.R;
    const wheel = this.wheel = TK.R.wheel; const Rw = TK.R.wheelR;
    // right hand: the solved power-grip fist (made for a 25 mm tube) closed round the 27 mm leather rim at 2 o'clock
    const bd = backDir(vm);
    const rh = this.rh = rig(vm); const th = Math.PI / 5; const rp = V(Math.cos(th) * Rw, Math.sin(th) * Rw, 0);
    rh.position.copy(rp); wheel.add(rh); orient(rh, V(-Math.sin(th), Math.cos(th), 0), V(Math.cos(th) * 0.35, Math.sin(th) * 0.35, 1).normalize(), bd);
    rh.traverse(o => { if (o.isMesh) o.receiveShadow = true; }); this.rhHand = rh.children[0];
    // v7 arms: ranger-jacket sleeves (canvas twill, cuff, folds) on BOTH arms, forearm + upper arm to the shoulder (built below)
    skinMaterials().skin.color.setRGB(0.6, 0.48, 0.4); // low golden-hour sun straight through the windshield: keep the skin from clipping to white (restored in finish)
    // left hand + radio: solved grip (palm on the back, fingers round the side onto the front edge, thumb on the PTT)
    const hand = buildHand('R'); const sol = walkieGrip(hand); poseHand(hand, sol.pose); hand.position.copy(sol.p); hand.quaternion.copy(sol.q);
    hand.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.receiveShadow = true; o.castShadow = true; } });
    const wt = this.walkie = buildWalkie([-sol.report.ptt[0], sol.report.ptt[1], sol.report.ptt[2]], 1); wt.scale.x = -1; // counter-mirror: printing reads correctly
    const lh = this.lh = new THREE.Group(); lh.add(hand); lh.add(wt); lh.scale.x = -1; // mirrored: right-hand solve -> left hand
    this.lhGroup = new THREE.Group(); this.lhGroup.add(lh); game.camera.add(this.lhGroup); this.gripReport = sol.report;
    // radio upright in front of the chest, speaker toward the face, antenna leaning away
    { const up = V(0.38, 0.8, -0.42).normalize(), front = V(0.3, 0.35, 0.87); front.addScaledVector(up, -front.dot(up)).normalize(); const xr = new THREE.Vector3().crossVectors(front, up);
      // walkie frame (rig-local, mirrored): x -> -xr (mirror), y -> front, z -> up
      lh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xr.clone().negate(), front, up)); lh.scale.x = -1;
      // with scale.x = -1 the rotation above applies to (-x, y, z): flip the x column back so the radio's front faces the eye
      lh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xr, front, up)); }
    this.lhBase = V(-0.15, -0.2, -0.36); this.lhGroup.position.copy(this.lhBase);
    this.handL = hand;
    this.sleeves = [addSleeve(this.rhHand, { z0: 0.03, len: 0.27, upperParent: game.camera }), addSleeve(hand, { z0: 0.03, len: 0.27, upperParent: game.camera })];
    this.shoulders = [V(0.21, -0.3, 0.14), V(-0.21, -0.3, 0.14)];
    this.camRig = V(-0.38, 1.74, 0.12); this.yaw = 0; this.pitch = -0.05;
    this.lines = data.lines.slice(); this.sfxOn = false;
  }
  start() {
    const g = this.g; g.camera.position.set(0, 0, 0); g.camera.rotation.set(0, 0, 0); this.truck.add(g.camera); g.camera.position.copy(this.camRig);
    g.audio.loop('truck', 'truck-drive-loop', 0.8, 'sfx'); g.audio.birds(true); this.place(0, 0);
  }
  sAt(t) { const v0 = this.v0, T = this.T; if (t < T - 8) return v0 * t; const u = Math.min(8, t - (T - 8)); return v0 * (T - 8) + v0 * u - v0 * u * u / 16; }
  pointAt(s) { s = Math.max(0, Math.min(this.L, s)); let i = 1; while (i < this.cum.length - 1 && this.cum[i] < s) i++; const f = (s - this.cum[i - 1]) / Math.max(1e-6, this.cum[i] - this.cum[i - 1]); return this.path[i - 1].clone().lerp(this.path[i], f); }
  place(s, dt) {
    // v7: dead-centre on the rendered road: same centreline polyline + the road mesh's height rule, heading from the local
    // tangent (short symmetric look-ahead), wheels sampled at the axles so the body pitches/rolls with the gravel.
    const p = this.pointAt(s), a = this.pointAt(s + 3.5), b = this.pointAt(s - 3.5);
    let dir = a.clone().sub(b); if (s > this.L - 4) dir = this.lastDir ? this.lastDir.clone() : dir; dir.y = 0; if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1); dir.normalize(); this.lastDir = dir.clone();
    const roadY = (q) => { const hc = height(q.x, q.z); const yc = Math.min(Math.max(q.y, hc), hc + 0.35); return Math.min(Math.max(yc, hc - 0.25), hc + 0.3) + 0.05 + 0.05; };
    const front = this.pointAt(s + 1.6), rear = this.pointAt(s - 1.6); const yF = roadY(front), yR = roadY(rear);
    const pos = p.clone(); const yGround = (yF + yR) / 2 - 0.1;
    const pitch = Math.atan2(yF - yR, 3.2);
    const yaw = Math.atan2(-dir.x, -dir.z); const tgt = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    this.truck.position.set(pos.x, yGround + 0.15 + Math.sin(this.t * 7.1) * 0.006 * (s < this.L - 1 ? 1 : 0), pos.z);
    if (dt === 0) this.truck.quaternion.copy(tgt); else this.truck.quaternion.slerp(tgt, Math.min(1, dt * 8));
    // the wheel follows the bend
    const turn = THREE.MathUtils.clamp((this.prevYaw === undefined ? 0 : ((yaw - this.prevYaw + Math.PI * 3) % (Math.PI * 2) - Math.PI)) / Math.max(dt, 1e-3) * 2.5, -1.2, 1.2); this.prevYaw = yaw;
    this.wheel.rotation.z += (turn - this.wheel.rotation.z) * Math.min(1, dt * 3);
  }
  say(line) {
    // no spoken audio: radio beep + typed text only (Aidyn's rule)
    const g = this.g; const me = line.speaker === 'PLAYER';
    g.radioSay(line.text, { speaker: me ? 'YOU' : 'DISPATCH \u2014 D. MARSH', player: me, dur: line.duration_s });
    if (!me) this.ledT = line.duration_s; this.speaking = me ? line.duration_s : 0;
  }
  update(dt, inp) {
    if (this.done) return; this.t += dt; const t = this.t, g = this.g;
    for (const l of this.lines) if (!l.said && t >= l.start_s) { l.said = true; this.say(l); }
    for (const c of this.d.cue_markers) if (!this.cues.has(c.id) && t >= c.time_s) { this.cues.add(c.id); this.cue(c); }
    const s = this.sAt(Math.min(t, this.T)); this.speed = dt > 0 ? Math.abs(s - (this.lastS ?? s)) / dt : 0; this.lastS = s; this.place(s, dt);
    // look around a little from the seat
    this.yaw = THREE.MathUtils.clamp(this.yaw - inp.look.x, -1.3, 1.3); this.pitch = THREE.MathUtils.clamp(this.pitch - inp.look.y, -0.6, 0.45);
    g.camera.position.copy(this.camRig); g.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    // walkie comes up to the mouth when the player talks, rests on the knee otherwise
    const up = this.speaking > 0 ? 1 : 0; this.speaking -= dt; this.wk = (this.wk || 0) + (up - (this.wk || 0)) * Math.min(1, dt * 3);
    // keep the wheel hand's forearm running back to the driver's right elbow while the wheel turns
    if (this.rhHand) { g.camera.updateMatrixWorld(); const elR = g.camera.localToWorld(V(0.5, -0.5, 0.3)); aimForearm(this.rhHand, elR);
      const elL = g.camera.localToWorld(V(-0.42, -0.55, 0.25));
    }
    this.lhGroup.position.set(this.lhBase.x + this.wk * 0.05, this.lhBase.y + this.wk * 0.09, this.lhBase.z + this.wk * 0.06);
    g.camera.updateMatrixWorld(true); for (let k = 0; k < 2; k++) this.sleeves[k].update(g.camera.localToWorld(this.shoulders[k].clone()));
    this.ledT = (this.ledT || 0) - dt; const W = this.walkie.userData; const rx = this.ledT > 0, tx = up > 0;
    W.led.material.color.set(tx ? 0xff3010 : rx ? 0x30ff50 : 0x0a140a); W.ledGlow.material.color.set(tx ? 0xff4020 : 0x40ff60); W.ledGlow.material.opacity = tx || rx ? 0.8 : 0;
    // gauges: speed / revs from the path speed
    const R = this.R; const vms = this.speed || 0; const mph = vms * 2.237; const rpm = this.done ? 0 : (this.engineOff ? 0 : 750 + mph * 55);
    R.speedo.rotation.z = GAUGE.rot(mph / 100, 130); R.tach.rotation.z = GAUGE.rot(rpm / 7000, 130);
    R.fuel.rotation.z = GAUGE.rot(0.62, 60); R.temp.rotation.z = GAUGE.rot(0.48, 60); R.oil.rotation.z = GAUGE.rot(rpm > 0 ? 0.55 : 0, 60); R.batt.rotation.z = GAUGE.rot(rpm > 0 ? 0.6 : 0.45, 60);
    // skip: hold E / USE
    if (inp.held.has('use') || inp.held.has('skip')) { const nw = performance.now() / 1000; this.skip0 = this.skip0 || nw; this.skipT = nw - this.skip0; /* wall-clock, so slow phones skip just as fast */ if (this.skipT > 1.2 && !this.skipping) { this.skipping = true; g.fadeTo(1, 0.8); setTimeout(() => this.finish(), 900); } } else { this.skipT = 0; this.skip0 = 0; }
  }
  cue(c) {
    const g = this.g; const a = g.audio;
    if (c.id === 'arrive_lot') { a.stopLoop('truck', 1.2); a.loop('truckIdle', 'truck-idle-loop', 0.8, 'sfx'); }
    if (c.id === 'engine_off') { this.engineOff = true; a.stopLoop('truckIdle', 0.4); a.play('truck-engine-off', { vol: 0.9 }); }
    if (c.id === 'door_open') a.play('truck-door-open', { vol: 0.9 });
    if (c.id === 'door_close') a.play('truck-door-close', { vol: 0.9 });
    if (c.id === 'fade_black') { g.fadeTo(1, c.fade_duration_s || 2); setTimeout(() => this.finish(), (c.fade_duration_s || 2) * 1000 + 300); }
  }
  finish() {
    skinMaterials().skin.color.setRGB(1.0, 0.8, 0.66); for (const sl of this.sleeves || []) { if (sl.upper) sl.upper.removeFromParent(); if (sl.elbow) sl.elbow.removeFromParent(); }
    if (this.done) return; this.done = true; const g = this.g; const a = g.audio;
    a.stopLoop('truck', 0.3); a.stopLoop('truckIdle', 0.3); a.birds(false); g.subtitle(null);
    for (const l of this.lines) l.said = true;
    this.truck.remove(g.camera); g.camera.remove(this.lhGroup); g.scene.remove(this.truck); g.scene.add(g.camera);
    this.truck.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    g.onIntroDone && g.onIntroDone();
  }
}
