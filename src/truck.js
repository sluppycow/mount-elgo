// Forest-service pickup cab for the morning intro + a rugged handheld radio.
// Truck frame: +x right, +y up, -z forward. Driver seat x = -0.38, eye ~ (-0.38, 1.74, 0.12).
import * as THREE from 'three';
import { leatherMaps, fabricMaps, paintMaps, texOf, smooth, rbox, boxUV, fbmField, hfNormal } from './procedural.js';
import { stippleMaps, knurlNormal } from './textures.js';
import { WALKIE } from './grip.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const cnv = (w, h, f) => { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), w, h); return c; };
function mats() {
  const L = leatherMaps(), F = fabricMaps();
  const leatherN = texOf(L.n, { rep: [6, 6] }), leatherR = texOf(L.r, { rep: [6, 6] });
  const M = {};
  const TL = new THREE.TextureLoader(); const dashN = TL.load('assets/tex/mychief/mychief-dash-normal.jpg'); dashN.wrapS = dashN.wrapT = THREE.RepeatWrapping; dashN.repeat.set(6, 6); dashN.anisotropy = 8;
  M.dash = new THREE.MeshPhysicalMaterial({ color: 0x3a2c22, roughness: 0.78, normalMap: dashN, normalScale: new THREE.Vector2(0.6, 0.6), roughnessMap: leatherR, sheen: 0.25, sheenColor: new THREE.Color(0x605850), sheenRoughness: 0.7, side: THREE.DoubleSide });
  M.vinyl = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.7, normalMap: leatherN, normalScale: new THREE.Vector2(0.5, 0.5), roughnessMap: leatherR });
  M.plastic = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.62, normalMap: texOf(L.n, { rep: [14, 14] }), normalScale: new THREE.Vector2(0.15, 0.15) });
  M.trim = new THREE.MeshStandardMaterial({ color: 0x4a3c30, roughness: 0.66, normalMap: texOf(L.n, { rep: [10, 10] }), normalScale: new THREE.Vector2(0.2, 0.2) });
  M.fabric = new THREE.MeshStandardMaterial({ color: 0x5e5a52, roughness: 0.95, normalMap: texOf(F.n, { rep: [24, 24] }), normalScale: new THREE.Vector2(0.5, 0.5) });
  M.seat = new THREE.MeshStandardMaterial({ color: 0x8a6f50, roughness: 0.9, normalMap: texOf(F.n, { rep: [30, 30] }), normalScale: new THREE.Vector2(0.7, 0.7) });
  M.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.12, metalness: 1 });
  M.rubber = new THREE.MeshStandardMaterial({ color: 0x111213, roughness: 0.85 });
  M.mirror = new THREE.MeshStandardMaterial({ color: 0x59606a, roughness: 0.04, metalness: 1, envMapIntensity: 0.7 });
  M.wheel = new THREE.MeshPhysicalMaterial({ color: 0x1e1c1a, roughness: 0.55, normalMap: texOf(L.n, { rep: [40, 2] }), normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: texOf(L.r, { rep: [40, 2] }), sheen: 0.3, sheenColor: new THREE.Color(0x504840) });
  // forest-green metallic paint under a clear coat (reflects the morning sky), light dust + chips
  const P = paintMaps('truck', 0x2c4a2a, 0x6a6a60, { seed: 61, chips: 0.08, grime: 0.6 });
  M.paint = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: texOf(P.map, { srgb: true, rep: [1.5, 1.5] }), roughness: 0.5, roughnessMap: texOf(P.rough, { rep: [1.5, 1.5] }), metalness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.18, envMapIntensity: 0.55 });
  M.glass = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.08, depthWrite: false, envMapIntensity: 0.9, side: THREE.DoubleSide });
  return M;
}
const mesh = (g, m, p, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; p.add(o); return o; };
// profile in (fwd = -z, y) extruded across x, welded + smoothed (soft padded look)
function extrudeProfile(pts, x0, x1, bevel = 0.012, curve = 10) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) s.quadraticCurveTo(p[2], p[3], p[0], p[1]); else s.lineTo(p[0], p[1]); }
  const g = new THREE.ExtrudeGeometry(s, { depth: x1 - x0 - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: curve, steps: 1 });
  g.applyMatrix4(new THREE.Matrix4().makeBasis(V(0, 0, -1), V(0, 1, 0), V(1, 0, 0))); g.translate(x0 + bevel, 0, 0);
  return smooth(g, 4);
}
function gaugeCanvas() {
  return cnv(1024, 384, (c, w, h) => {
    c.fillStyle = '#060606'; c.fillRect(0, 0, w, h);
    const dial = (cx, cy, R, a0, a1, labels, minor, title, red) => {
      const g = c.createRadialGradient(cx, cy, R * 0.2, cx, cy, R); g.addColorStop(0, '#141414'); g.addColorStop(1, '#0a0a0a'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
      c.strokeStyle = '#3a3a3a'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
      const N = (labels.length - 1) * minor;
      for (let i = 0; i <= N; i++) { const a = a0 + (a1 - a0) * i / N; const major = i % minor === 0; const r0 = R * (major ? 0.78 : 0.85);
        c.strokeStyle = red && i / N > red ? '#ff4a2a' : '#f2efe6'; c.lineWidth = major ? 5 : 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92); c.stroke();
        if (major) { c.fillStyle = '#f2efe6'; c.font = `bold ${R * 0.16 | 0}px Arial`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(labels[i / minor], cx + Math.cos(a) * R * 0.6, cy + Math.sin(a) * R * 0.6); } }
      c.fillStyle = '#bdb8ac'; c.font = `${R * 0.11 | 0}px Arial`; c.textAlign = 'center'; c.fillText(title, cx, cy + R * 0.42);
    };
    const A0 = Math.PI * 0.75, A1 = Math.PI * 2.25;
    dial(330, 192, 170, A0, A1, ['0', '20', '40', '60', '80', '100', '120'], 4, 'MPH', 0);
    dial(700, 192, 150, A0, A1, ['0', '1', '2', '3', '4', '5', '6'], 4, 'RPM x1000', 0.8);
    dial(110, 200, 78, Math.PI * 0.8, Math.PI * 1.2 + Math.PI, ['E', '½', 'F'], 4, 'FUEL', 0);
    dial(920, 200, 78, Math.PI * 0.8, Math.PI * 1.2 + Math.PI, ['C', '', 'H'], 4, 'TEMP', 0.85);
    c.fillStyle = '#1a1a1a'; c.fillRect(270, 270, 120, 34); c.fillStyle = '#ffb040'; c.font = 'bold 24px monospace'; c.textAlign = 'center'; c.fillText('148213', 330, 288);
    c.fillStyle = '#2aff6a'; c.beginPath(); c.moveTo(470, 40); c.lineTo(495, 25); c.lineTo(495, 55); c.fill(); // turn arrows (dim)
    c.beginPath(); c.moveTo(560, 40); c.lineTo(535, 25); c.lineTo(535, 55); c.fill();
  });
}
// needle rotation for a dial sweeping +-sweep degrees about 12 o'clock (clockwise = increasing)
export const GAUGE = { rot: (f, sweep) => Math.PI / 2 - (-sweep + 2 * sweep * Math.max(0, Math.min(1, f))) * Math.PI / 180 };
export function buildTruck(scene) {
  const M = mats(); const T = new THREE.Group(); scene.add(T); const R = {};
  // ---------- hood: crowned panel with rolled edges + front fenders ----------
  { const g = new THREE.PlaneGeometry(1.86, 1.9, 40, 30); g.rotateX(-Math.PI / 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); const u = x / 0.93, v = (z + 0.95) / 1.9; // v: 0 = windshield end, 1 = nose
      let y = 0.035 * (1 - u * u) - 0.06 * v - 0.012 * Math.cos(u * Math.PI * 3) * (1 - Math.abs(u)); const edge = Math.max(0, Math.abs(u) - 0.86) / 0.14; y -= edge * edge * 0.12; const nose = Math.max(0, v - 0.92) / 0.08; y -= nose * nose * 0.1;
      p.setY(i, y); p.setX(i, x * (1 - edge * 0.02)); }
    g.computeVertexNormals(); const hood = mesh(g, M.paint, T, 0, 1.31, -1.9); R.hood = hood;
    for (const s of [-1, 1]) { const f = mesh(rbox(0.22, 0.5, 1.8, 0.06, 4), M.paint, T, s * 0.84, 1.04, -1.9); }
    mesh(rbox(1.86, 0.55, 1.8, 0.05, 2), M.paint, T, 0, 0.98, -1.9); }
  // cowl with wiper slots + two wipers resting at the base of the windshield
  { const cowlT = cnv(512, 64, (c, w, h) => { c.fillStyle = '#1a1b1c'; c.fillRect(0, 0, w, h); c.fillStyle = '#050505'; for (let x = 10; x < w - 10; x += 14) c.fillRect(x, 18, 8, 28); });
    const cm = new THREE.MeshStandardMaterial({ map: texOf(cowlT, { srgb: true }), roughness: 0.7 }); const cowl = mesh(rbox(1.7, 0.03, 0.2, 0.012), cm, T, 0, 1.335, -0.98); cowl.rotation.x = 0.12;
    for (const x of [-0.55, 0.1]) { const w = new THREE.Group(); w.position.set(x, 1.37, -0.93); w.rotation.set(-0.62, 0, 0.06); T.add(w);
      const arm = mesh(rbox(0.6, 0.012, 0.018, 0.005), M.plastic, w, 0.3, 0, 0); mesh(rbox(0.56, 0.02, 0.01, 0.004), M.rubber, w, 0.31, 0.006, -0.012); mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.025, 16), M.plastic, w, 0, -0.005, 0); } }
  // ---------- windshield, pillars, roof ----------
  const wsB = V(0, 1.41, -0.88), wsT = V(0, 2.0, -0.32);
  { const L = wsB.distanceTo(wsT); const g = new THREE.PlaneGeometry(1.6, L); const ws = new THREE.Mesh(g, M.glass); ws.position.copy(wsB).lerp(wsT, 0.5); ws.rotation.x = -Math.atan2(wsT.z - wsB.z, wsT.y - wsB.y) * -1 - Math.PI / 2 + Math.PI / 2; ws.lookAt(ws.position.clone().add(V(0, 0.69, 0.72))); ws.renderOrder = 3; T.add(ws); R.windshield = ws;
    // a faint film of dust toward the edges + a wiper arc
    const dust = cnv(512, 256, (c, w, h) => { const n = fbmField(128, 31, 4, 4); const im = c.createImageData(128, 128); for (let i = 0; i < n.length; i++) { const v = n[i] * 255; im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = 255; im.data[i * 4 + 3] = v * 0.5; } const t = document.createElement('canvas'); t.width = t.height = 128; t.getContext('2d').putImageData(im, 0, 0);
      c.drawImage(t, 0, 0, w, h); c.globalCompositeOperation = 'destination-out'; for (const cx of [w * 0.28, w * 0.66]) { const g = c.createRadialGradient(cx, h * 1.05, h * 0.25, cx, h * 1.05, h * 0.95); g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(0.85, 'rgba(0,0,0,0.85)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h); } });
    const dm = new THREE.MeshBasicMaterial({ map: texOf(dust, { srgb: true }), transparent: true, opacity: 0.22, depthWrite: false, color: 0xd8c8a8 }); const d = new THREE.Mesh(g, dm); d.position.copy(ws.position); d.quaternion.copy(ws.quaternion); d.translateZ(0.002); d.renderOrder = 4; T.add(d); }
  for (const s of [-1, 1]) { const curve = new THREE.CatmullRomCurve3([V(s * 0.81, 1.36, -0.9), V(s * 0.79, 1.7, -0.62), V(s * 0.75, 2.0, -0.32), V(s * 0.72, 2.03, -0.2)]);
    const g = new THREE.TubeGeometry(curve, 24, 0.05, 12, false); g.scale(1, 1, 1); const pil = mesh(g, M.trim, T); pil.scale.set(1, 1, 1);
    mesh(new THREE.TubeGeometry(curve, 24, 0.056, 12, false), M.paint, T, s * 0.03, 0, -0.015); }
  { const g = new THREE.PlaneGeometry(1.62, 1.5, 16, 10); g.rotateX(Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, 0.025 * (1 - (x / 0.81) ** 2)); } g.computeVertexNormals();
    const roof = mesh(g, M.fabric, T, 0, 2.02, 0.42); roof.material.side = THREE.DoubleSide; mesh(rbox(1.66, 0.05, 0.1, 0.02), M.trim, T, 0, 2.0, -0.31); }
  // sun visors (driver's flipped down against the low morning sun) + rear-view mirror
  for (const [x, a] of [[-0.4, 0.3], [0.38, 0.1]]) { const v = new THREE.Group(); v.position.set(x, 1.99, -0.27); v.rotation.x = a; T.add(v); mesh(rbox(0.38, 0.022, 0.17, 0.01, 3), M.fabric, v, 0, -0.005, 0.085); mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.36, 8).rotateZ(Math.PI / 2), M.trim, v, 0, 0, 0); }
  { const m = new THREE.Group(); m.position.set(0.0, 1.88, -0.4); m.rotation.set(-0.12, 0.28, 0); T.add(m); mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.1, 8), M.plastic, m, 0, 0.06, -0.02);
    mesh(rbox(0.27, 0.075, 0.035, 0.015, 3), M.plastic, m, 0, 0, 0); const gl = mesh(rbox(0.255, 0.062, 0.004, 0.012, 2), M.mirror, m, 0, 0, 0.017); R.rearMirror = gl; }
  // ---------- dashboard: one padded, leather-grained piece ----------
  const dashP = [[0.95, 1.40], [0.66, 1.41, 0.80, 1.425], [0.6, 1.34, 0.585, 1.395], [0.555, 1.12, 0.565, 1.24], [0.5, 0.86, 0.53, 0.98], [0.62, 0.74], [0.95, 0.74]];
  const dash = mesh(extrudeProfile(dashP, -0.84, 0.84, 0.02, 12), M.dash, T); R.dash = dash;
  // instrument binnacle: brow hood + bezel + backlit gauge face + needles + glass
  { const cl = new THREE.Group(); cl.position.set(-0.38, 1.27, -0.575); cl.rotation.x = -0.3; T.add(cl); R.cluster = cl;
    const brow = new THREE.CylinderGeometry(0.29, 0.29, 0.12, 40, 1, true, -Math.PI * 0.36, Math.PI * 0.72); brow.rotateX(Math.PI / 2); brow.rotateZ(Math.PI / 2 * 0 ); const b = mesh(brow, M.dash, cl, 0, -0.2, 0.06); b.rotation.z = 0; b.scale.set(1, 0.55, 1); b.material = M.dash;
    mesh(rbox(0.46, 0.25, 0.03, 0.02, 3), M.plastic, cl, 0, 0, -0.01);
    const gt = new THREE.TextureLoader().load('assets/tex/mychief/mychief-truck-gauges.png'); gt.colorSpace = THREE.SRGBColorSpace; gt.anisotropy = 8;
    const face = mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: gt, emissiveMap: gt, emissive: 0xfff2e0, emissiveIntensity: 0.55, roughness: 0.6 }), cl, 0, 0, 0.008);
    const needle = (cx, cy, r) => { const pv = new THREE.Group(); pv.position.set(cx, cy, 0.012); cl.add(pv); const n = mesh(rbox(r, 0.004, 0.002, 0.0015), new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: 0xff4a10, emissiveIntensity: 1.2 }), pv, r * 0.5 - 0.006, 0, 0); mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.006, 16).rotateX(Math.PI / 2), M.plastic, pv, 0, 0, 0.002); return pv; };
    // MyChief cluster: speedo (200,235) / tach (824,235) r=178 px, small dials r=60 px (fuel, temp, oil, batt)
    const sx = 0.42 / 1024, sy = 0.21 / 512; const at = (px, py) => [(px - 512) * sx, (256 - py) * sy];
    R.speedo = needle(...at(200, 235), 0.066); R.tach = needle(...at(824, 235), 0.066); R.fuel = needle(...at(450, 118), 0.021); R.temp = needle(...at(574, 118), 0.021); R.oil = needle(...at(450, 254), 0.021); R.batt = needle(...at(574, 254), 0.021);
    const cg = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.23), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.1, depthWrite: false })); cg.position.z = 0.03; cl.add(cg); }
  // centre stack: AM/FM radio with a green LCD, vents, heater knobs; forest-service mobile radio under the dash
  { const cs = new THREE.Group(); cs.position.set(0.02, 1.12, -0.555); cs.rotation.x = -0.18; T.add(cs);
    mesh(rbox(0.3, 0.36, 0.04, 0.015, 3), M.plastic, cs, 0, 0, -0.01);
    const lcd = cnv(256, 64, (c, w, h) => { c.fillStyle = '#04140a'; c.fillRect(0, 0, w, h); c.fillStyle = '#7dffb0'; c.font = 'bold 34px monospace'; c.fillText('FM 89.3', 18, 44); c.font = '16px monospace'; c.fillText('ST', 210, 24); });
    mesh(rbox(0.2, 0.055, 0.02, 0.006), M.plastic, cs, 0, 0.11, 0.012); mesh(new THREE.PlaneGeometry(0.11, 0.028), new THREE.MeshStandardMaterial({ map: texOf(lcd, { srgb: true }), emissiveMap: texOf(lcd, { srgb: true }), emissive: 0xffffff, emissiveIntensity: 0.9 }), cs, -0.02, 0.11, 0.023);
    for (const x of [-0.085, 0.075]) mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.016, 20).rotateX(Math.PI / 2), M.chrome, cs, x, 0.11, 0.028);
    const ventT = cnv(128, 64, (c, w, h) => { c.fillStyle = '#0b0b0c'; c.fillRect(0, 0, w, h); for (let y = 4; y < h; y += 9) { c.fillStyle = '#2b2c2e'; c.fillRect(2, y, w - 4, 4); } });
    const ventM = new THREE.MeshStandardMaterial({ map: texOf(ventT, { srgb: true }), roughness: 0.6 });
    for (const x of [-0.07, 0.07]) { mesh(rbox(0.11, 0.06, 0.02, 0.008), M.plastic, cs, x, 0.02, 0.01); mesh(new THREE.PlaneGeometry(0.095, 0.048), ventM, cs, x, 0.02, 0.021); }
    for (const x of [-0.08, 0, 0.08]) { mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.02, 24).rotateX(Math.PI / 2), M.plastic, cs, x, -0.07, 0.015); mesh(rbox(0.004, 0.022, 0.004, 0.001), new THREE.MeshStandardMaterial({ color: 0xff8a30, emissive: 0xff6a10, emissiveIntensity: 0.5 }), cs, x, -0.07, 0.027); }
    const fs = new THREE.Group(); fs.position.set(0.02, 0.8, -0.5); T.add(fs); mesh(rbox(0.24, 0.07, 0.2, 0.01, 2), new THREE.MeshStandardMaterial({ color: 0x2c2e2c, roughness: 0.5, metalness: 0.5 }), fs, 0, 0, 0);
    const fsd = cnv(128, 32, (c, w, h) => { c.fillStyle = '#100800'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb040'; c.font = 'bold 22px monospace'; c.fillText('CH 07', 20, 24); });
    mesh(new THREE.PlaneGeometry(0.07, 0.02), new THREE.MeshStandardMaterial({ map: texOf(fsd, { srgb: true }), emissiveMap: texOf(fsd, { srgb: true }), emissive: 0xffffff, emissiveIntensity: 1 }), fs, -0.05, 0.005, 0.101); }
  // side vents, glovebox, door panels
  for (const x of [-0.72, 0.72]) { const v = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.03, 28).rotateX(Math.PI / 2), M.plastic, T, x, 1.23, -0.565); v.rotation.x = Math.PI / 2 - 0.2;
    for (let k = -2; k <= 2; k++) mesh(rbox(0.08, 0.004, 0.012, 0.002), M.trim, T, x, 1.23 + k * 0.016, -0.548); }
  { const gb = mesh(rbox(0.42, 0.2, 0.025, 0.02, 3), M.dash, T, 0.45, 1.0, -0.515); gb.rotation.x = 0.15; mesh(rbox(0.07, 0.018, 0.012, 0.005), M.chrome, T, 0.45, 1.075, -0.5); }
  for (const s of [-1, 1]) { const d = new THREE.Group(); d.position.set(s * 0.86, 0, 0.1); T.add(d);
    mesh(rbox(0.07, 0.62, 1.2, 0.03, 3), M.vinyl, d, 0, 1.0, 0); mesh(rbox(0.1, 0.05, 0.5, 0.02, 3), M.vinyl, d, -s * 0.05, 1.08, 0.12); mesh(rbox(0.09, 0.04, 1.22, 0.015), M.trim, d, 0, 1.34, 0);
    mesh(rbox(0.02, 0.03, 0.12, 0.008), M.chrome, d, -s * 0.04, 1.2, -0.2);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.6), M.glass); sg.rotation.y = Math.PI / 2; sg.position.set(s * 0.02, 1.66, -0.05); d.add(sg);
    // exterior mirror on an arm
    const om = new THREE.Group(); om.position.set(s * 0.17, 1.47, -0.62); T.add(om); om.position.x = s * 1.03; om.rotation.y = -s * 0.25;
    mesh(rbox(0.1, 0.03, 0.03, 0.01), M.plastic, om, -s * 0.07, -0.06, 0); mesh(rbox(0.13, 0.24, 0.06, 0.025, 3), M.plastic, om, 0, 0, 0); const mg = mesh(rbox(0.118, 0.225, 0.004, 0.02, 2), M.mirror, om, 0, 0, 0.03); }
  // B-pillars, back wall + rear window, bench seat
  for (const s of [-1, 1]) mesh(rbox(0.09, 1.0, 0.12, 0.03), M.trim, T, s * 0.84, 1.5, 0.98);
  mesh(rbox(1.7, 0.6, 0.05, 0.02), M.trim, T, 0, 1.0, 1.06); const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), M.glass); rw.position.set(0, 1.62, 1.05); T.add(rw);
  mesh(rbox(1.5, 0.62, 0.16, 0.06, 4), M.seat, T, 0, 1.28, 0.5); mesh(rbox(1.5, 0.15, 0.6, 0.06, 4), M.seat, T, 0, 0.98, 0.25);
  // ---------- steering wheel: leather rim, 3 spokes, padded hub, column + stalks ----------
  const wheel = new THREE.Group(); wheel.position.set(-0.38, 1.36, -0.44); wheel.rotation.x = -0.45; T.add(wheel); R.wheel = wheel; R.wheelR = 0.19;
  const rim = mesh(new THREE.TorusGeometry(0.19, 0.0135, 18, 96), M.wheel, wheel); R.rim = rim;
  for (const a of [0, Math.PI, -Math.PI / 2]) { const sp = new THREE.Group(); sp.rotation.z = a; wheel.add(sp); const s = mesh(rbox(0.15, a === -Math.PI / 2 ? 0.05 : 0.04, 0.016, 0.008, 3), M.plastic, sp, 0.1, 0, -0.012); s.rotation.y = 0.18; }
  { const prof = [[0, -0.03], [0.055, -0.03], [0.068, -0.012], [0.066, 0.008], [0.05, 0.02], [0, 0.026]].map(p => new THREE.Vector2(p[0], p[1]));
    const hub = new THREE.LatheGeometry(prof, 40); hub.rotateX(Math.PI / 2); const h = mesh(hub, M.vinyl, wheel, 0, 0, -0.01); h.scale.set(1.15, 0.9, 1);
    const emb = cnv(128, 128, (c, w, h) => { c.fillStyle = '#1b1b1b'; c.fillRect(0, 0, w, h); c.strokeStyle = '#9a9a9a'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 46, 0, 7); c.stroke(); c.fillStyle = '#b0b0b0'; c.font = 'bold 30px serif'; c.textAlign = 'center'; c.fillText('USFS', 64, 75); });
    mesh(new THREE.CircleGeometry(0.022, 32), new THREE.MeshStandardMaterial({ map: texOf(emb, { srgb: true }), metalness: 0.6, roughness: 0.35 }), wheel, 0, 0, 0.0165); }
  { const col = mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 20), M.plastic, wheel, 0, 0, -0.22); col.rotation.x = Math.PI / 2;
    mesh(rbox(0.11, 0.09, 0.12, 0.03, 3), M.plastic, wheel, 0, -0.01, -0.09);
    for (const s of [-1, 1]) { const st = new THREE.Group(); st.position.set(s * 0.05, 0.0, -0.085); st.rotation.set(0, 0, s * 0.25 - (s < 0 ? 0.2 : 0)); wheel.add(st); const sk = mesh(new THREE.CylinderGeometry(0.0055, 0.007, 0.14, 12), M.plastic, st, s * 0.07, 0, 0); sk.rotation.z = Math.PI / 2; mesh(new THREE.SphereGeometry(0.0085, 12, 10), M.plastic, st, s * 0.142, 0, 0); } }
  upgradeTruck(T, M, R);
  T.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return { group: T, R, M };
}
// ---------- rugged forest-service handheld radio ----------
const FRONT_Q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(-1, 0, 0), V(0, 0, 1), V(0, 1, 0)));
function faceFront(o) { o.quaternion.copy(FRONT_Q); }
export function buildWalkie(ptt, side = -1) {
  const g = new THREE.Group(); const { hx, hy, hz, r } = WALKIE; const S = stippleMaps(3);
  const body = new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.62, normalMap: S.normal, normalScale: new THREE.Vector2(0.12, 0.12) });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x141515, roughness: 0.92, normalMap: S.normal, normalScale: new THREE.Vector2(0.9, 0.9), roughnessMap: S.rough });
  const knurl = knurlNormal(4); const knob = new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.55, normalMap: knurl, normalScale: new THREE.Vector2(1.2, 1.2) });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(rbox(hx * 2, hy * 2, hz * 2, r, 4), body, 0, 0, 0);
  // rubber over-mould on the lower back and sides
  add(rbox(hx * 2 + 0.002, hy * 1.2, hz * 1.1, r * 0.9, 3), rubber, 0, -hy * 0.42, -hz * 0.35);
  // recessed speaker grille with fine slots (front +y face, upper half)
  const gr = cnv(256, 256, (c, w, h) => { c.fillStyle = '#2a2b2d'; c.fillRect(0, 0, w, h); c.fillStyle = '#040404'; for (let y = 14; y < h - 10; y += 15) { c.beginPath(); c.roundRect(22, y, w - 44, 7, 3.5); c.fill(); } });
  const gn = cnv(256, 256, (c, w, h) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.fillStyle = '#000'; for (let y = 14; y < h - 10; y += 15) { c.beginPath(); c.roundRect(22, y, w - 44, 7, 3.5); c.fill(); } });
  const H = fbmField(256, 1, 1, 1); { const d = gn.getContext('2d').getImageData(0, 0, 256, 256).data; for (let i = 0; i < H.length; i++) H[i] = d[i * 4] / 255; }
  const grille = new THREE.MeshStandardMaterial({ map: texOf(gr, { srgb: true }), normalMap: texOf(hfNormal(H, 256, 2.5)), roughness: 0.7 });
  add(rbox(hx * 1.7, 0.003, hz * 0.85, 0.006), body, 0, hy + 0.0005, hz * 0.2);
  const gp = add(new THREE.PlaneGeometry(hx * 1.55, hz * 0.78), grille, 0, hy + 0.0022, hz * 0.2); faceFront(gp);
  // small backlit LCD + keypad strip (front, lower)
  const lcdC = cnv(128, 64, (c, w, h) => { c.fillStyle = '#1e2a14'; c.fillRect(0, 0, w, h); c.fillStyle = '#c8ff78'; c.font = 'bold 30px monospace'; c.fillText('07', 10, 42); c.font = '15px monospace'; c.fillText('ELGO', 62, 26); c.fillText('▮▮▮', 62, 48); });
  const lcd = add(new THREE.PlaneGeometry(hx * 1.3, 0.018), new THREE.MeshStandardMaterial({ map: texOf(lcdC, { srgb: true }), emissiveMap: texOf(lcdC, { srgb: true }), emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.25 }), 0, hy + 0.0012, -hz * 0.32);
  faceFront(lcd);
  for (let k = 0; k < 3; k++) add(rbox(0.011, 0.003, 0.007, 0.002), rubber, -0.015 + k * 0.015, hy + 0.001, -hz * 0.6);
  // top: knurled channel + volume knobs, antenna base, LED
  const top = hz; const ck = add(new THREE.CylinderGeometry(0.0085, 0.0085, 0.013, 28).rotateX(Math.PI / 2), knob, -0.013, -0.002, top + 0.0065);
  const vk = add(new THREE.CylinderGeometry(0.0075, 0.0075, 0.011, 28).rotateX(Math.PI / 2), knob, 0.003, -0.002, top + 0.0055);
  for (const [k, z] of [[ck, 0.013], [vk, 0.011]]) { const m = add(rbox(0.0012, 0.0035, 0.002, 0.0005), new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.5 }), k.position.x + 0.0055, k.position.y, top + z + 0.0002); }
  add(new THREE.CylinderGeometry(0.0065, 0.008, 0.026, 18).rotateX(Math.PI / 2), rubber, 0.019, -0.003, top + 0.013);
  // flexible rubber-duck whip: tapered tube along a gentle curve
  { const c = new THREE.CatmullRomCurve3([V(0.019, -0.003, top + 0.024), V(0.02, -0.004, top + 0.07), V(0.023, -0.006, top + 0.12), V(0.028, -0.009, top + 0.165)]);
    const tg = new THREE.TubeGeometry(c, 30, 0.0042, 12, false); const p = tg.attributes.position; // taper
    for (let i = 0; i < p.count; i++) { const t = Math.floor(i / 13) / 30; const q = c.getPointAt(Math.min(1, t)); const k = 1 - 0.45 * t; p.setXYZ(i, q.x + (p.getX(i) - q.x) * k, q.y + (p.getY(i) - q.y) * k, q.z + (p.getZ(i) - q.z) * k); }
    tg.computeVertexNormals(); add(tg, rubber, 0, 0, 0); add(new THREE.SphereGeometry(0.0026, 12, 8), rubber, 0.028, -0.009, top + 0.165); }
  const led = add(new THREE.SphereGeometry(0.0022, 12, 8), new THREE.MeshBasicMaterial({ color: 0x0a1a0a }), -0.024, 0.006, top + 0.0005);
  const ledGlow = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x40ff60, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: (() => { const c = cnv(64, 64, (x) => { const gg = x.createRadialGradient(32, 32, 0, 32, 32, 32); gg.addColorStop(0, 'rgba(255,255,255,1)'); gg.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gg; x.fillRect(0, 0, 64, 64); }); const t = new THREE.CanvasTexture(c); return t; })() }));
  ledGlow.scale.set(0.012, 0.012, 1); ledGlow.position.copy(led.position); g.add(ledGlow);
  // side PTT bar (textured rubber, ribbed) where the thumb rests + belt clip on the back
  { const pz = ptt ? ptt[2] : 0.03, py = ptt ? ptt[1] : 0; const p = add(rbox(0.004, 0.022, 0.034, 0.0018, 3), rubber, side * (hx + 0.0012), Math.max(-hy * 0.5, Math.min(hy * 0.5, py)), Math.max(-0.02, Math.min(hz - 0.02, pz)));
    for (let k = -2; k <= 2; k++) add(rbox(0.0012, 0.018, 0.0016, 0.0005), rubber, side * (hx + 0.0032), p.position.y, p.position.z + k * 0.006);
    add(rbox(0.004, 0.012, 0.012, 0.002), rubber, side * (hx + 0.0012), p.position.y, p.position.z - 0.028); }
  add(rbox(0.03, 0.004, 0.06, 0.003), body, 0, -hy - 0.002, 0.01);
  // label
  const lab = cnv(128, 32, (c, w, h) => { c.fillStyle = '#1c1d1f'; c.fillRect(0, 0, w, h); c.fillStyle = '#c9c4b4'; c.font = 'bold 18px Arial'; c.fillText('BK  KNG-P150', 6, 22); });
  const lb = add(new THREE.PlaneGeometry(hx * 1.4, 0.007), new THREE.MeshStandardMaterial({ map: texOf(lab, { srgb: true }), roughness: 0.6 }), 0, hy + 0.0012, -hz * 0.12); faceFront(lb);
  g.userData = { led, ledGlow };
  g.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}

