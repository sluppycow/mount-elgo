// Grip solver: places the skinned hands on the pistol from anatomical landmarks (Horn/Kabsch fit), pushes the palm
// out of the gun, then curls each finger joint-by-joint until it touches the gun (or the other hand) so the fingers
// wrap tight without clipping. Thumbs and the trigger finger are fitted to targets by coordinate descent.
// Everything is solved once in gun space (gun.js frame: bore on y=0, slide rear z=0, muzzle -Z, +X right).
import * as THREE from 'three';
import { FRAME_OUTER, FRAME_HOLE, GUN_DIM } from './gun.js';
import { poseHand } from './hands.js';

const LEN3 = { thumb: 0.0233, index: 0.0232, middle: 0.0247, ring: 0.0245, pinky: 0.0183 };
const FN = ['index', 'middle', 'ring', 'pinky'];
const RAD = { index: [0.0088, 0.0080, 0.0072], middle: [0.0090, 0.0082, 0.0074], ring: [0.0086, 0.0078, 0.0070], pinky: [0.0076, 0.0070, 0.0064], thumb: [0.0088, 0.0080, 0.0072] };

// ---------- gun signed distance (metres) ----------
function polySDF(px, py, pts) {
  let d = Infinity, inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j], [bx, by] = pts[i]; const ex = bx - ax, ey = by - ay; const wx = px - ax, wy = py - ay;
    const t = Math.max(0, Math.min(1, (wx * ex + wy * ey) / (ex * ex + ey * ey))); const dx = wx - ex * t, dy = wy - ey * t; d = Math.min(d, dx * dx + dy * dy);
    if ((ay > py) !== (by > py) && px < (bx - ax) * (py - ay) / (by - ay) + ax) inside = !inside;
  }
  return (inside ? -1 : 1) * Math.sqrt(d);
}
function extrude(d2, dx) { return Math.min(Math.max(d2, dx), 0) + Math.hypot(Math.max(d2, 0), Math.max(dx, 0)); }
function boxSDF(x, y, z, hx, hy, hz, r = 0.001) { const qx = Math.abs(x) - hx + r, qy = Math.abs(y) - hy + r, qz = Math.abs(z) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; }
const GA = GUN_DIM.GRIP_ANGLE, cG = Math.cos(GA), sG = Math.sin(GA);
export function gunSDF(x, y, z) {
  const s = -z;
  const d2 = Math.max(polySDF(s, y, FRAME_OUTER), -polySDF(s, y, FRAME_HOLE));
  let d = extrude(d2, Math.abs(x) - (y < -0.0548 ? 0.0136 : 0.0124)) - 0.0005;
  d = Math.min(d, boxSDF(x, y - (GUN_DIM.SLIDE_TOP + GUN_DIM.SLIDE_BOT) / 2, z + 0.075 - GUN_DIM.SLIDE_Z0, 0.0116, (GUN_DIM.SLIDE_TOP - GUN_DIM.SLIDE_BOT) / 2, 0.075, 0.002));
  // extended magazine baseplate (in the raked magazine frame)
  const py = y + 0.0255, pz = z + 0.0195; const my = py * cG - pz * sG, mz = py * sG + pz * cG; // rotate +GA about X
  d = Math.min(d, boxSDF(x, my + GUN_DIM.MAG_L + 0.0006 + 0.0083, mz, 0.0128, 0.0085, 0.0185, 0.002));
  d = Math.min(d, boxSDF(x, my + GUN_DIM.MAG_L / 2, mz, 0.0112, GUN_DIM.MAG_L / 2, 0.0168, 0.002)); // magazine body (fills the well)
  // red-dot optic body
  d = Math.min(d, boxSDF(x, y - (GUN_DIM.SLIDE_TOP + 0.011), z + 0.033 - GUN_DIM.SLIDE_Z0, 0.0115, 0.011, 0.016, 0.002));
  return d;
}
function sdfGrad(p, f) { const e = 0.0004; return new THREE.Vector3(f(p.x + e, p.y, p.z) - f(p.x - e, p.y, p.z), f(p.x, p.y + e, p.z) - f(p.x, p.y - e, p.z), f(p.x, p.y, p.z + e) - f(p.x, p.y, p.z - e)).normalize(); }
function capsuleSDF(p, a, b, r) { const ab = b.clone().sub(a), ap = p.clone().sub(a); const t = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq())); return ap.sub(ab.multiplyScalar(t)).length() - r; }

// ---------- hand FK helpers (hand placed in a scratch group that IS gun space) ----------
const G = new THREE.Group(); G.updateMatrixWorld(true);
const v3 = () => new THREE.Vector3();
function wpos(o) { return o.getWorldPosition(v3()); }
function chain(hand, nm) {
  const b = hand.userData.bones; const pre = nm;
  const b1 = b[pre + '1'], b2 = b[pre + '2'], b3 = b[pre + '3'];
  hand.updateMatrixWorld(true);
  const p1 = wpos(b1), p2 = wpos(b2), p3 = wpos(b3);
  const dir = b3.position.clone().normalize(); // local axis of the chain (bone Y)
  const tip = b3.localToWorld(dir.multiplyScalar(LEN3[nm] / b3.getWorldScale(v3()).y));
  return [p1, p2, p3, tip];
}
function segHit(pts, rads, obst, from = 0, clearance = 0.0006) {
  let worst = Infinity;
  for (let k = from; k < 3; k++) {
    const a = pts[k], b = pts[k + 1];
    for (let i = 0; i <= 5; i++) { const t = i / 5; const p = a.clone().lerp(b, t); const d = obst(p) - rads[k] * (1 - 0.12 * t) - clearance; if (d < worst) worst = d; }
  }
  return worst; // < 0 => penetrating
}
function clonePose(p) { return { f: p.f.map(a => a.slice()), spread: p.spread.slice(), t: p.t.slice(), tRoll: p.tRoll || 0, wrist: (p.wrist || [0, 0, 0]).slice() }; }

// Horn's absolute orientation (weighted) -> quaternion + translation mapping a_i to b_i
function fitRigid(A, B, W) {
  const ca = v3(), cb = v3(); let ws = 0;
  A.forEach((a, i) => { ca.addScaledVector(a, W[i]); cb.addScaledVector(B[i], W[i]); ws += W[i]; }); ca.divideScalar(ws); cb.divideScalar(ws);
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  A.forEach((a0, i) => { const a = a0.clone().sub(ca), b = B[i].clone().sub(cb), w = W[i];
    Sxx += w * a.x * b.x; Sxy += w * a.x * b.y; Sxz += w * a.x * b.z; Syx += w * a.y * b.x; Syy += w * a.y * b.y; Syz += w * a.y * b.z; Szx += w * a.z * b.x; Szy += w * a.z * b.y; Szz += w * a.z * b.z; });
  const N = [[Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx], [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz], [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy], [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]];
  const fn = Math.hypot(...N.flat()) || 1; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) N[i][j] /= fn; for (let i = 0; i < 4; i++) N[i][i] += 1.0;
  let q = [1, 0.1, 0.1, 0.1];
  for (let it = 0; it < 2000; it++) { const r = [0, 1, 2, 3].map(i => N[i][0] * q[0] + N[i][1] * q[1] + N[i][2] * q[2] + N[i][3] * q[3]); const L = Math.hypot(...r); q = r.map(x => x / L); }
  const Q = new THREE.Quaternion(q[1], q[2], q[3], q[0]).normalize();
  const t = cb.clone().sub(ca.clone().applyQuaternion(Q));
  return { q: Q, t };
}

