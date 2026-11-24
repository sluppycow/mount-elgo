// Code-built bolt-action hunting rifle (.308 sporter): oiled walnut stock with cut checkering, blued/nitride steel
// receiver with a real ejection port and a working bolt, fluted barrel + ported muzzle brake, picatinny rail,
// 3-9x40 scope with rings / turrets / coated glass, detachable 5-round box mag, trigger + guard, sling studs + swivels,
// rubber recoil pad and an offset weapon light. Units: metres. Bore axis on y = 0, muzzle toward -Z, +X = right.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

import { buildGunMaterials, buildFlashlight } from './gun.js';
import { diamondKnurl } from './textures.js';
import { walnutMaps, tex } from './game/cabintex.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
export const RIFLE = { scopeY: 0.0485, eyeZ: 0.158, muzzleZ: -0.728, ejectZ: -0.038, boltTravel: 0.092, magCap: 5, length: 1.12 };
// v7: stock side profile in (z, y). Proper sporter pistol grip that starts BEHIND the trigger guard (front strap at
// z ~0.09) and sweeps down/back to a capped grip, so the trigger and guard sit in open air in front of the hand.
export function STOCK_PROFILE(s) {
  s.moveTo(-0.405, -0.016); s.lineTo(-0.15, -0.012); s.lineTo(0.082, -0.012);
  s.splineThru([V2(0.1, -0.013), V2(0.13, -0.021), V2(0.165, -0.022), V2(0.2, -0.0125), V2(0.255, -0.0045), V2(0.315, -0.006), V2(0.371, -0.0115)]);
  s.lineTo(0.386, -0.149); // butt (pad seat)
  s.splineThru([V2(0.33, -0.131), V2(0.27, -0.106), V2(0.225, -0.09), V2(0.19, -0.081), V2(0.166, -0.085), V2(0.153, -0.097), V2(0.147, -0.11), V2(0.144, -0.123), V2(0.141, -0.129)]);
  s.lineTo(0.12, -0.13); s.splineThru([V2(0.113, -0.112), V2(0.106, -0.088), V2(0.1, -0.066), V2(0.094, -0.052)]); s.lineTo(0.086, -0.047); s.lineTo(-0.145, -0.047);
  s.splineThru([V2(-0.25, -0.041), V2(-0.35, -0.032), V2(-0.398, -0.025), V2(-0.41, -0.02)]); s.lineTo(-0.405, -0.016);
}
const _ss = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function stockW(z, y) { let w = 1; // continuous everywhere (no shading seams)
  if (z > 0.11 && z < 0.21) w = 0.8 + 0.2 * Math.abs((z - 0.16) / 0.05) ** 2;
  const kg = _ss(-0.045, -0.07, y) * _ss(0.078, 0.095, z) * (1 - _ss(0.17, 0.19, z)); w = w + (Math.min(w, 0.78) - w) * kg;
  if (z >= 0.21) w = 1 + 0.02 * Math.min(1, (z - 0.21) / 0.1);
  if (z < -0.1) w = 1 - 0.08 * _ss(-0.1, -0.17, z) - 0.12 * Math.max(0, Math.min(1, (-0.15 - z) / 0.26)); return w; }
// signed distance to the rifle (rifle space, metres) for the hand solver: stock, receiver/bolt/handle, guard, mag, scope
let _SP = null;
// profile outline grown by 9.4 mm (the old bevel) along the vertex normals: the final outer silhouette of the stock
function stockPts() { if (_SP) return _SP; const sh = new THREE.Shape(); STOCK_PROFILE(sh); let P = sh.extractPoints(24).shape; const Q = [];
  for (const p of P) if (!Q.length || Q[Q.length - 1].distanceTo(p) > 1e-6) Q.push(p.clone()); if (Q[0].distanceTo(Q[Q.length - 1]) < 1e-6) Q.pop();
  let A = 0; for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length]; A += a.x * b.y - b.x * a.y; } const sg = A > 0 ? 1 : -1; const d = 0.0094;
  _SP = Q.map((p, i) => { const a = Q[(i - 1 + Q.length) % Q.length], b = Q[(i + 1) % Q.length]; const e1 = p.clone().sub(a).normalize(), e2 = b.clone().sub(p).normalize();
    const n1 = new THREE.Vector2(e1.y, -e1.x).multiplyScalar(sg), n2 = new THREE.Vector2(e2.y, -e2.x).multiplyScalar(sg); const m = n1.clone().add(n2); const L = m.length();
    if (L < 1e-6) return p.clone().addScaledVector(n1, d); m.divideScalar(L); return p.clone().addScaledVector(m, d / Math.max(0.5, m.dot(n1))); });
  return _SP; }
