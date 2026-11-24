// Breath planner: natural inhale/exhale cycles from sampled breaths (assets/audio/breath), shared by the game and the
// offline preview renderer. exertion 0..1 (0 = calm, 1 = after a sprint or a scare); hold = breath held while aiming.
export const BREATH_SAMPLES = {
  in_nose: ['in_nose_1', 'in_nose_2', 'in_nose_3'], out_nose: ['out_nose_1', 'out_nose_2', 'out_nose_3'],
  in_mouth: ['in_mouth_1', 'in_mouth_2'], out_mouth: ['out_mouth_1', 'out_mouth_2'],
  in_heavy: ['in_heavy_1', 'in_heavy_2', 'in_heavy_3'], out_heavy: ['out_heavy_1', 'out_heavy_2', 'out_heavy_3'], release: ['out_release_1'],
};
export class BreathPlanner {
  constructor(durations = {}, seed = 1) { this.dur = durations; this.s = seed >>> 0 || 1; this.next = 0.3; this.phase = 'in'; this.held = false; this.last = {}; }
  rnd() { this.s = (this.s * 1664525 + 1013904223) >>> 0; return this.s / 4294967296; }
  pick(fam) { const L = BREATH_SAMPLES[fam]; let id; do { id = L[Math.floor(this.rnd() * L.length)]; } while (L.length > 1 && id === this.last[fam]); this.last[fam] = id; return id; }
  // returns the events due before `until`: [time, sampleId, gain, playbackRate]
  plan(until, ex, hold) {
    const out = [];
    while (this.next < until) {
      const t = this.next; const r = this.rnd();
      // aiming: natural respiratory pause. If an exhale is due, let it out (a little shorter/quieter), then hold at the
      // bottom of the breath; if we are already at the exhale pause, hold right there. Never hold on a fresh inhale.
      if (hold && !this.held && this.phase === 'in') { this.held = true; this.holdT = t; }
      if (hold && !this.held && this.phase === 'out') { const fam = this.last.fam || 'nose'; const id = this.pick('out_' + fam); const d = this.dur[id] || 2;
        out.push([t, id, (0.34 + 0.5 * ex) * 0.85, 1.08]); this.phase = 'in'; this.next = t + d / 1.08 + 0.05; continue; }
      if (this.held) { if (hold) { this.next = t + 0.1; continue; } this.held = false; const id = this.pick('release'); out.push([t, id, 0.5 + 0.4 * ex, 1]); this.phase = 'in'; this.next = t + (this.dur[id] || 1.1) * 0.85 + 0.2; continue; }
      const bpm = 13.5 + 22 * ex + (r - 0.5) * 2.5; const cyc = 60 / bpm; // 12-16 / min at rest
      const fam = ex > 0.68 ? 'heavy' : ex > 0.33 ? (this.rnd() < (ex - 0.33) * 2.4 ? 'mouth' : 'nose') : (this.rnd() < 0.05 && this.last.fam !== 'mouth' ? 'mouth' : 'nose');
      this.last.fam = fam;
      const gain = (0.38 + 0.55 * ex) * (0.85 + this.rnd() * 0.25) * (fam === 'nose' ? 1 : 0.9);
      if (this.phase === 'in') {
        const id = this.pick('in_' + fam); const want = cyc * (0.38 + this.rnd() * 0.06); const d = this.dur[id] || 1.4;
        const rate = Math.min(1.18, Math.max(0.88, d / want)); out.push([t, id, gain, rate]); this.phase = 'out';
        this.next = t + Math.min(want, d / rate) + 0.04 + this.rnd() * 0.12; // brief top-of-breath pause
      } else {
        const id = this.pick('out_' + fam); const want = cyc * (0.47 + this.rnd() * 0.06); const d = this.dur[id] || 2;
        const rate = Math.min(1.15, Math.max(0.88, d / want)); out.push([t, id, gain * 0.95, rate]); this.phase = 'in';
        this.next = t + Math.max(want, cyc * 0.5) + cyc * (0.08 + this.rnd() * 0.1); // rest pause before the next inhale
      }
    }
    return out;
  }
}
// exertion follower: jumps up quickly, recovers slowly (~15 s time constant)
export function exertionStep(cur, target, dt) { const k = target > cur ? 1 - Math.exp(-dt / 0.8) : 1 - Math.exp(-dt / 15); return cur + (target - cur) * k; }