function landmarksLocal(hand) {
  // rest landmarks in the hand root frame
  const pos = hand.position.clone(), q = hand.quaternion.clone(); const par = hand.parent;
  G.add(hand); hand.position.set(0, 0, 0); hand.quaternion.identity(); hand.updateMatrixWorld(true);
  const b = hand.userData.bones; const L = {};
  L.wrist = wpos(b.hand); for (const n of FN) L[n] = wpos(b[n + '1']);
  L.thumbMCP = wpos(b.thumb2); L.thumbCMC = wpos(b.thumb1);
  L.web = L.thumbMCP.clone().lerp(L.index, 0.45);
  if (par) par.add(hand); hand.position.copy(pos); hand.quaternion.copy(q);
  return L;
}
function skinSamples(hand, step = 5) {
  // indices of palm/back vertices (not finger bones) for penetration checks
  const out = [];
  hand.traverse(o => { if (o.isSkinnedMesh && !out.mesh) { out.mesh = o; } });
  const m = out.mesh; const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight; const bones = m.skeleton.bones;
  for (let i = 0; i < si.count; i += step) {
    let best = 0, bi = 0; for (let k = 0; k < 4; k++) { const w = sw.getComponent(i, k); if (w > best) { best = w; bi = si.getComponent(i, k); } }
    const n = bones[bi].name; if (n === 'hand' || n === 'forearm' || n === 'thumb1' || n.endsWith('1')) { out.push(i); (out.names ||= {})[i] = n; }
  }
  return out;
}
function maxPenetration(hand, samples, obst) {
  const m = samples.mesh; const pa = m.geometry.attributes.position; const p = v3(); let worst = 0; const dir = v3(); let cnt = 0;
  hand.updateMatrixWorld(true); m.skeleton.update();
  for (const i of samples) {
    p.fromBufferAttribute(pa, i); m.applyBoneTransform(i, p); p.applyMatrix4(m.matrixWorld);
    const d = obst(p); if (d < 0) { if (d < worst && samples.names) samples.worstAt = [samples.names[i], p.toArray().map(x => +x.toFixed(4))]; worst = Math.min(worst, d); dir.add(sdfGrad(p, (x, y, z) => obst(new THREE.Vector3(x, y, z)))); cnt++; }
  }
  return { worst, dir: cnt ? dir.normalize() : null, cnt };
}

function wrapFingers(hand, pose, names, obst, maxA = [1.75, 1.95, 1.3], keep = false) {
  // per finger: coordinate descent that pulls every phalanx onto the surface (tight wrap) and forbids penetration
  for (const n of names) {
    const i = FN.indexOf(n); const R = RAD[n]; const a = pose.f[i];
    if (!keep) { a[0] = 1.2; a[1] = 1.3; a[2] = 0.7; }
    const cost = () => {
      poseHand(hand, pose); const pts = chain(hand, n); let c = 0;
      for (let k = 0; k < 3; k++) {
        let near = Infinity, pen = 0;
        for (let s2 = 0; s2 <= 6; s2++) { const t = s2 / 6; const p = pts[k].clone().lerp(pts[k + 1], t); const d = obst(p) - R[k] * (1 - 0.12 * t); near = Math.min(near, d); if (d < -0.0004) pen += (d + 0.0004) ** 2; }
        c += (k === 0 ? 0.6 : 1.0) * Math.max(0, near) ** 2 + 400 * pen;
      }
      // keep a natural PIP>=DIP coupling
      c += 1e-6 * (a[2] - 0.66 * a[1]) ** 2;
      return c;
    };
    let best = cost();
    for (let step = 0.3; step > 0.005; step *= 0.6) {
      let improved = true, guard = 0;
      while (improved && guard++ < 50) {
        improved = false;
        for (let j = 0; j < 3; j++) for (const sg of [1, -1]) { const v0 = a[j]; a[j] = Math.max(-0.1, Math.min(maxA[j], v0 + sg * step)); const c = cost(); if (c < best - 1e-14) { best = c; improved = true; } else a[j] = v0; }
      }
    }
    poseHand(hand, pose);
  }
}
function fitChain(hand, pose, getVec, target, obst, keys, R, reg = 0, mid = null, clear = 0.0004) {
  // coordinate descent over pose parameters named by keys: [['f',i,j] | ['t',k] | ['tRoll'] | ['spread',i]]
  const get = (k) => k[0] === 'tRoll' ? pose.tRoll : k[0] === 'f' ? pose.f[k[1]][k[2]] : pose[k[0]][k[1]];
  const set = (k, v) => { if (k[0] === 'tRoll') pose.tRoll = v; else if (k[0] === 'f') pose.f[k[1]][k[2]] = v; else pose[k[0]][k[1]] = v; };
  const cost = () => { poseHand(hand, pose); const { tip, pts } = getVec(); let c = tip.distanceTo(target) ** 2; if (mid) c += 0.7 * pts[2].distanceTo(mid) ** 2; const h = segHit(pts, R, obst, 0, clear); if (h < 0) c += 40 * h * h + 0.002 * -h; for (const k of keys) c += reg * get(k) ** 2; return c; };
  let best = cost();
  if (keys.length >= 5 && keys[0][0] === 't') { // thumb: coarse global search first (avoids getting stuck on the wrong side)
    let bv = keys.map(get);
    for (let a0 = -1.6; a0 <= 1.6; a0 += 0.2) for (let a1 = -1.2; a1 <= 1.6; a1 += 0.2) for (const r of [-1.2, -0.6, 0, 0.6, 1.2]) for (const a2 of [0, 0.35]) {
      const v = [a0, a1, a2, a2 * 0.6, r, 0, 0]; keys.forEach((k, i) => set(k, v[i])); const c = cost(); if (c < best) { best = c; bv = v; }
    }
    keys.forEach((k, i) => set(k, bv[i]));
  }
  for (let step = 0.25; step > 0.004; step *= 0.6) {
    let improved = true, guard = 0;
    while (improved && guard++ < 40) {
      improved = false;
      for (const k of keys) for (const sgn of [1, -1]) { const v0 = get(k); set(k, v0 + sgn * step); const c = cost(); if (c < best - 1e-12) { best = c; improved = true; } else set(k, v0); }
    }
  }
  poseHand(hand, pose); return best;
}


// v6: wrap a finger AROUND the grip to explicit targets (DIP joint + fingertip), never penetrating the obstacle.
// Coarse grid over the flex angles first, then coordinate descent. Keeps joints in a natural range.
function wrapTo(hand, pose, n, obst, dip, tip, w = {}) {
  const i = FN.indexOf(n), R = RAD[n], a = pose.f[i];
  const cost = () => { poseHand(hand, pose); const pts = chain(hand, n); let c = pts[3].distanceToSquared(tip) + (w.dip ?? 0.8) * pts[2].distanceToSquared(dip);
    const h = segHit(pts, R, obst, 0, 0.0003); if (h < 0) c += 80 * h * h + 0.004 * -h;
    for (let j = 0; j < 3; j++) { if (a[j] < -0.1) c += (a[j] + 0.1) ** 2 * 0.01; if (a[j] > 1.85) c += (a[j] - 1.85) ** 2 * 0.01; }
    c += 0.002 * pose.spread[i] ** 2; return c; };
  let best = cost(), bv = [a[0], a[1], a[2], pose.spread[i]];
  for (let a0 = 0; a0 <= 1.8; a0 += 0.15) for (let a1 = 0; a1 <= 1.8; a1 += 0.15) for (const k2 of [0.4, 0.7, 1.0]) for (const sp of [-0.15, 0, 0.15]) {
    a[0] = a0; a[1] = a1; a[2] = a1 * k2; pose.spread[i] = sp; const c = cost(); if (c < best) { best = c; bv = [a0, a1, a1 * k2, sp]; } }
  [a[0], a[1], a[2], pose.spread[i]] = bv;
  const get = (j) => j < 3 ? a[j] : pose.spread[i], set = (j, v) => { if (j < 3) a[j] = v; else pose.spread[i] = v; };
  for (let step = 0.12; step > 0.003; step *= 0.6) { let imp = true, g = 0; while (imp && g++ < 40) { imp = false; for (let j = 0; j < 4; j++) for (const sg of [1, -1]) { const v0 = get(j); set(j, v0 + sg * step); const c = cost(); if (c < best - 1e-13) { best = c; imp = true; } else set(j, v0); } } }
  poseHand(hand, pose); const pts = chain(hand, n);
  return { tipErr: +pts[3].distanceTo(tip).toFixed(4), dipErr: +pts[2].distanceTo(dip).toFixed(4), hit: +segHit(pts, R, obst).toFixed(4) };
}
// front strap z of the grip at height y (gun space, x = 0)
function frontZ(y) { for (let z = -0.06; z < 0.03; z += 0.0005) if (gunSDF(0, y, z) < 0) return z; return -0.02; }