// v7: 1980s USFS pickup detail pass: walnut-grain dash applique, two-tone stitched/pleated vinyl bench, door cards with
// armrests + window cranks + map pockets + carpeted kick panels, hood ribs, dash-mounted Forest Service radio with a
// coiled hand mic, and the exterior (fenders, bed, wheels, bumpers, grille + sealed-beam headlights) for outside shots.
function woodGrain() { return cnv(512, 128, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#5a3418'); g.addColorStop(1, '#4a2a12'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) { const y = Math.random() * h; c.strokeStyle = `rgba(${30 + Math.random() * 30},${14 + Math.random() * 12},6,${0.25 + Math.random() * 0.35})`; c.lineWidth = 0.6 + Math.random() * 2.2; c.beginPath(); c.moveTo(0, y);
    for (let x = 0; x <= w; x += 16) c.lineTo(x, y + Math.sin(x * 0.012 + i) * 4 + Math.sin(x * 0.05 + i * 3) * 1.2); c.stroke(); } }); }
function upgradeTruck(T, M, R) {
  const wood = new THREE.MeshPhysicalMaterial({ map: texOf(woodGrain(), { srgb: true, rep: [2, 1] }), roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const carpet = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1, normalMap: texOf(fabricMaps().n, { rep: [40, 40] }), normalScale: new THREE.Vector2(1, 1) });
  const stitch = new THREE.MeshStandardMaterial({ color: 0xd8c8a8, roughness: 0.8 });
  const darkV = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.75, normalMap: M.vinyl.normalMap, normalScale: new THREE.Vector2(0.5, 0.5) });
  // walnut applique across the passenger dash face + under the cluster
  for (const [x0, x1, y, z, rx] of [[-0.12, 0.8, 1.19, -0.548, -0.14], [-0.62, -0.14, 1.115, -0.535, -0.1]]) { const wdt = x1 - x0; const st = mesh(rbox(wdt, 0.055, 0.012, 0.005, 2), wood, T, (x0 + x1) / 2, y, z); st.rotation.x = rx;
    mesh(rbox(wdt + 0.01, 0.006, 0.014, 0.002), M.chrome, T, (x0 + x1) / 2, y + 0.03, z + 0.002).rotation.x = rx; }
  // dash-top Forest Service radio (bolted under the passenger dash lip) with a coiled hand mic hanging from a clip
  { const r = new THREE.Group(); r.position.set(0.32, 0.86, -0.47); T.add(r); const steel = new THREE.MeshStandardMaterial({ color: 0x3a3e36, roughness: 0.5, metalness: 0.55 });
    mesh(rbox(0.26, 0.07, 0.2, 0.008, 2), steel, r, 0, 0, 0); for (const s of [-1, 1]) mesh(rbox(0.012, 0.11, 0.16, 0.003), steel, r, s * 0.136, 0.03, 0);
    const lab = cnv(256, 64, (c, w, h) => { c.fillStyle = '#121310'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffb040'; c.font = 'bold 30px monospace'; c.fillText('168.625', 14, 42); c.fillStyle = '#c8c0a8'; c.font = '14px Arial'; c.fillText('USFS  KING', 160, 56); });
    const lt = texOf(lab, { srgb: true }); mesh(new THREE.PlaneGeometry(0.12, 0.03), new THREE.MeshStandardMaterial({ map: lt, emissiveMap: lt, emissive: 0xffffff, emissiveIntensity: 0.8 }), r, -0.05, 0.005, 0.101);
    for (const x of [0.05, 0.09]) mesh(new THREE.CylinderGeometry(0.011, 0.012, 0.016, 18).rotateX(Math.PI / 2), M.plastic, r, x, 0.005, 0.108);
    const mic = new THREE.Group(); mic.position.set(-0.2, 0.95, -0.5); T.add(mic); mesh(rbox(0.055, 0.075, 0.03, 0.012, 3), M.plastic, mic, 0, 0, 0); mesh(rbox(0.012, 0.025, 0.008, 0.003), M.rubber, mic, -0.03, 0.01, 0);
    mesh(rbox(0.03, 0.02, 0.012, 0.004), M.chrome, T, -0.2, 0.995, -0.517);
    const coil = []; for (let i = 0; i <= 200; i++) { const t = i / 200, a = t * Math.PI * 2 * 26; const p = V(-0.2, 0.92, -0.5).lerp(V(0.2, 0.86, -0.4), t); p.y -= Math.sin(t * Math.PI) * 0.14; coil.push(p.add(V(Math.cos(a) * 0.008, Math.sin(a) * 0.008, 0))); }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 260, 0.0022, 5), M.rubber, T); }
  // bench seat: pleated rolls with contrast stitching on the back + cushion, piping along the edges
  for (let x = -0.66; x <= 0.661; x += 0.12) { const b = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 14, 1), M.seat, T, x, 1.3, 0.418); b.scale.z = 0.35;
    const c = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.48, 14, 1), M.seat, T, x, 1.055, 0.24); c.rotation.x = Math.PI / 2; c.scale.x = 1; c.scale.z = 1; c.scale.y = 1; c.scale.set(1, 1, 0.35);
    mesh(new THREE.BoxGeometry(0.003, 0.5, 0.003), stitch, T, x + 0.06, 1.3, 0.414); mesh(new THREE.BoxGeometry(0.003, 0.003, 0.48), stitch, T, x + 0.06, 1.058, 0.24); }
  for (const [y, z] of [[1.59, 0.42], [1.055, -0.05]]) mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 10).rotateZ(Math.PI / 2), darkV, T, 0, y, z);
  // door cards: two-tone vinyl, walnut strip, padded armrest, pull handle, window crank, map pocket, carpeted kick panel
  for (const s of [-1, 1]) { const x = s * 0.82; mesh(rbox(0.02, 0.24, 1.1, 0.01), carpet, T, x, 0.82, 0.12); mesh(rbox(0.016, 0.03, 1.0, 0.006), wood, T, x, 1.24, 0.1);
    mesh(rbox(0.02, 0.12, 0.4, 0.01, 2), darkV, T, x - s * 0.005, 0.95, 0.0); // map pocket
    mesh(rbox(0.09, 0.06, 0.42, 0.025, 3), darkV, T, x - s * 0.04, 1.1, 0.18); // armrest
    const cr = new THREE.Group(); cr.position.set(x - s * 0.02, 1.12, -0.18); T.add(cr); cr.rotation.x = 0.6; // window crank
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 16).rotateZ(Math.PI / 2), M.chrome, cr, 0, 0, 0); mesh(rbox(0.008, 0.012, 0.075, 0.003), M.chrome, cr, -s * 0.008, 0, 0.035);
    mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.035, 12).rotateZ(Math.PI / 2), M.plastic, cr, -s * 0.025, 0, 0.07);
    mesh(rbox(0.03, 0.035, 0.1, 0.01), M.chrome, T, x - s * 0.03, 1.2, -0.12); } // pull handle
  // hood ribs (two pressed ridges) + hood ornament-free USFS shield decal on the cowl
  for (const x of [-0.32, 0.32]) { const c = new THREE.CatmullRomCurve3([V(x, 1.345, -1.0), V(x, 1.335, -1.9), V(x, 1.27, -2.82)]); mesh(new THREE.TubeGeometry(c, 30, 0.018, 8), M.paint, T).scale.y = 1; }
  // ---------- exterior ----------
  const bodyY = 0.98; mesh(rbox(1.92, 0.62, 2.0, 0.06, 3), M.paint, T, 0, bodyY, 0.15); // cab lower shell
  mesh(rbox(1.92, 0.5, 2.3, 0.05, 2), M.paint, T, 0, 0.95, 2.45); for (const s of [-1, 1]) mesh(rbox(0.06, 0.2, 2.3, 0.02), M.paint, T, s * 0.93, 1.27, 2.45); // bed sides
  mesh(rbox(1.92, 0.25, 0.06, 0.02), M.paint, T, 0, 1.2, 3.6); // tailgate top
  const tireM = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.92 }), rimM = new THREE.MeshStandardMaterial({ color: 0xc9c9c2, roughness: 0.35, metalness: 0.8 });
  for (const z of [-2.15, 2.45]) for (const s of [-1, 1]) { const w = new THREE.Group(); w.position.set(s * 0.86, 0.42, z); T.add(w);
    const tg = new THREE.TorusGeometry(0.3, 0.13, 14, 32); tg.rotateY(Math.PI / 2); mesh(tg, tireM, w); mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 24).rotateZ(Math.PI / 2), rimM, w);
    const arch = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.26, 24, 1, true, 0, Math.PI).rotateZ(Math.PI / 2), M.paint, T, s * 0.86, 0.45, z); arch.rotation.x = 0; arch.material = M.paint; }
  mesh(rbox(2.0, 0.16, 0.14, 0.03), M.chrome, T, 0, 0.62, -2.92); mesh(rbox(2.0, 0.14, 0.12, 0.03), M.chrome, T, 0, 0.66, 3.66);
  const grilleT = cnv(256, 64, (c, w, h) => { c.fillStyle = '#0c0c0c'; c.fillRect(0, 0, w, h); c.fillStyle = '#b8b8b0'; for (let y = 6; y < h; y += 12) c.fillRect(4, y, w - 8, 4); for (let x = 4; x < w; x += 42) c.fillRect(x, 0, 4, h); });
  mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshStandardMaterial({ map: texOf(grilleT, { srgb: true }), metalness: 0.6, roughness: 0.4 }), T, 0, 0.98, -2.86).rotation.y = Math.PI;
  for (const s of [-1, 1]) { mesh(rbox(0.22, 0.2, 0.04, 0.02), M.chrome, T, s * 0.72, 0.98, -2.86); const hl = mesh(new THREE.CircleGeometry(0.08, 24), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0c0, emissiveIntensity: 0.6, roughness: 0.1 }), T, s * 0.72, 0.98, -2.885); hl.rotation.y = Math.PI; }
  mesh(rbox(1.92, 0.42, 0.04, 0.02), M.paint, T, 0, 0.98, -2.84); // nose panel behind the grille
}
