// First-person viewmodel: pistol + hands + flashlight with a keyframed/procedural animation system.
import * as THREE from 'three';
import { buildGun, buildGunMaterials, buildMagazine, buildCasing, buildFlashlight, GUN_DIM } from './gun.js';
import { addSleeve } from './game/sleeve.js';
import { buildHand, poseHand, lerpPose, HAND_POSES, aimForearm } from './hands.js';
import { flashSprite, radialSprite } from './textures.js';
import { solveGrip, solveTorch } from './grip.js';

const D2R = Math.PI / 180;
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;   // in-out cubic
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIn = (t) => t * t * t;

// ---- base layout (tweakable) ----
export const VM = {
  gunPos: new THREE.Vector3(0.052, -0.066, -0.265),
  gunRot: new THREE.Euler(0.05, 0.12, -0.04),
  rh: { p: new THREE.Vector3(0.025, -0.035, 0.060), back: new THREE.Vector3(1, 0, 0), fwd: new THREE.Vector3(0, -0.3, -0.95) },
  lh: { p: new THREE.Vector3(-0.041, -0.024, 0.040), back: new THREE.Vector3(-1, 0, 0), fwd: new THREE.Vector3(0, -0.65, -0.76) },
  torch: { p: new THREE.Vector3(0.072, -0.088, -0.31), r: new THREE.Euler(0.07, 0.17, -1.92) }, // v6: overhand duty grip, rolled so the back of the hand faces up/out
  torchElbow: new THREE.Vector3(0.24, -0.42, 0.02), torchElbowK: 0.5,
  near: 0.15,
  ads: { eye: 0.30, fov: 44, swayK: 0.3 }, // aim-down-sights: red-dot centre on the view axis, 30 cm from the eye
  reloadPose: { gx: -0.04, gy: 0.04, gz: -0.01, grx: 0.12, gry: 0.3, grz: -0.45 },
  magGrip: { p: new THREE.Vector3(-0.004, -0.125, 0.05), back: new THREE.Vector3(0, -0.66, -0.75), fwd: new THREE.Vector3(0.05, 0.75, -0.66) },
  elbowR: new THREE.Vector3(0.17, -0.44, 0.0), elbowL: new THREE.Vector3(-0.15, -0.45, 0.0),
  torchHand: { p: new THREE.Vector3(0.034, 0.036, 0.020), back: new THREE.Vector3(0.75, -0.65, 0), fwd: new THREE.Vector3(-0.65, -0.75, 0), x: new THREE.Vector3(0, 0, 1) },
};

// channels used by clips (all offsets from base stance)
const CH = ['gx', 'gy', 'gz', 'grx', 'gry', 'grz', 'lx', 'ly', 'lz', 'lrx', 'lry', 'lrz', 'lgrip', 'lpinch', 'lrack', 'rthumb', 'slide', 'mag', 'mx', 'mz', 'mrx', 'lhold', 'hide', 'lhide'];
export function basisQuat(back, fwd) {
  const Y = back.clone().normalize(); const Z = fwd.clone().negate(); Z.addScaledVector(Y, -Z.dot(Y)).normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}
const zero = () => Object.fromEntries(CH.map(c => [c, 0]));

// clip = { dur, keys: { ch: [[t, v], ...] }, events: [[t, name]] }
function sample(keys, t) {
  if (!keys || !keys.length) return 0;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) { const k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]); const e = (b[2] || ease)(k); return a[1] + (b[1] - a[1]) * e; }
  }
  return keys[keys.length - 1][1];
}