export function solveGrip(vm, VM, POSES) {
  const T0 = performance.now(); const report = {};
  const rh = vm.rh, lh = vm.lh;
  const rPar = rh.parent, lPar = lh.parent;
  // ---------------- RIGHT HAND ----------------
  const LR = landmarksLocal(rh);
  const A = [LR.wrist, LR.index, LR.middle, LR.ring, LR.pinky, LR.web];
  // v5: short beavertail -> the whole hand rides higher/forward and the web nests up under the tang
  const GO = (typeof window !== 'undefined' && window.GRIP_OFS) || [0, 0.006, -0.010], WEB = (typeof window !== 'undefined' && window.GRIP_WEB) || [-0.002, -0.0185, 0.011];
  const B = [new THREE.Vector3(-0.018, -0.076, 0.058), new THREE.Vector3(0.031, -0.033, -0.036), new THREE.Vector3(0.0365, -0.051, -0.031), new THREE.Vector3(0.0355, -0.0685, -0.026), new THREE.Vector3(0.0325, -0.084, -0.019)].map(v => v.add(new THREE.Vector3(...GO)));
  B.push(new THREE.Vector3(...WEB));
  const W = [1.0, 1.4, 1.2, 1.0, 0.8, 2.0];
  const fr = fitRigid(A, B, W);
  G.add(rh); rh.position.copy(fr.t); rh.quaternion.copy(fr.q);
  const pr = clonePose(POSES.gripR); pr.wrist = [0, 0, 0]; pr.f = FN.map(() => [0.05, 0.05, 0.05]); pr.spread = [0.0, 0.0, 0.0, 0.0];
  poseHand(rh, pr);
  const sampR = skinSamples(rh, 4);
  const obstG = (p) => gunSDF(p.x, p.y, p.z);
  { const pen0 = maxPenetration(rh, sampR, obstG); report.rPen0 = [pen0.worst, pen0.cnt, sampR.worstAt]; }
  if (typeof window !== 'undefined' && window.GRIP_NOPUSH) { VM.rh.p = rh.position.clone(); VM.rh.q = rh.quaternion.clone(); if (rPar) rPar.add(rh); return report; }
  const backDir = (h) => new THREE.Vector3(0, 1, 0).applyQuaternion(h.quaternion).normalize();
  for (let it = 0; it < 16; it++) { const pen = maxPenetration(rh, sampR, obstG); if (!pen.dir || pen.worst > -0.0085) break; rh.position.addScaledVector(backDir(rh), Math.min(0.004, -pen.worst * 0.6)); }
  report.rPalm = maxPenetration(rh, sampR, obstG).worst;
  // seat the web of the hand snug up under the beavertail tang (before the fingers wrap)
  { const m = sampR.mesh, pa = m.geometry.attributes.position; const L1 = landmarksLocal(rh); rh.updateMatrixWorld(true); m.skeleton.update();
    const wW = L1.web.clone().applyMatrix4(rh.matrixWorld); const webIdx = [];
    const skinP = (i) => { const q = v3().fromBufferAttribute(pa, i); m.applyBoneTransform(i, q); return q.applyMatrix4(m.matrixWorld); };
    for (const i of sampR) if (skinP(i).distanceTo(wW) < 0.026 && skinP(i).y > wW.y - 0.004) webIdx.push(i);
    const webGap = () => { rh.updateMatrixWorld(true); m.skeleton.update(); let d = 1; for (const i of webIdx) d = Math.min(d, obstG(skinP(i))); return d; };
    const base = report.rPalm; const dir = new THREE.Vector3(0, 1, -0.25).normalize(); report.web0 = +webGap().toFixed(4); let moved = 0;
    for (let it = 0; it < 50; it++) { const g = webGap(); if (g < 0.0006) break; rh.position.addScaledVector(dir, 0.0005); moved += 0.0005;
      if (maxPenetration(rh, sampR, obstG).worst < base - 0.0025) { rh.position.addScaledVector(dir, -0.0005); moved -= 0.0005; break; } }
    report.webMoved = +moved.toFixed(4); report.webGap = +webGap().toFixed(4); report.webN = webIdx.length; }
  { const L2 = landmarksLocal(rh); const w = L2.web.clone(); rh.updateMatrixWorld(true); w.applyMatrix4(rh.matrixWorld); report.web = { pos: w.toArray().map(x => +x.toFixed(4)), sdf: +obstG(w).toFixed(4) }; }
  // fingers wrap the front strap (middle, ring, pinky), pinky may rest on the baseplate shelf
  wrapFingers(rh, pr, ['middle', 'ring', 'pinky'], obstG);
  // v6: middle/ring/pinky reach across the front strap; pads end on the LEFT side of the grip
  if (!(typeof window !== 'undefined' && window.GRIP_OLDWRAP)) { report.rWrap = {};
    for (const n of ['middle', 'ring', 'pinky']) { const m1 = chain(rh, n)[0]; const y = Math.min(m1.y - 0.012, n === 'middle' ? -0.068 : 0); const fz = frontZ(y); const r = RAD[n][1];
      report.rWrap[n] = wrapTo(rh, pr, n, obstG, new THREE.Vector3(0.002, y, fz - r * 0.9), new THREE.Vector3(-0.0124 - RAD[n][2] * 0.85, y - 0.002, fz + 0.013)); } }
  // index straight along the frame above the trigger guard (right side)
  const idxTarget = new THREE.Vector3(0.0186, -0.0245, -0.080);
  fitChain(rh, pr, () => { const pts = chain(rh, 'index'); return { tip: pts[3], pts }; }, idxTarget, obstG, [['f', 0, 0], ['f', 0, 1], ['f', 0, 2], ['spread', 0]], RAD.index, 0.0004, new THREE.Vector3(0.0200, -0.0250, -0.0600), 0.0002);
  // thumb forward along the left side of the frame, above the mag release, below the slide
  const thTarget = new THREE.Vector3(-0.0215, -0.0185, -0.058);
  const thumbVec = (h) => () => { const pts = chain(h, 'thumb'); return { tip: pts[3], pts }; };
  pr.t = [0.6, 0.4, 0.2, 0.1, 0, 0]; pr.tRoll = 0;
  fitChain(rh, pr, thumbVec(rh), thTarget, obstG, [['t', 0], ['t', 1], ['t', 2], ['t', 3], ['tRoll'], ['t', 4], ['t', 5]], RAD.thumb, 0.00002, new THREE.Vector3(-0.0215, -0.023, -0.022), -0.0025);
  const gripR = clonePose(pr);
  // trigger press pose: index pad on the trigger blade
  const pt = clonePose(pr);
  const trigTarget = new THREE.Vector3(0.0015, -0.0465, -0.0685);
  const obstNoGuard = (p) => (p.z < -0.035 && p.z > -0.085 && p.y < -0.02 && p.y > -0.065) ? 1 : obstG(p);
  fitChain(rh, pt, () => { const pts = chain(rh, 'index'); const pad = pts[2].clone().lerp(pts[3], 0.55); return { tip: pad, pts: pts }; }, trigTarget, obstNoGuard, [['f', 0, 0], ['f', 0, 1], ['f', 0, 2], ['spread', 0]], RAD.index, 0.0);
  const triggerR = clonePose(pt);
  poseHand(rh, gripR);
  report.rFingers = Object.fromEntries(FN.map(n => [n, +segHit(chain(rh, n), RAD[n], obstG).toFixed(4)]));
  report.rThumbPts = chain(rh, 'thumb').map(v => v.toArray().map(x => +x.toFixed(3)));
  report.rIdx = chain(rh, 'index').map(v => v.toArray().map(x => +x.toFixed(3)));
  report.rThumb = { dist: +chain(rh, 'thumb')[3].distanceTo(thTarget).toFixed(4), hit: +segHit(chain(rh, 'thumb'), RAD.thumb, obstG).toFixed(4) };
  // capsules of the right hand (for the support hand to wrap over)
  rh.updateMatrixWorld(true);
  const caps = [];
  for (const n of [...FN, 'thumb']) { const pts = chain(rh, n); for (let k = 0; k < 3; k++) caps.push([pts[k], pts[k + 1], RAD[n][k]]); }
  const palmPts = []; { const m = sampR.mesh; const pa = m.geometry.attributes.position; m.skeleton.update(); for (let k = 0; k < sampR.length; k += 6) { const p = v3().fromBufferAttribute(pa, sampR[k]); m.applyBoneTransform(sampR[k], p); p.applyMatrix4(m.matrixWorld); palmPts.push(p); } }
  const obstGR = (p) => { let d = obstG(p); for (const [a, b, r] of caps) { d = Math.min(d, capsuleSDF(p, a, b, r)); } for (const q of palmPts) { d = Math.min(d, q.distanceTo(p) - 0.0015); } return d; };
  VM.rh.p = rh.position.clone(); VM.rh.q = rh.quaternion.clone();
  if (rPar) rPar.add(rh);
  // ---------------- LEFT (SUPPORT) HAND, thumbs forward ----------------
  const LL = landmarksLocal(lh);
  const A2 = [LL.wrist, LL.index, LL.middle, LL.ring, LL.pinky, LL.thumbMCP];
  const B2 = [new THREE.Vector3(-0.056, -0.088, 0.036), new THREE.Vector3(-0.028, -0.046, -0.062), new THREE.Vector3(-0.024, -0.063, -0.059), new THREE.Vector3(-0.019, -0.079, -0.053), new THREE.Vector3(-0.013, -0.093, -0.045), new THREE.Vector3(-0.036, -0.032, -0.022)].map(v => v.add(new THREE.Vector3(...((typeof window !== 'undefined' && window.LOFS) || [0.006, -0.022, -0.004]))));
  const W2 = [0.8, 1.2, 1.0, 0.9, 0.7, 4.0];
  const fl = fitRigid(A2, B2, W2);
  G.add(lh); lh.position.copy(fl.t); lh.quaternion.copy(fl.q);
  const pl = clonePose(POSES.supportL); pl.wrist = [0, 0, 0]; pl.f = FN.map(() => [0.05, 0.05, 0.05]); pl.spread = [0, 0, 0, 0];
  poseHand(lh, pl);
  const sampL = skinSamples(lh, 4);
  { const pen0 = maxPenetration(lh, sampL, obstGR); report.lPen0 = [pen0.worst, pen0.cnt, sampL.worstAt]; }
  for (let it = 0; it < 16; it++) { const pen = maxPenetration(lh, sampL, obstGR); if (!pen.dir || pen.worst > -0.0012) break; lh.position.addScaledVector(backDir(lh), Math.min(0.004, -pen.worst * 0.6)); }
  report.lPalm = maxPenetration(lh, sampL, obstGR).worst;
  wrapFingers(lh, pl, FN, obstGR);
  // v6: all four support fingers reach across the front, OVER the right hand's fingers, tips on the right side
  if (!(typeof window !== 'undefined' && window.GRIP_OLDWRAP)) { report.lWrap = {};
    const rows = (typeof window !== 'undefined' && window.LROWS) || [-0.075, -0.091, -0.106, -0.12];
    FN.forEach((n, k) => { const y = rows[k]; const fz = frontZ(Math.max(y, -0.09)); report.lWrap[n] = wrapTo(lh, pl, n, obstGR, new THREE.Vector3(0.022, y, fz - 0.019), new THREE.Vector3(0.034, y + 0.002, fz + 0.008), { dip: 0.6 }); }); }
  const thL = new THREE.Vector3(-0.0235, -0.026, -0.098);
  pl.t = [0.5, 0.3, 0.1, 0.05, 0, 0]; pl.tRoll = 0;
  fitChain(lh, pl, thumbVec(lh), thL, obstGR, [['t', 0], ['t', 1], ['t', 2], ['t', 3], ['tRoll'], ['t', 4], ['t', 5]], RAD.thumb, 0.00002, new THREE.Vector3(-0.0245, -0.034, -0.064), -0.0025);
  report.lFingers = Object.fromEntries(FN.map(n => [n, +segHit(chain(lh, n), RAD[n], obstGR).toFixed(4)]));
  report.lThumbPts = chain(lh, 'thumb').map(v => v.toArray().map(x => +x.toFixed(3)));
  report.lThumb = { dist: +chain(lh, 'thumb')[3].distanceTo(thL).toFixed(4) };
  report.lChains = Object.fromEntries(FN.map(n => [n, chain(lh, n).map(v => v.toArray().map(x => +x.toFixed(3)))])); report.lF = pl.f.map(a => a.map(x => +x.toFixed(2)));
  report.rChains = Object.fromEntries(FN.map(n => [n, chain(rh, n).map(v => v.toArray().map(x => +x.toFixed(3)))]));
  VM.lh.p = lh.position.clone(); VM.lh.q = lh.quaternion.clone();
  if (lPar) lPar.add(lh);
  POSES.gripR = gripR; POSES.triggerR = triggerR; POSES.supportL = clonePose(pl);
  report.ms = Math.round(performance.now() - T0);
  return report;
}

