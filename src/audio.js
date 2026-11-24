import { BreathPlanner, exertionStep } from './breath.js';
// Audio: sample bank (MyChief pack, mp3 for iPhone) + synthesized weapon/foley sounds.
// All synth functions take (ctx, dest, t0) so they also render in an OfflineAudioContext.

function noiseBuf(ctx, dur, seed = 1) {
  const n = Math.floor(ctx.sampleRate * dur); const b = ctx.createBuffer(1, n, ctx.sampleRate); const d = b.getChannelData(0);
  let s = seed * 9301 + 49297; for (let i = 0; i < n; i++) { s = (s * 9301 + 49297) % 233280; d[i] = s / 116640 - 1; }
  return b;
}
const cache = new WeakMap();
function noise(ctx) { if (!cache.has(ctx)) cache.set(ctx, noiseBuf(ctx, 3, 7)); return cache.get(ctx); }
function env(g, t0, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(end, t0 + a + d); }
function nburst(ctx, dest, t0, { dur = 0.05, type = 'bandpass', f = 2000, q = 1, peak = 0.5, a = 0.001, off = 0 }) {
  const s = ctx.createBufferSource(); s.buffer = noise(ctx); const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = ctx.createGain(); env(g, t0, a, peak, dur); s.connect(fl).connect(g).connect(dest); s.start(t0, off % 2.5, a + dur + 0.05); return g;
}
function ping(ctx, dest, t0, { f = 3000, f2 = null, dur = 0.04, peak = 0.2, type = 'sine' }) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  const g = ctx.createGain(); env(g, t0, 0.0015, peak, dur); o.connect(g).connect(dest); o.start(t0); o.stop(t0 + dur + 0.05);
}
function click(ctx, dest, t0, k = 1, f = 3200) {
  nburst(ctx, dest, t0, { dur: 0.018, f, q: 4, peak: 0.55 * k });
  ping(ctx, dest, t0, { f: f * 1.35, dur: 0.035, peak: 0.08 * k });
  nburst(ctx, dest, t0 + 0.002, { dur: 0.03, type: 'lowpass', f: 900, q: 0.7, peak: 0.25 * k });
}
const impulseCache = new WeakMap();
function valleyImpulse(ctx) {
  if (impulseCache.has(ctx)) return impulseCache.get(ctx);
  const sr = ctx.sampleRate, len = Math.floor(sr * 4.2); const b = ctx.createBuffer(2, len, sr);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let s = 17 + c * 31; let lp = 0;
    for (let i = 0; i < len; i++) { s = (s * 9301 + 49297) % 233280; const n = s / 116640 - 1; const t = i / sr;
      // diffuse forest reverb + discrete slap echoes off ridges
      let e = n * Math.exp(-t * 2.2) * 0.35;
      for (const [et, eg] of [[0.62, 0.55], [1.18, 0.4], [1.9, 0.3], [2.7, 0.18], [3.4, 0.1]]) { const dt = t - et - c * 0.013; if (dt > 0 && dt < 0.5) e += n * eg * Math.exp(-dt * 9) * (dt < 0.01 ? dt / 0.01 : 1); }
      lp += (e - lp) * (0.18 - Math.min(0.12, t * 0.03)); d[i] = lp; } }
  impulseCache.set(ctx, b); return b;
}