function poly2(px, py, pts) { let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const ax = pts[j].x, ay = pts[j].y, bx = pts[i].x, by = pts[i].y; const ex = bx - ax, ey = by - ay, wx = px - ax, wy = py - ay;
    const L2 = ex * ex + ey * ey; const t = L2 > 1e-14 ? Math.max(0, Math.min(1, (wx * ex + wy * ey) / L2)) : 0; const dx = wx - ex * t, dy = wy - ey * t; d = Math.min(d, dx * dx + dy * dy);
    if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside; }
  return (inside ? -1 : 1) * Math.sqrt(d); }
const capZ = (x, y, z, z0, z1, r) => { const zz = Math.max(z0, Math.min(z1, z)); return Math.hypot(x, y, z - zz) - r; };
const segD = (px, py, pz, a, b, r) => { const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ap = [px - a[0], py - a[1], pz - a[2]]; const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
  return Math.hypot(ap[0] - ab[0] * t, ap[1] - ab[1] * t, ap[2] - ab[2] * t) - r; };
const boxD = (x, y, z, hx, hy, hz, r = 0.002) => { const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; };
export function rifleSDF(x, y, z, opt = {}) {
  stockPts();
  const w = stockW(z, y); const a = poly2(z, y, _SP), b = Math.abs(x) - 0.021 * w, r = 0.0085;
  let d = Math.hypot(Math.max(a + r, 0), Math.max(b + r, 0)) + Math.min(Math.max(a + r, b + r), 0) - r;
  d = Math.min(d, capZ(x, y, z, -0.145, 0.075, 0.0165), capZ(x, y, z, 0.075, 0.112, 0.0132), boxD(x, y + 0.013, z + 0.035, 0.0168, 0.006, 0.105), boxD(x, y + 0.008, z - 0.095, 0.012, 0.006, 0.025));
  if (!opt.noBolt) d = Math.min(d, segD(x, y, z, [0.01, 0, 0.035], [0.058, -0.034, 0.061], 0.0042), Math.hypot(x - 0.06, y + 0.039, (z - 0.064) / 1.12) - 0.0115);
  if (!opt.noGuard) { const tg = Math.abs(x) - 0.0053; const gy = y, gz = z; // guard bow as a thick polyline
    const G = [[0.028, -0.044], [0.034, -0.07], [0.048, -0.081], [0.068, -0.08], [0.083, -0.066], [0.088, -0.046]]; let g = Infinity;
    for (let i = 0; i < G.length - 1; i++) g = Math.min(g, segD(0, gy, gz, [0, G[i][1], G[i][0]], [0, G[i + 1][1], G[i + 1][0]], 0.0035));
    d = Math.min(d, Math.max(g, tg)); }
  if (!opt.noTrigger) d = Math.min(d, Math.max(segD(0, y, z, [0, -0.046, 0.055], [0, -0.068, 0.058], 0.003), Math.abs(x) - 0.003));
  d = Math.min(d, boxD(x, y + 0.06, z + 0.045, 0.0168, 0.029, 0.046, 0.003));
  // scope (tube + bell + eyepiece), rings
  const sy = y - RIFLE.scopeY; const sr = z < -0.19 ? 0.027 : z < -0.142 ? 0.013 + (0.014 * (-0.142 - z) / 0.048) : z < 0.098 ? 0.0128 : 0.0205;
  if (z > -0.236 && z < 0.157) d = Math.min(d, Math.hypot(x, sy) - sr); d = Math.min(d, boxD(x, y - 0.03, z + 0.098, 0.013, 0.012, 0.008), boxD(x, y - 0.03, z - 0.034, 0.013, 0.012, 0.008));
  if (opt.light !== false) d = Math.min(d, capZ(x + 0.03, y + 0.034, z + 0.345, -0.07, 0.06, 0.0145));
  return d;
}
let _M = null;
export function rifleMaterials() {
  if (_M) return _M; const G = buildGunMaterials(); const W = walnutMaps();
  const walnut = new THREE.MeshPhysicalMaterial({ map: tex(W.map, { srgb: true, rep: [2.2, 2.2] }), normalMap: tex(W.normal, { rep: [2.2, 2.2] }), normalScale: new THREE.Vector2(0.35, 0.35), roughnessMap: tex(W.rough, { rep: [2.2, 2.2] }), roughness: 1, clearcoat: 0.55, clearcoatRoughness: 0.32, sheen: 0.1, sheenColor: new THREE.Color(0x6a3a20), envMapIntensity: 0.9 });
  // cut checkering on the pistol grip and forend: procedural diamonds in object space (darker, oil-soaked, matte)
  walnut.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vOP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvOP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec3 vOP;
      float chkZone(vec3 p){ float g = smoothstep(0.004,0.0,abs(p.z-0.125)-0.024) * smoothstep(-0.05,-0.06,p.y) * step(p.y,-0.055) * step(-0.124,p.y);
        float f = smoothstep(0.004,0.0,abs(p.z+0.245)-0.075) * step(p.y,-0.014) * step(-0.04,p.y); return max(g,f) * step(0.012, abs(p.x)); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
      float cz = chkZone(vOP); vec2 cq = vec2(vOP.z + vOP.y, vOP.z - vOP.y) * 520.0; vec2 cf = abs(fract(cq) - 0.5); float ridge = min(cf.x, cf.y);
      diffuseColor.rgb *= mix(1.0, 0.62 + 0.25 * smoothstep(0.0, 0.25, ridge), cz);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, 0.85, cz);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec2 s = sign(fract(cq) - 0.5); float dir = cf.x < cf.y ? 1.0 : 0.0; vec2 gq = dir > 0.5 ? vec2(s.x, s.x) : vec2(s.y, -s.y);
        vec3 pn = normalize(vec3(0.0, gq.x - gq.y, gq.x + gq.y) * 0.6); normal = normalize(mix(normal, normalize(normal + pn * 0.55), cz)); }`)
      .replace('#include <clearcoat_normal_fragment_maps>', '#include <clearcoat_normal_fragment_maps>');
  };
  const blued = new THREE.MeshPhysicalMaterial({ color: 0x24272d, map: G.slide.map, roughnessMap: G.slide.roughnessMap, normalMap: G.slide.normalMap, normalScale: new THREE.Vector2(0.35, 0.35), roughness: 0.55, metalness: 0.92, clearcoat: 0.12, clearcoatRoughness: 0.3, envMapIntensity: 0.9 });
  const boltM = new THREE.MeshPhysicalMaterial({ color: 0xd8dade, roughness: 0.16, metalness: 1, clearcoat: 0.2, envMapIntensity: 1.5 }); // jeweled/polished bolt body
  const scope = new THREE.MeshPhysicalMaterial({ color: 0x18191b, roughness: 0.42, metalness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.45, envMapIntensity: 0.8 });
  const kn = diamondKnurl(1); kn.repeat.set(10, 2); const knurl = new THREE.MeshPhysicalMaterial({ color: 0x161719, roughness: 0.5, metalness: 0.6, normalMap: kn, normalScale: new THREE.Vector2(1.2, 1.2) });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x0d0d0d, roughness: 0.92 }); const poly = new THREE.MeshPhysicalMaterial({ color: 0x121315, roughness: 0.66, metalness: 0.05 });
  const lensO = new THREE.MeshPhysicalMaterial({ color: 0x0b1a1c, roughness: 0.04, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, iridescence: 0.9, iridescenceIOR: 1.8, iridescenceThicknessRange: [200, 600], envMapIntensity: 2.4 });
  const lensE = new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.05, metalness: 0.1, clearcoat: 1, envMapIntensity: 1.6 });
  const reticle = new THREE.MeshBasicMaterial({ color: 0xff2a14, toneMapped: false });
  const white = new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.6 }); const hole = new THREE.MeshBasicMaterial({ color: 0x030303 });
  const etch = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#18191b'; x.fillRect(0, 0, 256, 32); x.fillStyle = '#9a9a94'; x.font = 'bold 15px sans-serif'; x.fillText('3-9x40   ELGO OPTICS', 8, 21); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const etched = new THREE.MeshPhysicalMaterial({ map: etch, roughness: 0.45, metalness: 0.5, clearcoat: 0.3 });
  return (_M = { ...G, walnut, blued, boltM, scope, knurl, rubber, poly, lensO, lensE, reticle, white, hole, etched });
}
function rbox(w, h, d, r = Math.min(w, h, d) * 0.25, seg = 2) { return new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) * 0.45)); }
function mesh(g, m, x = 0, y = 0, z = 0, parent) { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = true; if (parent) parent.add(o); return o; }
// revolve a (radius, z) profile around the bore (z axis)
function lathe(prof, seg = 40) { const g = new THREE.LatheGeometry(prof.map(([r, z]) => V2(Math.max(r, 1e-5), -z)), seg); g.rotateX(-Math.PI / 2); return g; }
// side-profile extrusion in the (z, y) plane, thickness along x, with rounded (beveled) edges
function sideShape(build, depth, bevel, curve = 18, bevelSeg = 4) {
  const sh = new THREE.Shape(); build(sh);
  const g = new THREE.ExtrudeGeometry(sh, { depth: Math.max(1e-4, depth - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.85, bevelSegments: bevelSeg, curveSegments: curve });
  g.translate(0, 0, -(depth - bevel * 2) / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals(); return g;
}

// v7 stock mesh: lofted from vertical slices of the side profile with a rounded (superellipse) cross-section whose width
// follows stockW() (slim wrist + pistol grip, full butt, tapered forend), so every surface is smooth with no facets.
let _stockGeo = null;
function stockSlice(z) { const ys = []; const P = _SP; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i];
    if ((a.x <= z) !== (b.x <= z) && Math.abs(b.x - a.x) > 1e-9) ys.push(a.y + (b.y - a.y) * (z - a.x) / (b.x - a.x)); }
  return ys.length < 2 ? null : [Math.min(...ys), Math.max(...ys)]; }
function stockGeometry() {
  if (_stockGeo) return _stockGeo;
  stockPts();
  let z0 = Infinity, z1 = -Infinity; for (const p of _SP) { z0 = Math.min(z0, p.x); z1 = Math.max(z1, p.x); }
  const zs = []; for (let z = z0 + 0.0004; z < z1 - 0.0004;) { zs.push(z); const fine = (z > 0.06 && z < 0.25) || z > 0.36 || z < -0.39; z += fine ? 0.0028 : 0.007; } zs.push(z1 - 0.0004);
  const N = 44, n = 2.7, pos = [], uv = [], idx = []; let rows = 0;
  for (const z of zs) { const sl = stockSlice(z); if (!sl) continue; const c = (sl[0] + sl[1]) / 2, hb = (sl[1] - sl[0]) / 2;
    for (let k = 0; k <= N; k++) { const th = k / N * Math.PI * 2; const cs = Math.cos(th), sn = Math.sin(th);
      const ey = Math.sign(sn) * Math.abs(sn) ** (2 / n), ex = Math.sign(cs) * Math.abs(cs) ** (2 / n); const y = c + hb * ey; const hw = 0.021 * stockW(z, y) * Math.min(1, hb / 0.006 + 0.15);
      pos.push(hw * ex, y, z); uv.push(z + ex * 0.02, y); }
    rows++; }
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < N; k++) { const a = r * (N + 1) + k, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals(); return (_stockGeo = g);
}
export function buildRifle(M = rifleMaterials(), { light = true } = {}) {
  const g = new THREE.Group(); g.name = 'rifle'; const U = g.userData;
  // ---------- stock ----------
  const stockN = stockGeometry();
  const stock = mesh(stockN, M.walnut, 0, 0, 0, g); U.stock = stock;
  // recoil pad (black rubber, white-line spacer), grip cap, forend cap
  { const pad = mesh(rbox(0.044, 0.143, 0.022, 0.008, 3), M.rubber, 0, -0.0805, 0.39, g); pad.rotation.x = -0.108;
    const sp = mesh(new THREE.BoxGeometry(0.0405, 0.138, 0.0016), M.white, 0, -0.0805, 0.3785, g); sp.rotation.x = -0.108;
    const cap = mesh(rbox(0.03, 0.006, 0.042, 0.002), M.poly, 0, -0.1395, 0.1305, g); cap.rotation.x = 0.03;
    const fc = mesh(rbox(0.034, 0.02, 0.012, 0.004), M.poly, 0, -0.016, -0.408, g); }
  // ---------- receiver, tang, ejection port, bolt ----------
  const R = 0.0165;
  mesh(new THREE.CylinderGeometry(R, R, 0.07, 40).rotateX(Math.PI / 2), M.blued, 0, 0, -0.11, g);                          // front ring
  mesh(new THREE.CylinderGeometry(R, R, 0.075, 40, 1, true, Math.PI * 0.77, Math.PI * 1.72).rotateX(Math.PI / 2), M.blued, 0, 0, -0.0375, g); // port section (open on the right)
  mesh(new THREE.CylinderGeometry(R, R, 0.075, 40).rotateX(Math.PI / 2), M.blued, 0, 0, 0.0375, g);                       // rear bridge
  mesh(new THREE.CircleGeometry(R, 40), M.blued, 0, 0, -0.145, g).rotation.y = Math.PI;
  mesh(rbox(0.024, 0.012, 0.05, 0.004), M.blued, 0, -0.008, 0.095, g);                                                     // tang
  mesh(new THREE.BoxGeometry(0.0335, 0.012, 0.21), M.blued, 0, -0.013, -0.035, g);                                       // receiver flat bottom
  mesh(rbox(0.004, 0.008, 0.012, 0.0015), M.blued, 0.012, -0.0025, 0.088, g);                                              // safety
  const port = mesh(new THREE.PlaneGeometry(0.072, 0.02), M.hole, 0.0005, 0, -0.0375, g); port.visible = false;
  const bolt = new THREE.Group(); g.add(bolt); U.bolt = bolt;
  mesh(new THREE.CylinderGeometry(0.0148, 0.0148, 0.19, 32).rotateX(Math.PI / 2), M.boltM, 0, 0, -0.02, bolt);
  for (let k = 0; k < 7; k++) mesh(new THREE.TorusGeometry(0.0149, 0.0008, 4, 32), M.edge, 0, 0, -0.07 + k * 0.009, bolt);     // engine-turned bands
  { const sh = lathe([[0.0, 0.074], [0.0128, 0.074], [0.0132, 0.08], [0.0128, 0.104], [0.009, 0.118], [0.0, 0.12]], 32); mesh(sh, M.blued, 0, 0, 0, bolt); } // bolt shroud
  const handle = new THREE.Group(); handle.position.set(0, 0, 0.035); bolt.add(handle); U.boltHandle = handle;
  { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(0.01, 0, 0), new THREE.Vector3(0.03, -0.004, 0.006), new THREE.Vector3(0.048, -0.016, 0.016), new THREE.Vector3(0.058, -0.034, 0.026)]);
    mesh(new THREE.TubeGeometry(c, 16, 0.0042, 12), M.boltM, 0, 0, 0, handle);
    const knob = mesh(new THREE.SphereGeometry(0.0115, 24, 16), M.knurl, 0.06, -0.039, 0.029, handle); knob.scale.set(1, 1, 1.12); U.knob = knob; }
  // ---------- barrel (fluted), brake ----------
  { const prof = []; for (let i = 0; i <= 40; i++) { const t = i / 40; const z = -0.145 - t * 0.525; const r = 0.0128 - 0.0042 * Math.pow(t, 0.8); prof.push([r, z]); }
    const bg = lathe(prof, 48); const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(y, x);
      const zone = THREE.MathUtils.smoothstep(-z, 0.2, 0.235) * (1 - THREE.MathUtils.smoothstep(-z, 0.53, 0.565)); const fl = Math.pow(Math.max(0, Math.cos(a * 6)), 6) * 0.11 * zone; p.setX(i, x * (1 - fl)); p.setY(i, y * (1 - fl)); }
    bg.computeVertexNormals(); mesh(bg, M.blued, 0, 0, 0, g);
    mesh(lathe([[0.0, -0.145], [0.0135, -0.145], [0.0135, -0.16], [0.0128, -0.165]], 40), M.blued, 0, 0, 0, g); // recoil lug collar
    // muzzle brake: body with three rows of radial ports (dark gaps between solid lands) + crown
    const B0 = -0.668; mesh(lathe([[0.0086, B0], [0.0104, B0 - 0.002], [0.0104, B0 - 0.012]], 32), M.blued, 0, 0, 0, g);
    for (let k = 0; k < 3; k++) { const z0 = B0 - 0.012 - k * 0.014; mesh(new THREE.CylinderGeometry(0.0066, 0.0066, 0.008, 20).rotateX(Math.PI / 2), M.hole, 0, 0, z0 - 0.004, g);
      for (let s = 0; s < 4; s++) { const a = s / 4 * Math.PI * 2 + Math.PI / 4; const land = mesh(new THREE.BoxGeometry(0.0062, 0.0037, 0.0082), M.blued, Math.cos(a) * 0.0087, Math.sin(a) * 0.0087, z0 - 0.004, g); land.rotation.z = a + Math.PI / 2; }
      mesh(lathe([[0.0104, z0 - 0.008], [0.0104, z0 - 0.014]], 32), M.blued, 0, 0, 0, g); }
    mesh(lathe([[0.0104, B0 - 0.054], [0.0098, B0 - 0.058], [0.0042, B0 - 0.059], [0.0035, B0 - 0.056]], 32), M.blued, 0, 0, 0, g);
    mesh(new THREE.CircleGeometry(0.0036, 16), M.hole, 0, 0, B0 - 0.0565, g).rotation.y = Math.PI; }
  // ---------- trigger guard, trigger, magazine ----------
  { const tg = sideShape((s) => { s.moveTo(0.028, -0.044); s.lineTo(0.034, -0.07); s.splineThru([V2(0.048, -0.081), V2(0.068, -0.08), V2(0.083, -0.066)]); s.lineTo(0.088, -0.046); s.lineTo(0.081, -0.046); s.lineTo(0.077, -0.064); s.splineThru([V2(0.066, -0.0735), V2(0.049, -0.0745), V2(0.04, -0.067)]); s.lineTo(0.035, -0.044); s.lineTo(0.028, -0.044); }, 0.0105, 0.0018, 10, 2);
    mesh(tg, M.poly, 0, 0, 0, g);
    const tr = sideShape((s) => { s.moveTo(0.052, -0.044); s.splineThru([V2(0.051, -0.054), V2(0.053, -0.063), V2(0.059, -0.0705)]); s.lineTo(0.061, -0.069); s.splineThru([V2(0.057, -0.061), V2(0.057, -0.052), V2(0.058, -0.044)]); s.lineTo(0.052, -0.044); }, 0.006, 0.0012, 8, 2);
    U.trigger = mesh(tr, M.blued, 0, 0, 0, g);
    const mag = new THREE.Group(); mag.position.set(0, -0.06, -0.045); g.add(mag); U.mag = mag;
    mesh(rbox(0.031, 0.05, 0.088, 0.004), M.poly, 0, 0, 0, mag); mesh(rbox(0.0335, 0.008, 0.092, 0.003), M.poly, 0, -0.026, 0, mag);
    mesh(rbox(0.012, 0.012, 0.008, 0.003), M.poly, 0, -0.012, -0.046, mag); // release latch
    for (const sx of [-1, 1]) mesh(new THREE.BoxGeometry(0.0006, 0.026, 0.06), M.poly, sx * 0.0158, -0.004, 0, mag); // stiffening ribs
    U.magHome = mag.position.clone(); }
  // ---------- sling studs + swivels ----------
  for (const [z, y] of [[0.3, -0.125], [-0.34, -0.031]]) { mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.01, 12), M.blued, 0, y - 0.004, z, g);
    const sw = mesh(new THREE.TorusGeometry(0.009, 0.0016, 6, 18), M.blued, 0, y - 0.017, z, g); sw.rotation.y = Math.PI / 2; sw.rotation.x = 0.4; }
  // ---------- picatinny rail + scope rings + scope ----------
  { const rail = []; rail.push(new THREE.BoxGeometry(0.0212, 0.0045, 0.2).translate(0, R + 0.0012, -0.035));
    for (let k = 0; k < 19; k++) rail.push(new THREE.BoxGeometry(0.0212, 0.0032, 0.0052).translate(0, R + 0.0052, -0.128 + k * 0.0098));
    mesh(mergeGeometries(rail), M.blued, 0, 0, 0, g);
    const SY = RIFLE.scopeY;
    for (const z of [-0.098, 0.034]) { mesh(rbox(0.026, 0.012, 0.016, 0.002), M.scope, 0, R + 0.0115, z, g); mesh(rbox(0.02, 0.016, 0.014, 0.002), M.scope, 0, SY - 0.012, z, g);
      mesh(lathe([[0.0131, z - 0.008], [0.0158, z - 0.0075], [0.0161, z], [0.0158, z + 0.0075], [0.0131, z + 0.008]], 36), M.scope, 0, SY, 0, g);
      for (const sx of [-1, 1]) { mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 10).rotateZ(Math.PI / 2), M.edge, sx * 0.0165, SY, z - 0.004, g); mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.004, 10).rotateZ(Math.PI / 2), M.edge, sx * 0.0165, SY, z + 0.004, g); }
      mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.03, 10).rotateZ(Math.PI / 2), M.edge, 0, R + 0.012, z, g); }
    // tube + objective bell + eyepiece (profile radius, z)
    const scopeP = [[0.0, -0.236], [0.0262, -0.236], [0.027, -0.232], [0.027, -0.2], [0.0262, -0.196], [0.0262, -0.19], [0.0255, -0.186], [0.0175, -0.16], [0.0131, -0.142], [0.0127, -0.13], [0.0127, 0.07],
      [0.0145, 0.074], [0.0145, 0.098], [0.0165, 0.104], [0.0203, 0.116], [0.0207, 0.15], [0.0200, 0.157], [0.0, 0.157]];
    mesh(lathe(scopeP, 48), M.scope, 0, SY, 0, g);
    const pr = mesh(new THREE.CylinderGeometry(0.0156, 0.0156, 0.02, 48, 1, true).rotateX(Math.PI / 2), M.knurl, 0, SY, 0.085, g); // power ring
    mesh(new THREE.BoxGeometry(0.003, 0.004, 0.012), M.scope, 0.0, SY + 0.0165, 0.085, g); // throw lever
    const label = mesh(new THREE.CylinderGeometry(0.01275, 0.01275, 0.07, 32, 1, true, -0.5, 1.0).rotateX(Math.PI / 2), M.etched, 0, SY, 0.02, g); label.rotation.z = Math.PI / 2 - 0.15;
    // turret housing, elevation (top) + windage (right) + illumination (left) turrets with knurled caps
    mesh(rbox(0.028, 0.02, 0.034, 0.006), M.scope, 0, SY + 0.004, -0.02, g);
    const tur = (ax, len, r) => { const t = new THREE.Group(); t.position.set(0, SY, -0.02); g.add(t); const c = mesh(new THREE.CylinderGeometry(r, r, len, 32), M.scope, 0, 0.0127 + len / 2, 0, t); const k = mesh(new THREE.CylinderGeometry(r * 1.04, r * 1.04, len * 0.55, 32, 1, true), M.knurl, 0, 0.0127 + len * 0.62, 0, t);
      const top = mesh(new THREE.CircleGeometry(r * 0.98, 32), M.edge, 0, 0.0127 + len + 0.0002, 0, t); top.rotation.x = -Math.PI / 2; for (let i = 0; i < 12; i++) { const m = mesh(new THREE.BoxGeometry(0.0005, 0.003, 0.0004), M.white, Math.cos(i / 12 * 6.283) * r * 1.045, 0.0127 + len * 0.2, Math.sin(i / 12 * 6.283) * r * 1.045, t); m.rotation.y = -i / 12 * 6.283; }
      t.rotation.z = ax; return t; };
    tur(0, 0.016, 0.0105); tur(-Math.PI / 2, 0.015, 0.0105); tur(Math.PI / 2, 0.011, 0.0085);
    // glass: objective (coated, reflective) and eyepiece lens with the illuminated dot visible from behind
    const ob = mesh(new THREE.CircleGeometry(0.0238, 40), M.lensO, 0, SY, -0.2345, g); ob.rotation.y = Math.PI;
    mesh(new THREE.CircleGeometry(0.0188, 40), M.lensE, 0, SY, 0.1565, g); const dot = mesh(new THREE.CircleGeometry(0.0006, 12), M.reticle, 0, SY, 0.1563, g);
    U.eyepiece = new THREE.Object3D(); U.eyepiece.position.set(0, SY, RIFLE.eyeZ); g.add(U.eyepiece); }
  // ---------- offset weapon light on a clamp under the forend (left side) ----------
  if (light) { const L = buildFlashlight(); L.scale.setScalar(0.82); L.position.set(-0.03, -0.034, -0.345); g.add(L); U.light = L;
    mesh(rbox(0.024, 0.01, 0.022, 0.003), M.scope, -0.016, -0.03, -0.345, g); }
  const muzzle = new THREE.Object3D(); muzzle.position.z = RIFLE.muzzleZ; g.add(muzzle); U.muzzle = muzzle;
  const ej = new THREE.Object3D(); ej.position.set(0.017, 0.004, RIFLE.ejectZ); g.add(ej); U.ejectPort = ej;
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}
// .308 Win cartridge / spent case (brass, 71 mm loaded, 51 mm case)
export function buildRifleRound(M = rifleMaterials(), spent = false) {
  const g = new THREE.Group(); const prof = [[0.0, 0.0], [0.0060, 0.0], [0.0060, 0.0012], [0.0052, 0.0016], [0.0052, 0.0026], [0.0059, 0.0032], [0.0059, 0.039], [0.0054, 0.0425], [0.0044, 0.0438], [0.0044, 0.0512]];
  if (!spent) prof.push([0.0039, 0.0512], [0.0039, 0.0545], [0.0034, 0.06], [0.0018, 0.068], [0.0, 0.0705]); else prof.push([0.0, 0.0512]);
  const lg = new THREE.LatheGeometry(prof.map(([r, y]) => V2(r, y)), 20); lg.rotateX(-Math.PI / 2);
  g.add(new THREE.Mesh(lg, M.brass)); if (!spent) { const tip = new THREE.Mesh(new THREE.ConeGeometry(0.0039, 0.016, 16).rotateX(-Math.PI / 2), M.copper); tip.position.z = -0.0602; g.add(tip); }
  return g;
}