// ---------- flashlight: fist around the body, thumb on the tail-cap switch ----------
export function torchSDF(p) {
  // matches buildFlashlight(): knurled body r=0.0126 (z -0.046..0.047), flare to the head r=0.0165 (z<-0.058), tail cap r=0.0131
  const r = Math.hypot(p.x, p.y), z = p.z;
  const body = Math.max(r - 0.0126, Math.abs(z - 0.0005) - 0.0465);
  const t = Math.min(1, Math.max(0, (-0.046 - z) / 0.012)); const rr = 0.0126 + (0.0167 - 0.0126) * t;
  const head = Math.max(r - rr, Math.max(-0.0852 - z, z + 0.046));
  const tail = Math.max(r - 0.0131, Math.abs(z - 0.0548) - 0.0074);
  return Math.min(body, head, tail);
}
function fitCircle3(P) {
  // best-fit plane (PCA) then Kasa circle fit in that plane -> { c, r, n }
  const c0 = P.reduce((a, p) => a.add(p), v3()).multiplyScalar(1 / P.length);
  const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; for (const p of P) { const d = p.clone().sub(c0).toArray(); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
  const pow = (M, v) => { for (let it = 0; it < 60; it++) { const w = [0, 1, 2].map(i => M[i][0] * v[0] + M[i][1] * v[1] + M[i][2] * v[2]); const L = Math.hypot(...w) || 1; v = w.map(x => x / L); } return v; };
  const e1 = new THREE.Vector3(...pow(C, [1, 0.3, 0.2])); const tr = C[0][0] + C[1][1] + C[2][2];
  const C2 = C.map((row, i) => row.map((x, j) => x - (e1.getComponent(i) * e1.getComponent(j)) * (e1.clone().toArray().reduce((s, a, k) => s + a * [0, 1, 2].reduce((t, b) => t + C[k][b] * e1.getComponent(b), 0), 0))));
  const e2 = new THREE.Vector3(...pow(C2, [0.2, 1, 0.3])); e2.addScaledVector(e1, -e2.dot(e1)).normalize(); const n = new THREE.Vector3().crossVectors(e1, e2).normalize();
  // Kasa: x^2+y^2 + D x + E y + F = 0
  let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, Sz = 0, Szx = 0, Szy = 0; const N = P.length;
  for (const p of P) { const d = p.clone().sub(c0); const x = d.dot(e1), y = d.dot(e2), z = x * x + y * y; Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y; Sz += z; Szx += z * x; Szy += z * y; }
  const A = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, N]], bv = [-Szx, -Szy, -Sz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const dA = det(A); const sol = [0, 1, 2].map(k => det(A.map((row, i) => row.map((x, j) => j === k ? bv[i] : x))) / dA);
  const cx = -sol[0] / 2, cy = -sol[1] / 2; const r = Math.sqrt(Math.max(0, cx * cx + cy * cy - sol[2]));
  return { c: c0.clone().addScaledVector(e1, cx).addScaledVector(e2, cy), r, n };
}
function fingerArc(h, n) { const pts = chain(h, n); const P = [pts[1], pts[2], pts[3]]; for (let k = 1; k < 3; k++) P.push(pts[k].clone().lerp(pts[k + 1], 0.5)); P.push(pts[0].clone().lerp(pts[1], 0.75)); return fitCircle3(P); }

