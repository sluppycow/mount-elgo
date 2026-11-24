// Small deterministic value/gradient noise helpers (no deps).
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const perm = new Uint8Array(512);
(() => { const r = mulberry32(1337); const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; })();
const G = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
export function noise2(x, y) {
  const X = Math.floor(x), Y = Math.floor(y); const xf = x - X, yf = y - Y;
  const xi = X & 255, yi = Y & 255;
  const g = (i, j, dx, dy) => { const h = G[perm[i + perm[j]] & 7]; return h[0] * dx + h[1] * dy; };
  const n00 = g(xi, yi, xf, yf), n10 = g(xi + 1, yi, xf - 1, yf), n01 = g(xi, yi + 1, xf, yf - 1), n11 = g(xi + 1, yi + 1, xf - 1, yf - 1);
  const u = fade(xf), v = fade(yf);
  return (n00 + u * (n10 - n00)) + v * ((n01 + u * (n11 - n01)) - (n00 + u * (n10 - n00)));
}
export function fbm(x, y, oct = 5, lac = 2.0, gain = 0.5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, y * f); n += a; a *= gain; f *= lac; }
  return s / n;
}
export function ridged(x, y, oct = 5) {
  let a = 1, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) { let v = 1 - Math.abs(noise2(x * f + i * 17.3, y * f - i * 9.1)); v *= v; s += a * v; n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
export const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
