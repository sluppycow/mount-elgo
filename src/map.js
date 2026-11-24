// Loads the MyChief terrain map (assets/map/). Returns null if anything is missing -> procedural fallback.
import { useMap } from './geo.js';
const BASE = 'assets/map/';
async function grey(url) { // decode an 8-bit L/RGBA png into a Float32Array 0..1 (channel 0)
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, img.width, img.height).data; const out = new Float32Array(img.width * img.height); for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return { a: out, n: img.width };
}
export async function loadMap() {
  try {
    const [S, J] = await Promise.all([fetch(BASE + 'mychief-map-scale.json').then(r => { if (!r.ok) throw 0; return r.json(); }), fetch(BASE + 'mychief-map.min.json').then(r => { if (!r.ok) throw 0; return r.json(); })]);
    const r = await fetch(BASE + 'mychief-map-height-1024.u16'); if (!r.ok) throw 0;
    const raw = new Uint16Array(await r.arrayBuffer()); const n = 1024; if (raw.length !== n * n) throw 0;
    const span = S.height_max_m - S.height_min_m; const heights = new Float32Array(raw.length); for (let i = 0; i < raw.length; i++) heights[i] = S.height_min_m + raw[i] / 65535 * span;
    const [dens, burn] = await Promise.all([grey(BASE + 'mychief-map-tree-density-256.png'), grey(BASE + 'mychief-map-mask-burn-512.png').catch(() => null)]);
    const M = { heights, n, step: S.extent_m / (n - 1), half: S.extent_m / 2, json: J, scale: S, dens: dens.a, dn: dens.n, burn: burn && burn.a, bn: burn && burn.n, base: BASE };
    useMap(M); return M;
  } catch (e) { console.warn('MyChief map not available, using procedural terrain', e); return null; }
}