export function solveTorch(vm, VM, POSES) {
  // Power-grip fist: the flashlight body passes THROUGH the fist. Fingers curl round the far side with the tips tucked
  // back toward the palm, the palm presses the near side, the thumb wraps over the index/middle middle phalanges.
  // Head out of the index/thumb side, tail out of the pinky side.
  const h = vm.torchHand; const par = h.parent; const report = {};
  G.add(h); h.position.set(0, 0, 0); h.quaternion.identity();
  const pose = clonePose(POSES.fistTorch); pose.wrist = [0, 0, 0]; pose.spread = [0.02, 0, -0.02, -0.06]; pose.t = [0.5, 0.3, 0.2, 0.1, 0, 0]; pose.tRoll = 0;
  const BC = (typeof window !== 'undefined' && window.TORCH_CURL) || [[1.15, 1.6, 0.95], [1.2, 1.65, 0.95], [1.25, 1.65, 0.95], [1.3, 1.6, 0.95]];
  pose.f = BC.map(r => r.slice());
  const RW = 0.0126 + 0.0076 + ((typeof window !== 'undefined' && window.TORCH_RWX) ?? 0.0); // arc radius of the finger centre-lines (PIP..tip) around the body
  FN.forEach((n, i) => { let lo = 0.5, hi = 1.45; for (let it = 0; it < 22; it++) { const k = (lo + hi) / 2; pose.f[i] = [BC[i][0], BC[i][1] * k, BC[i][2] * k]; poseHand(h, pose); h.updateMatrixWorld(true); const r = fingerArc(h, n).r; if (r > RW) lo = k; else hi = k; } });
  poseHand(h, pose); h.updateMatrixWorld(true);
  const arcs = FN.map(n => fingerArc(h, n)); report.arcR = arcs.map(a => +a.r.toFixed(4));
  // 2) channel axis = line through the arc centres (pinky -> index), averaged with the arc normals for robustness
  const cen = arcs.reduce((a, c) => a.add(c.c), v3()).multiplyScalar(0.25);
  const ax = arcs[0].c.clone().sub(arcs[3].c).normalize(); const nAvg = arcs.reduce((a, c) => a.add(c.n.clone().multiplyScalar(Math.sign(c.n.dot(ax)) || 1)), v3()).normalize();
  const axis = ax.clone().add(nAvg).normalize(); // points toward the index side
  // v6: oblique power grip - the tube lies diagonally across the palm, head tilted toward the fingers, tail toward the wrist/hypothenar
  const TILT = (typeof window !== 'undefined' && window.TORCH_TILT) ?? 0;
  { const bh = h.userData.bones; h.updateMatrixWorld(true); const W0 = bh.hand.getWorldPosition(v3()), M0 = bh.middle1.getWorldPosition(v3());
    const D = M0.sub(W0); D.addScaledVector(axis, -D.dot(axis)).normalize(); axis.multiplyScalar(Math.cos(TILT)).addScaledVector(D, Math.sin(TILT)).normalize();
    cen.copy(arcs[1].c).lerp(arcs[2].c, 0.5); }
  // 3) rigid placement: axis -> torch -Z (head on the index side), back of hand -> wantBack, channel centred on the tube
  const back = new THREE.Vector3(0, 1, 0); back.addScaledVector(axis, -back.dot(axis)).normalize();
  const srcB = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(back, axis), back, axis);
  const WB = (typeof window !== 'undefined' && window.TORCH_BACK) || [-0.96, 0.18, 0];
  const FLIP = (typeof window !== 'undefined' && window.TORCH_FLIP) ?? 1; // v6: overhand duty grip - lens out of the pinky side, thumb on the tail-cap switch
  const wantBack = new THREE.Vector3(...WB).normalize(); const dz = new THREE.Vector3(0, 0, FLIP ? 1 : -1);
  const dstB = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(wantBack, dz), wantBack, dz);
  const qR = new THREE.Quaternion().setFromRotationMatrix(dstB.multiply(srcB.clone().transpose()));
  const ZC = (typeof window !== 'undefined' && window.TORCH_ZC) ?? (FLIP ? 0.012 : 0.011);
  h.quaternion.copy(qR); h.position.copy(new THREE.Vector3(0, 0, ZC).sub(cen.clone().applyQuaternion(qR))); h.updateMatrixWorld(true);
  const obst = (p) => torchSDF(p);
  const samp = skinSamples(h, 4);
  report.prePen = +maxPenetration(h, samp, obst).worst.toFixed(4);
  const STAGE = (typeof window !== 'undefined' && window.TORCH_STAGE) || 9;
  if (STAGE <= 1) { report.fingers = Object.fromEntries(FN.map(n => [n, +segHit(chain(h, n), RAD[n], obst).toFixed(4)])); VM.torchHand.p = h.position.clone(); VM.torchHand.q = h.quaternion.clone(); POSES.fistTorch = clonePose(pose); if (par) par.add(h); return report; }
  const palmGap = () => { const m = samp.mesh, pa = m.geometry.attributes.position; h.updateMatrixWorld(true); m.skeleton.update(); let d = 1; for (const i of samp) { if (samp.names[i] !== 'hand') continue; const q = v3().fromBufferAttribute(pa, i); m.applyBoneTransform(i, q); q.applyMatrix4(m.matrixWorld); d = Math.min(d, obst(q)); } return d; };
  if (typeof window !== 'undefined' && window.TORCH_SEAT2) {
    // v6 seat: open the fingers, seat the palm on the tube (~1.5 mm skin compression), then curl every finger onto it
    pose.f = FN.map(() => [0.35, 0.3, 0.2]); poseHand(h, pose); h.updateMatrixWorld(true);
    const m = samp.mesh, pa = m.geometry.attributes.position; const palmIdx = samp.filter(i => samp.names[i] === 'hand');
    const palmMin = () => { h.updateMatrixWorld(true); m.skeleton.update(); let d = 1, at = null; for (const i of palmIdx) { const q = v3().fromBufferAttribute(pa, i); m.applyBoneTransform(i, q); q.applyMatrix4(m.matrixWorld); const e = obst(q); if (e < d) { d = e; at = q; } } return { d, at }; };
    for (let it = 0; it < 60; it++) { const pen = maxPenetration(h, samp, obst); const { d, at } = palmMin();
      if (pen.dir && pen.worst < -0.0022) { h.position.addScaledVector(pen.dir.clone().setZ(0).normalize(), Math.min(0.002, (-0.0018 - pen.worst) * 0.6)); continue; }
      if (d > -0.0008) { const dir = new THREE.Vector3(at.x, at.y, 0).normalize(); h.position.addScaledVector(dir, -Math.min(0.002, (d + 0.0012) * 0.6)); continue; } break; }
    report.seatPen = +maxPenetration(h, samp, obst).worst.toFixed(4);
    report.palmSeat = +palmMin().d.toFixed(4);
    // place the fist on the tube: coordinate descent of the hand position (torch xy) with the fingers re-wrapped each time,
    // so the tube ends up pinched between palm and curled fingers (all phalanges touching, palm pressing, nothing sinking in)
    const sub = samp.filter((_, k) => k % 2 === 0); sub.mesh = samp.mesh; sub.names = samp.names;
    const evalPos = () => { wrapFingers(h, pose, FN, obst, [1.75, 1.95, 1.5], false); let c = 0;
      for (const n of FN) { const pts = chain(h, n); for (let k = 0; k < 3; k++) { let d = 1; for (let u = 0; u <= 1; u += 0.25) d = Math.min(d, obst(pts[k].clone().lerp(pts[k + 1], u)) - RAD[n][k]); c += (k === 0 ? 0.4 : 1) * Math.max(0, d) ** 2 + 30 * Math.min(0, d + 0.0012) ** 2; } }
      const pen = maxPenetration(h, sub, obst).worst; c += 40 * Math.min(0, pen + 0.0025) ** 2; const pm = palmMin().d; c += 0.6 * Math.max(0, pm) ** 2; return c; };
    const t0 = performance.now(); let bestC = evalPos(); let nEval = 1;
    for (const st of [0.006, 0.003, 0.0015]) for (let it = 0; it < 6; it++) { let imp = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { h.position.x += dx * st; h.position.y += dy * st; const c = evalPos(); nEval++; if (c < bestC - 1e-12) { bestC = c; imp = true; } else { h.position.x -= dx * st; h.position.y -= dy * st; } }
      if (!imp) break; }
    report.place = { cost: +bestC.toExponential(2), nEval, ms: Math.round(performance.now() - t0) };
    wrapFingers(h, pose, FN, obst, [1.75, 1.95, 1.5], false);
    // fingertips must not sink into the palm (the old crease): back the DIP/PIP off until the tip clears the palm skin
    const palmPts = () => { h.updateMatrixWorld(true); m.skeleton.update(); return palmIdx.filter((_, k) => k % 2 === 0).map(i => { const q = v3().fromBufferAttribute(pa, i); m.applyBoneTransform(i, q); return q.applyMatrix4(m.matrixWorld); }); };
    const PP = palmPts();
    const tipPalm = (n) => { const pts = chain(h, n); const t = pts[3], t2 = pts[2].clone().lerp(pts[3], 0.5); let d = 1; for (const q of PP) d = Math.min(d, q.distanceTo(t) - RAD[n][2], q.distanceTo(t2) - RAD[n][2]); return d; };
    report.tipPalm0 = FN.map(n => +tipPalm(n).toFixed(4));
    FN.forEach((n, fi) => { for (let it = 0; it < 30; it++) { poseHand(h, pose); if (tipPalm(n) > -0.0015) break; pose.f[fi][2] = Math.max(0, pose.f[fi][2] - 0.03); pose.f[fi][1] = Math.max(0, pose.f[fi][1] - 0.01); } });
    poseHand(h, pose); report.tipPalm = FN.map(n => +tipPalm(n).toFixed(4));
  } else {
  // 4) palm: push out radially until it only presses (<=2.5 mm skin compression), or pull in until it touches
  { // v6: back the fist off along its own back-of-hand direction (palm-normal), not the averaged SDF gradient (which cancels when the palm crosses the axis)
    const bh = h.userData.bones; h.updateMatrixWorld(true); const g = (n) => bh[n].getWorldPosition(v3());
    const N = g('index1').sub(g('pinky1')).cross(g('middle1').sub(g('hand'))).normalize(); N.z = 0; N.normalize(); // palm normal (right hand)
    const palmOnly = samp.filter(i => samp.names[i] === 'hand'); palmOnly.mesh = samp.mesh; palmOnly.names = samp.names;
    const PEN = (typeof window !== 'undefined' && window.TORCH_PALMPEN) ?? -0.002;
    for (let it = 0; it < 60; it++) { const pen = maxPenetration(h, palmOnly, obst); if (pen.worst > PEN) break; h.position.addScaledVector(N, -Math.min(0.0015, (PEN - pen.worst) + 0.0002)); h.updateMatrixWorld(true); }
    report.palmBack = N.toArray().map(x => +x.toFixed(3)); }
  report.palm0 = +palmGap().toFixed(4);
  if (window.TORCH_RIGID) // rigid refinement: slide/tilt the fist on the tube so the middle+distal phalanges all touch it and nothing sinks in
  { const m = samp.mesh, pa = m.geometry.attributes.position; const sub = samp.filter((_, k) => k % 3 === 0);
    const cost = () => { h.updateMatrixWorld(true); m.skeleton.update(); let c = 0;
      for (const n of FN) { const pts = chain(h, n); for (let k = 1; k < 3; k++) for (let u = 0; u <= 1; u += 0.5) { const d = obst(pts[k].clone().lerp(pts[k + 1], u)) - RAD[n][k]; c += d * d * (d < 0 ? 30 : 1); } }
      let pen = 0, near = 1; for (const i of sub) { const q = v3().fromBufferAttribute(pa, i); m.applyBoneTransform(i, q); q.applyMatrix4(m.matrixWorld); const d = obst(q); if (d < -0.0025) pen += (d + 0.0025) ** 2; if (samp.names[i] === 'hand') near = Math.min(near, d); }
      return c + 40 * pen + 2 * Math.max(0, near) ** 2; };
    const piv = new THREE.Vector3(0, 0, ZC); let best = cost();
    const tryMove = (fn, undo) => { fn(); const c = cost(); if (c < best - 1e-12) { best = c; return true; } undo(); return false; };
    for (let st = 0.003; st > 0.0002; st *= 0.6) for (let it = 0; it < 30; it++) { let imp = false;
      for (const ax of [0, 1]) for (const sg of [1, -1]) { const d = new THREE.Vector3(); d.setComponent(ax, sg * st); imp = tryMove(() => h.position.add(d), () => h.position.sub(d)) || imp; }
      for (const ax of [0, 1]) for (const sg of [1, -1]) { const A = new THREE.Vector3(); A.setComponent(ax, 1); const q = new THREE.Quaternion().setFromAxisAngle(A, sg * st * 8);
        const ap = () => { h.position.sub(piv).applyQuaternion(q).add(piv); h.quaternion.premultiply(q); }; const qi = q.clone().invert(); const un = () => { h.position.sub(piv).applyQuaternion(qi).add(piv); h.quaternion.premultiply(qi); };
        imp = tryMove(ap, un) || imp; }
      if (!imp) break; }
    report.rigidCost = +best.toExponential(2); }
  // 5) fingers wrap tight onto the tube (contact, no penetration)
  if (STAGE <= 2) { VM.torchHand.p = h.position.clone(); VM.torchHand.q = h.quaternion.clone(); POSES.fistTorch = clonePose(pose); if (par) par.add(h); return report; }
  pose.f = FN.map(() => [0.3, 0.25, 0.15]); wrapFingers(h, pose, FN, obst, [1.75, 1.95, 1.5], true);
  }
  if (STAGE <= 3) { report.fingers = Object.fromEntries(FN.map(n => [n, +segHit(chain(h, n), RAD[n], obst).toFixed(4)])); report.f = pose.f; VM.torchHand.p = h.position.clone(); VM.torchHand.q = h.quaternion.clone(); POSES.fistTorch = clonePose(pose); if (par) par.add(h); return report; }
  if (false) FN.forEach((n, fi) => { for (let it = 0; it < 12; it++) { poseHand(h, pose); h.updateMatrixWorld(true); if (segHit(chain(h, n), RAD[n], obst) > -0.0042) break; pose.f[fi][2] = Math.max(0, pose.f[fi][2] - 0.02); pose.f[fi][1] = Math.max(0, pose.f[fi][1] - 0.01); } });
  poseHand(h, pose); h.updateMatrixWorld(true);
  // 6) thumb wraps over the index + middle middle phalanges (outside them), pad pressing down on them
  const caps = []; for (const n of FN) { const pts = chain(h, n); for (let k = 0; k < 3; k++) caps.push([pts[k], pts[k + 1], RAD[n][k]]); }
  const obstF = (p) => { let d = torchSDF(p); for (const [a, b, r] of caps) d = Math.min(d, capsuleSDF(p, a, b, r)); return d; };
  const midPh = (n, u = 0.5) => { const pts = chain(h, n); return pts[1].clone().lerp(pts[2], u); };
  const TU = (typeof window !== 'undefined' && window.TORCH_THU) ?? 0.15; const over = midPh('index', TU).lerp(midPh('middle', TU), 0.4); const rad = new THREE.Vector3(over.x, over.y, 0).normalize();
  { // v6: thumb presses down on the index (and middle) just behind the PIP knuckle, from the palm side of the fist (where a real thumb reaches)
    const ip = chain(h, 'index'), mp = chain(h, 'middle'); const aP = Math.atan2(ip[1].y, ip[1].x), aM = Math.atan2(ip[0].y, ip[0].x); let dA = aM - aP; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
    const TA = (typeof window !== 'undefined' && window.TORCH_THA) ?? 0.45; const ang = aP + Math.sign(dA) * TA; rad.set(Math.cos(ang), Math.sin(ang), 0);
    over.copy(ip[1]).lerp(ip[0], 0.2).lerp(mp[1].clone().lerp(mp[0], 0.2), 0.3); }
  const thT = FLIP ? new THREE.Vector3(0, 0, 0.0655 + 0.0035 + RAD.thumb[2] * 0.8) : new THREE.Vector3(0, 0, over.z).addScaledVector(rad, Math.hypot(over.x, over.y) + RAD.index[1] * 0.6 + RAD.thumb[2] * 0.85); report.thT = thT.toArray().map(v => +v.toFixed(4));
  const padOf = () => { const pts = chain(h, 'thumb'); return { tip: pts[2].clone().lerp(pts[3], 0.55), pts }; };
  fitChain(h, pose, padOf, thT, obstF, [['t', 0], ['t', 1], ['t', 2], ['t', 3], ['tRoll'], ['t', 4], ['t', 5]], RAD.thumb, 0.00001, null, 0.0002);
  report.thumb = +padOf().tip.distanceTo(thT).toFixed(4);
  { const r3 = v => v.toArray().map(x => +x.toFixed(3)); report.thPts = chain(h, 'thumb').map(r3); report.ixPts = chain(h, 'index').map(r3); report.mdPts = chain(h, 'middle').map(r3); }
  report.thumbHit = +segHit(chain(h, 'thumb'), RAD.thumb, obstF).toFixed(4);
  report.thumbOver = +obstF(padOf().tip).toFixed(4);
  // 7) validation
  report.fingers = Object.fromEntries(FN.map(n => [n, +segHit(chain(h, n), RAD[n], obst).toFixed(4)]));
  report.contact = Object.fromEntries(FN.map(n => { const pts = chain(h, n); let d = 1; for (let k = 1; k < 3; k++) for (let u = 0; u <= 1; u += 0.25) d = Math.min(d, obst(pts[k].clone().lerp(pts[k + 1], u)) - RAD[n][k]); return [n, +d.toFixed(4)]; }));
  report.contactSeg = Object.fromEntries(FN.map(n => { const pts = chain(h, n); return [n, [0, 1, 2].map(k => { let d = 1; for (let u = 0; u <= 1; u += 0.25) d = Math.min(d, obst(pts[k].clone().lerp(pts[k + 1], u)) - RAD[n][k]); return +d.toFixed(4); })]; }));
  report.tips = Object.fromEntries(FN.map(n => { const t = chain(h, n)[3]; return [n, { axisDist: +Math.hypot(t.x, t.y).toFixed(4), ang: Math.round(Math.atan2(t.y, t.x) * 57.3), z: +t.z.toFixed(3) }]; }));
  report.mcpAng = FN.map(n => { const t = chain(h, n)[0]; return Math.round(Math.atan2(t.y, t.x) * 57.3); });
  report.palm = +palmGap().toFixed(4); { const pp = maxPenetration(h, samp, obst); report.pen = +pp.worst.toFixed(4); report.penAt = samp.worstAt; report.penCnt = pp.cnt; }
  report.handZ = FN.map(n => +chain(h, n)[0].z.toFixed(3));
  VM.torchHand.p = h.position.clone(); VM.torchHand.q = h.quaternion.clone();
  POSES.fistTorch = clonePose(pose);
  if (par) par.add(h);
  return report;
}

