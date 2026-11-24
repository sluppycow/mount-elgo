// Synthesized foley for v2 (no extra downloads): gravel steps, creature footfalls + growl, breaker clunk, generator pull /
// sputter / running hum, fuel pour, hose spray, fire crackle, steam hiss, dead-radio static, brush rustle, keys, heartbeat,
// and the skinwalker: damp footfalls, twig cracks, raspy breath / panting, jaw clicks, limb scrapes, elk-bugle screech, shriek, brush crash.
const nb = new WeakMap();
function noise(ctx) { if (nb.has(ctx)) return nb.get(ctx); const n = ctx.sampleRate * 2, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; nb.set(ctx, b); return b; }
function out(A, pos, ref = 6, cat = 'sfx') {
  const c = A.ctx; const g = c.createGain(); const bus = cat === 'voice' ? A.voice : cat === 'ambience' ? A.amb : A.sfx;
  if (pos) { const p = c.createPanner(); p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = ref; p.rolloffFactor = 0.8; p.maxDistance = 3000;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z); g.connect(p).connect(bus); g._p = p; } else g.connect(bus);
  return g;
}
function nsrc(c, t, dur, rate = 1) { const s = c.createBufferSource(); s.buffer = noise(c); s.playbackRate.value = rate; s.loopStart = 0; s.loop = true; s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s; }
function env(g, t, a, peak, d, end = 0.0001) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(Math.max(end, 0.0001), t + a + d); }
const ok = (A) => A && A.ctx && A.sfx;
// --- creature helpers ---
function burst(c, o, t, type, f, q, d, pk, rate = 1) { const s = nsrc(c, t, d + 0.03, rate); const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); env(g, t, 0.002, pk, d); s.connect(fl).connect(g).connect(o); }
function twig(c, o, t, k = 1) { let tt = t; for (let i = 0, n = 2 + (Math.random() * 2 | 0); i < n; i++) { burst(c, o, tt, 'highpass', 2600, 0.7, 0.012, 0.9 * k, 1.3); burst(c, o, tt, 'bandpass', 3200 + Math.random() * 1500, 6, 0.03, 0.35 * k, 1); tt += 0.025 + Math.random() * 0.06; }
  burst(c, o, tt, 'bandpass', 1500, 1.2, 0.12, 0.12 * k, 0.9); }
// noise through a throat formant, chopped by a fast tremolo = rasp
function rasp(c, o, t, d, pk, f, am) { const s = nsrc(c, t, d + 0.05, 1); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.3; const bp2 = c.createBiquadFilter(); bp2.type = 'peaking'; bp2.frequency.value = f * 2.3; bp2.gain.value = 6; bp2.Q.value = 2;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + d * 0.35); g.gain.linearRampToValueAtTime(0.0001, t + d);
  const tr = c.createGain(); tr.gain.value = 0.55; const l = c.createOscillator(); l.type = 'square'; l.frequency.value = am * (0.9 + Math.random() * 0.2); const lg = c.createGain(); lg.gain.value = 0.45; l.connect(lg).connect(tr.gain); l.start(t); l.stop(t + d + 0.05);
  s.connect(bp).connect(bp2).connect(g).connect(tr).connect(o); }
function gurgle(c, o, t, d, pk) { const os = c.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(64, t); os.frequency.linearRampToValueAtTime(52, t + d); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 3;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d); const am = c.createGain(); am.gain.value = 0.5; const l = c.createOscillator(); l.frequency.value = 19; const lg = c.createGain(); lg.gain.value = 0.5; l.connect(lg).connect(am.gain);
  os.connect(lp).connect(g).connect(am).connect(o); os.start(t); os.stop(t + d + 0.05); l.start(t); l.stop(t + d + 0.05); }
function growlTone(c, o, t, d, pk, f) { const sh = shaper(c, 25); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(pk, t + Math.min(0.12, d * 0.3)); g.gain.linearRampToValueAtTime(0.0001, t + d);
  const am = c.createGain(); am.gain.value = 0.6; const l = c.createOscillator(); l.frequency.value = 22 + Math.random() * 6; const lg = c.createGain(); lg.gain.value = 0.4; l.connect(lg).connect(am.gain); l.start(t); l.stop(t + d + 0.05);
  for (const [m, ty, a] of [[1, 'sawtooth', 0.5], [1.51, 'sawtooth', 0.25]]) { const os = c.createOscillator(); os.type = ty; os.frequency.setValueAtTime(f * m, t); os.frequency.linearRampToValueAtTime(f * m * 1.2, t + d * 0.5); os.frequency.linearRampToValueAtTime(f * m * 0.9, t + d); const og = c.createGain(); og.gain.value = a; os.connect(og).connect(sh); os.start(t); os.stop(t + d + 0.05); }
  sh.connect(lp).connect(g).connect(am).connect(o); }