export const SYNTH = {
  gunshot(ctx, dest, t0) {
    // layered 9mm: crack + muzzle body + mechanical + long valley tail. Every node is new per shot and
    // nothing is ever stopped early, so rapid shots overlap and each tail rings out fully (~3 s).
    const eq = ctx.createBiquadFilter(); eq.type = 'peaking'; eq.frequency.value = 110; eq.Q.value = 0.9; eq.gain.value = 4; // punch
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 5200; hs.gain.value = -2.5; eq.connect(hs).connect(dest);
    const dry = ctx.createGain(); dry.gain.value = 0.9; dry.connect(eq);
    const conv = ctx.createConvolver(); conv.buffer = valleyImpulse(ctx); const wet = ctx.createGain(); wet.gain.value = 1.35; conv.connect(wet).connect(dest);
    const bus = ctx.createGain(); bus.connect(dry); bus.connect(conv);
    const v = 0.92 + Math.random() * 0.16;
    nburst(ctx, bus, t0, { dur: 0.012, type: 'highpass', f: 2600, q: 0.7, peak: 0.9 * v });           // supersonic crack
    nburst(ctx, bus, t0, { dur: 0.2, type: 'lowpass', f: 1500 * v, q: 0.8, peak: 0.85, a: 0.0015 });  // blast
    nburst(ctx, bus, t0 + 0.004, { dur: 0.45, type: 'lowpass', f: 360, q: 0.6, peak: 0.55, a: 0.003 }); // body
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120 * v, t0); o.frequency.exponentialRampToValueAtTime(40, t0 + 0.16);
    const g = ctx.createGain(); env(g, t0, 0.002, 0.85, 0.2); o.connect(g).connect(bus); o.start(t0); o.stop(t0 + 0.3);
    // distance tail: smooth rolling rumble down the valley (no hard end)
    const n = ctx.createBufferSource(); n.buffer = noise(ctx); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(900, t0); lp.frequency.exponentialRampToValueAtTime(140, t0 + 2.6);
    const tg = ctx.createGain(); tg.gain.setValueAtTime(0.0001, t0); tg.gain.linearRampToValueAtTime(0.16, t0 + 0.05); tg.gain.setTargetAtTime(0.0001, t0 + 0.12, 0.55);
    n.connect(lp).connect(tg).connect(dest); n.start(t0, Math.random() * 0.4, 3.0);
    // action
    click(ctx, dry, t0 + 0.028, 0.35, 3600); click(ctx, dry, t0 + 0.06, 0.4, 2800);
  },
  // one breath (inhale + exhale) of filtered noise; k = loudness, r = speed (1 calm, 2 scared)
  breath(ctx, dest, t0, k = 1, r = 1) {
    const mk = (st, du, f, pk) => { const s = ctx.createBufferSource(); s.buffer = noise(ctx); const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = 0.7;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, st); g.gain.linearRampToValueAtTime(pk, st + du * 0.4); g.gain.linearRampToValueAtTime(0.0001, st + du);
      s.connect(fl).connect(g).connect(dest); s.start(st, Math.random() * 1.5, du + 0.05); };
    const inh = 1.25 / r, exh = 1.6 / r;
    mk(t0, inh, 1700, 0.035 * k); mk(t0 + inh + 0.15 / r, exh, 1100, 0.05 * k);
    return inh + exh + 0.15 / r;
  },
  dryfire(ctx, d, t) { click(ctx, d, t, 0.45, 4200); },
  magRelease(ctx, d, t) { click(ctx, d, t, 0.6, 2600); nburst(ctx, d, t + 0.02, { dur: 0.06, f: 1800, q: 1.5, peak: 0.12 }); },
  magDrop(ctx, d, t) { // falls to the wooden floor
    const t1 = t + 0.42; nburst(ctx, d, t1, { dur: 0.09, type: 'lowpass', f: 700, peak: 0.6 }); ping(ctx, d, t1, { f: 170, f2: 120, dur: 0.12, peak: 0.35 });
    ping(ctx, d, t1 + 0.002, { f: 2300, dur: 0.09, peak: 0.05, type: 'triangle' }); nburst(ctx, d, t1 + 0.16, { dur: 0.05, type: 'lowpass', f: 900, peak: 0.25 }); },
  magPouch(ctx, d, t) { nburst(ctx, d, t, { dur: 0.14, type: 'bandpass', f: 900, q: 0.6, peak: 0.18, a: 0.04 }); },
  magInsert(ctx, d, t) { nburst(ctx, d, t - 0.06, { dur: 0.06, f: 2200, q: 1, peak: 0.18, a: 0.02 }); click(ctx, d, t, 1.0, 2400); ping(ctx, d, t, { f: 1250, dur: 0.06, peak: 0.08, type: 'triangle' }); },
  slideGrab(ctx, d, t) { nburst(ctx, d, t, { dur: 0.08, f: 3000, q: 1.2, peak: 0.12, a: 0.03 }); },
  slideRelease(ctx, d, t) { nburst(ctx, d, t, { dur: 0.04, f: 2600, q: 0.8, peak: 0.3, a: 0.01 }); click(ctx, d, t + 0.035, 1.3, 2200); ping(ctx, d, t + 0.035, { f: 900, dur: 0.08, peak: 0.12, type: 'triangle' }); },
  casing(ctx, d, t) { const b = [0, 0.13, 0.22, 0.27]; b.forEach((o, i) => { ping(ctx, d, t + 0.32 + o, { f: 4700 - i * 300, dur: 0.12 - i * 0.02, peak: 0.07 / (i + 1), type: 'sine' }); ping(ctx, d, t + 0.32 + o, { f: 7100, dur: 0.05, peak: 0.03 / (i + 1) }); }); },
  torchClick(ctx, d, t) { click(ctx, d, t, 0.55, 5200); },
  draw(ctx, d, t) { nburst(ctx, d, t, { dur: 0.25, type: 'bandpass', f: 1200, q: 0.5, peak: 0.12, a: 0.08 }); click(ctx, d, t + 0.3, 0.25, 2000); },
  floodOn(ctx, d, t) { nburst(ctx, d, t, { dur: 0.06, type: 'lowpass', f: 600, peak: 0.6 }); click(ctx, d, t, 1, 1500); ping(ctx, d, t + 0.01, { f: 95, f2: 60, dur: 0.12, peak: 0.3 }); },
  floodOff(ctx, d, t) { click(ctx, d, t, 0.9, 1300); nburst(ctx, d, t, { dur: 0.05, type: 'lowpass', f: 500, peak: 0.4 }); },
  radioClick(ctx, d, t) { click(ctx, d, t, 0.5, 3000); nburst(ctx, d, t + 0.02, { dur: 0.35, type: 'bandpass', f: 2000, q: 0.4, peak: 0.07, a: 0.01 }); },
  bulletHit(ctx, d, t) { nburst(ctx, d, t, { dur: 0.05, type: 'bandpass', f: 1500, q: 0.8, peak: 0.25 }); },
  gateRattle(ctx, d, t) { for (let i = 0; i < 4; i++) { ping(ctx, d, t + i * 0.06, { f: 1900 + i * 230, dur: 0.07, peak: 0.06, type: 'triangle' }); click(ctx, d, t + i * 0.06, 0.25, 2400); } },
  pickup(ctx, d, t) { nburst(ctx, d, t, { dur: 0.12, type: 'bandpass', f: 1400, q: 0.6, peak: 0.12, a: 0.03 }); click(ctx, d, t + 0.1, 0.3, 2600); },
  paper(ctx, d, t) { nburst(ctx, d, t, { dur: 0.25, type: 'highpass', f: 2500, q: 0.4, peak: 0.08, a: 0.05 }); },
  drawer(ctx, d, t) { nburst(ctx, d, t, { dur: 0.45, type: 'bandpass', f: 500, q: 0.6, peak: 0.2, a: 0.08 }); click(ctx, d, t + 0.5, 0.4, 900); },
};