// ---------- handheld radio (truck intro) ----------
// Walkie frame: x = width (+x = right side seen from the front), y = depth (+y = front/speaker face), z = up (antenna).
// Solved as the RIGHT hand on a mirrored radio; the intro mirrors hand + radio together (scale.x = -1) to make the left hand.
// Mirrored-frame grip: palm flat on the back (-y), fingers run across the back and wrap the +x side onto the front edge,
// thumb lies along the -x side on the PTT bar (the PTT is placed under the solved thumb pad).
export const WALKIE = { hx: 0.0305, hy: 0.0185, hz: 0.068, r: 0.008 };
export function walkieSDF(p) { const { hx, hy, hz, r } = WALKIE; return boxSDF(p.x, p.y, p.z, hx, hy, hz, r); }
export function solveWalkie(h, opt = {}) {
  const par = h.parent; const report = {}; const t0 = performance.now();
  G.add(h); h.position.set(0, 0, 0); h.quaternion.identity();
  const pose = { f: FN.map(() => [0.25, 0.2, 0.1]), spread: [0.03, 0.0, -0.03, -0.07], t: [0.2, 0.0, 0.1, 0.05, 0, 0], tRoll: 0, wrist: [0, 0, 0] };
  poseHand(h, pose); h.updateMatrixWorld(true);
  // hand axes -> walkie: fingers (-Zh) -> +x, palm normal (-Yh) -> +y (into the back face), thumb (-Xh) -> +z ... tilted so the fingers run a little downward
  const tilt = opt.tilt ?? -0.55; const fx = new THREE.Vector3(Math.cos(tilt), 0, -Math.sin(tilt)); const py = new THREE.Vector3(0, 1, 0);
  const Zh = fx.clone().negate(), Yh = py.clone().negate(), Xh = new THREE.Vector3().crossVectors(Yh, Zh);
  h.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(Xh, Yh, Zh)); h.updateMatrixWorld(true);
  const b = h.userData.bones; const mid = () => b.middle1.getWorldPosition(v3()).lerp(b.ring1.getWorldPosition(v3()), 0.5);
  // knuckle line just past the back-right corner so the proximal phalanges lie on the back, middle ones round the side
  const tgt = new THREE.Vector3(opt.kx ?? 0.012, -WALKIE.hy - 0.0105, opt.kz ?? -0.004);
  h.position.add(tgt.clone().sub(mid())); h.updateMatrixWorld(true);
  const obst = (p) => walkieSDF(p); const samp = skinSamples(h, 4);
  const m = samp.mesh, pa = m.geometry.attributes.position; const palmIdx = samp.filter(i => samp.names[i] === 'hand');
  const palmMin = () => { h.updateMatrixWorld(true); m.skeleton.update(); let d = 1; for (const i of palmIdx) { const q = v3().fromBufferAttribute(pa, i); m.applyBoneTransform(i, q); q.applyMatrix4(m.matrixWorld); d = Math.min(d, obst(q)); } return d; };
  // seat the palm on the back face: move along y until the palm just touches (~1 mm skin compression), never sinking in
  for (let it = 0; it < 80; it++) { const pen = maxPenetration(h, samp, obst).worst; const d = palmMin();
    if (pen < -0.0015) { h.position.y -= Math.min(0.002, (-0.0012 - pen) * 0.7); continue; }
    if (d > -0.0006) { h.position.y += Math.min(0.002, (d + 0.0009) * 0.7); continue; } break; }
  report.palm = +palmMin().toFixed(4); report.pen0 = +maxPenetration(h, samp, obst).worst.toFixed(4);
  // curl every finger onto the radio (tight wrap, no clipping)
  wrapFingers(h, pose, FN, obst, [1.6, 1.9, 1.4], false);
  // thumb: pad on the -x side, upper third (PTT), lying along the side
  const thT = new THREE.Vector3(-WALKIE.hx - RAD.thumb[2] * 0.92, opt.ty ?? 0.002, opt.tz ?? 0.034);
  const padOf = () => { const pts = chain(h, 'thumb'); return { tip: pts[2].clone().lerp(pts[3], 0.55), pts }; };
  fitChain(h, pose, padOf, thT, obst, [['t', 0], ['t', 1], ['t', 2], ['t', 3], ['tRoll'], ['t', 4], ['t', 5]], RAD.thumb, 0.00001, null, 0.0002);
  report.thumb = +padOf().tip.distanceTo(thT).toFixed(4);
  const pad = padOf().tip; report.ptt = [-WALKIE.hx, pad.y, pad.z];
  report.fingers = Object.fromEntries(FN.map(n => [n, +segHit(chain(h, n), RAD[n], obst).toFixed(4)]));
  report.contact = Object.fromEntries(FN.map(n => { const pts = chain(h, n); let d = 1; for (let k = 1; k < 3; k++) for (let u = 0; u <= 1; u += 0.25) d = Math.min(d, obst(pts[k].clone().lerp(pts[k + 1], u)) - RAD[n][k]); return [n, +d.toFixed(4)]; }));
  report.pen = +maxPenetration(h, samp, obst).worst.toFixed(4); report.ms = Math.round(performance.now() - t0);
  const out = { p: h.position.clone(), q: h.quaternion.clone(), pose: clonePose(pose), report };
  G.remove(h); if (par) par.add(h); return out;
}