// sample spheres in hand space [x, y, z, radius]: palm, fingertips, wrist and forearm out to the elbow-ish cut
const NEAR_SAMPLES = [[0, 0, -0.05, 0.03], [0, 0, -0.17, 0.012], [-0.04, 0, -0.08, 0.012], [0, 0, 0, 0.03], [0, 0, 0.06, 0.032], [0, 0, 0.12, 0.036], [0, 0, 0.18, 0.04], [0, 0, 0.24, 0.042]];
// ---------- CLIPS ----------
const MAGOUT = 0.13; // m along mag axis when fully free of the well
function reloadClip(empty) {
  // Reference motion: right thumb presses the mag release, the left hand pulls the mag out by its baseplate,
  // drops it, brings a fresh mag and seats it with a click. Empty: then the right thumb drops the slide stop.
  const T = empty ? 2.45 : 2.05; const k = {};
  const s = (ch, arr) => (k[ch] = arr);
  const g1 = 0.24, g2 = T - 0.42;
  // gun: rises toward centre, muzzle up, canted so the mag well faces the left hand / camera
  const RP = VM.reloadPose;
  for (const c of ['gx', 'gy', 'gz', 'grx', 'gry', 'grz']) s(c, [[0, 0], [g1, RP[c]], [g2, RP[c] * 0.96], [T - 0.1, 0]]);
  s('rthumb', [[0.16, 0], [0.24, 1], [0.34, 1], [0.42, 0]]);
  const tGrab = 0.40, tOut = 0.60, tDrop = 0.70, tBelt = 1.00, tNew = 1.18, tAlign = 1.40, tIn = 1.55, tBack = 1.78;
  // magazine pose in mag-pivot space: m = distance out along the well axis, mx/mz = off-axis drift
  s('mag', [[0, 0], [0.28, 0], [0.33, 0.014], [tGrab, 0.014], [tOut, MAGOUT], [tDrop, MAGOUT + 0.02], [tDrop + 0.0001, 9], [tNew - 0.0001, 9], [tNew, MAGOUT + 0.16], [tAlign, 0.03], [tIn - 0.05, 0.012], [tIn, 0]]);
  s('mx', [[0, 0], [tOut, 0], [tDrop, 0.03], [tDrop + 0.0001, 0], [tNew, -0.06], [tAlign, 0], [T, 0]]);
  s('mz', [[0, 0], [tOut, 0.005], [tDrop, 0.03], [tDrop + 0.0001, 0], [tNew, 0.05], [tAlign, 0.004], [tIn, 0]]);
  s('mrx', [[0, 0], [tOut, 0.05], [tDrop, 0.35], [tDrop + 0.0001, 0], [tNew, -0.25], [tAlign, 0.02], [tIn, 0]]);
  // left hand follows the magazine while holding it
  s('lhold', [[0, 0], [0.18, 0], [tGrab, 1], [tDrop, 1], [tDrop + 0.12, 0], [tNew - 0.12, 0], [tNew, 1], [tIn + 0.04, 1], [tBack, 0]]);
  s('lpinch', [[0, 0], [0.25, 0.6], [tGrab, 1], [tDrop - 0.02, 1], [tDrop + 0.06, 0.2], [tNew - 0.06, 0.6], [tNew, 1], [tIn + 0.04, 1], [tBack, 0]]);
  s('lgrip', [[0, 1], [0.18, 0], [tBack - 0.15, 0], [tBack, 1]]);
  // while not holding: support-space offsets (down to the belt pouch and back)
  s('ly', [[0, 0], [0.2, -0.04], [tDrop + 0.1, -0.16], [tBelt, -0.32], [tNew - 0.1, -0.26], [tIn, -0.1], [tBack, 0]]);
  s('lx', [[0, 0], [tDrop + 0.1, -0.02], [tBelt, -0.06], [tIn, -0.02], [tBack, 0]]);
  s('lz', [[0, 0], [tDrop + 0.1, 0.04], [tBelt, 0.08], [tIn, 0.02], [tBack, 0]]);
  const ev = [[0.24, 'magRelease'], [tDrop, 'dropMag'], [tNew - 0.03, 'newMag'], [tIn, 'magInsert']];
  if (empty) {
    const r0 = tIn + 0.3; // right thumb hits the slide stop: slide slams home
    s('rthumb', [[0.16, 0], [0.24, 1], [0.34, 1], [0.42, 0], [r0 - 0.15, 0], [r0, 1.2], [r0 + 0.12, 0]]);
    s('slide', [[0, 1], [r0, 1], [r0 + 0.035, 0, easeIn], [T, 0]]);
    s('gy', [[0, 0], [g1, RP.gy], [r0, RP.gy], [r0 + 0.04, RP.gy + 0.006], [r0 + 0.12, RP.gy], [g2 + 0.2, RP.gy], [T - 0.1, 0]]);
    ev.push([r0 + 0.01, 'slideRelease']);
  }
  return { dur: T, keys: k, events: ev, name: empty ? 'reloadEmpty' : 'reloadTac' };
}
function inspectClip() {
  // small inspect: left hand eases off, gun rolls to show its left side, tilts up to look at the optic, returns
  const T = 3.4; const k = {};
  k.grz = [[0, 0], [0.55, 0.95], [1.55, 0.95], [2.05, -0.35], [2.6, -0.35], [3.2, 0]];
  k.gry = [[0, 0], [0.55, -0.35], [1.55, -0.28], [2.05, 0.25], [2.6, 0.22], [3.2, 0]];
  k.grx = [[0, 0], [0.55, 0.25], [1.1, 0.32], [1.55, 0.18], [2.05, 0.12], [2.6, 0.1], [3.2, 0]];
  k.gx = [[0, 0], [0.55, -0.045], [1.55, -0.045], [2.05, -0.02], [2.6, -0.02], [3.2, 0]];
  k.gy = [[0, 0], [0.55, 0.035], [1.55, 0.04], [2.05, 0.02], [3.2, 0]];
  k.gz = [[0, 0], [0.55, 0.07], [1.55, 0.07], [2.05, 0.06], [3.2, 0]];
  k.lgrip = [[0, 1], [0.3, 0.2], [2.8, 0.2], [3.2, 1]];
  k.lx = [[0, 0], [0.4, -0.05], [2.8, -0.05], [3.2, 0]];
  k.ly = [[0, 0], [0.4, -0.10], [2.8, -0.10], [3.2, 0]];
  k.lz = [[0, 0], [0.4, 0.06], [2.8, 0.06], [3.2, 0]];
  k.lrz = [[0, 0], [0.4, 0.3], [2.8, 0.3], [3.2, 0]];
  return { dur: T, keys: k, events: [], name: 'inspect', cancelable: true };
}
function drawClip() {
  const T = 0.95; const k = {};
  k.gy = [[0, -0.32], [0.55, 0.012, easeOut], [0.8, 0]];
  k.gx = [[0, 0.12], [0.55, 0.0, easeOut], [0.8, 0]];
  k.gz = [[0, 0.1], [0.55, 0, easeOut]];
  k.grx = [[0, -1.0], [0.55, 0.05, easeOut], [0.8, 0]];
  k.grz = [[0, -0.6], [0.55, 0.03, easeOut], [0.8, 0]];
  k.lgrip = [[0, 0], [0.55, 0], [0.8, 1]];
  k.lx = [[0, -0.12], [0.45, -0.05], [0.75, 0]];
  k.ly = [[0, -0.35], [0.45, -0.06], [0.75, 0]];
  k.lz = [[0, 0.05], [0.75, 0]];
  return { dur: T, keys: k, events: [[0.05, 'drawCloth']], name: 'draw' };
}
function holsterClip() {
  const T = 0.55; const k = {};
  k.gy = [[0, 0], [0.5, -0.34, easeIn]]; k.gx = [[0, 0], [0.5, 0.12]]; k.grx = [[0, 0], [0.5, -0.9]]; k.grz = [[0, 0], [0.5, -0.5]];
  k.lgrip = [[0, 1], [0.2, 0]]; k.ly = [[0, 0], [0.45, -0.35]]; k.lx = [[0, 0], [0.45, -0.12]];
  k.hide = [[0, 0], [0.54, 0], [0.55, 1]];
  return { dur: T, keys: k, events: [], name: 'holster', hold: true };
}