// Event cue name -> sample id (MyChief pack)
export const CUE_MAP = {
  wind_loop: null, stinger_soft_01: 'stinger-1', stinger_spot_01: 'stinger-2', stinger_spot_02: 'stinger-3', stinger_spot_03: 'stinger-3', stinger_loud_01: 'stinger-4',
  animal_owl_01: 'animal-owl-1', animal_owl_02: 'animal-owl-2', animal_elk_01: 'animal-elk-bugle', animal_coyote_01: 'animal-coyote-howl', animal_coyote_02: 'animal-coyote-yips',
  creak_tower_01: 'tower-creak-1', creak_tower_02: 'tower-creak-3', far_knock_01: 'far-knocking-1', far_knock_02: 'far-knocking-2',
  step_wood_01: 'footstep-wood-2', step_wood_02: 'footstep-wood-5', branch_snap_below_01: 'far-branch-snap-1', branch_snap_below_02: 'far-branch-snap-3',
  far_scream_01: 'far-scream-1', far_scream_02: 'far-scream-2', far_scream_03: 'far-scream-3', far_whistle_01: 'far-whistle-1', far_whistle_02: 'far-whistle-2',
  door_open: 'door-open', door_close: 'door-close',
};

export class AudioSys {
  constructor() {
    this.ctx = null; this.buffers = new Map(); this.meta = {}; this.loading = new Map(); this.loops = new Map();
    this.volume = 0.8; this.musicVolume = 0.7;
  }
  async init(manifestUrl = 'assets/audio/manifest.json') {
    try { const r = await fetch(manifestUrl); this.manifest = await r.json(); } catch (e) { this.manifest = { sounds: {} }; }
    for (const [id, m] of Object.entries(this.manifest.sounds || {})) this.meta[id] = m;
  }
  resumeSafe() { try { const c = this.ctx; if (c && c.state !== 'running' && c.state !== 'closed') { const r = c.resume(); r && r.catch && r.catch(() => {}); } } catch (e) {} }
  suspendSafe() { try { const r = this.ctx && this.ctx.suspend && this.ctx.suspend(); r && r.catch && r.catch(() => {}); } catch (e) {} }
  // must run inside the tap handler on iOS; never throws and never waits on a promise
  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {} // iOS 17: play even with the ringer switch on silent
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 3; this.comp.attack.value = 0.004; this.comp.release.value = 0.25;
      this.lim = this.ctx.createDynamicsCompressor(); this.lim.threshold.value = -2; this.lim.knee.value = 0; this.lim.ratio.value = 20; this.lim.attack.value = 0.001; this.lim.release.value = 0.1;
      this.out = this.ctx.createGain(); this.out.gain.value = 0.89; // ~-1 dB ceiling
      this.master.connect(this.comp).connect(this.lim).connect(this.out).connect(this.ctx.destination);
      this.sfx = this.ctx.createGain(); this.sfx.connect(this.master);
      this.music = this.ctx.createGain(); this.music.gain.value = this.musicVolume; this.music.connect(this.master);
      this.amb = this.ctx.createGain(); this.amb.connect(this.master);
      this.voice = this.ctx.createGain(); this.voice.gain.value = 1.0; this.voice.connect(this.master);
      // preload the gameplay-critical one-shots
      for (const id of Object.keys(this.meta)) if (/creak|footstep|door|stinger|wind/.test(id)) this.load(id);
    }
    this.resumeSafe();
    try { const b = this.ctx.createBuffer(1, 1, 22050); const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.ctx.destination); s.start(0); } catch (e) {} // classic iOS unlock
  }
  // Breathing: sampled nasal/mouth breaths planned by BreathPlanner (varied timing, no loop). state: 'idle' | 'move' |
  // 'sprint' | 'hold' (aiming) | 'scared'. Exertion rises fast and recovers slowly; gunshots duck the breath bus.
  breathing(state) {
    if (!this.ctx) return; this.breathState = state;
    if (!this.breathBus) {
      this.breathBus = this.ctx.createGain(); this.breathBus.gain.value = 0.9; this.breathBus.connect(this.sfx);
      this.ex = 0; this.exT = 0; this.planner = null;
      fetch('assets/audio/breath/breaths.json').then(r => r.json()).then(d => { this.breathDur = d; this.planner = new BreathPlanner(d, (Math.random() * 1e9) | 0); this.planner.next = this.ctx.currentTime + 0.5;
        for (const id of Object.keys(d)) { this.meta['breath:' + id] = { file: `assets/audio/breath/${id}.mp3`, volume: 1, category: 'sfx' }; this.load('breath:' + id); } }).catch(() => {});
      this.breathTimer = setInterval(() => this.tickBreath(0.1), 100);
    }
    if (state === 'scared') this.ex = Math.max(this.ex, 0.95); if (state === 'panic') this.ex = Math.max(this.ex, 0.8);
  }
  addExertion(v) { this.ex = Math.min(1, (this.ex || 0) + v); }
  tickBreath(dt) {
    if (!this.planner) return; const st = this.breathState;
    const target = st === 'panic' ? 1 : st === 'sprint' ? 0.9 : st === 'stairs' ? 0.6 : st === 'run' ? 0.75 : st === 'move' ? 0.3 : st === 'scared' ? 0.85 : 0; this.ex = exertionStep(this.ex, target, dt);
    const ev = this.planner.plan(this.ctx.currentTime + 0.25, this.ex, st === 'hold');
    for (const [t, id, g, rate] of ev) { const b = this.buffers.get('breath:' + id); if (!b) continue;
      const s = this.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate * (0.98 + Math.random() * 0.04); const gg = this.ctx.createGain(); gg.gain.value = g;
      s.connect(gg).connect(this.breathBus); s.start(Math.max(t, this.ctx.currentTime)); if (/^out_/.test(id) && this.onExhale) this.onExhale(Math.max(0, t - this.ctx.currentTime), g, this.ex); }
  }
  duckBreath() { if (!this.breathBus) return; const g = this.breathBus.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setTargetAtTime(0.35, t, 0.01); g.setTargetAtTime(0.9, t + 0.25, 0.35); }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; }
  has(id) { return !!this.meta[id] || !!SYNTH[id]; }
  load(id) {
    if (!this.ctx || !this.meta[id]) return Promise.resolve(null);
    if (this.buffers.has(id)) return Promise.resolve(this.buffers.get(id));
    if (this.loading.has(id)) return this.loading.get(id);
    // OGG first; if this browser cannot decode it (older iOS Safari), fall back to the MP3 twin
    const get = (url) => fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(a => new Promise((res, rej) => this.ctx.decodeAudioData(a, res, rej)));
    const m = this.meta[id]; const p = get(m.file).catch(() => m.alt ? get(m.alt) : null)
      .then(b => { if (b) this.buffers.set(id, b); return b; }).catch(() => null);
    this.loading.set(id, p); return p;
  }
  bus(cat) { return cat === 'music' ? this.music : cat === 'ambience' ? this.amb : cat === 'voice' ? this.voice : this.sfx; }
  // play a sample or synth. opts: {vol, pos:{x,y,z}, listener, cat, rate, loop, delay}
  play(id, opts = {}) {
    if (!this.ctx) return null;
    const t = this.ctx.currentTime + (opts.delay || 0);
    let out = this.bus(opts.cat || this.meta[id]?.category);
    const g = this.ctx.createGain(); g.gain.value = (opts.vol ?? 1) * (this.meta[id]?.volume ?? 1);
    if (opts.pos) { const p = this.ctx.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = opts.ref || 6; p.rolloffFactor = opts.rolloff ?? 0.6; p.maxDistance = 5000;
      p.positionX ? (p.positionX.value = opts.pos.x, p.positionY.value = opts.pos.y, p.positionZ.value = opts.pos.z) : p.setPosition(opts.pos.x, opts.pos.y, opts.pos.z);
      g.connect(p).connect(out); } else g.connect(out);
    if (this.meta[id]) {
      const go = (b) => { if (!b) { if (SYNTH[id]) SYNTH[id](this.ctx, g, this.ctx.currentTime); return; }
        const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = !!opts.loop; s.playbackRate.value = opts.rate || 1; s.connect(g); s.start(Math.max(t, this.ctx.currentTime)); g._src = s; if (opts.onend) s.onended = opts.onend; };
      const b = this.buffers.get(id); if (b) go(b); else this.load(id).then(go);
      return g;
    }
    if (id === 'gunshot') this.duckBreath();
    if (SYNTH[id]) { SYNTH[id](this.ctx, g, t); return g; }
    return null;
  }
  loop(name, id, vol = 1, cat = 'ambience', fade = 1.5) {
    if (!this.ctx) return; if (this.loops.has(name)) return this.loops.get(name);
    const g = this.ctx.createGain(); g.gain.value = 0.0001; g.connect(this.bus(cat));
    const L = { g, src: null, id };
    this.load(id).then(b => { if (!b || !this.loops.has(name)) return; const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true; if (b.duration > 2) { s.loopStart = 0.03; s.loopEnd = b.duration - 0.03; } s.connect(g); s.start(); L.src = s; });
    g.gain.setTargetAtTime(vol * (this.meta[id]?.volume ?? 1), this.ctx.currentTime, fade / 3);
    this.loops.set(name, L); return L;
  }
  stopLoop(name, fade = 1.0) {
    const L = this.loops.get(name); if (!L) return; this.loops.delete(name);
    L.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade / 3); setTimeout(() => { try { L.src && L.src.stop(); } catch (e) {} L.g.disconnect(); }, fade * 1000 + 200);
  }
  setLoopVol(name, v) { const L = this.loops.get(name); if (L) L.g.gain.setTargetAtTime(v * (this.meta[L.id]?.volume ?? 1), this.ctx.currentTime, 0.2); }
  // synthesized hum for the floodlight
  hum(on) {
    if (!this.ctx) return;
    if (on && !this.humNode) {
      const g = this.ctx.createGain(); g.gain.value = 0.0001; g.connect(this.sfx);
      const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.connect(g);
      const os = [[120, 'sawtooth', 0.05], [240, 'sine', 0.03], [360, 'sine', 0.012], [60, 'sine', 0.05]].map(([fr, ty, a]) => { const o = this.ctx.createOscillator(); o.type = ty; o.frequency.value = fr; const og = this.ctx.createGain(); og.gain.value = a; o.connect(og).connect(f); o.start(); return o; });
      const n = this.ctx.createBufferSource(); n.buffer = noise(this.ctx); n.loop = true; const nf = this.ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 6000; nf.Q.value = 0.8; const ng = this.ctx.createGain(); ng.gain.value = 0.012; n.connect(nf).connect(ng).connect(g); n.start();
      g.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.08);
      this.humNode = { g, os, n };
    } else if (!on && this.humNode) {
      const h = this.humNode; this.humNode = null; h.g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.05);
      setTimeout(() => { h.os.forEach(o => o.stop()); h.n.stop(); h.g.disconnect(); }, 400);
    }
  }
  // Morning birds (synthesized chirps) for the intro drive
  birds(on) {
    if (!this.ctx) return;
    clearInterval(this.birdTimer); this.birdTimer = null;
    if (!on) return;
    const chirp = () => {
      const t = this.ctx.currentTime; const g = this.ctx.createGain(); g.gain.value = 0.05 + Math.random() * 0.05;
      const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null; if (p) { p.pan.value = Math.random() * 2 - 1; g.connect(p).connect(this.amb); } else g.connect(this.amb);
      const base = 2600 + Math.random() * 2400; const n = 2 + Math.floor(Math.random() * 5);
      for (let i = 0; i < n; i++) ping(this.ctx, g, t + i * (0.09 + Math.random() * 0.05), { f: base * (1 + Math.random() * 0.2), f2: base * (0.7 + Math.random() * 0.6), dur: 0.06 + Math.random() * 0.05, peak: 0.5 });
    };
    this.birdTimer = setInterval(() => { if (Math.random() < 0.55) chirp(); }, 700);
  }
}