// ---------- v7: .308 bolt rifle (rifle.js frame: bore y=0, muzzle -Z, +X right) ----------
// Right hand: palm wrapped round the pistol grip behind the guard, web high under the stock wrist, thumb over the top
// of the wrist onto the left side, index pad on the trigger, middle/ring/pinky curled round the front strap.
// Left hand: forend cradled in the palm ahead of the magazine, fingers up the right side, thumb along the left side.
// Bolt hand: thumb + index/middle closed round the bolt knob (solved relative to the knob at rest).
export function solveRifleGrip(rh, lh, POSES, sdf, O = {}) {
  const T0 = performance.now(); const rep = {}; const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const ov = (typeof window !== 'undefined' && window.RG) || {}; const P = (k, d) => (ov[k] ? V(...ov[k]) : d);
  const rPar = rh.parent, lPar = lh.parent; const backDir = (h) => V(0, 1, 0).applyQuaternion(h.quaternion).normalize();
  const obst = (p) => sdf(p.x, p.y, p.z);
  // front strap z at height y (x = 0)
  const front = (y) => { for (let z = 0.07; z < 0.16; z += 0.0005) if (sdf(0, y, z, { noGuard: 1, noTrigger: 1, noBolt: 1 }) < 0) return z; return 0.1; };
  // ---------------- RIGHT ----------------
  const LR = landmarksLocal(rh);
  const A = [LR.wrist, LR.index, LR.middle, LR.ring, LR.pinky, LR.web];
  const mx = 0.0395, mdz = 0.014; const ys = [-0.064, -0.081, -0.098, -0.114];
  const B = [P('wrist', V(-0.006, -0.112, 0.222)), ...ys.map((y, i) => V(mx - (i === 3 ? 0.004 : i === 0 ? 0.002 : 0), y, front(y) + mdz + i * 0.002)), P('web', V(0.012, -0.05, 0.168))];
  if (ov.ofs) B.forEach(b => b.add(V(...ov.ofs)));
  const fr = fitRigid(A, B, [1.0, 1.4, 1.2, 1.0, 0.8, 2.0]);
  G.add(rh); rh.position.copy(fr.t); rh.quaternion.copy(fr.q);
  rep.fitR = A.map((a, i) => [a.clone().applyQuaternion(fr.q).add(fr.t).toArray().map(x => +x.toFixed(3)), B[i].toArray().map(x => +x.toFixed(3))]);
  const pr = clonePose(POSES.gripR); pr.wrist = [0, 0, 0]; pr.f = FN.map(() => [0.05, 0.05, 0.05]); pr.spread = [0, 0, 0, 0];
  poseHand(rh, pr); const sampR = skinSamples(rh, 4);
  const obstR = (p) => sdf(p.x, p.y, p.z);
  rep.rPen0 = maxPenetration(rh, sampR, obstR).worst;
  { let moved = 0; for (let it = 0; it < (ov.nopush ? 0 : 30) && moved < 0.014; it++) { const pen = maxPenetration(rh, sampR, obstR); if (!pen.dir || pen.worst > -0.003) break; const st = Math.min(0.001, -pen.worst * 0.5); rh.position.addScaledVector(backDir(rh), st); moved += st; } rep.rMoved = +moved.toFixed(4); }
  rep.rPalm = maxPenetration(rh, sampR, obstR).worst;
  for (const n of ['middle', 'ring', 'pinky']) { const m1 = chain(rh, n)[0]; const y = m1.y - 0.004; const fz = front(y); const r = RAD[n][1];
    (rep.rWrap ||= {})[n] = wrapTo(rh, pr, n, obstR, V(0.004, y, fz - r * 0.9), V(-0.0165 - RAD[n][2] * 0.85, y - 0.002, fz + 0.016)); }
  // index pad on the trigger blade (guard interior is free space)
  const obstNoTrig = (p) => sdf(p.x, p.y, p.z, { noTrigger: 1 });
  const trig = P('trig', V(0.002, -0.0635, 0.0545));
  fitChain(rh, pr, () => { const pts = chain(rh, 'index'); const pad = pts[2].clone().lerp(pts[3], 0.55); return { tip: pad, pts }; }, trig, obstNoTrig, [['f', 0, 0], ['f', 0, 1], ['f', 0, 2], ['spread', 0]], RAD.index, 0.0002, null, 0.0002);
  const triggerR = clonePose(pr);
  // thumb over the top of the stock wrist, tip on the left side
  const thT = P('thumb', V(-0.027, -0.045, 0.105)); const thumbVec = (h) => () => { const pts = chain(h, 'thumb'); return { tip: pts[3], pts }; };
  pr.t = [0.6, 0.4, 0.2, 0.1, 0, 0]; pr.tRoll = 0;
  fitChain(rh, pr, thumbVec(rh), thT, obstR, [['t', 0], ['t', 1], ['t', 2], ['t', 3], ['tRoll'], ['t', 4], ['t', 5]], RAD.thumb, 0.00002, P('thumbMid', V(-0.025, -0.05, 0.13)), 0.0003);
  triggerR.t = pr.t.slice(); triggerR.tRoll = pr.tRoll; const gripR = clonePose(pr);
  poseHand(rh, triggerR);
  rep.rFingers = Object.fromEntries([...FN, 'thumb'].map(n => [n, +segHit(chain(rh, n), RAD[n], n === 'index' ? obstNoTrig : obstR).toFixed(4)]));
  rep.rThumb = +chain(rh, 'thumb')[3].distanceTo(thT).toFixed(4); rep.rIdx = +chain(rh, 'index')[2].clone().lerp(chain(rh, 'index')[3], 0.55).distanceTo(trig).toFixed(4);
  rep.rPenFinal = +maxPenetration(rh, sampR, obstNoTrig).worst.toFixed(4);
  const R = { p: rh.position.clone(), q: rh.quaternion.clone(), pose: triggerR, grip: gripR };
  // ---------------- BOLT (right hand on the knob) ----------------
  const K = V(0.06, -0.039, 0.064);
  const kSDF = (p) => Math.min(Math.hypot(p.x - K.x, p.y - K.y, (p.z - K.z) / 1.12) - 0.0115, sdf(p.x, p.y, p.z, { noBolt: 1 }) + 0.002);
  const Bb = [P('bWrist', V(0.13, -0.07, 0.115)), V(0.074, -0.03, 0.074), V(0.077, -0.046, 0.08), V(0.078, -0.06, 0.087), V(0.077, -0.072, 0.095), P('bWeb', V(0.066, -0.026, 0.09))];
  const fb = fitRigid(A, Bb, [1.0, 1.2, 1.2, 0.8, 0.6, 1.5]); rh.position.copy(fb.t); rh.quaternion.copy(fb.q);
  const pb = clonePose(POSES.pinchL || POSES.gripR); pb.wrist = [0, 0, 0]; pb.f = FN.map(() => [0.05, 0.05, 0.05]); pb.spread = [0, 0, 0, 0]; poseHand(rh, pb);
  for (let it = 0; it < 16; it++) { const pen = maxPenetration(rh, sampR, kSDF); if (!pen.dir || pen.worst > -0.0015) break; rh.position.addScaledVector(pen.dir, Math.min(0.003, -pen.worst * 0.6)); }
  wrapFingers(rh, pb, ['index', 'middle'], kSDF); pb.f[2] = [1.25, 1.35, 0.7]; pb.f[3] = [1.35, 1.4, 0.7];
  pb.t = [0.6, 0.4, 0.2, 0.1, 0, 0]; pb.tRoll = 0;
  fitChain(rh, pb, thumbVec(rh), K.clone().add(V(-0.004, 0.011, 0.006)), kSDF, [['t', 0], ['t', 1], ['t', 2], ['t', 3], ['tRoll'], ['t', 4], ['t', 5]], RAD.thumb, 0.00002, null, 0.0003);
  rep.bolt = { idx: +segHit(chain(rh, 'index'), RAD.index, kSDF).toFixed(4), th: +chain(rh, 'thumb')[3].distanceTo(K).toFixed(4) };
  const Bo = { p: rh.position.clone(), q: rh.quaternion.clone(), pose: clonePose(pb), K };
  poseHand(rh, triggerR); rh.position.copy(R.p); rh.quaternion.copy(R.q); if (rPar) rPar.add(rh);
  // ---------------- LEFT (support) ----------------
  const LL = landmarksLocal(lh); const A2 = [LL.wrist, LL.index, LL.middle, LL.ring, LL.pinky, LL.thumbMCP];
  const zc = ov.lz ?? -0.215;
  const B2 = [P('lWrist', V(-0.062, -0.088, zc + 0.03)), V(0.026, -0.058, zc - 0.03), V(0.029, -0.06, zc - 0.012), V(0.028, -0.061, zc + 0.006), V(0.025, -0.06, zc + 0.022), P('lThumbMCP', V(-0.012, -0.07, zc - 0.035))];
  B2.forEach(b => b.add(V(...(ov.lofs || [0.004, 0.012, 0]))));
  const fl = fitRigid(A2, B2, [0.8, 1.2, 1.0, 0.9, 0.7, 2.5]); G.add(lh); lh.position.copy(fl.t); lh.quaternion.copy(fl.q);
  rep.fitL = A2.map((a, i) => [a.clone().applyQuaternion(fl.q).add(fl.t).toArray().map(x => +x.toFixed(3)), B2[i].toArray().map(x => +x.toFixed(3))]);
  const pl = clonePose(POSES.supportL); pl.wrist = [0, 0, 0]; pl.f = FN.map(() => [0.05, 0.05, 0.05]); pl.spread = [0, 0, 0, 0]; poseHand(lh, pl);
  const sampL = skinSamples(lh, 4); rep.lPen0 = maxPenetration(lh, sampL, obst).worst;
  for (let it = 0; it < 24; it++) { const pen = maxPenetration(lh, sampL, obst); if (!pen.dir || pen.worst > -0.0012) break; lh.position.addScaledVector(pen.dir, Math.min(0.003, -pen.worst * 0.6)); }
  rep.lPalm = maxPenetration(lh, sampL, obst).worst;
  // fingers up the right side of the forend (tips below the receiver line)
  wrapFingers(lh, pl, FN, obst);
  const thL = P('lThumb', V(-0.023, -0.024, zc - 0.05));
  pl.t = [0.5, 0.3, 0.1, 0.05, 0, 0]; pl.tRoll = 0;
  fitChain(lh, pl, thumbVec(lh), thL, obst, [['t', 0], ['t', 1], ['t', 2], ['t', 3], ['tRoll'], ['t', 4], ['t', 5]], RAD.thumb, 0.00002, null, 0.0003);
  rep.lFingers = Object.fromEntries([...FN, 'thumb'].map(n => [n, +segHit(chain(lh, n), RAD[n], obst).toFixed(4)]));
  rep.lThumb = +chain(lh, 'thumb')[3].distanceTo(thL).toFixed(4); rep.lPenFinal = +maxPenetration(lh, sampL, obst).worst.toFixed(4);
  const L = { p: lh.position.clone(), q: lh.quaternion.clone(), pose: clonePose(pl) };
  if (lPar) lPar.add(lh);
  rep.ms = Math.round(performance.now() - T0);
  return { R, L, Bo, rep };
}
