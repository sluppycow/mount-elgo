// v3 dread layer: heat lightning with delayed thunder (it can light the thing up), flashlight + radio interference when it
// is near, a heartbeat that quickens as it closes, twig snaps behind you, breathing in the brush when you leave the
// trail, bullet-impact dust / wood chips / sparks, brass on the ground, sprint stamina, and the compass bar.
// No camera shake anywhere: everything here is light, sound, particles and HUD.
import * as THREE from 'three';
import { height, bearingOf } from '../geo.js';
import { radialSprite } from '../textures.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export class Horror {
  constructor(scene, { audio, SFX, W }) {
    this.scene = scene; this.audio = audio; this.SFX = SFX; this.W = W; this.t = 0;
    // lightning: one fixed directional light, dark until a strike (no light-count changes = no shader recompiles)
    this.bolt = { intensity: 0, position: V(0, 0, 0) }; // the strike is applied to the moon light by the host (no extra light)
    this.nextStrike = 40 + Math.random() * 30; this.strike = null; this.flash = 0;
    this.hbT = 0; this.snapT = 25 + Math.random() * 20; this.brT = 18; this.flickT = 0; this.staticT = 0; this.flickK = 1;
    // impact particles (pooled sprites)
    const mk = (c0, c1) => new THREE.SpriteMaterial({ map: radialSprite(c0, c1, 32), transparent: true, depthWrite: false });
    this.mats = { dirt: mk('rgba(120,100,80,0.9)', 'rgba(90,70,50,0)'), wood: mk('rgba(190,150,100,1)', 'rgba(150,110,70,0)'), spark: new THREE.SpriteMaterial({ map: radialSprite('rgba(255,230,160,1)', 'rgba(255,140,40,0)', 32), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }),
      puff: mk('rgba(150,140,130,0.5)', 'rgba(140,130,120,0)'), blood: mk('rgba(70,10,8,0.95)', 'rgba(50,5,5,0)') };
    this.parts = []; this.pool = [];
    // brass on the ground (persists until the pool wraps)
    this.brassM = new THREE.MeshStandardMaterial({ color: 0xc09048, metalness: 1, roughness: 0.28 });
    this.brassG = { p: new THREE.CylinderGeometry(0.0048, 0.0048, 0.019, 10), r: new THREE.CylinderGeometry(0.006, 0.006, 0.051, 10) }; this.brass = []; this.falling = [];
    this.stam = 1; this.stamLock = false; this.stamRest = 0;
    this.compass = null;
  }
  // ---- lightning ----
  updateSky(dt, { night, play, onFlash, indoor = false }) {
    if (!night) { this.bolt.intensity = 0; return 0; }
    this.nextStrike -= dt; if (play && this.nextStrike < 0 && !this.strike) { this.nextStrike = 28 + Math.random() * 45; const far = 0.4 + Math.random() * 0.6;
      this.strike = { t: 0, pulses: [[0, 0.07], [0.12, 0.05], [0.22 + Math.random() * 0.15, 0.1]].slice(0, 2 + (Math.random() < 0.6 ? 1 : 0)), k: 1.3 - far * 0.6, delay: 1.2 + far * 4.5 };
      const a = Math.random() * 6.28; this.bolt.position.set(Math.sin(a) * 500, 380, Math.cos(a) * 500); this.audio.play('thunder', { delay: this.strike.delay, vol: 1.15 - far * 0.4, cat: 'ambience' }); onFlash && onFlash(this.strike); }
    let f = 0; const s = this.strike; if (s) { s.t += dt; for (const [t0, d] of s.pulses) if (s.t > t0 && s.t < t0 + d) f = Math.max(f, 1 - (s.t - t0) / d * 0.4); f += Math.max(0, 0.25 - (s.t - 0.3)) * 0.4 * (s.t > 0.3 ? 1 : 0); if (s.t > 0.9) this.strike = null; f *= s ? s.k : 0; }
    this.flash = f * (indoor ? 0.35 : 1); this.bolt.intensity = f * (indoor ? 0.6 : 3.2); return f;
  }
  // ---- creature proximity: torch flicker, radio interference, heartbeat ----
  updateDread(dt, { swDist, swOut, ground, onStatic }) {
    this.t += dt; const near = swOut && swDist < 22; const close = swOut ? THREE.MathUtils.clamp(1 - (swDist - 4) / 32, 0, 1) : 0;
    if (near) { this.flickT -= dt; if (this.flickT < 0) { this.flickT = 0.05 + Math.random() * 0.12; const deep = Math.random() < 0.18 + (1 - swDist / 22) * 0.3; this.flickK = deep ? Math.random() * 0.15 : 0.55 + Math.random() * 0.45; }
      this.staticT -= dt; if (this.staticT < 0) { this.staticT = 2.5 + Math.random() * 4 * (swDist / 22); onStatic && onStatic(0.3 + (1 - swDist / 22) * 0.5); } }
    else { this.flickK += (1 - this.flickK) * Math.min(1, dt * 10); this.staticT = 0.6; }
    this.hbT -= dt; if (close > 0.05 && this.hbT < 0) { this.hbT = 1.15 - close * 0.72; this.SFX.heartbeat(this.audio, 0.25 + close * 0.6); }
    return { flick: this.flickK, close };
  }
  // ---- ambient threats while on the ground ----
  updateGround(dt, { P, fwd, offTrail, swOut, night }) {
    if (!night) return; this.snapT -= dt; this.brT -= dt;
    if (this.snapT < 0) { this.snapT = 20 + Math.random() * 30; const a = Math.atan2(-fwd.x, -fwd.z) + Math.PI + (Math.random() - 0.5) * 1.2; const r = 7 + Math.random() * 7; const p = V(P.x - Math.sin(a) * r, 0, P.z - Math.cos(a) * r); p.y = height(p.x, p.z) + 0.3;
      if (Math.random() < 0.5) this.SFX.swTwig(this.audio, p, 0.7); else this.audio.play('far-branch-snap-' + (1 + Math.floor(Math.random() * 4)), { pos: p, vol: 0.9, ref: 8 }); }
    if (offTrail && !swOut && this.brT < 0) { this.brT = 14 + Math.random() * 16; const a = Math.atan2(fwd.x, fwd.z) + Math.PI + (Math.random() - 0.5) * 0.8; const p = V(P.x + Math.sin(a) * 4.5, P.y + 1.2, P.z + Math.cos(a) * 4.5);
      this.SFX.swBreath(this.audio, p, 0.45, 1.3); }
  }
  // ---- bullet impacts ----
  impact(point, normal, kind = 'dirt') {
    const n = normal ? normal.clone().normalize() : V(0, 1, 0); const cnt = kind === 'spark' ? 10 : kind === 'blood' ? 10 : 8;
    for (let i = 0; i < cnt; i++) { const s = new THREE.Sprite((this.mats[kind] || this.mats.dirt).clone()); s.position.copy(point).addScaledVector(n, 0.03); this.scene.add(s);
      const v = n.clone().multiplyScalar(1.2 + Math.random() * 2.2).add(V((Math.random() - 0.5) * 2.2, Math.random() * 1.6, (Math.random() - 0.5) * 2.2)); this.parts.push({ s, v, life: 0, max: kind === 'spark' ? 0.25 + Math.random() * 0.2 : 0.5 + Math.random() * 0.4, sz: kind === 'spark' ? 0.025 : 0.05 + Math.random() * 0.05, g: kind === 'spark' ? 6 : 9 }); }
    if (kind !== 'spark') { const s = new THREE.Sprite(this.mats.puff.clone()); s.position.copy(point).addScaledVector(n, 0.1); this.scene.add(s); this.parts.push({ s, v: n.clone().multiplyScalar(0.35).add(V(0, 0.25, 0)), life: 0, max: 1.4, sz: 0.25, g: -0.2, grow: 0.9 }); }
  }
  // ---- brass on the ground ----
  dropBrass(from, side, rifle) { const m = new THREE.Mesh(rifle ? this.brassG.r : this.brassG.p, this.brassM); m.castShadow = false; m.position.copy(from); this.scene.add(m);
    this.falling.push({ m, v: side.clone().multiplyScalar(1.6 + Math.random()).add(V(0, 1.2, 0)), w: V(Math.random() * 18, Math.random() * 10, Math.random() * 18), t: 0, clinked: false, rifle });
    this.brass.push(m); if (this.brass.length > 36) { const o = this.brass.shift(); this.scene.remove(o); } }
  // ---- sprint stamina ----
  stamina(dt, sprinting, moving) { if (sprinting && moving && !this.stamLock) { this.stam = Math.max(0, this.stam - dt / 7.5); this.stamRest = 0; if (this.stam <= 0) this.stamLock = true; }
    else { this.stamRest += dt; if (this.stamRest > 0.9) this.stam = Math.min(1, this.stam + dt / 5.5); if (this.stamLock && this.stam > 0.35) this.stamLock = false; } return !this.stamLock; }
  update(dt, ctx = {}) {
    for (let i = this.parts.length - 1; i >= 0; i--) { const p = this.parts[i]; p.life += dt; p.v.y -= p.g * dt; p.s.position.addScaledVector(p.v, dt); const k = p.life / p.max; p.s.scale.setScalar(p.sz * (1 + (p.grow || 0) * k * 3)); p.s.material.opacity = 1;
      if (p.life > p.max) { this.scene.remove(p.s); p.s.material.dispose(); this.parts.splice(i, 1); } else p.s.material.opacity = 1 - k; }
    for (let i = this.falling.length - 1; i >= 0; i--) { const f = this.falling[i]; f.t += dt; f.v.y -= 9.8 * dt; f.m.position.addScaledVector(f.v, dt); f.m.rotation.x += f.w.x * dt; f.m.rotation.y += f.w.y * dt; f.m.rotation.z += f.w.z * dt;
      const gy = (ctx.floorAt && ctx.floorAt(f.m.position.x, f.m.position.z)) ?? height(f.m.position.x, f.m.position.z); if (f.m.position.y < gy + 0.006) { f.m.position.y = gy + 0.006;
        if (!f.clinked) { f.clinked = true; this.audio.play('casing', { pos: f.m.position.clone(), vol: ctx.onWood ? 0.6 : 0.25, ref: 3 }); } if (f.v.y < -1.2) { f.v.y *= -0.25; f.v.x *= 0.4; f.v.z *= 0.4; } else { f.m.rotation.set(Math.PI / 2, f.m.rotation.y, 0); this.falling.splice(i, 1); } } }
  }
  // ---- compass bar: bearings every 15 deg + named markers ----
  drawCompass(el, strip, yawFwd, marks) { const W = el.clientWidth || 300; const pxPerDeg = W / 120; const b = bearingOf(yawFwd.x, yawFwd.z); let h = '';
    for (let d = -75; d <= 75; d += 5) { const v = Math.round((b + d) / 5) * 5; const off = ((v - b + 540) % 360) - 180; if (Math.abs(off) > 62) continue; const vv = ((v % 360) + 360) % 360; if (vv % 15) continue;
      const lbl = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' }[vv] ?? String(vv).padStart(3, '0'); h += `<span style="left:${(W / 2 + off * pxPerDeg).toFixed(0)}px;${lbl.length < 3 ? 'color:#fff;font-weight:700' : 'opacity:.6'}">${lbl}</span>`; }
    for (const m of marks) { const off = ((m.b - b + 540) % 360) - 180; const x = Math.abs(off) > 58 ? W / 2 + Math.sign(off) * 58 * pxPerDeg : W / 2 + off * pxPerDeg; h += `<span class="mk ${m.cls || ''}" style="left:${x.toFixed(0)}px">\u25BE ${m.l}</span>`; }
    if (h !== this._ch) { strip.innerHTML = h; this._ch = h; } }
}
