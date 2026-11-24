// v7 field kit: emergency red road flares (thrown, bounce, burn ~35 s with a red light, smoke + sparks, hiss; the thing
// will not enter their light), flashlight battery, spare flare / battery pickups, the cabin door bolt, and the five
// Ranger Field Notes. Lights are pooled at boot (fixed light count = no shader recompiles).
import * as THREE from 'three';
import { height } from '../geo.js';
import { radialSprite } from '../textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const FLARE_R = 9, FLARE_LIFE = 35;
export const FIELD_NOTES = [
  { id: 'fn_tower', where: 'tower desk', title: 'Ranger Field Note 1: Tower desk', author: 'D. Marsh', text: 'Flares are in the red tin under the desk. Strike it, throw it, and stay inside the light. It hissed at mine like a cat and walked the edge of the glow until it burned out. Thirty-some seconds. Count them.' },
  { id: 'ranger', where: 'cabin table', title: 'Ranger Field Note 2: Cabin table', author: 'D. Marsh', text: '' },
  { id: 'fn_gen', where: 'generator shed', title: 'Ranger Field Note 3: Generator shed', author: 'R. Vance', text: 'Spare D-cells in the coffee can on the shelf. The flashlight dies faster in the cold. When it dims, get up to the cab, the charger runs off the generator. Do not let the light die out there.' },
  { id: 'camp', where: 'abandoned campsite', title: 'Ranger Field Note 4: Campsite', author: 'unsigned', text: '' },
  { id: 'fn_ridge', where: 'ridge trail post', title: 'Ranger Field Note 5: Ridge trail post', author: 'L. Hale', text: 'It does not like being looked at down a barrel. It slips behind the trees and comes around from the other side. Watch your flanks, not the place it was. Bolt the cabin door. It will try the door first, then the windows.' },
];
export class FieldKit {
  constructor(scene, { audio, SFX, phone }) {
    this.scene = scene; this.audio = audio; this.SFX = SFX; this.flares = []; this.count = 4; this.bat = 1; this.pickups = [];
    this.lights = []; for (let i = 0; i < (phone ? 1 : 2); i++) { const l = new THREE.PointLight(0xff2a12, 0, FLARE_R * 2.2, 1.4); l.position.set(0, -500, 0); scene.add(l); this.lights.push(l); }
    this.stickG = new THREE.CylinderGeometry(0.016, 0.016, 0.22, 10); this.stickM = new THREE.MeshStandardMaterial({ color: 0xb01810, roughness: 0.6 });
    this.capM = new THREE.MeshBasicMaterial({ color: 0xffd0b0, toneMapped: false });
    this.glowM = new THREE.SpriteMaterial({ map: radialSprite('rgba(255,120,90,1)', 'rgba(255,20,10,0)', 64), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    this.sparkM = new THREE.SpriteMaterial({ map: radialSprite('rgba(255,230,180,1)', 'rgba(255,90,40,0)', 32), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
    this.smokeM = new THREE.SpriteMaterial({ map: radialSprite('rgba(200,120,115,0.42)', 'rgba(160,100,100,0)', 64), transparent: true, depthWrite: false });
    try { this.noteNum = new Set(JSON.parse(localStorage.getItem('elgo.fieldnotes') || '[]')); } catch (e) { this.noteNum = new Set(); }
  }
  resetShift() { this.count = 4; for (const f of this.flares) this.kill(f); this.flares = []; for (const p of this.pickups) { p.taken = false; p.mesh.visible = true; } }
  throw(origin, dir, floorAt) {
    if (this.count <= 0) return false; this.count--;
    const g = new THREE.Group(); const st = new THREE.Mesh(this.stickG, this.stickM); st.rotation.x = Math.PI / 2; g.add(st); const cap = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), this.capM); cap.position.z = -0.11; g.add(cap);
    const glow = new THREE.Sprite(this.glowM); glow.scale.set(0.9, 0.9, 1); glow.position.z = -0.11; g.add(glow); g.position.copy(origin); this.scene.add(g);
    const f = { g, glow, v: dir.clone().multiplyScalar(10.5).add(V(0, 3.2, 0)), spin: V(Math.random() * 8, Math.random() * 8, 0), t: 0, rest: false, parts: [], sT: 0, hT: 0, floorAt };
    this.flares.push(f); this.SFX.hiss(this.audio, origin, 0.9, 0.7); this.audio.play('slideRelease', { vol: 0.4 }); return true;
  }
  kill(f) { this.scene.remove(f.g); for (const p of f.parts) this.scene.remove(p.s); }
  zones() { return this.flares.filter(f => f.t < FLARE_LIFE).map(f => ({ p: f.g.position, r: FLARE_R * Math.min(1, (FLARE_LIFE - f.t) / 3) })); }
  update(dt, cam) {
    for (const f of this.flares) {
      f.t += dt; const g = f.g;
      if (!f.rest) { f.v.y -= 9.8 * dt; g.position.addScaledVector(f.v, dt); g.rotation.x += f.spin.x * dt; g.rotation.y += f.spin.y * dt;
        const fy = (f.floorAt ? f.floorAt(g.position.x, g.position.z, g.position.y) : null) ?? height(g.position.x, g.position.z); if (g.position.y < fy + 0.02) { g.position.y = fy + 0.02;
          if (Math.abs(f.v.y) > 1.2) { f.v.y = -f.v.y * 0.35; f.v.x *= 0.55; f.v.z *= 0.55; f.spin.multiplyScalar(0.5); this.SFX.crunch && this.SFX.crunch(this.audio, g.position, 0.3); } else { f.rest = true; g.rotation.set(0, g.rotation.y, 0); } } }
      const life = Math.max(0, 1 - f.t / FLARE_LIFE), fl = 0.75 + 0.25 * Math.sin(f.t * 31) * Math.sin(f.t * 17.3);
      f.glow.scale.setScalar((0.6 + 0.5 * fl) * (life > 0 ? 1 : 0)); f.glow.material.opacity = 1;
      // smoke + sparks
      f.sT -= dt; if (life > 0 && f.sT <= 0) { f.sT = 0.09; for (let k = 0; k < 2; k++) { const smoke = k === 0; const s = new THREE.Sprite(smoke ? this.smokeM : this.sparkM); s.position.copy(g.position); this.scene.add(s);
        f.parts.push({ s, smoke, t: 0, life: smoke ? 3.2 : 0.5, v: smoke ? V((Math.random() - 0.5) * 0.3, 0.7 + Math.random() * 0.4, (Math.random() - 0.5) * 0.3) : V((Math.random() - 0.5) * 2.2, 1.5 + Math.random() * 1.8, (Math.random() - 0.5) * 2.2) }); } }
      for (let i = f.parts.length - 1; i >= 0; i--) { const p = f.parts[i]; p.t += dt; if (p.t > p.life) { this.scene.remove(p.s); f.parts.splice(i, 1); continue; } if (!p.smoke) p.v.y -= 6 * dt; p.s.position.addScaledVector(p.v, dt); const k = p.t / p.life;
        p.s.scale.setScalar(p.smoke ? 0.3 + k * 1.6 : 0.06 * (1 - k)); }
      f.hT -= dt; if (life > 0 && f.hT <= 0) { f.hT = 0.9; this.SFX.hiss(this.audio, g.position, 0.32, 1.0); }
    }
    for (let i = this.flares.length - 1; i >= 0; i--) { const f = this.flares[i]; if (f.t > FLARE_LIFE + 3.5) { this.kill(f); this.flares.splice(i, 1); } }
    // the lights go to the newest burning flares
    const burning = this.flares.filter(f => f.t < FLARE_LIFE).slice(-this.lights.length);
    this.lights.forEach((l, i) => { const f = burning[i]; if (!f) { l.intensity = 0; return; } const life = 1 - f.t / FLARE_LIFE; l.position.copy(f.g.position).add(V(0, 0.35, 0)); l.intensity = 9 * (0.8 + 0.2 * Math.sin(f.t * 29) * Math.sin(f.t * 13.1)) * Math.min(1, life * 6); });
  }
  // flashlight battery: ~4.5 min of light, recharges in the powered cab
  battery(dt, { on, charging }) { if (on) this.bat = Math.max(0, this.bat - dt / 270); if (charging) this.bat = Math.min(1, this.bat + dt / 45); return this.bat <= 0 ? 0 : this.bat < 0.15 ? 0.25 + 0.75 * (this.bat / 0.15) * (0.85 + 0.15 * Math.sin(performance.now() * 0.02)) : 1; }
  // a pickup (spare flare / battery / field note) rendered as a small prop, used through the interact list
  addPickup(kind, pos, { scene, onTake, label, rotY = 0, upright = false }) {
    let mesh; if (kind === 'flare') { mesh = new THREE.Group(); for (let k = 0; k < 2; k++) { const s = new THREE.Mesh(this.stickG, this.stickM); s.rotation.z = Math.PI / 2; s.position.set(0, 0.017, k * 0.04 - 0.02); mesh.add(s); } }
    else if (kind === 'battery') { mesh = new THREE.Group(); for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.06, 12), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.4 })); b.position.set(k * 0.038 - 0.019, 0.03, 0); mesh.add(b);
        const t = new THREE.Mesh(new THREE.CylinderGeometry(0.0172, 0.0172, 0.018, 12), new THREE.MeshStandardMaterial({ color: 0xc89020, roughness: 0.4, metalness: 0.6 })); t.position.set(k * 0.038 - 0.019, 0.05, 0); mesh.add(t); } }
    else { const c = document.createElement('canvas'); c.width = 128; c.height = 160; const x = c.getContext('2d'); x.fillStyle = '#e8dfc4'; x.fillRect(0, 0, 128, 160); x.fillStyle = '#2a4a2a'; x.fillRect(0, 0, 128, 18); x.fillStyle = '#e8dfc4'; x.font = 'bold 11px Arial'; x.fillText('USFS FIELD NOTE', 14, 13);
      x.strokeStyle = 'rgba(40,40,60,0.6)'; for (let y = 32; y < 150; y += 10) { x.beginPath(); x.moveTo(10, y); x.lineTo(40 + Math.random() * 78, y); x.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide })); if (!upright) mesh.rotation.x = -Math.PI / 2; else mesh.rotation.y = rotY; }
    if (kind !== 'note') mesh.rotation.y = rotY; mesh.position.copy(pos); (scene || this.scene).add(mesh);
    const P = { kind, mesh, taken: false }; this.pickups.push(P);
    return { id: 'pk_' + kind + this.pickups.length, pos: pos.clone().add(V(0, 0.1, 0)), r: 1.8, use: () => kind === 'note' ? 'READ' : 'TAKE', label, avail: () => !P.taken, press: () => { if (kind !== 'note') { P.taken = true; mesh.visible = false; } onTake && onTake(); } };
  }
  readNote(id) { this.noteNum.add(id); try { localStorage.setItem('elgo.fieldnotes', JSON.stringify([...this.noteNum])); } catch (e) {} return this.noteNum.size; }
}