const shCache = new WeakMap();
function shaper(c, amt) { let m = shCache.get(c); if (!m) shCache.set(c, m = {}); if (!m[amt]) { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; cv[i] = (1 + amt) * x / (1 + amt * Math.abs(x)); } m[amt] = cv; }
  const w = c.createWaveShaper(); w.curve = m[amt]; w.oversample = '2x'; return w; }
// a short feedback echo (forest slap-back); the loop is torn down after `life` seconds so nothing keeps running
function echo(c, o, mix, dt, fb, life) { const d = c.createDelay(1); d.delayTime.value = dt; const f = c.createGain(); f.gain.value = fb; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; const w = c.createGain(); w.gain.value = mix;
  d.connect(lp).connect(f).connect(d); lp.connect(w).connect(o); setTimeout(() => { try { f.disconnect(); d.disconnect(); w.disconnect(); } catch (e) {} }, life * 1000); return d; }
export const SFX = {
  crunch(A, pos, vol = 0.5) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 3); o.gain.value = vol;
    for (let k = 0; k < 2; k++) { const tt = t + k * (0.03 + Math.random() * 0.03); const s = nsrc(c, tt, 0.12, 0.7 + Math.random() * 0.5); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + Math.random() * 1600; bp.Q.value = 0.9; const g = c.createGain(); env(g, tt, 0.004, k ? 0.35 : 0.6, 0.08 + Math.random() * 0.04); s.connect(bp).connect(g).connect(o); } },
  thud(A, pos, vol = 1) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 8); o.gain.value = vol;
    const os = c.createOscillator(); os.type = 'sine'; os.frequency.setValueAtTime(95, t); os.frequency.exponentialRampToValueAtTime(42, t + 0.12); const g = c.createGain(); env(g, t, 0.005, 0.7, 0.16); os.connect(g).connect(o); os.start(t); os.stop(t + 0.25);
    const s = nsrc(c, t, 0.14, 0.5); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; const g2 = c.createGain(); env(g2, t, 0.003, 0.4, 0.1); s.connect(lp).connect(g2).connect(o); },
  growl(A, pos, vol = 1, dur = 1.8) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 12); o.gain.value = vol;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; const bp = c.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 320; bp.gain.value = 9; bp.Q.value = 2;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.55, t + 0.35); g.gain.setValueAtTime(0.55, t + dur - 0.5); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const am = c.createGain(); am.gain.value = 0.6; const lfo = c.createOscillator(); lfo.frequency.value = 17; const lg = c.createGain(); lg.gain.value = 0.4; lfo.connect(lg).connect(am.gain); lfo.start(t); lfo.stop(t + dur);
    for (const [f, ty, a] of [[52, 'sawtooth', 0.5], [79, 'sawtooth', 0.3], [131, 'square', 0.08]]) { const os = c.createOscillator(); os.type = ty; os.frequency.setValueAtTime(f, t); os.frequency.linearRampToValueAtTime(f * 1.25, t + dur * 0.4); os.frequency.linearRampToValueAtTime(f * 0.9, t + dur); const og = c.createGain(); og.gain.value = a; os.connect(og).connect(am); os.start(t); os.stop(t + dur + 0.05); }
    const s = nsrc(c, t, dur, 0.3); const sg = c.createGain(); sg.gain.value = 0.5; s.connect(sg).connect(am); am.connect(bp).connect(lp).connect(g).connect(o); },
  breaker(A) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, null); o.gain.value = 0.9;
    const s = nsrc(c, t, 0.06, 1); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500; const g = c.createGain(); env(g, t, 0.001, 0.8, 0.05); s.connect(hp).connect(g).connect(o);
    const os = c.createOscillator(); os.frequency.setValueAtTime(70, t); os.frequency.exponentialRampToValueAtTime(30, t + 0.2); const g2 = c.createGain(); env(g2, t, 0.002, 0.9, 0.25); os.connect(g2).connect(o); os.start(t); os.stop(t + 0.3);
    const w = c.createOscillator(); w.type = 'sawtooth'; w.frequency.setValueAtTime(120, t + 0.05); w.frequency.exponentialRampToValueAtTime(18, t + 1.4); const wl = c.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 500; const g3 = c.createGain(); g3.gain.setValueAtTime(0.12, t + 0.05); g3.gain.exponentialRampToValueAtTime(0.0001, t + 1.4); w.connect(wl).connect(g3).connect(o); w.start(t + 0.05); w.stop(t + 1.5); },
  pull(A, pos, catches) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 4); o.gain.value = 0.9;
    const s = nsrc(c, t, 0.5, 1); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3; bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.35); const g = c.createGain(); env(g, t, 0.02, 0.5, 0.4); s.connect(bp).connect(g).connect(o);
    const n = catches ? 9 : 4; let tt = t + 0.3; for (let i = 0; i < n; i++) { tt += catches ? Math.max(0.05, 0.16 - i * 0.012) : 0.14 + Math.random() * 0.08; const p = nsrc(c, tt, 0.09, 0.4); const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const pg = c.createGain(); env(pg, tt, 0.003, catches ? 0.9 : 0.6 - i * 0.1, 0.07); p.connect(lp).connect(pg).connect(o); } },
  genLoop(A, pos) { if (!ok(A)) return null; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 5); o.gain.value = 0.0001; o.gain.setTargetAtTime(0.7, t, 0.4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; const am = c.createGain(); am.gain.value = 0.5; const lfo = c.createOscillator(); lfo.frequency.value = 28; const lg = c.createGain(); lg.gain.value = 0.35; lfo.connect(lg).connect(am.gain); lfo.start();
    const os = [[29, 'sawtooth', 0.5], [58, 'square', 0.12], [87, 'sawtooth', 0.12]].map(([f, ty, a]) => { const x = c.createOscillator(); x.type = ty; x.frequency.value = f; const g = c.createGain(); g.gain.value = a; x.connect(g).connect(am); x.start(); return x; });
    const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true; const sg = c.createGain(); sg.gain.value = 0.25; s.connect(sg).connect(am); s.start(); am.connect(lp).connect(o);
    return { stop: () => { o.gain.setTargetAtTime(0.0001, c.currentTime, 0.3); setTimeout(() => { try { os.forEach(x => x.stop()); s.stop(); lfo.stop(); o.disconnect(); } catch (e) {} }, 1500); } }; },
  pourLoop(A, pos) { if (!ok(A)) return null; const c = A.ctx; const o = out(A, pos, 3); o.gain.value = 0.0001; o.gain.setTargetAtTime(0.5, c.currentTime, 0.1);
    const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 4; const am = c.createGain(); const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 7; const lg = c.createGain(); lg.gain.value = 0.5; lfo.connect(lg).connect(am.gain); lfo.start(); s.connect(bp).connect(am).connect(o); s.start();
    const iv = setInterval(() => { bp.frequency.setTargetAtTime(500 + Math.random() * 600, c.currentTime, 0.05); lfo.frequency.setTargetAtTime(5 + Math.random() * 6, c.currentTime, 0.1); }, 120);
    return { stop: () => { clearInterval(iv); o.gain.setTargetAtTime(0.0001, c.currentTime, 0.08); setTimeout(() => { try { s.stop(); lfo.stop(); o.disconnect(); } catch (e) {} }, 600); } }; },
  sprayLoop(A) { if (!ok(A)) return null; const c = A.ctx; const o = out(A, null); o.gain.value = 0.0001;
    const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.5; const g1 = c.createGain(); g1.gain.value = 0.5;
    const s2 = c.createBufferSource(); s2.buffer = noise(c); s2.loop = true; s2.playbackRate.value = 0.5; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; const g2 = c.createGain(); g2.gain.value = 0.6;
    s.connect(bp).connect(g1).connect(o); s2.connect(lp).connect(g2).connect(o); s.start(); s2.start();
    return { set: (v) => o.gain.setTargetAtTime(Math.max(0.0001, v * 0.55), c.currentTime, 0.06), stop: () => { o.gain.setTargetAtTime(0.0001, c.currentTime, 0.1); setTimeout(() => { try { s.stop(); s2.stop(); o.disconnect(); } catch (e) {} }, 700); } }; },
  fireLoop(A, pos) { if (!ok(A)) return null; const c = A.ctx; const o = out(A, pos, 7); o.gain.value = 0.0001; o.gain.setTargetAtTime(0.9, c.currentTime, 0.5);
    const s = c.createBufferSource(); s.buffer = noise(c); s.loop = true; s.playbackRate.value = 0.35; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; const rg = c.createGain(); rg.gain.value = 0.7; s.connect(lp).connect(rg).connect(o); s.start();
    const iv = setInterval(() => { const t = c.currentTime; for (let i = 0; i < 3; i++) if (Math.random() < 0.7) { const tt = t + Math.random() * 0.15; const p = nsrc(c, tt, 0.03, 1.5); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1800 + Math.random() * 2500; const g = c.createGain(); env(g, tt, 0.001, 0.2 + Math.random() * 0.5, 0.02 + Math.random() * 0.03); p.connect(hp).connect(g).connect(o); } }, 160);
    return { set: (v) => o.gain.setTargetAtTime(Math.max(0.0001, v * 0.9), c.currentTime, 0.2), stop: () => { clearInterval(iv); o.gain.setTargetAtTime(0.0001, c.currentTime, 0.4); setTimeout(() => { try { s.stop(); o.disconnect(); } catch (e) {} }, 1800); } }; },
  hiss(A, pos, vol = 0.6, dur = 1.2) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 5); o.gain.value = vol; const s = nsrc(c, t, dur, 1); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(hp).connect(g).connect(o); },
  deadRadio(A, dur = 1.6) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, null, 6, 'voice'); o.gain.value = 0.5;
    const s = nsrc(c, t, dur, 1); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 0.4; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.02);
    for (let k = 0; k < 10; k++) g.gain.setValueAtTime(Math.random() < 0.3 ? 0.02 : 0.25 + Math.random() * 0.2, t + 0.05 + k * dur / 11); g.gain.linearRampToValueAtTime(0.0001, t + dur); s.connect(bp).connect(g).connect(o);
    const os = c.createOscillator(); os.type = 'square'; os.frequency.value = 420; const og = c.createGain(); env(og, t + dur - 0.1, 0.005, 0.05, 0.12); os.connect(og).connect(o); os.start(t + dur - 0.1); os.stop(t + dur + 0.1); },
  rustle(A, pos, vol = 0.8, dur = 0.9) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 8); o.gain.value = vol; const s = nsrc(c, t, dur, 1); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 3600; bp.Q.value = 0.7; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
    for (let k = 0; k < 14; k++) g.gain.setTargetAtTime(Math.random() * 0.6, t + k * dur / 14, 0.02); g.gain.setTargetAtTime(0.0001, t + dur, 0.05); s.connect(bp).connect(g).connect(o); },
  keys(A) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, null); o.gain.value = 0.25; for (let i = 0; i < 6; i++) { const tt = t + i * 0.045 + Math.random() * 0.03; const os = c.createOscillator(); os.type = 'sine'; os.frequency.value = 3200 + Math.random() * 3000; const g = c.createGain(); env(g, tt, 0.001, 0.4, 0.12); os.connect(g).connect(o); os.start(tt); os.stop(tt + 0.2); } },
  unlock(A, pos) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 3); o.gain.value = 0.8; for (const [dt, f] of [[0, 2400], [0.12, 1600], [0.32, 900]]) { const s = nsrc(c, t + dt, 0.05, 1); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; const g = c.createGain(); env(g, t + dt, 0.001, 0.9, 0.06); s.connect(bp).connect(g).connect(o); } },
  heartbeat(A, vol = 0.5) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, null); o.gain.value = vol; for (const dt of [0, 0.24]) { const os = c.createOscillator(); os.frequency.setValueAtTime(58, t + dt); os.frequency.exponentialRampToValueAtTime(34, t + dt + 0.12); const g = c.createGain(); env(g, t + dt, 0.006, dt ? 0.5 : 0.8, 0.14); os.connect(g).connect(o); os.start(t + dt); os.stop(t + dt + 0.25); } },
  // ---------- the skinwalker (all procedural; positional, so distance falloff + stereo pan follow the listener/camera) ----------
  // heavy damp footfall: sub thump + muffled body + pine-needle crunch + a wet squelch
  swStep(A, pos, k = 1) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 7); o.gain.value = k;
    const os = c.createOscillator(); os.frequency.setValueAtTime(78 + Math.random() * 12, t); os.frequency.exponentialRampToValueAtTime(30, t + 0.16); const og = c.createGain(); env(og, t, 0.004, 0.9, 0.17); os.connect(og).connect(o); os.start(t); os.stop(t + 0.25);
    burst(c, o, t, 'lowpass', 260, 0.8, 0.13, 0.7, 0.6); burst(c, o, t + 0.005, 'bandpass', 1500 + Math.random() * 900, 0.9, 0.06, 0.22, 1.2); burst(c, o, t + 0.02, 'bandpass', 520, 4, 0.08, 0.16, 0.5); },
  // dry twig / brush crackle
  swTwig(A, pos, v = 0.6) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 8); o.gain.value = v; twig(c, o, t); },
  // low wet raspy breath: inhale + longer gurgling exhale through a throat that is wrong
  swBreath(A, pos, v = 0.6, r = 1) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 5); o.gain.value = v * 1.8;
    const inh = (0.8 + Math.random() * 0.3) / r, exh = (1.15 + Math.random() * 0.4) / r; rasp(c, o, t, inh, 0.22, 900, 31); rasp(c, o, t + inh + 0.12 / r, exh, 0.34, 600, 23); gurgle(c, o, t + inh + 0.12 / r, exh, 0.16); },
  // hollow bone clicks of the jaw
  swJaw(A, pos, v = 0.7) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 4); o.gain.value = v * 1.5; let tt = t; const n = 3 + (Math.random() * 4 | 0);
    for (let i = 0; i < n; i++) { burst(c, o, tt, 'bandpass', 1700 + Math.random() * 900, 9, 0.02, 0.7, 1); const p = c.createOscillator(); p.type = 'triangle'; p.frequency.setValueAtTime(950 + Math.random() * 400, tt); p.frequency.exponentialRampToValueAtTime(480, tt + 0.05); const g = c.createGain(); env(g, tt, 0.001, 0.22, 0.05); p.connect(g).connect(o); p.start(tt); p.stop(tt + 0.08); tt += 0.04 + Math.random() * 0.045; } },
  // wet scraping / scuttling limb dragged over needles and dirt
  swScrape(A, pos, v = 0.5) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 5); o.gain.value = v * 1.6; const d = 0.12 + Math.random() * 0.1;
    const s = nsrc(c, t, d + 0.05, 0.8 + Math.random() * 0.5); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4; const up = Math.random() < 0.5; bp.frequency.setValueAtTime(up ? 1300 : 2700, t); bp.frequency.exponentialRampToValueAtTime(up ? 2700 : 1200, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.012); for (let k = 0; k < 6; k++) g.gain.setValueAtTime(0.15 + Math.random() * 0.45, t + 0.015 + k * d / 7); g.gain.exponentialRampToValueAtTime(0.0001, t + d); s.connect(bp).connect(g).connect(o);
    burst(c, o, t, 'lowpass', 420, 0.7, 0.1, 0.25, 0.7); burst(c, o, t + d * 0.4, 'bandpass', 700, 5, 0.05, 0.12, 0.6); },
  // guttural raspy panting (crawl: slow and low; sprint: fast and loud)
  swPant(A, pos, v = 0.6, r = 1) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 6); o.gain.value = v * 1.5; const a = 0.2 / r, b = 0.28 / r;
    rasp(c, o, t, a, 0.2, 1000, 34); rasp(c, o, t + a + 0.04 / r, b, 0.3, 700, 27); growlTone(c, o, t + a, b + 0.05, 0.22, 50); },
  // a distorted elk bugle that tears into a hollow screech and a snarl: when it spots you, bursts from cover, or charges
  swBugle(A, pos, v = 1) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 18); o.gain.value = v * 0.55; const D = 2.4 + Math.random() * 0.3;
    const wet = c.createGain(); wet.gain.value = 1; wet.connect(o); const ech = echo(c, o, 0.4, 0.23, 0.42, D + 3); wet.connect(ech);
    const pf = (p, m = 1) => { p.setValueAtTime(110 * m, t); p.exponentialRampToValueAtTime(380 * m, t + 0.32); p.exponentialRampToValueAtTime(1450 * m, t + 0.72); p.linearRampToValueAtTime(1680 * m, t + D * 0.62); p.exponentialRampToValueAtTime(520 * m, t + D * 0.82); p.exponentialRampToValueAtTime(150 * m, t + D); };
    const sh = shaper(c, 60); const f1 = c.createBiquadFilter(); f1.type = 'peaking'; f1.frequency.value = 950; f1.Q.value = 1.4; f1.gain.value = 9; const f2 = c.createBiquadFilter(); f2.type = 'peaking'; f2.frequency.value = 2500; f2.Q.value = 2; f2.gain.value = 6;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.18); g.gain.linearRampToValueAtTime(0.42, t + 0.8); g.gain.setValueAtTime(0.42, t + D * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + D);
    sh.connect(f1).connect(f2).connect(lp).connect(g).connect(wet);
    const vib = c.createOscillator(); vib.frequency.value = 6.5; const vg = c.createGain(); vg.gain.value = 38; vib.connect(vg); vib.start(t); vib.stop(t + D + 0.1);
    for (const [ty, m, a] of [['sawtooth', 1, 0.5], ['square', 1.47, 0.14], ['sawtooth', 0.503, 0.3]]) { const os = c.createOscillator(); os.type = ty; pf(os.frequency, m); vg.connect(os.frequency); const og = c.createGain(); og.gain.value = a; os.connect(og).connect(sh); os.start(t); os.stop(t + D + 0.05); }
    // breathy hollow whistle riding the pitch
    const n = nsrc(c, t, D, 1); const nb_ = c.createBiquadFilter(); nb_.type = 'bandpass'; nb_.Q.value = 4; pf(nb_.frequency, 2); const ng = c.createGain(); env(ng, t + 0.3, 0.3, 0.5, D - 0.6); n.connect(nb_).connect(ng).connect(wet);
    // snarl underneath at the start and the end
    growlTone(c, wet, t, 0.7, 0.55, 55); growlTone(c, wet, t + D * 0.78, D * 0.3, 0.5, 62); },
  // sharp pained shriek + hiss when the 9mm hits
  swShriek(A, pos, v = 1) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 14); o.gain.value = v * 0.8; const D = 0.95;
    const sh = shaper(c, 80); const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 450; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.012); g.gain.setTargetAtTime(0.0001, t + 0.25, 0.22);
    sh.connect(hp).connect(g).connect(o); const ech = echo(c, o, 0.3, 0.19, 0.35, 3); g.connect(ech);
    const vib = c.createOscillator(); vib.frequency.value = 11; const vg = c.createGain(); vg.gain.value = 140; vib.connect(vg); vib.start(t); vib.stop(t + D);
    for (const [m, a] of [[1, 0.5], [1.33, 0.25]]) { const os = c.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(900 * m, t); os.frequency.exponentialRampToValueAtTime(2400 * m, t + 0.07); os.frequency.exponentialRampToValueAtTime(1700 * m, t + 0.4); os.frequency.exponentialRampToValueAtTime(520 * m, t + D);
      vg.connect(os.frequency); const og = c.createGain(); og.gain.value = a; os.connect(og).connect(sh); os.start(t); os.stop(t + D + 0.05); }
    burst(c, o, t, 'highpass', 3000, 0.7, 0.9, 0.45, 1.0); },
  // crashing brush as it bolts: heavy rustle, snapping branches, thuds
  swCrash(A, pos, v = 1, dur = 1.5) { if (!ok(A)) return; const c = A.ctx, t = c.currentTime; const o = out(A, pos, 10); o.gain.value = v;
    const s = nsrc(c, t, dur, 1); const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.5; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.6, t + 0.03);
    for (let k = 0; k < 18; k++) g.gain.setTargetAtTime(0.1 + Math.random() * 0.6, t + k * dur / 18, 0.015); g.gain.setTargetAtTime(0.0001, t + dur, 0.08); s.connect(bp).connect(g).connect(o);
    for (let k = 0; k < 4; k++) twig(c, o, t + Math.random() * dur * 0.8, 1.2); for (let k = 0; k < 3; k++) burst(c, o, t + Math.random() * dur * 0.7, 'lowpass', 220, 0.8, 0.14, 0.6, 0.5); },
};
