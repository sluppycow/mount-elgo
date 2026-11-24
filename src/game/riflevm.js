// First-person .308 bolt rifle (key 2 / RIFLE once picked up at the ranger cabin): both hands on the stock, scope with
// ADS, bolt cycling with brass ejection, detachable 5-round box magazine. Recoil moves only the rifle and the hands;
// the player camera never moves.
import * as THREE from 'three';
import { buildHand, poseHand, lerpPose, HAND_POSES, aimForearm } from '../hands.js';
import { basisQuat } from '../viewmodel.js';
import { flashSprite, radialSprite } from '../textures.js';
import { buildRifle, buildRifleRound, rifleMaterials, RIFLE } from '../rifle.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
const seg = (t, a, b) => ease((t - a) / (b - a));
export const RIFLE_HANDS = { // tunables (rifle space: -z = muzzle, +y = up)
  rPos: V(0.016, -0.03, 0.155), rBack: V(1, 0.05, 0.3), rFwd: V(-0.1, -0.5, -0.86),
  lPos: V(-0.03, -0.032, -0.245), lBack: V(-0.6, 0.78, 0.1), lFwd: V(0.8, 0.45, -0.38),
};
export class RifleVM {
  constructor(vm, audio) {
    this.vm = vm; this.audio = audio; this.g = new THREE.Group(); vm.camera.add(this.g); this.g.visible = false; this.k = 0; this.want = false; this.t = 0; this.sx = 0; this.sy = 0;
    this.M = rifleMaterials(); this.holder = new THREE.Group(); this.g.add(this.holder); this.rifle = buildRifle(this.M, { light: true }); this.holder.add(this.rifle); const U = this.U = this.rifle.userData;
    this.ammo = { mag: 0, chamber: 0, reserve: 0, cap: RIFLE.magCap }; this.ads = false; this.adsK = 0; this.busy = null; this.recoil = 0; this.recV = 0; this.lightOn = false; this.onEvent = null; this.casings = [];
    // hands
    this.rh = buildHand('R'); this.rifle.add(this.rh); this.lh = buildHand('L'); this.rifle.add(this.lh); this.placeHands();
    // muzzle flash (sprite + side petals) and a local light on the hands
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashSprite(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false })); this.flash.visible = false; U.muzzle.add(this.flash); this.flash.position.z = -0.05;
    this.petal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.08), new THREE.MeshBasicMaterial({ map: this.flash.material.map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, side: THREE.DoubleSide }));
    this.petal.rotation.y = Math.PI / 2; this.petal.position.z = -0.1; this.petal.visible = false; U.muzzle.add(this.petal);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 2); vm.scene.add(this.flashLight); this.flashT = 0;
    this.smokeTex = radialSprite('rgba(200,200,200,0.5)', 'rgba(200,200,200,0)', 64); this.smoke = [];
    this.tip = new THREE.Object3D(); this.tip.position.set(0, 0, -0.075); U.light.add(this.tip);
    this.lens = U.light.children.find(o => o.isMesh && o.material && o.material.emissive) || null;
    this.g.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    this.hip = V(0.135, -0.128, -0.42); this.hipRot = V(0.02, 0.03, -0.05);
    this.adsPos = V(0, -RIFLE.scopeY, -RIFLE.eyeZ - 0.075);
  }
  placeHands() { const H = RIFLE_HANDS;
    poseHand(this.rh, HAND_POSES.triggerR); this.rh.position.copy(H.rPos); this.rh.quaternion.copy(basisQuat(H.rBack.clone().normalize(), H.rFwd.clone().normalize()));
    poseHand(this.lh, HAND_POSES.supportL); this.lh.position.copy(H.lPos); this.lh.quaternion.copy(basisQuat(H.lBack.clone().normalize(), H.lFwd.clone().normalize())); }
  emit(n) { this.onEvent && this.onEvent(n); }
  get total() { return this.ammo.mag + this.ammo.chamber + this.ammo.reserve; }
  show(on) { this.want = on; if (on) { this.g.visible = true; this.audio?.play('slideGrab', { vol: 0.4 }); } else { this.ads = false; } }
  get active() { return this.want && this.k > 0.9 && !this.busy; }
  setADS(on) { this.ads = !!on && this.want && !(this.busy && this.busy.kind === 'reload'); }
  fire() {
    if (!this.want || this.k < 0.9 || this.busy) return false;
    if (!this.ammo.chamber) { this.audio?.play('dryfire'); if (this.ammo.mag) this.cycle(); else if (this.ammo.reserve) this.reload(); return false; }
    this.ammo.chamber = 0; this.recV += 9.5; this.flashT = 0.05; this.flash.material.rotation = Math.random() * 6.28; const s = 0.16 + Math.random() * 0.06; this.flash.scale.set(s, s, 1);
    this.audio?.play('rifleShot'); this.spawnSmoke(); this.emit('fire');
    this.busy = { kind: 'pause', t: 0, d: 0.32, then: () => this.cycle() }; return true;
  }
  cycle() { this.busy = { kind: 'bolt', t: 0, d: 0.78, ejected: false, fed: false }; this.audio?.play('rifleBolt'); }
  reload() { if (!this.want || this.busy || this.ammo.mag >= this.ammo.cap || !this.ammo.reserve) return false; this.ads = false; this.busy = { kind: 'reload', t: 0, d: 2.3, out: false, in: false }; this.audio?.play('rifleMagOut', { delay: 0.35 }); this.emit('reload'); return true; }
  toggleLight() { this.lightOn = !this.lightOn; this.audio?.play('torchClick'); }
  spawnCasing(spent = true) { const c = buildRifleRound(this.M, spent); this.vm.scene.add(c); this.U.ejectPort.updateWorldMatrix(true, false); c.position.setFromMatrixPosition(this.U.ejectPort.matrixWorld); c.quaternion.setFromRotationMatrix(this.rifle.matrixWorld);
    const v = V(1.3 + Math.random() * 0.4, 1.0 + Math.random() * 0.5, 0.35).applyQuaternion(this.vm.camera.quaternion); this.casings.push({ m: c, v, w: V(Math.random() * 20, 18 + Math.random() * 14, Math.random() * 8), life: 0 }); this.emit('casing'); }
  spawnSmoke() { const mz = this.U.muzzle; mz.updateWorldMatrix(true, false); for (let i = 0; i < 4; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.smokeTex, transparent: true, depthWrite: false, opacity: 0.22 }));
    s.position.setFromMatrixPosition(mz.matrixWorld); s.scale.setScalar(0.05); this.vm.scene.add(s); this.smoke.push({ s, v: V((Math.random() - 0.5) * 0.08, 0.05 + Math.random() * 0.06, -0.1 - Math.random() * 0.2).applyQuaternion(this.vm.camera.quaternion), life: 0, max: 1.1 + Math.random() * 0.6 }); } }
  update(dt, ctx = {}) {
    this.t += dt; this.k += ((this.want ? 1 : 0) - this.k) * Math.min(1, dt * 6); if (!this.want && this.k < 0.02) { this.g.visible = false; this.adsK = 0; this.flashLight.intensity = 0; return; }
    const U = this.U; const lv = ctx.look || { x: 0, y: 0 };
    // action timeline
    let boltBack = 0, boltLift = 0, magDrop = 0, tilt = 0, rhOnBolt = 0, lhOnMag = 0;
    const b = this.busy; if (b) { b.t += dt; const t = b.t;
      if (b.kind === 'bolt') { rhOnBolt = seg(t, 0, 0.12) * (1 - seg(t, 0.64, 0.78)); boltLift = seg(t, 0.1, 0.2) * (1 - seg(t, 0.52, 0.62)); boltBack = seg(t, 0.2, 0.34) * (1 - seg(t, 0.4, 0.52)); tilt = 0.12 * rhOnBolt;
        if (!b.ejected && t > 0.32) { b.ejected = true; if (this.ejectSpent !== false) this.spawnCasing(this._spent !== false); this._spent = true; }
        if (!b.fed && t > 0.46) { b.fed = true; if (this.ammo.mag > 0) { this.ammo.mag--; this.ammo.chamber = 1; } } }
      if (b.kind === 'reload') { tilt = 0.28 * seg(t, 0, 0.3) * (1 - seg(t, 1.9, 2.3)); lhOnMag = seg(t, 0.2, 0.45) * (1 - seg(t, 1.75, 2.0)); magDrop = seg(t, 0.45, 0.75) * (1 - seg(t, 1.25, 1.6));
        if (!b.out && t > 0.6) { b.out = true; }
        if (!b.in && t > 1.55) { b.in = true; const n = Math.min(this.ammo.cap - this.ammo.mag, this.ammo.reserve); this.ammo.mag += n; this.ammo.reserve -= n; this.audio?.play('rifleMagIn'); this.emit('reloadDone'); } }
      if (t >= b.d) { this.busy = null; if (b.then) b.then(); else if (b.kind === 'reload' && !this.ammo.chamber && this.ammo.mag) { this._spent = false; this.ejectSpent = false; this.cycle(); this.ejectSpent = true; } } }
    U.bolt.position.z = boltBack * RIFLE.boltTravel; U.boltHandle.rotation.z = boltLift * 1.25; U.mag.position.copy(U.magHome).add(V(0, -0.16 * magDrop, 0.02 * magDrop)); U.mag.rotation.x = magDrop * 0.3;
    // recoil spring (weapon only)
    this.recV += (-this.recoil * 120 - this.recV * 16) * dt; this.recoil += this.recV * dt;
    this.adsK += ((this.ads ? 1 : 0) - this.adsK) * Math.min(1, dt * 9);
    const sw = 1 - this.adsK * 0.8;
    this.sx += (THREE.MathUtils.clamp(-lv.x * 0.0008, -0.03, 0.03) - this.sx) * Math.min(1, dt * 6); this.sy += (THREE.MathUtils.clamp(lv.y * 0.0008, -0.03, 0.03) - this.sy) * Math.min(1, dt * 6);
    const mv = ctx.moveAmt || 0; const bob = Math.sin(this.t * 7) * 0.007 * mv * sw; const br = Math.sin(this.t * 1.4) * 0.0018 * (1 - this.adsK * 0.6);
    const p = this.hip.clone().lerp(this.adsPos, this.adsK); const r = this.hipRot.clone().multiplyScalar(1 - this.adsK);
    this.holder.position.set(p.x + (this.sx * 0.6 + bob) * sw, p.y + br + this.sy * 0.5 * sw - Math.abs(bob) * 0.5 - (1 - this.k) * 0.45 - tilt * 0.12, p.z + this.recoil * 0.06);
    this.holder.rotation.set(r.x + this.sy * 1.1 * sw + this.recoil * 0.14 - (1 - this.k) * 0.9 + tilt * 0.4, r.y + this.sx * 1.2 * sw, r.z - tilt * 1.4);
    // hands follow the action
    const H = RIFLE_HANDS; const kn = U.knob.getWorldPosition(V(0, 0, 0)); this.rifle.worldToLocal(kn);
    this.rh.position.copy(H.rPos).lerp(kn.clone().add(V(0.012, -0.012, 0.03)), rhOnBolt); poseHand(this.rh, lerpPose(HAND_POSES.triggerR, HAND_POSES.pinchL || HAND_POSES.gripR, rhOnBolt * 0.8));
    const magP = U.mag.position.clone().add(V(-0.02, -0.05, 0.0)); this.lh.position.copy(H.lPos).lerp(magP, lhOnMag); poseHand(this.lh, lerpPose(HAND_POSES.supportL, HAND_POSES.holdMagL || HAND_POSES.supportL, lhOnMag));
    // flash
    if (this.flashT > 0) { this.flashT -= dt; this.flash.visible = this.petal.visible = true; U.muzzle.updateWorldMatrix(true, false); this.flashLight.position.setFromMatrixPosition(U.muzzle.matrixWorld); this.flashLight.intensity = 4; }
    else { this.flash.visible = this.petal.visible = false; this.flashLight.intensity = 0; }
    for (let i = this.casings.length - 1; i >= 0; i--) { const c = this.casings[i]; c.life += dt; c.v.y -= 9.8 * dt * 0.6; c.m.position.addScaledVector(c.v, dt); c.m.rotation.x += c.w.x * dt; c.m.rotation.y += c.w.y * dt; if (c.life > 0.9) { this.vm.scene.remove(c.m); this.casings.splice(i, 1); } }
    for (let i = this.smoke.length - 1; i >= 0; i--) { const s = this.smoke[i]; s.life += dt; s.s.position.addScaledVector(s.v, dt); s.s.scale.setScalar(0.05 + s.life * 0.25); s.s.material.opacity = 0.22 * (1 - s.life / s.max); if (s.life > s.max) { this.vm.scene.remove(s.s); s.s.material.dispose(); this.smoke.splice(i, 1); } }
    this.vm.camera.updateMatrixWorld(); this.g.updateMatrixWorld(true);
    for (const [h, e] of [[this.rh, V(0.22, -0.5, 0.12)], [this.lh, V(-0.16, -0.45, -0.05)]]) aimForearm(h, this.vm.camera.localToWorld(e.clone()));
  }
  // weapon-light tip position / direction in the viewmodel camera's space
  lightLocal() { this.tip.updateWorldMatrix(true, false); const inv = this.vm.camera.matrixWorld.clone().invert(); const p = V(0, 0, 0).setFromMatrixPosition(this.tip.matrixWorld).applyMatrix4(inv);
    const d = V(0, 0, -1).transformDirection(this.tip.matrixWorld).transformDirection(inv); return { p, d }; }
}
