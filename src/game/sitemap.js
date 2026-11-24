// Hand-drawn USFS site map of the Elgo summit (drawn from the real terrain + object positions): contour lines, the tower,
// stairs, generator shed, water tank, outhouse, trailhead fire cache, the lantern trail and the old ranger cabin (red X).
// Pinned on the cab's door wall and readable full-screen.
import * as THREE from 'three';
import { height } from '../geo.js';
import { mulberry32 } from '../noise.js';

export function drawSiteMap(cv, { CB, GR, T }) {
  const x = cv.getContext('2d'), N = cv.width, R = 105, s = N / (2 * R); const r = mulberry32(31);
  const toC = (wx, wz) => [N / 2 + wx * s, N / 2 + wz * s]; // north (-z) up
  // paper
  x.fillStyle = '#d8ccab'; x.fillRect(0, 0, N, N); const im = x.getImageData(0, 0, N, N); for (let i = 0; i < im.data.length; i += 4) { const n = (r() - 0.5) * 18; im.data[i] += n; im.data[i + 1] += n; im.data[i + 2] += n * 0.8; } x.putImageData(im, 0, 0);
  const g = x.createRadialGradient(N / 2, N / 2, N * 0.2, N / 2, N / 2, N * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(90,60,20,0.35)'); x.fillStyle = g; x.fillRect(0, 0, N, N);
  // contours (marching squares, every 2 m, index every 10 m)
  const G = 96, H = new Float32Array((G + 1) * (G + 1)); let lo = 1e9, hi = -1e9; for (let j = 0; j <= G; j++) for (let i = 0; i <= G; i++) { const h = height(-R + i / G * 2 * R, -R + j / G * 2 * R); H[j * (G + 1) + i] = h; lo = Math.min(lo, h); hi = Math.max(hi, h); }
  const cs = N / G; for (let lv = Math.ceil(lo / 2) * 2; lv < hi; lv += 2) { const idx = Math.round(lv) % 10 === 0; x.strokeStyle = idx ? 'rgba(120,70,30,0.75)' : 'rgba(140,90,40,0.38)'; x.lineWidth = idx ? 1.6 : 0.8; x.beginPath();
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) { const a = H[j * (G + 1) + i], b = H[j * (G + 1) + i + 1], c = H[(j + 1) * (G + 1) + i + 1], d = H[(j + 1) * (G + 1) + i]; const P = [];
      const e = (h0, h1, x0, y0, x1, y1) => { if ((h0 < lv) !== (h1 < lv)) { const t = (lv - h0) / (h1 - h0); P.push([(x0 + (x1 - x0) * t) * cs, (y0 + (y1 - y0) * t) * cs]); } };
      e(a, b, i, j, i + 1, j); e(b, c, i + 1, j, i + 1, j + 1); e(c, d, i + 1, j + 1, i, j + 1); e(d, a, i, j + 1, i, j); for (let k = 0; k + 1 < P.length; k += 2) { x.moveTo(P[k][0], P[k][1]); x.lineTo(P[k + 1][0], P[k + 1][1]); } } x.stroke(); }
  // trees (stipple) away from the clearing
  x.fillStyle = 'rgba(40,70,40,0.35)'; for (let k = 0; k < 900; k++) { const wx = (r() - 0.5) * 2 * R, wz = (r() - 0.5) * 2 * R; if (Math.hypot(wx, wz) < 22) continue; if (CB && CB.trailDist(wx, wz) < 4) continue; const [cx, cy] = toC(wx, wz); x.beginPath(); x.arc(cx, cy, 2 + r() * 3, 0, 7); x.fill(); }
  const ink = '#2a2218'; x.strokeStyle = ink; x.fillStyle = ink; x.font = 'bold 18px "Courier New",monospace';
  const label = (t, wx, wz, dx = 10, dy = -8, col = ink, f = 'bold 24px "Courier New",monospace') => { const [cx, cy] = toC(wx, wz); x.fillStyle = col; x.font = f; x.fillText(t, cx + dx, cy + dy); };
  // fire road / trail south (dashed)
  x.setLineDash([10, 7]); x.lineWidth = 2.5; x.beginPath(); { const [a, b] = toC(GR.cachePos?.x ?? 0.5, GR.cachePos?.z ?? 21.7); const [c, d] = toC(4, 100); x.moveTo(N / 2, N / 2); x.lineTo(a, b); x.lineTo(c, d); } x.stroke();
  // lantern trail to the cabin
  if (CB) { x.setLineDash([4, 6]); x.strokeStyle = '#6a3a1a'; x.lineWidth = 3; x.beginPath(); CB.trailPts.forEach((p, i) => { const [cx, cy] = toC(p.x, p.z); i ? x.lineTo(cx, cy) : x.moveTo(cx, cy); }); x.stroke(); x.setLineDash([]);
    for (let k = 1; k < 7; k++) { const p = CB.trailAt(k / 7); const [cx, cy] = toC(p.x, p.z); x.fillStyle = '#b8681a'; x.beginPath(); x.arc(cx, cy, 3.2, 0, 7); x.fill(); } }
  x.setLineDash([]);
  // tower
  { const [cx, cy] = toC(0, 0); x.strokeStyle = ink; x.lineWidth = 3; x.strokeRect(cx - 5 * s, cy - 5 * s, 10 * s, 10 * s); x.beginPath(); x.moveTo(cx - 5 * s, cy - 5 * s); x.lineTo(cx + 5 * s, cy + 5 * s); x.moveTo(cx + 5 * s, cy - 5 * s); x.lineTo(cx - 5 * s, cy + 5 * s); x.stroke(); label('ELGO L.O.', 0, 0, 34, 8); }
  const sq = (wx, wz, w, t) => { const [cx, cy] = toC(wx, wz); x.fillStyle = ink; x.fillRect(cx - w / 2, cy - w / 2, w, w); if (t) label(t, wx, wz, w / 2 + 6, 5, ink, 'bold 19px "Courier New",monospace'); };
  if (T.stairs) sq(T.stairs.bottom.x, T.stairs.bottom.z, 7, 'STAIRS');
  if (GR.genWorld) sq(GR.genWorld.x, GR.genWorld.z, 11, 'GEN SHED');
  if (T.tankPos) { const [cx, cy] = toC(T.tankPos.x, T.tankPos.z); x.lineWidth = 2.5; x.beginPath(); x.arc(cx, cy, 9, 0, 7); x.stroke(); label('TANK', T.tankPos.x, T.tankPos.z, -54, 5, ink, 'bold 19px "Courier New",monospace'); }
  if (T.outPos) sq(T.outPos.x, T.outPos.z, 8, 'PRIVY');
  if (GR.cachePos) { const [cx, cy] = toC(GR.cachePos.x, GR.cachePos.z); x.fillStyle = '#9a1a10'; x.fillRect(cx - 6, cy - 6, 12, 12); label('FIRE CACHE / HOSE', GR.cachePos.x, GR.cachePos.z, 10, 5, '#7a1a10', 'bold 19px "Courier New",monospace'); }
  label('TRAIL TO FIRE RD \u2193', 4, 96, -40, 0, ink, 'bold 19px "Courier New",monospace');
  if (CB) { const c = CB.center; const [cx, cy] = toC(c.x, c.z); x.save(); x.translate(cx, cy); x.rotate(-CB.yaw); x.strokeStyle = ink; x.lineWidth = 2; x.strokeRect(-2.8 * s, -2.2 * s, 5.6 * s, 6.2 * s); x.restore();
    x.strokeStyle = '#b01a10'; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.moveTo(cx - 16, cy - 16); x.lineTo(cx + 16, cy + 16); x.moveTo(cx + 16, cy - 16); x.lineTo(cx - 16, cy + 16); x.stroke();
    x.beginPath(); x.ellipse(cx, cy, 34, 28, 0.3, 0, 7); x.lineWidth = 2.5; x.stroke();
    label('OLD RANGER CABIN', c.x, c.z, -140, -46, '#8a1208', 'bold 29px "Courier New",monospace'); label("MARSH'S .308 ON RACK", c.x, c.z, -150, 64, '#8a1208', 'italic bold 23px "Courier New",monospace');
    if (CB.campPos) { const [ax, ay] = toC(CB.campPos.x, CB.campPos.z); x.strokeStyle = ink; x.lineWidth = 2; x.beginPath(); x.moveTo(ax - 7, ay + 6); x.lineTo(ax, ay - 7); x.lineTo(ax + 7, ay + 6); x.closePath(); x.stroke(); label('old camp?', CB.campPos.x, CB.campPos.z, 10, 4, ink, 'italic 19px "Courier New",monospace'); } }
  // title block, north arrow, scale
  x.fillStyle = 'rgba(216,204,171,0.9)'; x.fillRect(N - 330, N - 120, 310, 100); x.strokeStyle = ink; x.lineWidth = 2; x.strokeRect(N - 330, N - 120, 310, 100);
  x.fillStyle = ink; x.font = 'bold 20px "Courier New",monospace'; x.fillText('ELGO LOOKOUT', N - 315, N - 92); x.font = '14px "Courier New",monospace'; x.fillText('SITE PLAN  \u00b7  KETTLE R.D.', N - 315, N - 70); x.fillText('USDA FOREST SERVICE  1987', N - 315, N - 50); x.fillText('contours 2 m', N - 315, N - 30);
  { const ax = 60, ay = 90; x.beginPath(); x.moveTo(ax, ay - 50); x.lineTo(ax - 14, ay); x.lineTo(ax, ay - 12); x.lineTo(ax + 14, ay); x.closePath(); x.fill(); x.font = 'bold 26px "Courier New",monospace'; x.fillText('N', ax - 9, ay + 30); }
  { const bx = 40, by = N - 40; x.lineWidth = 3; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + 50 * s, by); x.stroke(); for (const k of [0, 25, 50]) { x.beginPath(); x.moveTo(bx + k * s, by - 6); x.lineTo(bx + k * s, by + 6); x.stroke(); } x.font = '13px "Courier New",monospace'; x.fillText('0      25      50 m', bx - 4, by - 12); }
  // handwritten pencil note
  x.save(); x.translate(60, N - 210); x.rotate(-0.05); x.fillStyle = 'rgba(40,40,60,0.8)'; x.font = 'italic 27px "Segoe Print","Comic Sans MS",cursive'; x.fillText('Keep to the lantern trail after dark.', 0, 0); x.fillText('Rifle stays at the cabin. \u2014 D.M.', 0, 36); x.restore();
  return cv;
}
// framed map on the cab's door wall (right of the door, below the window line)
export function mountSiteMap(T, cv, { F, H }) {
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const g = new THREE.Group(); const w = 0.56, h = 0.56;
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 })); g.add(paper);
  const frameM = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
  for (const [fw, fh, fx, fy] of [[w + 0.05, 0.025, 0, h / 2 + 0.0125], [w + 0.05, 0.025, 0, -h / 2 - 0.0125], [0.025, h, w / 2 + 0.0125, 0], [0.025, h, -w / 2 - 0.0125, 0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(fw, fh, 0.018), frameM); m.position.set(fx, fy, 0.004); g.add(m); }
  const pinM = new THREE.MeshStandardMaterial({ color: 0xb01a10, roughness: 0.4 }); for (const [px, py] of [[-0.25, 0.25], [0.25, 0.25]]) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 8), pinM); p.position.set(px, py, 0.012); g.add(p); }
  g.position.set(1.12, F + 0.6, H - 0.075); g.rotation.y = Math.PI; T.group.add(g); return { group: g, pos: new THREE.Vector3(1.12, F + 0.6, H - 0.1) };
}