export const CLIPS = { drawClip, inspectClip, holsterClip, reloadClip };
export class ViewModel {
  static drawClip() { return drawClip(); }
  constructor(audio) {
    this.audio = audio;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(52, 16 / 9, 0.01, 10);
    this.scene.add(this.camera);
    this.root = new THREE.Group(); this.camera.add(this.root);
    this.M = buildGunMaterials();
    this.gun = buildGun(this.M); this.root.add(this.gun);
    this.rh = buildHand('R'); this.gun.add(this.rh);
    this.lh = buildHand('L'); this.root.add(this.lh);
    this.torch = buildFlashlight(); this.root.add(this.torch); this.torch.visible = false;
    this.torchHand = buildHand('R'); this.torch.add(this.torchHand);
    this.gripReport = solveGrip(this, VM, HAND_POSES); this.gripReport.torch = solveTorch(this, VM, HAND_POSES); if (typeof window !== 'undefined') window.gripReport = this.gripReport;
    
    poseHand(this.torchHand, HAND_POSES.fistTorch);
    this.sleeves = [addSleeve(this.rh, { len: 0.75 }), addSleeve(this.lh, { len: 0.75 }), addSleeve(this.torchHand, { len: 0.75 })];
    // lights inside the viewmodel scene (driven by the world each frame)
    this.hemi = new THREE.HemisphereLight(0x8090b0, 0x201812, 0.3); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 0.5); this.key.position.set(-1, 2, 1); this.scene.add(this.key); this.scene.add(this.key.target);
    this.fill = new THREE.PointLight(0xffb070, 0, 3, 2); this.fill.position.set(0.3, 0.4, 0.2); this.scene.add(this.fill);
    this.flashLight = new THREE.PointLight(0xffc070, 0, 2.5, 2); this.scene.add(this.flashLight);
    this.torchVM = new THREE.SpotLight(0xfff1dc, 0, 3, 0.5, 0.6, 2); this.scene.add(this.torchVM); this.scene.add(this.torchVM.target);
    // muzzle flash sprite
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashSprite(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
    this.flash.scale.set(0.09, 0.09, 1); this.flash.visible = false; this.gun.userData.muzzle.add(this.flash); this.flash.position.z = -0.03;
    this.flashSide = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: this.flash.material.map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    this.flashSide.rotation.y = Math.PI / 2; this.flashSide.position.z = -0.06; this.flashSide.visible = false; this.gun.userData.muzzle.add(this.flashSide);
    this.smoke = [];
    this.smokeTex = radialSprite('rgba(200,200,205,0.5)', 'rgba(200,200,205,0)');
    this.casings = [];
    this.loose = []; // dropped mags in vm space (fall out of view)
    // state
    this.ammo = { mag: 9, chamber: 1, reserve: 40, cap: 10 };
    this.mode = 'gun'; // 'gun' | 'torch' | 'none'
    this.torchOn = false;
    this.clip = null; this.ct = 0; this.blendFrom = null; this.blendT = 1; this.cur = zero();
    this.idleTime = 0; this.t = 0; this.moveAmt = 0; this.bobPhase = 0;
    this.recoil = { p: 0, v: 0, r: 0, rv: 0, y: 0, yv: 0, shots: [] };
    this.slidePos = 0; this.slideLocked = false; this.fireT = 9; this.trigger = 0;
    this.pendingMode = null; this.onEvent = null; this.onFire = null;
    this.swayX = 0; this.swayY = 0;
    this.ads = false; this.adsK = 0; this.baseFov = this.camera.fov;
    this.lookVel = new THREE.Vector2();
    this.play(drawClip());
  }
  camWorld(v) { return v.clone().applyMatrix4(this.camera.matrixWorld); }
  get total() { return this.ammo.mag + this.ammo.chamber + this.ammo.reserve; }
  get busy() { return this.clip && !this.clip.cancelable; }
  play(clip) {
    this.blendFrom = { ...this.cur }; this.blendT = 0; this.clip = clip; this.ct = 0; this.firedEv = new Set();
  }
  input() { this.idleTime = 0; if (this.clip && this.clip.cancelable) { this.play({ dur: 0.25, keys: {}, events: [], name: 'cancel' }); } }
  // ---- actions ----
  fire() {
    if (this.mode !== 'gun' || this.busy || this.hidden) return false;
    this.input();
    if (this.fireT < 0.12) return false;
    if (this.ammo.chamber <= 0) { this.fireT = 0; this.trigger = 1; this.audio?.play('dryfire'); this.emit('dry'); return false; }
    this.ammo.chamber = 0; this.fireT = 0; this.trigger = 1;
    { // kick impulse: snap back + muzzle flip with random roll/yaw; rapid shots stack a little
      const R = this.recoil; const live = R.shots.filter(s => this.t - s.t < 0.25).length;
      R.shots.push({ t: this.t, k: 1 + Math.min(0.45, live * 0.18), roll: (Math.random() - 0.5) * 0.07, yaw: (Math.random() - 0.5) * 0.045, rise: 0.16 + Math.random() * 0.04 });
      if (R.shots.length > 8) R.shots.shift(); }
    this.slideCycle = 0;
    if (this.ammo.mag > 0) { this.ammo.mag--; this.ammo.chamber = 1; } else { this.slideLocked = true; }
    this.showFlash = 0.045;
    this.flash.material.rotation = Math.random() * 6.28; const s = 0.075 + Math.random() * 0.04; this.flash.scale.set(s, s, 1);
    this.spawnCasing(); this.spawnSmoke();
    this.audio?.play('gunshot');
    this.emit('fire'); this.onFire && this.onFire();
    return true;
  }
  reload() {
    if (this.mode !== 'gun' || this.busy || this.hidden) return false;
    this.input();
    if (this.ammo.reserve <= 0 || this.ammo.mag >= this.ammo.cap) return false;
    const empty = this.ammo.chamber === 0;
    this.play(reloadClip(empty)); this.emit(empty ? 'reloadEmpty' : 'reloadTac');
    return true;
  }
  inspect() { if (this.mode === 'gun' && !this.clip && !this.hidden) { this.play(inspectClip()); this.emit('inspect'); } }
  equip(mode) {
    if (this.busy || mode === this.mode) return;
    this.input(); this.pendingMode = mode;
    if (this.mode === 'gun') { this.play(holsterClip()); }
    else { this.torchAnim = { t: 0, dir: -1 }; }
  }
  // right mouse (or setADS from any input layer): raise the pistol so the red dot sits on the line of sight
  setADS(on) { on = !!on && this.mode === 'gun' && !this.hidden; if (on === this.ads) return; this.ads = on; if (on) this.input(); this.emit(on ? 'adsIn' : 'adsOut'); }
  bindInput(el) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => { if (e.button === 2) this.setADS(true); });
    window.addEventListener('mouseup', (e) => { if (e.button === 2) this.setADS(false); });
    window.addEventListener('blur', () => this.setADS(false));
  }
  // red-dot centre in gun space (the point that must land on the view axis when aiming)
  dotPoint() { const od = this.gun.userData.optic, dot = this.gun.userData.dot; const p = dot ? dot.position.clone() : new THREE.Vector3(0, 0.0102, -0.005); p.add(od.position); p.z += this.gun.userData.slideZ0 || 0; return p; }
  toggleTorch() { if (this.mode !== 'torch' || this.torchAnim) return; this.input(); this.torchOn = !this.torchOn; this.audio?.play('torchClick'); this.torchPress = 0.12; this.emit('torch'); }
  emit(n) { this.onEvent && this.onEvent(n); }
  // ---- effects ----
  spawnCasing() {
    const c = buildCasing(this.M); const ej = this.gun.userData.ejectPort; this.scene.add(c);
    ej.updateWorldMatrix(true, false); c.position.setFromMatrixPosition(ej.matrixWorld);
    c.quaternion.setFromRotationMatrix(this.gun.matrixWorld);
    const camQ = this.camera.quaternion; const v = new THREE.Vector3(1.1 + Math.random() * 0.4, 1.3 + Math.random() * 0.5, 0.25 + Math.random() * 0.3).applyQuaternion(camQ);
    this.casings.push({ m: c, v, w: new THREE.Vector3(Math.random() * 30, 20 + Math.random() * 20, Math.random() * 10), life: 0 });
    this.audio?.play('casing'); this.emit('casing');
  }
  spawnSmoke() {
    const mz = this.gun.userData.muzzle; mz.updateWorldMatrix(true, false);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0.18 }));
      s.position.setFromMatrixPosition(mz.matrixWorld); s.scale.setScalar(0.03); this.scene.add(s);
      this.smoke.push({ s, v: new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.04 + Math.random() * 0.05, -0.05 - Math.random() * 0.1).applyQuaternion(this.camera.quaternion), life: 0, max: 0.9 + Math.random() * 0.6 });
    }
  }
  dropMag() {
    const old = this.gun.userData.mag; old.updateWorldMatrix(true, false);
    const m = buildMagazine(this.M); m.userData.topRound.visible = this.ammo.mag > 0;
    this.scene.add(m); m.applyMatrix4(old.matrixWorld);
    this.loose.push({ m, v: new THREE.Vector3(0, -0.6, 0.1).applyQuaternion(this.camera.quaternion), w: new THREE.Vector3(2, 0, 3), life: 0 });
    this.emit('magDropped');
  }
  // ---- per-frame ----
  update(dt, ctx = {}) {
    this.t += dt; this.fireT += dt; this.idleTime += dt;
    const moving = ctx.moveAmt || 0; this.moveAmt += (moving - this.moveAmt) * Math.min(1, dt * 6);
    if (moving > 0.05 || ctx.looking) this.idleTime = Math.min(this.idleTime, 0), this.idleTime = 0;
    if (ctx.looking && this.clip && this.clip.cancelable) this.input();
    // torch equip/unequip animation
    if (this.torchAnim) {
      const a = this.torchAnim; a.t += dt / 0.45;
      if (a.t >= 1) {
        if (a.dir < 0) { this.torch.visible = false; this.torchOn = false; this.mode = 'none'; this.torchAnim = null; this.afterHide(); }
        else { this.torchAnim = null; this.mode = 'torch'; }
      }
    }
    // clip playback
    let ch = zero();
    if (this.clip) {
      this.ct += dt; const c = this.clip;
      for (const name of CH) if (c.keys[name]) ch[name] = sample(c.keys[name], this.ct);
      if (!c.keys.lgrip) ch.lgrip = 1;
      for (const [t, n] of c.events) if (this.ct >= t && !this.firedEv.has(t + n)) { this.firedEv.add(t + n); this.clipEvent(n); }
      if (this.ct >= c.dur) {
        const done = c.name; this.clip = null; this.idleTime = 0;
        if (done === 'holster') { this.hidden = true; this.afterHide(); }
        if (done === 'reloadTac' || done === 'reloadEmpty') this.emit('reloadDone');
      }
    } else ch.lgrip = 1;
    if (this.hidden) { ch.hide = 1; }
    if (this.blendT < 1) { this.blendT = Math.min(1, this.blendT + dt / 0.14); const k = ease(this.blendT); for (const n of CH) ch[n] = this.blendFrom[n] + (ch[n] - this.blendFrom[n]) * k; }
    this.cur = ch;
    // idle inspect after ~5 s still
    if (!this.clip && this.mode === 'gun' && !this.hidden && this.idleTime > 5.0 && !ctx.noInspect) this.inspect();
    // procedural: breathing sway, walk bob, look sway, recoil springs
    const br = Math.sin(this.t * 1.55) * 0.0022, br2 = Math.sin(this.t * 0.83 + 1.3) * 0.0014;
    this.bobPhase += dt * (6.6 * this.moveAmt + 0.0001);
    const bob = this.moveAmt; const bx = Math.sin(this.bobPhase) * 0.0075 * bob, by = -Math.abs(Math.cos(this.bobPhase)) * 0.0085 * bob;
    const lv = ctx.look || { x: 0, y: 0 };
    this.swayX += (THREE.MathUtils.clamp(-lv.x * 0.0009, -0.03, 0.03) - this.swayX) * Math.min(1, dt * 7);
    this.swayY += (THREE.MathUtils.clamp(lv.y * 0.0009, -0.03, 0.03) - this.swayY) * Math.min(1, dt * 7);
    const R = this.recoil; // critically-damped-ish springs
    // recoil profile per shot: 65 ms snap (ease-out), then a damped return (~200 ms) with a slight overshoot
    let kb = 0, kr = 0, kroll = 0, kyaw = 0;
    for (const s of R.shots) { const x = this.t - s.t; if (x < 0 || x > 0.6) continue;
      const f = x < 0.065 ? 1 - Math.pow(1 - x / 0.065, 2.4) : Math.exp(-(x - 0.065) / 0.062) * Math.cos((x - 0.065) * 7.5) - 0.05 * Math.sin(Math.min(Math.PI, (x - 0.065) * 12)) ;
      const fr = x < 0.075 ? 1 - Math.pow(1 - x / 0.075, 2.0) : Math.exp(-(x - 0.075) / 0.07) * Math.cos((x - 0.075) * 6.5);
      kb += s.k * f; kr += s.k * fr * s.rise; kroll += fr * s.roll; kyaw += fr * s.yaw; }
    R.p = kb; R.r = kr; R.y = kyaw; R.roll = kroll;
    // slide
    let slide = 0;
    if (this.slideCycle !== undefined) { this.slideCycle += dt; const sc = this.slideCycle; slide = sc < 0.022 ? sc / 0.022 : sc < 0.075 ? 1 - (sc - 0.022) / 0.053 : 0; if (this.slideLocked && sc >= 0.022) slide = 1; if (sc > 0.08) this.slideCycle = undefined; }
    if (this.slideLocked && this.slideCycle === undefined) slide = 1;
    if (this.clip && this.clip.keys.slide) slide = ch.slide;
    this.gun.userData.slide.position.z = (this.gun.userData.slideZ0 || 0) + slide * 0.024;
    // aim down sights blend (drops out during reloads / holster)
    const adsT = this.ads && this.mode === 'gun' && !this.hidden && !(this.clip && /reload|holster|inspect/.test(this.clip.name || '')) ? 1 : 0;
    if (!adsT && this.ads && this.clip && /reload|holster/.test(this.clip.name || '')) this.setADS(false);
    this.adsK += (adsT - this.adsK) * Math.min(1, dt * 11); const ak = ease(Math.min(1, Math.max(0, this.adsK)));
    if (Math.abs(this.camera.fov - (this.baseFov + (VM.ads.fov - this.baseFov) * ak)) > 0.01) { this.camera.fov = this.baseFov + (VM.ads.fov - this.baseFov) * ak; this.camera.updateProjectionMatrix(); }
    const sk = 1 - (1 - VM.ads.swayK) * ak; // sway/bob shrink in ADS
    // gun transform
    const g = this.gun; const hide = ch.hide;
    const dp = this.dotPoint(); const ap = new THREE.Vector3(0, -dp.y, -VM.ads.eye - dp.z);
    const hx = VM.gunPos.x + (ap.x - VM.gunPos.x) * ak, hy = VM.gunPos.y + (ap.y - VM.gunPos.y) * ak, hz = VM.gunPos.z + (ap.z - VM.gunPos.z) * ak;
    g.position.set(hx + ch.gx + (bx + this.swayX * 0.6) * sk, hy + ch.gy + (by + br + this.swayY * 0.5) * sk - hide * 0.5, hz + ch.gz + R.p * 0.05 * (1 - 0.4 * ak) + br2 * sk); g.position.y += R.r * 0.06 * (1 - 0.5 * ak);
    g.rotation.set(VM.gunRot.x * (1 - ak) + ch.grx + R.r * (1 - 0.35 * ak) + (br * 0.6 + this.swayY * 1.2) * sk, VM.gunRot.y * (1 - ak) + ch.gry + R.y + this.swayX * 1.4 * sk, VM.gunRot.z * (1 - ak) + ch.grz + (R.roll || 0) + Math.sin(this.bobPhase) * 0.02 * bob * sk);
    g.visible = hide < 0.99;
    // trigger + right hand
    this.trigger = Math.max(0, this.trigger - dt * 9);
    g.userData.trigger.rotation.x = -this.trigger * 0.25;
    const rp = this.fireT < 0.2 ? lerpPose(HAND_POSES.gripR, HAND_POSES.triggerR, Math.min(1, 1 - (this.fireT - 0.08) / 0.12)) : HAND_POSES.gripR;
    const rpose = this.fireT < 0.08 ? HAND_POSES.triggerR : rp;
    const tpress = ch.rthumb; const rpp = { ...rpose, t: [rpose.t[0] - 0.25 * tpress, rpose.t[1] - 0.35 * tpress, rpose.t[2] + 0.5 * tpress, rpose.t[3] + 0.3 * tpress, rpose.t[4] || 0, rpose.t[5] || 0] };
    poseHand(this.rh, rpp); this.rh.position.copy(VM.rh.p); this.rh.quaternion.copy(VM.rh.q || basisQuat(VM.rh.back, VM.rh.fwd));
    this.camera.updateMatrixWorld(); g.updateMatrixWorld(); // straight, locked wrist: forearm follows the hand
    // magazine travel
    const mag = g.userData.mag; const mv = ch.mag;
    mag.visible = mv < 5; mag.position.set(ch.mx, -Math.min(mv, MAGOUT + 0.3), ch.mz); mag.rotation.x = ch.mrx;
    // near guard: no part of the right hand/forearm closer than NEAR to the eye (push the gun group away)
    this.minCamDist = 9; this.minCamDistPost = 9; this.nearGuard(this.rh, g, ak > 0.5);
    // left hand: in gun space, transformed into root space
    this.updateLeft(ch); this.nearGuard(this.lh, this.lh);
    // flashlight
    this.updateTorch(dt, ch); if (this.torch.visible && this.torchHand) this.nearGuard(this.torchHand, this.torch);
    // muzzle flash
    if (this.showFlash > 0) { this.showFlash -= dt; this.flash.visible = this.flashSide.visible = true; this.flashLight.intensity = 2.2; this.gun.userData.muzzle.updateWorldMatrix(true, false); this.flashLight.position.setFromMatrixPosition(this.gun.userData.muzzle.matrixWorld); }
    else { this.flash.visible = this.flashSide.visible = false; this.flashLight.intensity = 0; }
    // casings / smoke / loose mags
    for (let i = this.casings.length - 1; i >= 0; i--) { const c = this.casings[i]; c.life += dt; c.v.y -= 9.8 * dt * 0.35; c.m.position.addScaledVector(c.v, dt * 0.35);
      c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; if (c.life > 1.4) { this.scene.remove(c.m); this.casings.splice(i, 1); } }
    for (let i = this.smoke.length - 1; i >= 0; i--) { const s = this.smoke[i]; s.life += dt; s.s.position.addScaledVector(s.v, dt); s.s.scale.setScalar(0.03 + s.life * 0.12); s.s.material.opacity = 0.16 * (1 - s.life / s.max); if (s.life > s.max) { this.scene.remove(s.s); this.smoke.splice(i, 1); } }
    for (let i = this.loose.length - 1; i >= 0; i--) { const c = this.loose[i]; c.life += dt; c.v.y -= 9.8 * dt * 0.4; c.m.position.addScaledVector(c.v, dt * 0.4); c.m.rotation.x += c.w.x * dt; c.m.rotation.z += c.w.z * dt; if (c.life > 1.2) { this.scene.remove(c.m); this.loose.splice(i, 1); } }
  }
  afterHide() {
    const m = this.pendingMode; this.pendingMode = null;
    if (m === 'torch') { this.hidden = true; this.torch.visible = true; this.torchAnim = { t: 0, dir: 1 }; this.mode = 'torchEquip'; this.emit('torchEquip'); }
    else if (m === 'gun') { this.hidden = false; this.mode = 'gun'; this.play(drawClip()); this.emit('draw'); }
    else if (m === 'none') { this.hidden = true; this.mode = 'none'; }
  }
  // Keeps every hand/forearm part at least VM.near (15 cm) from the eye. Samples the wrist, palm, fingertips and the
  // forearm (which extends +Z in hand space) as spheres; if one is too close, moves `mover` straight away from the eye.
  nearGuard(hand, mover, axial = false) {
    if (!hand.visible) return; const NEAR = VM.near;
    hand.updateWorldMatrix(true, false); const toCam = new THREE.Matrix4().copy(this.camera.matrixWorld).invert().multiply(hand.matrixWorld);
    let worst = 1e9, wp = null;
    for (const [x, y, z, r] of NEAR_SAMPLES) { const p = new THREE.Vector3(x, y, z).applyMatrix4(toCam); const d = p.length() - r; if (d < worst) { worst = d; wp = p; } }
    this.minCamDist = Math.min(this.minCamDist, worst);
    if (worst < NEAR && wp) { const push = axial ? new THREE.Vector3(0, 0, -(NEAR - worst) / Math.max(0.3, -wp.z / wp.length())) : wp.clone().normalize().multiplyScalar(NEAR - worst);
      // push is in camera space; mover's parent is the root (camera space) or the gun's parent
      mover.position.add(mover.parent === this.root || mover.parent === this.camera ? push : push.applyQuaternion(mover.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(this.camera.getWorldQuaternion(new THREE.Quaternion()))));
      mover.updateMatrixWorld(true); this.nearHits = (this.nearHits || 0) + 1;
      hand.updateWorldMatrix(true, false); toCam.copy(this.camera.matrixWorld).invert().multiply(hand.matrixWorld); let w2 = 1e9;
      for (const [x, y, z, r] of NEAR_SAMPLES) w2 = Math.min(w2, new THREE.Vector3(x, y, z).applyMatrix4(toCam).length() - r);
      this.minCamDistPost = Math.min(this.minCamDistPost, w2); }
    else this.minCamDistPost = Math.min(this.minCamDistPost, worst);
  }
  updateLeft(ch) {
    const lh = this.lh; const g = this.gun; const hide = ch.hide;
    lh.visible = hide < 0.99 && this.mode !== 'torch' && this.mode !== 'torchEquip';
    // base support pose in gun space + offsets
    const p = new THREE.Vector3(VM.lh.p.x + ch.lx, VM.lh.p.y + ch.ly, VM.lh.p.z + ch.lz);
    const e = new THREE.Euler(ch.lrx, ch.lry, ch.lrz);
    g.updateMatrix();
    const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromEuler(e).multiply(VM.lh.q || basisQuat(VM.lh.back, VM.lh.fwd)), new THREE.Vector3(1, 1, 1));
    m.premultiply(g.matrix); m.decompose(lh.position, lh.quaternion, lh.scale);
    if (ch.lhold > 0.001) {
      const mag = g.userData.mag; this.root.updateMatrixWorld(true);
      // hold pose = the (known-good) support pose carried along with the magazine's displacement from its seated spot,
      // turned a little palm-up so the fingers cup the baseplate
      const mp = new THREE.Vector3().setFromMatrixPosition(mag.matrixWorld); this.root.worldToLocal(mp);
      if (!this._magRest || ch.mag <= 0.0005) { this._magRest = this._magRest || new THREE.Vector3(); if (ch.mag <= 0.0005) this._magRest.copy(mp); }
      const P = lh.position.clone().add(mp.clone().sub(this._magRest));
      const gq = new THREE.Quaternion(); g.matrix.decompose(new THREE.Vector3(), gq, new THREE.Vector3());
      const Q = gq.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.35)).multiply(VM.lh.q || basisQuat(VM.lh.back, VM.lh.fwd));
      const k = ease(Math.min(1, ch.lhold)); lh.position.lerp(P, k); lh.quaternion.slerp(Q, k);
    }
    let pose = lerpPose(HAND_POSES.relaxed, HAND_POSES.supportL, THREE.MathUtils.clamp(ch.lgrip, 0, 1));
    if (ch.lpinch > 0) pose = lerpPose(pose, (ch.mag > 0.05 && ch.mag < 5) || ch.lpinch > 0 ? HAND_POSES.pinchL : HAND_POSES.holdMagL, Math.min(1, ch.lpinch));
    if (ch.lrack > 0) pose = lerpPose(pose, HAND_POSES.rackL, Math.min(1, ch.lrack));
    poseHand(lh, pose);
  }
  updateTorch(dt, ch) {
    const T = this.torch; if (!T.visible) { this.torchVM.intensity = 0; return; }
    let k = 1; if (this.torchAnim) k = this.torchAnim.dir > 0 ? easeOut(this.torchAnim.t) : 1 - easeIn(this.torchAnim.t);
    const br = Math.sin(this.t * 1.55) * 0.002; const bob = this.moveAmt;
    const bx = Math.sin(this.bobPhase) * 0.008 * bob, by = -Math.abs(Math.cos(this.bobPhase)) * 0.009 * bob;
    T.position.set(VM.torch.p.x + (1 - k) * 0.14 + bx + this.swayX * 0.6, VM.torch.p.y - (1 - k) * 0.26 + br + by + this.swayY * 0.5, VM.torch.p.z - (1 - k) * 0.05);
    T.rotation.set(VM.torch.r.x + (1 - k) * 0.55 + this.swayY * 1.2, VM.torch.r.y + this.swayX * 1.4, VM.torch.r.z - (1 - k) * 0.4);
    const bz = T.userData.buttonZ; if (this.torchPress > 0) { this.torchPress -= dt; T.userData.button.position.z = bz - 0.0015; } else T.userData.button.position.z = bz;
    // thumb on the tail switch
    this.torchHand.position.copy(VM.torchHand.p); this.torchHand.quaternion.copy(VM.torchHand.q || basisQuat(VM.torchHand.back, VM.torchHand.fwd));
    const tp = HAND_POSES.fistTorch; const sq = this.torchPress > 0 ? 0.06 : 0; poseHand(this.torchHand, { ...tp, f: tp.f.map(r => [r[0] + sq * 0.5, r[1] + sq, r[2] + sq]), t: [tp.t[0], tp.t[1], tp.t[2] + sq * 2, tp.t[3] + sq * 2, tp.t[4] || 0, tp.t[5] || 0] });
    this.aimTorchForearm();
    this.camera.updateMatrixWorld(); T.updateMatrixWorld();
    const on = this.torchOn && this.mode === 'torch';
    T.userData.lens.material.emissiveIntensity = on ? 1.5 : 0; T.userData.lens.material.opacity = on ? 0.55 : 0.18; if (T.userData.led) T.userData.led.material.emissiveIntensity = on ? 6 : 0;
    this.torchVM.intensity = on ? 1.2 : 0;
    T.userData.tip.updateWorldMatrix(true, false); this.torchVM.position.setFromMatrixPosition(T.userData.tip.matrixWorld);
    this.torchVM.target.position.copy(this.torchVM.position).add(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion));
  }
  aimTorchForearm() {
    // swing the forearm about the wrist toward a natural elbow (lower right, behind the hand), keeping the fist where the grip solver put it
    const h = this.torchHand, u = h.userData, hb = u.bones.hand, fb = u.bones.forearm; if (!hb || !fb) return;
    if (!u.hbRestP) u.hbRestP = hb.position.clone(); hb.position.copy(u.hbRestP);
    h.updateWorldMatrix(true, true);
    const desired = hb.matrixWorld.clone(); const W = new THREE.Vector3().setFromMatrixPosition(hb.matrixWorld);
    const Fp = new THREE.Vector3().setFromMatrixPosition(fb.matrixWorld); const cur = W.clone().sub(Fp).negate().normalize(); // wrist -> elbow side
    const cw = this.camera.matrixWorld; const elbow = VM.torchElbow.clone().applyMatrix4(cw);
    const want = elbow.sub(W).normalize(); const dir = cur.clone().lerp(want, VM.torchElbowK).normalize();
    const dq = new THREE.Quaternion().setFromUnitVectors(cur, dir);
    // rotate the hand root about the wrist (in world), then restore the hand bone's world pose
    const rootW = new THREE.Vector3(); h.getWorldPosition(rootW); const pq = h.parent.getWorldQuaternion(new THREE.Quaternion());
    const wq = h.getWorldQuaternion(new THREE.Quaternion()).premultiply(dq); const np = rootW.sub(W).applyQuaternion(dq).add(W);
    h.quaternion.copy(pq.clone().invert().multiply(wq)); h.position.copy(h.parent.worldToLocal(np)); h.updateWorldMatrix(true, true);
    const m = new THREE.Matrix4().copy(hb.parent.matrixWorld).invert().multiply(desired); const sc = new THREE.Vector3(); m.decompose(hb.position, hb.quaternion, sc);
    h.updateWorldMatrix(true, true);
  }
  clipEvent(n) {
    const a = this.audio;
    if (n === 'magRelease') { a?.play('magRelease'); }
    if (n === 'dropMag') { this.dropMag(); a?.play('magDrop'); }
    if (n === 'newMag') { const mag = this.gun.userData.mag; mag.userData.topRound.visible = true; a?.play('magPouch'); }
    if (n === 'magInsert') {
      a?.play('magInsert');
      const need = this.ammo.cap - this.ammo.mag; const take = Math.min(need, this.ammo.reserve);
      // dropped mag rounds are lost only if it still had some (they are kept in reserve here: realistic retention)
      this.ammo.reserve -= take; this.ammo.mag += take;
      this.emit('magInserted');
    }
    if (n === 'slideGrab') a?.play('slideGrab');
    if (n === 'slideRelease') { a?.play('slideRelease'); this.slideLocked = false; if (this.ammo.mag > 0 && this.ammo.chamber === 0) { this.ammo.mag--; this.ammo.chamber = 1; } }
    if (n === 'drawCloth') a?.play('draw');
  }
}
