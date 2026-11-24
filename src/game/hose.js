// First-person forestry hose: pistol-grip fog nozzle on 1.5" yellow forestry hose, held in both hands (key 3 / HOSE).
import * as THREE from 'three';
import { buildHand, poseHand, HAND_POSES, aimForearm } from '../hands.js';
import { basisQuat } from '../viewmodel.js';
import { radialSprite } from '../textures.js';
import { rbox } from '../procedural.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export class HoseVM {
  constructor(vm) {
    this.vm = vm; this.g = new THREE.Group(); vm.camera.add(this.g); this.g.visible = false; this.k = 0; this.want = false; this.spray = false; this.sx = 0; this.sy = 0; this.t = 0;
    const alu = new THREE.MeshPhysicalMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.32, clearcoat: 0.2 });
    const red = new THREE.MeshPhysicalMaterial({ color: 0x8c1410, metalness: 0.4, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.4 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
    const brass = new THREE.MeshStandardMaterial({ color: 0xc09048, metalness: 1, roughness: 0.3 });
    const hoseM = new THREE.MeshStandardMaterial({ color: 0xc9a43a, roughness: 0.85 });
    // nozzle axis = -z
    const nz = this.nozzle = new THREE.Group(); this.g.add(nz);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.027, 0.2, 24), alu); body.rotation.x = Math.PI / 2; body.position.z = -0.08; nz.add(body);
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.027, 0.002, 6, 24), alu); r.position.z = -0.03 - i * 0.012; nz.add(r); } // knurled grip rings
    const bumper = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.032, 0.05, 24), rubber); bumper.rotation.x = Math.PI / 2; bumper.position.z = -0.2; nz.add(bumper);
    for (let i = 0; i < 10; i++) { const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 0.02), rubber); const a = i / 10 * Math.PI * 2; tooth.position.set(Math.cos(a) * 0.036, Math.sin(a) * 0.036, -0.225); nz.add(tooth); }
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.02, 18), alu); tip.rotation.x = Math.PI / 2; tip.position.z = -0.232; nz.add(tip);
    const cpl = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.035, 6), brass); cpl.rotation.x = Math.PI / 2; cpl.position.z = 0.035; nz.add(cpl); // hex coupling
    const grip = new THREE.Mesh(rbox(0.032, 0.11, 0.042, 0.01, 2), red); grip.position.set(0, -0.06, 0.0); grip.rotation.x = 0.25; nz.add(grip);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.0055, 8, 20, Math.PI), red); bail.position.set(0, 0.018, -0.07); bail.rotation.set(0, Math.PI / 2, 0); nz.add(bail); this.bail = bail;
    const tipM = new THREE.Object3D(); tipM.position.z = -0.25; nz.add(tipM); this.tip = tipM;
    // hose: out the back, curving down out of frame
    const curve = new THREE.CatmullRomCurve3([V(0, 0, 0.05), V(0, -0.02, 0.18), V(0.02, -0.14, 0.3), V(0.05, -0.45, 0.38)]);
    const hose = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.024, 12), hoseM); nz.add(hose);
    // mist cone at the tip while spraying
    this.mist = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSprite('rgba(230,240,250,0.8)', 'rgba(230,240,250,0)', 64), transparent: true, depthWrite: false, opacity: 0 })); this.mist.position.z = -0.32; this.mist.scale.set(0.16, 0.16, 1); nz.add(this.mist);
    // hands
    this.rh = buildHand('R'); nz.add(this.rh); poseHand(this.rh, HAND_POSES.gripR);
    this.rh.position.set(0.018, -0.03, 0.035); this.rh.quaternion.copy(basisQuat(V(1, 0.1, 0.25), V(-0.1, -0.35, -0.93)));
    this.lh = buildHand('L'); nz.add(this.lh); poseHand(this.lh, HAND_POSES.fistTorch);
    this.lh.position.set(-0.034, 0.012, -0.11); this.lh.quaternion.copy(basisQuat(V(-0.55, 0.83, 0.05), V(0.85, 0.35, -0.38)));
    this.g.traverse(o => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; } });
    this.base = V(0.11, -0.13, -0.38);
  }
  show(on) { this.want = on; if (on) this.g.visible = true; }
  get active() { return this.want && this.k > 0.9; }
  update(dt, ctx = {}) {
    this.t += dt; this.k += ((this.want ? 1 : 0) - this.k) * Math.min(1, dt * 7); if (!this.want && this.k < 0.02) { this.g.visible = false; return; }
    const lv = ctx.look || { x: 0, y: 0 };
    this.sx += (THREE.MathUtils.clamp(-lv.x * 0.0009, -0.03, 0.03) - this.sx) * Math.min(1, dt * 7); this.sy += (THREE.MathUtils.clamp(lv.y * 0.0009, -0.03, 0.03) - this.sy) * Math.min(1, dt * 7);
    const br = Math.sin(this.t * 1.5) * 0.002; const mv = ctx.moveAmt || 0; const bob = Math.sin(this.t * 7) * 0.006 * mv;
    const push = this.spray ? 0.012 + Math.sin(this.t * 61) * 0.0012 : 0; // nozzle reaction under pressure (hands only, never the camera)
    this.nozzle.position.set(this.base.x + this.sx * 0.6 + bob, this.base.y + br + this.sy * 0.5 - (1 - this.k) * 0.4 - Math.abs(bob) * 0.5, this.base.z + push);
    this.nozzle.rotation.set(0.06 + this.sy * 1.2 - (1 - this.k) * 0.8, 0.08 + this.sx * 1.3, -0.05);
    this.bail.rotation.z = this.spray ? -0.9 : 0; // bail pulled back = open
    this.mist.material.opacity += ((this.spray ? 0.45 : 0) - this.mist.material.opacity) * Math.min(1, dt * 12); const ms = 0.12 + Math.random() * 0.06; this.mist.scale.set(ms, ms, 1);
    this.vm.camera.updateMatrixWorld(); this.g.updateMatrixWorld(true);
    for (const [h, e] of [[this.rh, V(0.2, -0.45, 0.05)], [this.lh, V(-0.2, -0.4, 0.05)]]) aimForearm(h, this.vm.camera.localToWorld(e.clone()));
  }
  // nozzle tip position + direction in the viewmodel camera's space
  tipLocal() { this.tip.updateWorldMatrix(true, false); const inv = this.vm.camera.matrixWorld.clone().invert(); const p = V(0, 0, 0).setFromMatrixPosition(this.tip.matrixWorld).applyMatrix4(inv);
    const d = V(0, 0, -1).transformDirection(this.tip.matrixWorld).transformDirection(inv); return { p, d }; }
}
