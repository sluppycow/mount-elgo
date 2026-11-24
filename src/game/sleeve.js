// USFS ranger work-jacket sleeves (v7): heavy olive cotton-canvas with a twill weave (albedo + normal + roughness),
// sculpted bunching folds above a buttoned cuff, a felled seam down the underside, and an optional upper-arm segment
// that runs from the elbow to a shoulder point so a first-person arm reads continuous (never a cut-off forearm).
// The forearm sleeve is parented to a hand root: hand-root +Z is the forearm direction (see hands.js aimForearm).
import * as THREE from 'three';
import { fabricMaps, texOf } from '../procedural.js';

let MAT = null;
function canvasTwill() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N; const x = c.getContext('2d'); const img = x.createImageData(N, N);
  const R = new Uint8ClampedArray(N * N); let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const blot = new Float32Array(N * N); for (let k = 0; k < 40; k++) { const cx = rnd() * N, cy = rnd() * N, r = 10 + rnd() * 40, a = (rnd() - 0.5) * 0.12; for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) { let dx = Math.abs(xx - cx), dy = Math.abs(yy - cy); dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy); const d = (dx * dx + dy * dy) / (r * r); if (d < 1) blot[yy * N + xx] += a * (1 - d); } }
  for (let y = 0; y < N; y++) for (let xx = 0; xx < N; xx++) { const i = y * N + xx; const tw = ((xx + y) >> 1) % 4 < 2 ? 1 : 0; // 2/2 twill diagonal
    const f = 0.86 + tw * 0.1 + (rnd() - 0.5) * 0.08 + blot[i]; img.data[i * 4] = 78 * f; img.data[i * 4 + 1] = 90 * f; img.data[i * 4 + 2] = 60 * f; img.data[i * 4 + 3] = 255; R[i] = 215 + tw * 25 - (rnd() * 20); }
  x.putImageData(img, 0, 0); const c2 = document.createElement('canvas'); c2.width = c2.height = N; const x2 = c2.getContext('2d'); const im2 = x2.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { im2.data[i * 4] = im2.data[i * 4 + 1] = im2.data[i * 4 + 2] = R[i]; im2.data[i * 4 + 3] = 255; } x2.putImageData(im2, 0, 0);
  return { alb: c, rough: c2 };
}
export function sleeveMaterial() {
  if (MAT) return MAT; const T = canvasTwill();
  MAT = new THREE.MeshStandardMaterial({ map: texOf(T.alb, { srgb: true, rep: [3, 6] }), roughnessMap: texOf(T.rough, { rep: [3, 6] }), roughness: 1, metalness: 0,
    normalMap: texOf(fabricMaps().n, { rep: [7, 14] }), normalScale: new THREE.Vector2(0.55, 0.55), side: THREE.DoubleSide });
  return MAT;
}
// forearm sleeve: cuff at z = z0 behind the wrist, out to z = z0 + len (toward the elbow)
const _geo = {};
export function forearmSleeveGeo(len = 0.3, r0 = 0.043, r1 = 0.056) {
  const key = [len, r0, r1].join(); if (_geo[key]) return _geo[key];
  const NZ = Math.ceil(len / 0.008), NA = 28; const pos = [], uv = [], idx = [];
  for (let i = 0; i <= NZ; i++) { const t = i / NZ, z = t * len;
    for (let k = 0; k <= NA; k++) { const a = k / NA * Math.PI * 2; let r = r0 + (r1 - r0) * Math.pow(t, 0.8);
      if (z < 0.022) r += 0.004 * Math.sin(Math.min(1, z / 0.022) * Math.PI) + 0.002; // rolled cuff band
      else { const f = Math.max(0, 1 - (z - 0.022) / 0.16); // bunching folds just above the cuff, fading up the arm
        r += 0.0042 * f * Math.max(0, Math.sin(z * 150 + Math.sin(a * 2) * 1.6)) * (0.6 + 0.4 * Math.cos(a * 3 + z * 40));
        r += 0.0016 * Math.sin(a * 5 + z * 22) * (1 - t * 0.5) + 0.0012 * Math.sin(a * 2 - z * 9); }
      if (Math.abs(Math.cos(a) + 1) < 0.04) r += 0.0012; // felled seam along the underside
      pos.push(Math.cos(a) * r, Math.sin(a) * r, z); uv.push(k / NA, z * 3.3); }
    if (i < NZ) for (let k = 0; k < NA; k++) { const p = i * (NA + 1) + k; idx.push(p, p + 1, p + NA + 1, p + 1, p + NA + 2, p + NA + 1); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return (_geo[key] = g);
}
// add a sleeve to a hand root; returns { forearm, upper?, update(shoulderWorld) }
export function addSleeve(hand, { z0 = 0.055, len = 0.3, r0 = 0.043, r1 = 0.056, upperParent = null } = {}) {
  const m = sleeveMaterial(); const f = new THREE.Mesh(forearmSleeveGeo(len, r0, r1), m); f.frustumCulled = false; f.castShadow = false; f.receiveShadow = true;
  const fb = hand.userData.bones && hand.userData.bones.forearm, hb = hand.userData.bones && hand.userData.bones.hand;
  if (fb && hb) { // ride the forearm bone (its +Y runs elbow -> wrist), so the sleeve always wraps the actual forearm skin
    const bl = hb.position.length(); const k = bl / 0.192; f.rotation.x = Math.PI / 2; f.scale.setScalar(k); f.position.set(0, bl - z0 * k, 0); fb.add(f); }
  else { f.position.z = z0; hand.add(f); }
  // cuff button + seam tab
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 12), new THREE.MeshStandardMaterial({ color: 0x2a2418, roughness: 0.5 }));
  btn.rotation.z = Math.PI / 2; btn.position.set(r0 + 0.006, 0, 0.012); f.add(btn);
  const S = { forearm: f, upper: null, hand, z0, len };
  if (upperParent) { const u = new THREE.Mesh(forearmSleeveGeo(1, r1 * 0.98, r1 * 1.16), m); u.frustumCulled = false; u.receiveShadow = true; upperParent.add(u); S.upper = u;
    // elbow knuckle (a soft ball so the bend reads as fabric, not two tubes)
    const el = new THREE.Mesh(new THREE.SphereGeometry(r1 * 1.02, 18, 12), m); el.frustumCulled = false; upperParent.add(el); S.elbow = el; }
  const _e = new THREE.Vector3(), _q = new THREE.Quaternion(), _inv = new THREE.Matrix4(), _l = new THREE.Vector3(), _s = new THREE.Vector3();
  S.update = (shoulderWorld) => { if (!S.upper) return; f.updateWorldMatrix(true, false); _e.set(0, 0, len - 0.01).applyMatrix4(f.matrixWorld);
    const P = S.upper.parent; P.updateWorldMatrix(true, false); _inv.copy(P.matrixWorld).invert(); const e = _e.clone().applyMatrix4(_inv), sh = shoulderWorld.clone().applyMatrix4(_inv);
    const d = sh.clone().sub(e); const L = d.length(); S.upper.position.copy(e); S.upper.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.normalize()); S.upper.scale.set(1, 1, L); S.elbow.position.copy(e); };
  return S;
}
