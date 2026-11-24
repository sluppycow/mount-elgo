// A ground-scale wildfire you can walk up to: licking flame sheets, burning brush, ember glow on the ground, a real smoke
// column, flickering firelight; it shrinks under the hose with steam and hiss until it is out. Plus the pressurized hose stream.
import * as THREE from 'three';
import { height } from '../geo.js';
import { smokeAtlas } from '../procedural.js';
import { radialSprite } from '../textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
let _flame = null;
function flameAtlas() { // 4 frames of a ragged teardrop flame: white-yellow core, orange body, dark red tongues
  if (_flame) return _flame; const S = 128, c = document.createElement('canvas'); c.width = S * 4; c.height = S * 2; const x = c.getContext('2d');
  for (let f = 0; f < 4; f++) { const ox = f * S; const img = x.createImageData(S, S * 2); const d = img.data; const ph = f * 1.7;
    for (let j = 0; j < S * 2; j++) for (let i = 0; i < S; i++) { const u = (i - S / 2) / (S / 2), v = 1 - j / (S * 2); // v: 0 bottom .. 1 top
      const wob = Math.sin(v * 9 + ph) * 0.12 * v + Math.sin(v * 23 + ph * 2.3) * 0.05 * v; const w = Math.max(0.0001, (1 - v) ** 0.7 * (0.95 - 0.3 * v) * (0.85 + 0.15 * Math.sin(v * 5 + ph)));
      const r = Math.abs(u + wob) / w; let a = Math.max(0, 1 - r) * Math.min(1, v * 6) * (1 - v ** 3);
      const tongue = Math.max(0, Math.sin(u * 7 + v * 13 + ph * 3)) * v; a *= 1 - 0.55 * tongue; const k = (j * S + i) * 4; const core = Math.max(0, 1 - r * 1.8) * (1 - v);
      d[k] = 255; d[k + 1] = Math.min(255, 90 + 150 * core + 60 * (1 - v)); d[k + 2] = Math.min(255, 20 + 200 * core * core); d[k + 3] = Math.min(255, a * 255 * 1.3); }
    x.putImageData(img, ox, 0); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return (_flame = t);
}
export class NearFire {
  constructor(scene, pos, opts = {}) {
    this.scene = scene; this.g = new THREE.Group(); this.pos = pos.clone(); this.pos.y = height(pos.x, pos.z); this.g.position.copy(this.pos); scene.add(this.g);
    this.R = opts.radius || 3.4; this.hp = 1; this.t = 0; this.out = false; this.steam = []; this.hitT = 0; this.sound = opts.sound;
    const FA = flameAtlas(); const frames = [0, 1, 2, 3].map(q => { const t = FA.clone(); t.repeat.set(0.25, 1); t.offset.set(q * 0.25, 0); t.needsUpdate = true; return t; });
    this.flames = [];
    for (let i = 0; i < 22; i++) { const a = Math.random() * 6.28, r = Math.sqrt(Math.random()) * this.R * 0.9; const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const m = new THREE.SpriteMaterial({ map: frames[i % 4], color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9, fog: false });
      const s = new THREE.Sprite(m); s.center.set(0.5, 0.02); const h = 1.2 + Math.random() * 2.4 * (1 - r / this.R * 0.5); s.userData = { x, z, h, ph: Math.random() * 6.28, fr: frames, k: i % 4, sp: 7 + Math.random() * 6 };
      s.position.set(x, height(pos.x + x, pos.z + z) - this.pos.y, z); s.scale.set(h * 0.55, h, 1); this.g.add(s); this.flames.push(s); }
    // burning brush + charred logs
    const char = new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.95, emissive: 0xff4a10, emissiveIntensity: 0.35 }); this.charMat = char;
    for (let i = 0; i < 9; i++) { const L = 0.8 + Math.random() * 1.6; const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05 + Math.random() * 0.06, 0.08, L, 7), char); const a = Math.random() * 6.28, r = Math.random() * this.R * 0.8;
      m.position.set(Math.cos(a) * r, height(pos.x + Math.cos(a) * r, pos.z + Math.sin(a) * r) - this.pos.y + 0.06, Math.sin(a) * r); m.rotation.set(Math.PI / 2 - 0.15, Math.random() * 3, Math.random() * 0.3); this.g.add(m); }
    // glowing ember bed on the ground (and the scorched ring left behind)
    const bed = new THREE.Mesh(new THREE.CircleGeometry(this.R * 1.25, 32), new THREE.MeshBasicMaterial({ map: radialSprite('rgba(255,120,30,0.9)', 'rgba(120,20,0,0)', 128), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = 0.08; this.g.add(bed); this.bed = bed;
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(this.R * 1.4, 32), new THREE.MeshStandardMaterial({ map: radialSprite('rgba(10,8,6,0.95)', 'rgba(10,8,6,0)', 128), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }));
    scorch.rotation.x = -Math.PI / 2; scorch.position.y = 0.05; this.g.add(scorch);
    // firelight
    this.light = new THREE.PointLight(0xff8a3a, 60, 38, 1.7); this.light.position.set(0, 2.2, 0); this.g.add(this.light);
    // smoke column + steam
    const SA = smokeAtlas(); this.atl = [0, 1, 2, 3].map(q => { const t = SA.clone(); t.repeat.set(0.5, 0.5); t.offset.set((q % 2) * 0.5, (q >> 1) * 0.5); t.needsUpdate = true; return t; });
    this.puffs = []; for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.atl[i % 4], color: 0x6c6862, transparent: true, opacity: 0.5, depthWrite: false })); s.userData = { u: i / 26, r0: Math.random() * 6.28, j: Math.random() }; this.g.add(s); this.puffs.push(s); }
    const eg = new THREE.BufferGeometry(); this.nE = 70; this.ep = new Float32Array(this.nE * 3); this.eu = Float32Array.from({ length: this.nE }, () => Math.random()); eg.setAttribute('position', new THREE.BufferAttribute(this.ep, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffa040, size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); this.embers.frustumCulled = false; this.g.add(this.embers);
    this.loop = this.sound && this.sound.loop ? this.sound.loop(this.pos.clone().add(V(0, 1, 0))) : null;
  }
  get top() { return this.pos.clone().add(V(0, 20, 0)); }
  // water arriving at world point p: returns true if it hit the fire
  douse(p, k = 1) { if (this.out) return false; const dx = p.x - this.pos.x, dz = p.z - this.pos.z; const r = Math.hypot(dx, dz); const sz = this.R * (0.35 + 0.65 * this.hp) + 0.6;
    if (r > sz || p.y > this.pos.y + 3.2 * (0.3 + 0.7 * this.hp) + 0.5) return false; this.hp = Math.max(0, this.hp - 0.0016 * k); this.hitT = 0.25; if (Math.random() < 0.18) this.puffSteam(p);
    if (this.hp <= 0 && !this.out) { this.out = true; this.outT = 0; this.onOut && this.onOut(); } return true; }
  puffSteam(p) { if (this.steam.length > 40) return; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.atl[Math.floor(Math.random() * 4)], color: 0xe8ecef, transparent: true, opacity: 0.0, depthWrite: false }));
    s.position.copy(p).sub(this.pos); s.position.y = Math.max(0.3, s.position.y); this.g.add(s); this.steam.push({ s, life: 0, max: 1.8 + Math.random(), v: V((Math.random() - 0.5) * 0.4, 1.6 + Math.random(), (Math.random() - 0.5) * 0.4) }); }
  update(dt) {
    this.t += dt; const t = this.t; const k = this.hp; this.hitT -= dt; if (this.out) this.outT += dt;
    const ks = Math.max(0, k) ** 0.8;
    for (const s of this.flames) { const d = s.userData; const shrink = Math.max(0, Math.min(1, ks * 1.15 - (Math.hypot(d.x, d.z) / this.R) * (1 - ks) * 0.9));
      const f = 0.75 + 0.25 * Math.sin(t * d.sp + d.ph) * Math.sin(t * (d.sp * 0.37) + d.ph * 2); const h = d.h * shrink * f; s.visible = h > 0.05; s.scale.set(h * 0.55 * (0.9 + 0.2 * Math.sin(t * 3 + d.ph)), h, 1);
      if (Math.random() < dt * 10) { d.k = (d.k + 1) % 4; s.material.map = d.fr[d.k]; } s.material.opacity = 0.85 * Math.min(1, shrink * 3); }
    const fl = 0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7.7 + 1);
    this.light.intensity = 70 * ks * fl + (this.out ? 0 : 3); this.light.position.x = Math.sin(t * 5) * 0.3; this.bed.material.opacity = 0.25 + 0.75 * ks * fl; this.charMat.emissiveIntensity = 0.15 + 0.6 * ks * fl;
    for (const s of this.puffs) { const d = s.userData; const u = (d.u + t * 0.05) % 1; const hh = 1.5 + u * 34; const w = 2 + u * 14 + d.j * 3;
      s.position.set(Math.sin(u * 6 + d.r0 + t * 0.2) * (0.6 + u * 4) + u * 9, hh, Math.cos(u * 5 + d.r0) * (0.6 + u * 3) + u * 4); s.scale.set(w, w * 0.9, 1); s.material.rotation = d.r0 + u * 2;
      const lo = Math.max(0, 1 - u * 4); s.material.color.setRGB(0.36 + 0.5 * lo * ks, 0.33 + 0.18 * lo * ks, 0.3 + 0.05 * lo * ks); const fade = this.out ? Math.max(0, 1 - this.outT / 10) : 1;
      s.material.opacity = 0.55 * Math.min(1, u * 6) * (1 - u) ** 1.3 * (0.25 + 0.75 * Math.max(ks, this.out ? 0.3 : 0)) * fade; }
    for (let i = 0; i < this.nE; i++) { const u = (this.eu[i] + t * 0.35) % 1; this.ep[i * 3] = Math.sin(i * 7.1 + u * 4) * this.R * 0.6 * (1 - u * 0.5) + u * 3; this.ep[i * 3 + 1] = 0.5 + u * 12; this.ep[i * 3 + 2] = Math.cos(i * 3.3 + u * 2) * this.R * 0.5; }
    this.embers.geometry.attributes.position.needsUpdate = true; this.embers.material.opacity = 0.9 * ks;
    for (let i = this.steam.length - 1; i >= 0; i--) { const s = this.steam[i]; s.life += dt; s.s.position.addScaledVector(s.v, dt); const a = s.life / s.max; s.s.scale.setScalar(0.8 + a * 4); s.s.material.opacity = 0.45 * Math.sin(Math.min(1, a) * Math.PI); if (a >= 1) { this.g.remove(s.s); s.s.material.dispose(); this.steam.splice(i, 1); } }
    if (this.loop) this.loop.set(Math.max(0.05, ks));
  }
  dispose() { this.g.parent && this.g.parent.remove(this.g); this.loop && this.loop.stop(); this.loop = null; }
}

// pressurized water from the nozzle: pooled droplets with gravity + a soft mist sprite at the tip
export class HoseStream {
  constructor(scene) {
    this.scene = scene; this.N = 260; this.p = new Float32Array(this.N * 3); this.v = new Float32Array(this.N * 3); this.life = new Float32Array(this.N).fill(9); this.i = 0;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.p, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ map: radialSprite('rgba(235,245,255,0.95)', 'rgba(200,220,240,0)', 32), color: 0xcfe0ee, size: 0.16, transparent: true, opacity: 0.75, depthWrite: false, sizeAttenuation: true }));
    this.pts.frustumCulled = false; scene.add(this.pts); this.acc = 0; this.on = false;
    this.splash = []; this.splashTex = radialSprite('rgba(230,240,250,0.7)', 'rgba(230,240,250,0)', 64);
  }
  update(dt, nozzle, dir, fire, onHit) {
    if (this.on && nozzle) { this.acc += dt * 110; while (this.acc > 1) { this.acc--; const i = this.i = (this.i + 1) % this.N; const sp = 15 + Math.random() * 2.5; const jx = (Math.random() - 0.5) * 0.05, jy = (Math.random() - 0.5) * 0.05, jz = (Math.random() - 0.5) * 0.05;
      this.p[i * 3] = nozzle.x; this.p[i * 3 + 1] = nozzle.y; this.p[i * 3 + 2] = nozzle.z; this.v[i * 3] = (dir.x + jx) * sp; this.v[i * 3 + 1] = (dir.y + jy) * sp; this.v[i * 3 + 2] = (dir.z + jz) * sp; this.life[i] = 0; } }
    const tmp = V(0, 0, 0);
    for (let i = 0; i < this.N; i++) { if (this.life[i] > 1.6) { this.p[i * 3 + 1] = -9999; continue; } this.life[i] += dt; this.v[i * 3 + 1] -= 9.8 * dt;
      this.v[i * 3] *= 1 - dt * 0.35; this.v[i * 3 + 2] *= 1 - dt * 0.35; this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      tmp.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
      if (fire && fire.douse(tmp)) { this.life[i] = 9; onHit && onHit(tmp); continue; }
      const gy = height(tmp.x, tmp.z); if (tmp.y < gy + 0.05) { this.life[i] = 9; if (Math.random() < 0.08) this.addSplash(tmp.set(tmp.x, gy + 0.1, tmp.z)); } }
    this.pts.geometry.attributes.position.needsUpdate = true;
    for (let i = this.splash.length - 1; i >= 0; i--) { const s = this.splash[i]; s.l += dt; s.s.scale.setScalar(0.2 + s.l * 1.4); s.s.material.opacity = 0.5 * (1 - s.l / 0.5); if (s.l > 0.5) { this.scene.remove(s.s); s.s.material.dispose(); this.splash.splice(i, 1); } }
  }
  addSplash(p) { if (this.splash.length > 24) return; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.splashTex, transparent: true, depthWrite: false, opacity: 0.5 })); s.position.copy(p); this.scene.add(s); this.splash.push({ s, l: 0 }); }
}
