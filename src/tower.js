// Elgo Tower: timber tower, cab interior, balcony, barred stairs, props, ground features.
import * as THREE from 'three';
import { TOWER, polar, height , MAPD } from './geo.js';
import { mulberry32 } from './noise.js';
import { rbox, paintMaps, rustMaps, grimeAlpha, corkMaps, fabricMaps, leatherMaps, texOf, addBoxAO, fbmField } from './procedural.js';

const F = TOWER.floor, H = TOWER.half, B = TOWER.balc;
let FF_ROT = 0; // firefinder map rotation so its north points to world north (-z)
export const CAB = { F, H, B, outer: H + B, wallTop: 2.6, sill: 1.0, door: { x0: -0.42, x1: 0.42, z: H } };

function beam(a, b, w, d, mat) { // box beam between points a,b
  const v = new THREE.Vector3().subVectors(b, a); const L = v.length();
  const m = new THREE.Mesh(rbox(w, L, d, Math.min(w, d) * 0.18, 2), mat); m.position.copy(a).addScaledVector(v, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = true; m.receiveShadow = true; return m;
}
function texClone(t, rx, ry) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function box(w, h, d, mat, x, y, z, parent) { const m = new THREE.Mesh(rbox(w, h, d, Math.min(0.014, Math.min(w, h, d) * 0.25), 2), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; if (parent) parent.add(m); return m; }

export function buildTower(scene, tex, Q) {
  const T = { group: new THREE.Group(), interact: [], colliders: [], bulletMeshes: [], notes: [] };
  const g = T.group; scene.add(g);
  const wood = new THREE.MeshStandardMaterial({ map: texClone(tex.planks, 0.3, 2), normalMap: texClone(tex.planksN, 0.3, 2), roughnessMap: texClone(tex.planksR, 0.3, 2), color: 0x9a8a78, roughness: 1 });
  const woodPaint = new THREE.MeshStandardMaterial({ map: texClone(tex.planks, 1, 1), normalMap: texClone(tex.planksN, 1, 1), color: 0x6f5f50, roughness: 0.95 });
  const floorMat = new THREE.MeshStandardMaterial({ map: texClone(tex.brown, 2, 2), normalMap: texClone(tex.brownN, 2, 2), roughnessMap: texClone(tex.brownR, 2, 2), color: 0xa08870 });
  const TLm = new THREE.TextureLoader(); const mw = (f, srgb) => { const t = TLm.load('assets/tex/mychief/mychief-wood-' + f + '.jpg'); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const MW = { a: mw('albedo', true), n: mw('normal'), r: mw('rough') };
  // MyChief weathered planks: rows run horizontally like real lap siding / board walls
  const wallMat = new THREE.MeshStandardMaterial({ map: texClone(MW.a, 1.6, 0.8), normalMap: texClone(MW.n, 1.6, 0.8), roughnessMap: texClone(MW.r, 1.6, 0.8), color: 0xd8ccbc, roughness: 1 });
  // chipped white lookout paint on the window frames/trim (bare grey wood shows through), iron hardware, rusted catwalk steel
  const PT = paintMaps('trim', 0xd6d0bf, 0x6b5a48, { seed: 23, chips: 0.75, grime: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ map: texOf(PT.map, { srgb: true, rep: [1, 2] }), roughnessMap: texOf(PT.rough, { rep: [1, 2] }), normalMap: texOf(PT.normal, { rep: [1, 2] }), normalScale: new THREE.Vector2(0.6, 0.6), roughness: 1 });
  const PG = paintMaps('green', 0x3e5643, 0x5a4a3a, { seed: 29, chips: 0.5, grime: 0.6 });
  const trimGreen = new THREE.MeshStandardMaterial({ map: texOf(PG.map, { srgb: true }), roughnessMap: texOf(PG.rough), normalMap: texOf(PG.normal), normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1 });
  const RM = rustMaps();
  const metal = new THREE.MeshStandardMaterial({ color: 0x8a8e94, map: texOf(RM.map, { srgb: true, rep: [0.5, 0.5] }), roughness: 0.6, metalness: 0.75, roughnessMap: texOf(RM.rough, { rep: [0.5, 0.5] }) });
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a7e78, map: texOf(RM.map, { srgb: true, rep: [1, 3] }), roughnessMap: texOf(RM.rough, { rep: [1, 3] }), metalnessMap: texOf(RM.metal, { rep: [1, 3] }), normalMap: texOf(RM.normal, { rep: [1, 3] }), roughness: 1, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xc8d4e0, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.1, depthWrite: false, envMapIntensity: 1.6, specularIntensity: 1, side: THREE.DoubleSide });
  // fresnel sheen: the glass becomes more opaque/reflective at grazing angles (moonlight glints on the panes)
  glass.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `float fr = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 4.0);
    diffuseColor.a = clamp(opacity + fr * 0.45 + dot(outgoingLight, vec3(0.33)) * 0.5, 0.0, 0.85);
    #include <opaque_fragment>`); };
  const grime = new THREE.MeshBasicMaterial({ color: 0x9a948a, alphaMap: texOf(grimeAlpha()), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  grime.color.multiplyScalar(0.35); // dust reads at night as a faint film, not a white haze
  T.mats = { wood, floorMat, wallMat, trim, metal, glass };
  const AOC = new THREE.Vector3(0, F, 0); for (const m of [floorMat, wallMat, woodPaint, trim, trimGreen]) addBoxAO(m, AOC, H, { floorY: F, ceilY: F + CAB.wallTop, strength: 0.75, key: m.uuid.slice(0, 6) });

  // ---------- tower frame ----------
  const legTop = H - 0.25, legBot = 4.6, levels = 7;
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  for (const [sx, sz] of corners) g.add(beam(new THREE.Vector3(sx * legBot, -0.5, sz * legBot), new THREE.Vector3(sx * legTop, F, sz * legTop), 0.28, 0.28, wood));
  const at = (y) => legBot + (legTop - legBot) * (y / F);
  for (let i = 1; i <= levels; i++) {
    const y = F * i / levels - (i === levels ? 0.15 : 0), y0 = F * (i - 1) / levels; const r = at(y), r0 = at(y0);
    for (let k = 0; k < 4; k++) {
      const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
      g.add(beam(new THREE.Vector3(ax * r, y, az * r), new THREE.Vector3(bx * r, y, bz * r), 0.16, 0.2, wood));
      g.add(beam(new THREE.Vector3(ax * r0, y0 + 0.2, az * r0), new THREE.Vector3(bx * r, y - 0.1, bz * r), 0.09, 0.14, wood));
      g.add(beam(new THREE.Vector3(bx * r0, y0 + 0.2, bz * r0), new THREE.Vector3(ax * r, y - 0.1, az * r), 0.09, 0.14, wood));
    }
  }
  // concrete footings
  const conc = new THREE.MeshStandardMaterial({ color: 0x7a7670, roughness: 1 });
  for (const [sx, sz] of corners) { // footings: terrain-sampled at every corner, piers buried 4 m below the lowest ground so nothing can float
    const cx = sx * legBot, cz = sz * legBot; const hs = [[-.5, -.5], [.5, -.5], [-.5, .5], [.5, .5]].map(([a, b]) => height(cx + a, cz + b));
    const hmin = Math.min(...hs), hmax = Math.max(...hs); const topY = Math.max(0.1, hmax + 0.3), botY = hmin - 4;
    box(0.9, topY - botY, 0.9, conc, cx, (topY + botY) / 2, cz, g);
    }
  // ---------- stairs: exterior switchback on the west face, from the balcony hatch to the ground (walkable path in T.stairs) ----------
  { const nSteps = 14, flights = 7, sw = 0.72; const xO = (y) => -(at(y) + 1.25), xI = (y) => -(at(y) + 0.47);
    const gbX = xO(0), gbZ = -2.7; const gb = Math.max(...[[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]].map(([a, b]) => height(gbX + a, gbZ + b))) + 0.07;
    const yB = Math.min(...[-1.75, 1.75].map(zz => height(xO(0), zz))) ; const yEnd = Math.max(gb, yB + 0.05); const rise = (F - yEnd) / flights;
    const treadG = rbox(sw, 0.05, 0.27, 0.012, 1); const treads = new THREE.InstancedMesh(treadG, wood, nSteps * flights); let ti = 0; const o = new THREE.Object3D();
    const pts = [new THREE.Vector3(xO(F), F, 2.35), new THREE.Vector3(xO(F), F, 1.75)];
    for (let f = 0; f < flights; f++) {
      const outer = f % 2 === 0, lane = outer ? xO : xI, zs = outer ? 1.75 : -1.75, ze = -zs, y0 = F - f * rise, y1 = F - (f + 1) * rise;
      for (let s = 0; s < nSteps; s++) { const t = (s + 1) / (nSteps + 1), y = y0 + (y1 - y0) * t; o.position.set(lane(y), y - 0.025, zs + (ze - zs) * t); o.updateMatrix(); treads.setMatrixAt(ti++, o.matrix); }
      for (const side of [-0.38, 0.38]) g.add(beam(new THREE.Vector3(lane(y0) + side, y0 - 0.12, zs - Math.sign(ze) * 0.12), new THREE.Vector3(lane(y1) + side, y1 - 0.12, ze + Math.sign(ze) * 0.12), 0.05, 0.24, wood));
      // outer handrail on posts (the side away from the frame)
      const hr = outer ? -0.4 : 0.4; const hx = (y) => lane(y) + (outer ? -0.4 : 0) ;
      if (outer) { g.add(beam(new THREE.Vector3(hx(y0), y0 + 0.95, zs), new THREE.Vector3(hx(y1), y1 + 0.95, ze), 0.05, 0.06, wood)); for (const t of [0.02, 0.5, 0.98]) { const y = y0 + (y1 - y0) * t; g.add(beam(new THREE.Vector3(hx(y), y - 0.05, zs + (ze - zs) * t), new THREE.Vector3(hx(y), y + 0.97, zs + (ze - zs) * t), 0.06, 0.06, wood)); } }
      pts.push(new THREE.Vector3(lane(y0), y0, zs), new THREE.Vector3(lane(y1), y1, ze));
      if (f < flights - 1) { const zl = ze + Math.sign(ze) * 0.42, xm = -(at(y1) + 0.86); box(1.66, 0.08, 0.9, wood, xm, y1 - 0.04, zl, g); // landing + its posts down to the brace
        g.add(beam(new THREE.Vector3(xm - 0.78, y1 - 0.08, zl), new THREE.Vector3(xm - 0.78, y1 + 1.0, zl), 0.06, 0.06, wood)); g.add(beam(new THREE.Vector3(xm - 0.78, y1 + 0.97, zl - 0.42), new THREE.Vector3(xm - 0.78, y1 + 0.97, zl + 0.42), 0.05, 0.05, wood));
        g.add(beam(new THREE.Vector3(xm + 0.3, y1 - 0.08, zl), new THREE.Vector3(-at(y1) - 0.05, y1 - 0.08, zl), 0.08, 0.12, wood));
        pts.push(new THREE.Vector3(lane(y1), y1, zl), new THREE.Vector3((outer ? xI : xO)(y1), y1, zl)); }
    }
    pts.push(new THREE.Vector3(gbX, yEnd, gbZ));
    treads.castShadow = true; treads.receiveShadow = true; g.add(treads); T.bulletMeshes.push(treads);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    T.stairs = { pts, cum, L: cum[cum.length - 1], top: pts[0].clone(), bottom: pts[pts.length - 1].clone(), xTop: xO(F) };
  }
  // ---------- cab ----------
  const cab = new THREE.Group(); cab.position.y = F; g.add(cab); T.cab = cab;
  // floor & balcony deck
  const hatch = { x0: -H - B - 0.01, x1: -H - B + 0.71, z0: -0.75, z1: 1.8 }; T.hatch = hatch; // opening over the top flight of the exterior stairs
  floorMat.map.repeat.set(4, 4); floorMat.normalMap.repeat.set(4, 4); floorMat.roughnessMap.repeat.set(4, 4);
  const O = H + B; const deck = box(O - hatch.x1, 0.14, 2 * O, floorMat, (hatch.x1 + O) / 2, -0.07, 0, cab);
  const fm2 = floorMat.clone(); for (const k of ['map', 'normalMap', 'roughnessMap']) { fm2[k] = floorMat[k].clone(); fm2[k].repeat.set(0.4, 1.2); fm2[k].needsUpdate = true; }
  const deckS = box(hatch.x1 + O, 0.14, O - hatch.z1, fm2, (hatch.x1 - O) / 2, -0.07, (hatch.z1 + O) / 2, cab), deckN = box(hatch.x1 + O, 0.14, hatch.z0 + O, fm2, (hatch.x1 - O) / 2, -0.07, (hatch.z0 - O) / 2, cab);
  T.bulletMeshes.push(deck, deckS, deckN);
  // joists framing the opening
  for (const z of [hatch.z0 - 0.04, hatch.z1 + 0.04]) box(hatch.x1 - hatch.x0, 0.2, 0.08, wood, (hatch.x0 + hatch.x1) / 2, -0.12, z, cab);
  box(0.08, 0.2, hatch.z1 - hatch.z0, wood, hatch.x1 + 0.04, -0.12, (hatch.z0 + hatch.z1) / 2, cab);
  // walls (lower solid, window band, header), with door opening on south (+z)
  const wallH = CAB.sill; const top = CAB.wallTop;
  const mk = (w, h, x, y, z, ry, mat = wallMat) => { const m = box(w, h, 0.1, mat, 0, 0, 0, cab); m.position.set(x, y, z); m.rotation.y = ry; T.bulletMeshes.push(m); return m; };
  for (const [ry, nx, nz] of [[0, 0, -1], [Math.PI / 2, 1, 0], [Math.PI / 2, -1, 0]]) { mk(2 * H, wallH, nx * H, wallH / 2, nz * H, ry); mk(2 * H, 0.25, nx * H, top - 0.125, nz * H, ry); }
  // south wall split for door
  const dx0 = CAB.door.x0, dx1 = CAB.door.x1;
  mk(H + dx0, wallH, (-H + dx0) / 2, wallH / 2, H, 0); mk(H - dx1, wallH, (H + dx1) / 2, wallH / 2, H, 0);
  mk(H + dx0, 0.25, (-H + dx0) / 2, top - 0.125, H, 0); mk(H - dx1, 0.25, (H + dx1) / 2, top - 0.125, H, 0); mk(dx1 - dx0, top - 2.08, 0, (top + 2.08) / 2, H, 0);
  // windows: mullions + glass
  const winH = top - 0.25 - wallH, wy = wallH + winH / 2;
  const addWin = (x0, x1, z, ry) => { // along local x from x0..x1 at z (rotated)
    const grp = new THREE.Group(); grp.rotation.y = ry; cab.add(grp);
    const n = Math.max(1, Math.round((x1 - x0) / 0.85));
    for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; box(0.07, winH, 0.09, trim, x, wy, z, grp); }
    box(x1 - x0, 0.06, 0.12, trim, (x0 + x1) / 2, wallH + 0.03, z, grp); box(x1 - x0, 0.05, 0.1, trim, (x0 + x1) / 2, wy + 0.08, z, grp);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, winH), glass); gl.position.set((x0 + x1) / 2, wy, z); gl.renderOrder = 2; grp.add(gl);
    const gm = grime.clone(); gm.alphaMap = grime.alphaMap.clone(); gm.alphaMap.repeat.set(n, 2); gm.alphaMap.needsUpdate = true;
    const gr = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, winH), gm); gr.position.set((x0 + x1) / 2, wy, z + 0.004); gr.renderOrder = 3; grp.add(gr);
  };
  addWin(-H, H, -H, 0); addWin(-H, H, -H, -Math.PI / 2); addWin(-H, H, -H, Math.PI / 2);
  addWin(-H, dx0 - 0.02, H, 0); addWin(dx1 + 0.02, H, H, 0);
  // ceiling and roof
  const ceil = box(2 * H, 0.06, 2 * H, woodPaint, 0, top + 0.03, 0, cab); ceil.castShadow = false;
  const roofG = new THREE.ConeGeometry((H + B + 0.25) * Math.SQRT2, 1.15, 4, 1, false); roofG.rotateY(Math.PI / 4);
  const roof = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.7, metalness: 0.35 })); roof.position.y = top + 0.65; roof.castShadow = true; cab.add(roof);
  const lightning = beam(new THREE.Vector3(0, top + 1.1, 0), new THREE.Vector3(0, top + 2.0, 0), 0.02, 0.02, metal); cab.add(lightning);
  // balcony posts holding roof + railings
  const R = H + B - 0.08;
  for (const [sx, sz] of corners) box(0.14, top, 0.14, wood, sx * R, top / 2, sz * R, cab);
  const railY = [0.5, 1.02]; const sides = [[[-R, R], [R, R]], [[R, R], [R, -R]], [[R, -R], [-R, -R]], [[-R, -R], [-R, R]]];
  // rusted steel catwalk railing: pipe top/mid rails, square balusters, kick plate; weathered timber posts
  const pipe = (a, b, r) => { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 14), rust); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = m.receiveShadow = true; cab.add(m); return m; };
  for (const [a, b] of sides) {
    for (const [y, r] of [[1.04, 0.024], [0.55, 0.016]]) pipe(new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1]), r);
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.round(L / 0.95);
    for (let i = 1; i < n; i++) { const t = i / n; box(0.08, 1.05, 0.08, wood, a[0] + (b[0] - a[0]) * t, 0.525, a[1] + (b[1] - a[1]) * t, cab); }
    for (let i = 0; i < n * 7; i++) { const t = (i + 0.5) / (n * 7); const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; const bb = box(0.018, 1.0, 0.018, rust, x, 0.52, z, cab); bb.castShadow = !!Q.shadows; }
    const kv = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]); const kp = box(L, 0.1, 0.012, rust, (a[0] + b[0]) / 2, 0.06, (a[1] + b[1]) / 2, cab); kp.rotation.y = -Math.atan2(kv.z, kv.x);
  }
  // bolts / brackets where the rails meet the posts
  for (const [sx, sz] of corners) for (const y of [1.04, 0.55]) { const c = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), rust); c.position.set(sx * R, y, sz * R); cab.add(c); }
  // ---------- door ----------
  const doorPivot = new THREE.Group(); doorPivot.position.set(dx0, 0, H + 0.02); cab.add(doorPivot);
  const doorW = dx1 - dx0 - 0.02; const door = new THREE.Group(); doorPivot.add(door);
  box(doorW, 1.0, 0.05, wallMat, doorW / 2, 0.52, 0, door); box(doorW, 0.12, 0.05, wallMat, doorW / 2, 2.0, 0, door);
  box(0.08, 0.95, 0.05, trimGreen, 0.04, 1.5, 0, door); box(0.08, 0.95, 0.05, trimGreen, doorW - 0.04, 1.5, 0, door); box(doorW, 0.06, 0.055, trimGreen, doorW / 2, 1.04, 0, door);
  for (const z of [-0.028, 0.028]) for (const [y, h] of [[0.3, 0.32], [0.75, 0.32]]) box(doorW - 0.16, h, 0.008, trimGreen, doorW / 2, y, z, door); // raised panels
  for (const y of [0.35, 1.75]) { const hg = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.11, 12), metal); hg.position.set(0.0, y, 0.0); door.add(hg); box(0.06, 0.09, 0.004, metal, 0.035, y, -0.029, door); }
  // casing round the opening
  for (const x of [dx0 - 0.04, dx1 + 0.04]) box(0.08, 2.1, 0.13, trim, x, 1.05, H, cab); box(dx1 - dx0 + 0.16, 0.09, 0.13, trim, 0, 2.12, H, cab); box(dx1 - dx0 + 0.1, 0.03, 0.2, wood, 0, 0.015, H, cab);
  const dg = new THREE.Mesh(new THREE.PlaneGeometry(doorW - 0.16, 0.92), glass); dg.position.set(doorW / 2, 1.5, 0); door.add(dg);
  const doorBrass = new THREE.MeshStandardMaterial({ color: 0xa88648, metalness: 1, roughness: 0.38 });
  for (const sz of [-1, 1]) { const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.01, 20), doorBrass); rose.rotation.x = Math.PI / 2; rose.position.set(doorW - 0.08, 1.0, sz * 0.03); door.add(rose);
    const lev = new THREE.Mesh(rbox(0.11, 0.018, 0.02, 0.008), doorBrass); lev.position.set(doorW - 0.12, 1.0, sz * 0.055); door.add(lev); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 10), doorBrass); st.rotation.x = Math.PI / 2; st.position.set(doorW - 0.08, 1.0, sz * 0.045); door.add(st); }
  T.door = { pivot: doorPivot, open: false, a: 0 };
  T.interact.push({ id: 'door', pos: new THREE.Vector3(0, F + 1.1, H), r: 1.6, label: () => T.door.open ? 'Close door' : 'Open door', press: () => { T.door.open = !T.door.open; T.onSound && T.onSound(T.door.open ? 'door-open' : 'door-close', new THREE.Vector3(0, F + 1.2, H)); } });
  // ---------- stair gate: hinged steel gate across the hatch, padlocked (Stairs Key on the hook by the door) ----------
  const gx = (hatch.x0 + hatch.x1) / 2, gw = hatch.x1 - hatch.x0 - 0.04;
  { const rp = (a, b, r = 0.02) => { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 10), rust); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = true; cab.add(m); };
    for (const y of [0.55, 1.04]) { rp(new THREE.Vector3(hatch.x1, y, hatch.z0), new THREE.Vector3(hatch.x1, y, hatch.z1)); rp(new THREE.Vector3(hatch.x0 + 0.04, y, hatch.z0), new THREE.Vector3(hatch.x1, y, hatch.z0)); }
    for (const z of [hatch.z0, (hatch.z0 + hatch.z1) / 2, hatch.z1]) box(0.06, 1.06, 0.06, rust, hatch.x1, 0.53, z, cab); }
  const gatePivot = new THREE.Group(); gatePivot.position.set(hatch.x1 - 0.02, 0, hatch.z1 + 0.03); cab.add(gatePivot);
  const gate = new THREE.Group(); gatePivot.add(gate);
  box(gw, 0.045, 0.045, metal, -gw / 2, 1.0, 0, gate); box(gw, 0.045, 0.045, metal, -gw / 2, 0.12, 0, gate); box(0.045, 0.95, 0.045, metal, 0, 0.56, 0, gate); box(0.045, 0.95, 0.045, metal, -gw, 0.56, 0, gate);
  for (let i = 1; i < 5; i++) box(0.022, 0.86, 0.022, rust, -gw * i / 5, 0.56, 0, gate);
  const chainG = new THREE.Group(); gate.add(chainG);
  for (let k = 0; k < 9; k++) { const l = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 10), metal); l.position.set(-gw + 0.02 - (k % 2) * 0.01, 0.92 - k * 0.04, 0.03); l.rotation.y = (k % 2) * Math.PI / 2; chainG.add(l); }
  const lockM = new THREE.MeshStandardMaterial({ color: 0xb08a40, metalness: 1, roughness: 0.38 });
  const lock = box(0.06, 0.07, 0.025, lockM, -gw + 0.02, 0.52, 0.05, chainG); const shk = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.005, 6, 12, Math.PI), metal); shk.position.set(-gw + 0.02, 0.56, 0.05); chainG.add(shk);
  const signT = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#d8d0b8'; c.fillRect(0, 0, w, h); c.strokeStyle = '#8a1a10'; c.lineWidth = 8; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#8a1a10'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('STAIRS LOCKED', w / 2, 52); c.font = '19px sans-serif'; c.fillText('KEY ON HOOK BY DOOR', w / 2, 86); c.fillText('GENERATOR \u2192 BASE OF TOWER', w / 2, 110); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.23), new THREE.MeshStandardMaterial({ map: signT, roughness: 0.8, side: THREE.DoubleSide })); sign.position.set(-gw / 2, 0.66, 0.03); gate.add(sign);
  T.gate = { pivot: gatePivot, open: false, locked: true, a: 0, chain: chainG, x: gx, z: hatch.z1 + 0.03 };
  T.interact.push({ id: 'gate', pos: new THREE.Vector3(gx, F + 0.75, hatch.z1 + 0.1), r: 1.8, label: () => T.gate.locked ? (T.hasKey && T.hasKey() ? 'Unlock stair gate' : 'Stair gate (locked)') : (T.gate.open ? 'Close stair gate' : 'Open stair gate'),
    press: () => { const gt = T.gate; const p = new THREE.Vector3(gx, F + 0.7, hatch.z1);
      if (gt.locked) { if (T.hasKey && T.hasKey()) { gt.locked = false; gt.open = true; chainG.visible = false; T.onSound && T.onSound('unlock', p); T.onMessage && T.onMessage('Gate unlocked. The stairs go all the way down.'); T.onGate && T.onGate('unlock'); } else { T.onSound && T.onSound('gate', p); T.onMessage && T.onMessage('Locked. The Stairs Key hangs on the hook by the door.'); } return; }
      gt.open = !gt.open; T.onSound && T.onSound('gate', p); } });
  // ---------- interior props ----------
  // Osborne firefinder
  const ff = new THREE.Group(); cab.add(ff);
  const ffWood = new THREE.MeshPhysicalMaterial({ map: texClone(tex.brown, 0.5, 0.5), normalMap: texClone(tex.brownN, 0.5, 0.5), normalScale: new THREE.Vector2(0.4, 0.4), color: 0x9a7650, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.35 });
  addBoxAO(ffWood, new THREE.Vector3(0, F, 0), H, { floorY: F, ceilY: F + CAB.wallTop, strength: 0.6, key: 'ffw' });
  const brass = new THREE.MeshStandardMaterial({ color: 0xb8924c, metalness: 1, roughness: 0.32 });
  { // turned wooden pedestal on a cross-foot base
    const prof = [[0.0, 0.0], [0.17, 0.0], [0.17, 0.03], [0.1, 0.06], [0.065, 0.1], [0.055, 0.3], [0.07, 0.36], [0.05, 0.42], [0.048, 0.7], [0.075, 0.76], [0.11, 0.8], [0.11, 0.84], [0.0, 0.84]].map(p => new THREE.Vector2(p[0], p[1]));
    const ped = new THREE.Mesh(new THREE.LatheGeometry(prof, 36), ffWood); ped.castShadow = ped.receiveShadow = true; ff.add(ped);
    for (const a of [0, Math.PI / 2]) { const f = box(0.72, 0.05, 0.08, ffWood, 0, 0.025, 0, ff); f.rotation.y = a; } }
  const mapT = canvasTex(512, 512, (c, w, h) => { c.fillStyle = '#e2dccb'; c.fillRect(0, 0, w, h); const r = mulberry32(5); c.strokeStyle = 'rgba(120,90,60,0.5)'; for (let i = 0; i < 40; i++) { c.beginPath(); let x = r() * w, y = r() * h; c.moveTo(x, y); for (let k = 0; k < 20; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; c.lineTo(x, y); } c.stroke(); }
    c.fillStyle = 'rgba(60,110,170,0.55)'; c.beginPath(); c.ellipse(120, 260, 50, 40, 0, 0, 7); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.arc(256, 256, 240, 0, 7); c.stroke();
    c.fillStyle = '#222'; c.font = '16px serif'; for (let d = 0; d < 360; d += 10) { const a = (d - 90) * Math.PI / 180; c.save(); c.translate(256 + Math.cos(a) * 225, 256 + Math.sin(a) * 225); c.rotate(a + Math.PI / 2); c.fillText(d % 30 === 0 ? String(d) : '|', -8, 0); c.restore(); }
    c.fillStyle = '#a01010'; c.beginPath(); c.arc(256, 256, 5, 0, 7); c.fill(); c.fillStyle = '#333'; c.font = 'bold 18px serif'; c.fillText('ELGO', 236, 290); c.fillText('TAMARACK N.F.', 190, 150); });
  const ffMap = new THREE.TextureLoader().load('assets/tex/mychief/mychief-firefinder-map.jpg'); ffMap.colorSpace = THREE.SRGBColorSpace; ffMap.anisotropy = 8;
  const top1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 64), [ffWood, new THREE.MeshStandardMaterial({ map: ffMap, roughness: 0.7 }), ffWood]); top1.rotation.y = FF_ROT; top1.position.y = 0.88; ff.add(top1); top1.castShadow = true;
  // brass azimuth ring engraved in degrees, glass over the map, alidade with front (hair-wire) and rear (peep) sighting vanes
  const ringT = canvasTex(1024, 64, (c, w, h) => { c.fillStyle = '#c9a25a'; c.fillRect(0, 0, w, h); c.fillStyle = '#3a2a10'; c.strokeStyle = '#3a2a10'; for (let d = 0; d < 360; d++) { const x = d / 360 * w; c.lineWidth = d % 10 ? 1 : 2; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, d % 10 ? 14 : (d % 30 ? 22 : 30)); c.stroke(); if (d % 30 === 0) { c.font = 'bold 22px serif'; c.fillText(String(d), x + 3, 56); } } });
  const ringM = new THREE.MeshStandardMaterial({ map: ringT, metalness: 0.9, roughness: 0.35, color: 0xffffff });
  const ringG = new THREE.RingGeometry(0.42, 0.47, 96, 1); { const uv = ringG.attributes.uv, pp = ringG.attributes.position; for (let i = 0; i < uv.count; i++) { const a = Math.atan2(pp.getY(i), pp.getX(i)); uv.setXY(i, (a / (Math.PI * 2) + 1) % 1, Math.hypot(pp.getX(i), pp.getY(i)) > 0.445 ? 1 : 0); } }
  const ring = new THREE.Mesh(ringG, ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.909; ff.add(ring);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.008, 8, 96), brass); rim.rotation.x = Math.PI / 2; rim.position.y = 0.908; ff.add(rim);
  const mapGlass = new THREE.Mesh(new THREE.CircleGeometry(0.42, 64), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.03, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 1.5 })); mapGlass.rotation.x = -Math.PI / 2; mapGlass.position.y = 0.912; ff.add(mapGlass);
  const ali = new THREE.Group(); ali.position.y = 0.915; ali.rotation.y = 0.6; ff.add(ali);
  box(0.03, 0.006, 0.92, brass, 0, 0.003, 0, ali);
  { const fv = new THREE.Group(); fv.position.set(0, 0, -0.45); ali.add(fv); box(0.06, 0.008, 0.02, brass, 0, 0.004, 0, fv); box(0.008, 0.16, 0.012, brass, -0.025, 0.08, 0, fv); box(0.008, 0.16, 0.012, brass, 0.025, 0.08, 0, fv); box(0.058, 0.008, 0.012, brass, 0, 0.16, 0, fv);
    const hair = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0007, 0.15, 4), new THREE.MeshStandardMaterial({ color: 0x111111 })); hair.position.y = 0.083; fv.add(hair); }
  { const rv = new THREE.Group(); rv.position.set(0, 0, 0.45); ali.add(rv); box(0.05, 0.008, 0.02, brass, 0, 0.004, 0, rv); const pl = box(0.04, 0.11, 0.004, brass, 0, 0.06, 0, rv); const peep = new THREE.Mesh(new THREE.TorusGeometry(0.004, 0.0015, 6, 16), new THREE.MeshStandardMaterial({ color: 0x111111 })); peep.position.set(0, 0.09, 0.003); rv.add(peep); }
  for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; const clip = box(0.025, 0.012, 0.03, brass, Math.cos(a) * 0.455, 0.912, Math.sin(a) * 0.455, ff); clip.rotation.y = -a; }
  T.bulletMeshes.push(top1);
  // desk with drawer along north wall
  const desk = new THREE.Group(); desk.position.set(-1.25, 0, -H + 0.34); cab.add(desk);
  box(1.5, 0.05, 0.62, ffWood, 0, 0.76, 0, desk); for (const [x, z] of [[-0.7, -0.26], [0.7, -0.26], [-0.7, 0.26], [0.7, 0.26]]) box(0.05, 0.74, 0.05, ffWood, x, 0.37, z, desk);
  box(0.5, 0.6, 0.55, ffWood, 0.45, 0.43, 0, desk);
  const drawer = new THREE.Group(); drawer.position.set(-0.25, 0.64, 0.02); desk.add(drawer);
  box(0.6, 0.12, 0.55, new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.8 }), 0, 0, 0, drawer);
  box(0.62, 0.14, 0.02, ffWood, 0, 0, 0.285, drawer); box(0.1, 0.02, 0.03, metal, 0, 0, 0.31, drawer);
  T.drawer = { g: drawer, open: false, a: 0, hasTorch: true };
  const torchProp = new THREE.Group(); torchProp.position.set(0.05, 0.075, 0.05); torchProp.rotation.set(0, 0.4, Math.PI / 2); drawer.add(torchProp); T.torchProp = torchProp;
  const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0x1a1b1d, roughness: 0.5, metalness: 0.7 })); torchProp.add(tb);
  const th = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.015, 0.04, 16), tb.material); th.position.y = 0.085; torchProp.add(th);
  T.interact.push({ id: 'drawer', pos: new THREE.Vector3(-1.5, F + 0.65, -H + 0.62), r: 1.5, label: () => !T.drawer.open ? 'Open drawer' : (T.drawer.hasTorch ? 'Take flashlight' : 'Close drawer'),
    press: () => { const d = T.drawer; if (!d.open) { d.open = true; T.onSound && T.onSound('drawer'); } else if (d.hasTorch) { d.hasTorch = false; torchProp.visible = false; T.onTakeTorch && T.onTakeTorch(); T.onSound && T.onSound('pickup'); } else { d.open = false; T.onSound && T.onSound('drawer'); } } });
  // radio on desk
  const radio = new THREE.Group(); radio.position.set(-0.8, 0.785, -0.08); desk.add(radio);
  // base-station transceiver: olive crinkle steel case, glowing frequency dial + S-meter, knobs, toggles, desk mic on a coiled cord
  { const case_ = new THREE.MeshStandardMaterial({ color: 0x4a5038, roughness: 0.55, metalness: 0.45, normalMap: texOf(leatherMaps().n, { rep: [3, 3] }), normalScale: new THREE.Vector2(0.25, 0.25) });
    box(0.36, 0.15, 0.24, case_, 0, 0.075, 0, radio); box(0.37, 0.155, 0.012, new THREE.MeshStandardMaterial({ color: 0x1d1e1c, roughness: 0.5, metalness: 0.4 }), 0, 0.077, 0.121, radio);
    const fp = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#1a0d02'; c.fillRect(0, 0, w, h); const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#ffb24a'); g.addColorStop(1, '#ff8a20'); c.fillStyle = g; c.globalAlpha = 0.22; c.fillRect(8, 8, 300, 112); c.globalAlpha = 1;
      c.strokeStyle = '#2a1404'; c.fillStyle = '#2a1404'; c.font = 'bold 16px monospace'; for (let i = 0; i <= 30; i++) { const x = 20 + i * 9.4; c.lineWidth = i % 5 ? 1 : 2; c.beginPath(); c.moveTo(x, 70); c.lineTo(x, i % 5 ? 82 : 90); c.stroke(); if (i % 5 === 0) c.fillText(String(150 + i / 5 * 2), x - 14, 110); }
      c.fillStyle = '#ff3a10'; c.fillRect(150, 30, 3, 70); c.fillStyle = '#ffd890'; c.font = 'bold 30px monospace'; c.fillText('168.250', 30, 50);
      c.fillStyle = '#e8dcc0'; c.fillRect(330, 14, 170, 90); c.strokeStyle = '#222'; c.lineWidth = 2; c.beginPath(); c.arc(415, 112, 80, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); c.fillStyle = '#222'; c.font = '14px sans-serif'; c.fillText('S  1  3  5  7  9  +20', 345, 50); c.strokeStyle = '#b01010'; c.beginPath(); c.moveTo(415, 104); c.lineTo(385, 40); c.stroke(); });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.05), new THREE.MeshStandardMaterial({ map: fp, emissiveMap: fp, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.3 })); face.position.set(-0.06, 0.1, 0.128); radio.add(face); T.radioDial = face;
    const dl = new THREE.PointLight(0xff9a40, 0.25, 0.9, 2); dl.position.set(-0.06, 0.1, 0.2); radio.add(dl);
    const knurl = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.45, metalness: 0.3 });
    for (const [x, y, r] of [[0.09, 0.1, 0.019], [0.145, 0.1, 0.014], [0.09, 0.04, 0.013], [0.145, 0.04, 0.013]]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, 0.022, 24), knurl); k.rotation.x = Math.PI / 2; k.position.set(x, y, 0.135); radio.add(k); const sk = box(0.003, r * 0.9, 0.003, new THREE.MeshStandardMaterial({ color: 0xdddddd }), x, y + r * 0.45, 0.147, radio); }
    for (let i = 0; i < 4; i++) { const tg = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.02, 8), new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 1, roughness: 0.3 })); tg.rotation.x = Math.PI / 2 - 0.5; tg.position.set(-0.14 + i * 0.035, 0.03, 0.137); radio.add(tg); }
    const mic = new THREE.Group(); mic.position.set(-0.3, 0.0, 0.08); radio.add(mic); const mp = [[0, 0], [0.04, 0], [0.04, 0.01], [0.012, 0.03], [0.01, 0.14], [0.025, 0.155], [0.028, 0.19], [0.0, 0.2]].map(p => new THREE.Vector2(p[0], p[1]));
    const micM = new THREE.Mesh(new THREE.LatheGeometry(mp, 24), new THREE.MeshStandardMaterial({ color: 0x2a2b2c, metalness: 0.6, roughness: 0.35 })); micM.castShadow = true; mic.add(micM);
    const coil = []; for (let i = 0; i <= 160; i++) { const t = i / 160; const a = t * Math.PI * 2 * 22; coil.push(new THREE.Vector3(-0.3 + t * 0.26 + Math.cos(a) * 0.008, 0.012 + Math.sin(a) * 0.008 + Math.sin(t * Math.PI) * 0.01, 0.08 - t * 0.12)); }
    const cord = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 600, 0.0022, 6), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5 })); radio.add(cord); }
  const ant = beam(new THREE.Vector3(0.14, 0.14, -0.08), new THREE.Vector3(0.18, 0.55, -0.1), 0.006, 0.006, metal); radio.add(ant);

  T.interact.push({ id: 'radio', pos: new THREE.Vector3(-2.05, F + 0.86, -H + 0.26), r: 1.6, label: () => 'Use radio', press: () => { T.onRadio && T.onRadio(); } });
  // binoculars on desk
  const bino = new THREE.Group(); bino.position.set(0.3, 0.8, 0.1); bino.rotation.y = 0.5; desk.add(bino);
  const bm = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6 });
  for (const x of [-0.035, 0.035]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.028, 0.15, 14), bm); c.rotation.x = Math.PI / 2; c.position.set(x, 0.0, 0); bino.add(c); }
  T.binoProp = bino;
  T.interact.push({ id: 'bino', pos: new THREE.Vector3(-0.95, F + 0.82, -H + 0.44), r: 1.5, label: () => 'Pick up binoculars', press: () => { bino.visible = false; T.interact = T.interact.filter(i => i.id !== 'bino'); T.onTakeBino && T.onTakeBino(); T.onSound && T.onSound('pickup'); } });
  // cot on east wall
  const cot = new THREE.Group(); cot.position.set(H - 0.45, 0, 0.6); cab.add(cot);
  { const FB = fabricMaps(); const canvasM = new THREE.MeshStandardMaterial({ color: 0x5a6040, roughness: 0.95, normalMap: texOf(FB.n, { rep: [12, 30] }), normalScale: new THREE.Vector2(0.6, 0.6) });
    const plaid = canvasTex(256, 256, (c, w, h) => { c.fillStyle = '#5a1e1a'; c.fillRect(0, 0, w, h); for (const [col, sz, off] of [['rgba(20,20,20,0.55)', 40, 0], ['rgba(20,40,25,0.5)', 18, 26], ['rgba(200,170,120,0.35)', 4, 50]]) { c.fillStyle = col; for (let x = off; x < w; x += 64) { c.fillRect(x, 0, sz, h); c.fillRect(0, x, w, sz); } } });
    plaid.wrapS = plaid.wrapT = THREE.RepeatWrapping; plaid.repeat.set(2, 5);
    const wool = new THREE.MeshStandardMaterial({ map: plaid, roughness: 1, normalMap: texOf(FB.n, { rep: [20, 50] }), normalScale: new THREE.Vector2(0.8, 0.8) });
    const tube = (a, b, r = 0.014) => { const v = new THREE.Vector3().subVectors(b, a); const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 12), metal); m.position.copy(a).addScaledVector(v, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()); m.castShadow = true; cot.add(m); };
    for (const x of [-0.33, 0.33]) tube(new THREE.Vector3(x, 0.42, -0.95), new THREE.Vector3(x, 0.42, 0.95));
    for (const z of [-0.95, 0.95]) { tube(new THREE.Vector3(-0.33, 0.42, z), new THREE.Vector3(0.33, 0.42, z)); for (const x of [-0.3, 0.3]) tube(new THREE.Vector3(x, 0.0, z * 0.92), new THREE.Vector3(x, 0.42, z)); }
    box(0.64, 0.02, 1.88, canvasM, 0, 0.43, 0, cot);
    const mat = new THREE.Mesh(rbox(0.62, 0.09, 1.84, 0.04, 4), new THREE.MeshStandardMaterial({ color: 0x7a7464, roughness: 1, normalMap: texOf(FB.n, { rep: [10, 30] }) })); mat.position.set(0, 0.485, 0); mat.castShadow = mat.receiveShadow = true; cot.add(mat);
    const bl = new THREE.Mesh(rbox(0.68, 0.03, 1.2, 0.014, 3), wool); bl.position.set(0, 0.54, 0.3); bl.castShadow = bl.receiveShadow = true; cot.add(bl); const fold = new THREE.Mesh(rbox(0.68, 0.06, 0.25, 0.025, 3), wool); fold.position.set(0, 0.56, -0.25); cot.add(fold);
    const pil = new THREE.Mesh(rbox(0.5, 0.1, 0.3, 0.05, 5), new THREE.MeshStandardMaterial({ color: 0xc8c0ac, roughness: 1, normalMap: texOf(FB.n, { rep: [8, 8] }) })); pil.scale.set(1, 0.8, 1); pil.position.set(0, 0.57, -0.75); pil.rotation.z = 0.05; cot.add(pil); }
  // stool + shelf + coffee
  box(0.36, 0.04, 0.36, ffWood, 1.0, 0.6, -1.4, cab); for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) box(0.03, 0.6, 0.03, ffWood, 1.0 + x, 0.3, -1.4 + z, cab);
  box(0.9, 0.03, 0.25, ffWood, H - 0.15, 0.8, -1.6, cab).rotation.y = Math.PI / 2;
  { // speckled blue enamel camp mug with a dark rolled rim and coffee
    const enT = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#21486e'; c.fillRect(0, 0, w, h); const r = mulberry32(4); for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.7 ? 'rgba(235,240,245,0.9)' : 'rgba(10,20,30,0.7)'; c.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); } c.fillStyle = 'rgba(20,15,10,0.6)'; c.fillRect(0, 0, w, 6); c.fillRect(0, h - 4, w, 4); });
    const en = new THREE.MeshPhysicalMaterial({ map: enT, roughness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.15, side: THREE.DoubleSide });
    const mp = [[0.0, 0.0], [0.036, 0.0], [0.04, 0.004], [0.042, 0.085], [0.045, 0.09], [0.041, 0.091], [0.038, 0.086], [0.036, 0.01], [0.0, 0.01]].map(p => new THREE.Vector2(p[0], p[1]));
    const mug = new THREE.Group(); mug.position.set(-0.9, F + 0.785, -H + 0.55); mug.rotation.y = 2.3; g.add(mug);
    const body = new THREE.Mesh(new THREE.LatheGeometry(mp, 32), en); body.castShadow = true; mug.add(body);
    const hdl = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.006, 8, 20, Math.PI), en); hdl.rotation.z = -Math.PI / 2; hdl.position.set(0.042, 0.048, 0); mug.add(hdl);
    const cof = new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), new THREE.MeshPhysicalMaterial({ color: 0x1a0c05, roughness: 0.08, clearcoat: 1 })); cof.rotation.x = -Math.PI / 2; cof.position.y = 0.07; mug.add(cof); }
  // lantern hanging from ceiling hook
  const lant = new THREE.Group(); lant.position.set(-0.9, top - 0.45, 0.9); cab.add(lant);
  { // kerosene lantern: tin fount + chimney top, wire guard, bail; glowing glass globe with the flame inside
    const tin = new THREE.MeshStandardMaterial({ color: 0x7a2a1e, metalness: 0.6, roughness: 0.45 });
    const fount = new THREE.Mesh(new THREE.LatheGeometry([[0, -0.16], [0.07, -0.16], [0.075, -0.13], [0.06, -0.1], [0.03, -0.09], [0, -0.09]].map(p => new THREE.Vector2(p[0], p[1])), 28), tin); lant.add(fount);
    const cap = new THREE.Mesh(new THREE.LatheGeometry([[0, 0.14], [0.035, 0.14], [0.05, 0.11], [0.055, 0.09], [0, 0.09]].map(p => new THREE.Vector2(p[0], p[1])), 28), tin); lant.add(cap);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; const w = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.2, 6), metal); w.position.set(Math.cos(a) * 0.058, 0.0, Math.sin(a) * 0.058); lant.add(w); }
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.003, 6, 24, Math.PI), metal); bail.position.y = 0.13; lant.add(bail);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd080 })); flame.scale.set(1, 2.2, 1); flame.position.y = -0.03; lant.add(flame); }
  const globe = new THREE.Mesh(new THREE.LatheGeometry([[0.03, -0.09], [0.05, -0.06], [0.052, 0.0], [0.045, 0.06], [0.03, 0.09]].map(p => new THREE.Vector2(p[0], p[1])), 28), new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xffa040, emissiveIntensity: 2.0, transparent: true, opacity: 0.55, roughness: 0.1, depthWrite: false, side: THREE.DoubleSide })); lant.add(globe);
  cab.add(beam(new THREE.Vector3(-0.9, top, 0.9), new THREE.Vector3(-0.9, top - 0.32, 0.9), 0.008, 0.008, metal));
  T.lantern = new THREE.PointLight(0xffa858, 6, 8, 1.6); T.lantern.position.set(-0.9, F + top - 0.47, 0.9); T.lantern.castShadow = Q.shadows; T.lantern.shadow.mapSize.set(512, 512); T.lantern.shadow.bias = -0.002; g.add(T.lantern); T.lanternGlobe = globe;
  // gooseneck desk lamp: warm pool of light on the desk (contrasts with the cool moonlight outside)
  { const lamp = new THREE.Group(); lamp.position.set(-1.95, 0.785, -H + 0.2); cab.add(lamp);
    const blk = new THREE.MeshStandardMaterial({ color: 0x1e3a2a, metalness: 0.5, roughness: 0.35 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 28), blk); base.position.y = 0.012; base.castShadow = true; lamp.add(base);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0.0, 0.22, 0.02), new THREE.Vector3(0.08, 0.38, 0.08), new THREE.Vector3(0.2, 0.4, 0.16)]), 30, 0.007, 8), metal); lamp.add(neck);
    const shade = new THREE.Mesh(new THREE.LatheGeometry([[0.012, 0.0], [0.03, -0.01], [0.06, -0.06], [0.075, -0.1], [0.072, -0.1], [0.057, -0.06], [0.028, -0.012], [0.01, -0.002]].map(p => new THREE.Vector2(p[0], p[1])), 32), new THREE.MeshStandardMaterial({ color: 0x1e3a2a, metalness: 0.5, roughness: 0.35, side: THREE.DoubleSide }));
    shade.position.set(0.2, 0.41, 0.16); shade.rotation.set(0.35, 0, -0.4); shade.castShadow = true; lamp.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 10), new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffc070, emissiveIntensity: 4 })); bulb.position.set(0.19, 0.355, 0.175); lamp.add(bulb);
    const sp = new THREE.SpotLight(0xffb060, 9, 4.5, 0.95, 0.75, 2); sp.position.set(-1.95 + 0.19, F + 0.785 + 0.35, -H + 0.2 + 0.175); sp.target.position.set(-1.3, F + 0.6, -H + 0.7); sp.castShadow = !!Q.shadows; sp.shadow.mapSize.set(512, 512); sp.shadow.bias = -0.002; g.add(sp); g.add(sp.target); T.deskLamp = sp; T.deskBulb = bulb; }
  // corkboard with the district fire map, notes and a duty roster on the west wall
  { const CK = corkMaps(); const board = new THREE.Group(); board.position.set(-H + 0.06, 0.62, 0.55); board.rotation.y = Math.PI / 2; cab.add(board);
    box(0.8, 0.5, 0.025, trim, 0, 0, -0.005, board); const ck = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.44), new THREE.MeshStandardMaterial({ map: texOf(CK.map, { srgb: true, rep: [2, 1.2] }), normalMap: texOf(CK.normal, { rep: [2, 1.2] }), roughness: 1 })); ck.position.z = 0.0095; board.add(ck);
    const fmap = canvasTex(256, 200, (c, w, h) => { c.fillStyle = '#e8e0c4'; c.fillRect(0, 0, w, h); const r = mulberry32(19); c.strokeStyle = 'rgba(140,100,60,0.55)'; c.lineWidth = 1; for (let i = 0; i < 26; i++) { c.beginPath(); let x = r() * w, y = r() * h; c.moveTo(x, y); for (let k = 0; k < 30; k++) { x += (r() - 0.5) * 18; y += (r() - 0.5) * 18; c.lineTo(x, y); } c.stroke(); }
      c.fillStyle = 'rgba(40,110,60,0.25)'; c.fillRect(20, 30, 120, 90); c.strokeStyle = '#b01010'; c.lineWidth = 3; c.beginPath(); c.arc(170, 80, 18, 0, 7); c.stroke(); c.beginPath(); c.moveTo(60, 150); c.lineTo(90, 175); c.moveTo(90, 150); c.lineTo(60, 175); c.stroke(); c.fillStyle = '#222'; c.font = 'bold 14px serif'; c.fillText('TAMARACK DIST. 4', 8, 16); });
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.28), new THREE.MeshStandardMaterial({ map: fmap, roughness: 0.9 })); pm.position.set(-0.15, 0.02, 0.012); pm.rotation.z = 0.02; board.add(pm);
    const note = canvasTex(64, 80, (c, w, h) => { c.fillStyle = '#f0e8a8'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(30,30,90,0.7)'; for (let y = 12; y < h; y += 9) { c.beginPath(); c.moveTo(6, y); c.lineTo(w - 6 - (y * 7) % 20, y); c.stroke(); } });
    for (const [x, y, rz] of [[0.2, 0.1, -0.06], [0.26, -0.1, 0.08], [0.1, -0.13, 0.03]]) { const n = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.12), new THREE.MeshStandardMaterial({ map: note, roughness: 0.95 })); n.position.set(x, y, 0.013 + x * 0.002); n.rotation.z = rz; board.add(n);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshStandardMaterial({ color: [0xd01010, 0x1040d0, 0x10a030][Math.round(x * 10) % 3], roughness: 0.3 })); pin.position.set(x, y + 0.05, 0.02); board.add(pin); }
    for (const [x, y] of [[-0.32, 0.15], [0.02, 0.15], [-0.32, -0.12], [0.02, -0.12]]) { const pin = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshStandardMaterial({ color: 0xe0c020, roughness: 0.3 })); pin.position.set(x, y, 0.02); board.add(pin); } }
  // dented steel footlocker at the foot of the cot
  { const fl = new THREE.Group(); fl.position.set(H - 0.45, 0, 1.95); cab.add(fl); const od = new THREE.MeshStandardMaterial({ color: 0x4d5440, roughness: 0.6, metalness: 0.5, map: texOf(rustMaps().map, { srgb: true, rep: [0.4, 0.4] }) });
    box(0.7, 0.36, 0.4, od, 0, 0.18, 0, fl); box(0.72, 0.05, 0.42, od, 0, 0.375, 0, fl); for (const x of [-0.25, 0.25]) box(0.05, 0.06, 0.02, metal, x, 0.33, 0.215, fl); for (const x of [-0.36, 0.36]) { const hd = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.006, 6, 14, Math.PI), metal); hd.rotation.y = Math.PI / 2; hd.position.set(x, 0.25, 0); fl.add(hd); } }
  // floodlight switch box on the south wall right of the door (inside)
  const sw = new THREE.Group(); sw.position.set(1.25, 1.12, H - 0.08); cab.add(sw);
  box(0.16, 0.24, 0.08, new THREE.MeshStandardMaterial({ color: 0x5a6a5a, roughness: 0.5, metalness: 0.6 }), 0, 0, 0, sw);
  const lever = new THREE.Group(); lever.position.set(0, 0, -0.05); sw.add(lever);
  box(0.025, 0.16, 0.025, metal, 0, 0.07, -0.0, lever); box(0.05, 0.05, 0.05, new THREE.MeshStandardMaterial({ color: 0xaa2010, roughness: 0.5 }), 0, 0.15, 0, lever);
  lever.rotation.x = 0.6; T.floodLever = lever;
  const lab = canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#ddd5c0'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 18px sans-serif'; c.fillText('FLOOD', 30, 23); });
  const labm = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.035), new THREE.MeshBasicMaterial({ map: lab })); labm.position.set(0, -0.16, -0.041); labm.rotation.y = Math.PI; sw.add(labm);
  T.interact.push({ id: 'flood', pos: new THREE.Vector3(1.25, F + 1.15, H - 0.1), r: 1.6, hold: true, label: () => 'Hold for floodlight' });
  // ---------- floodlight fixture on roof eave, aimed south over the lot ----------
  const FLY = 1.45, FLZ = H + B + 0.5; // bolted to the OUTSIDE of the balcony rail, well beyond the cab glass
  const fl = new THREE.Group(); fl.position.set(0.0, FLY, FLZ); cab.add(fl);
  { const am = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.7 }); box(0.07, 0.07, 0.62, am, 0, 0, -0.3, fl); box(0.06, 0.95, 0.06, am, 0, -0.5, -0.6, fl); box(0.3, 0.05, 0.12, am, 0, -1.0, -0.6, fl); }
  const head = new THREE.Group(); head.rotation.x = 0.55; fl.add(head); // tilt down
  const hm = new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.5, metalness: 0.7 });
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.25, 20, 1, true), hm); can.rotation.x = Math.PI / 2; head.add(can);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.15, 20), new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff2d8, emissiveIntensity: 0 })); lens.position.z = 0.126; head.add(lens);
  box(0.04, 0.2, 0.04, hm, 0, -0.1, 0, fl);
  const spot = new THREE.SpotLight(0xfff0dc, 0, 140, 0.42, 0.45, 1.2); spot.castShadow = Q.shadows; spot.shadow.mapSize.set(1024, 1024); spot.shadow.bias = -0.0005; spot.shadow.camera.near = 1; spot.shadow.camera.far = 140;
  spot.position.set(0, F + FLY, FLZ + 0.25); spot.target.position.set(0, 0, 44); g.add(spot); g.add(spot.target);
  // volumetric-ish beam: additive cone with view-dependent falloff
  const beamLen = 42; const bg = new THREE.ConeGeometry(Math.tan(0.42) * beamLen, beamLen, 40, 1, true); bg.translate(0, -beamLen / 2, 0);
  const beamMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uI: { value: 0 }, uLen: { value: beamLen } },
    vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV; void main(){ vT = -position.y; vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI, uLen; varying float vT; varying vec3 vN; varying vec3 vV; void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float fall = (1.0 - smoothstep(0.0, uLen, vT)) * smoothstep(0.0, 1.5, vT); gl_FragColor = vec4(vec3(1.0,0.95,0.85) * edge * fall * uI * 0.14, 1.0); }` });
  const beamM = new THREE.Mesh(bg, beamMat); beamM.position.copy(spot.position); beamM.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3().subVectors(spot.target.position, spot.position).normalize()); beamM.visible = false; g.add(beamM);
  T.flood = { on: false, k: 0, spot, lens, beam: beamM };
  // ---------- ground features ----------
  // gravel pad, water tank, target pole, generator shed, outhouse
  { // gravel pad: a terrain-conforming disc (every vertex follows height()) with a buried earth skirt, so no slab can hang off the ridge
    const R0 = 15, RINGS = 14, SEG = 56, pos = [], uv = [], idx = [], padH = (x, z) => height(x, z) + 0.07;
    pos.push(0, padH(0, 0), 0); uv.push(0.5, 0.5);
    for (let r = 1; r <= RINGS; r++) for (let k = 0; k < SEG; k++) { const a = k / SEG * Math.PI * 2, rr = r / RINGS * R0, x = Math.cos(a) * rr, z = Math.sin(a) * rr; pos.push(x, padH(x, z), z); uv.push(x / 6, z / 6); }
    for (let k = 0; k < SEG; k++) idx.push(0, 1 + (k + 1) % SEG, 1 + k);
    for (let r = 1; r < RINGS; r++) for (let k = 0; k < SEG; k++) { const a = 1 + (r - 1) * SEG + k, b = 1 + (r - 1) * SEG + (k + 1) % SEG, c = a + SEG, d = b + SEG; idx.push(a, b, c, b, d, c); }
    // skirt: outer edge dropped 4 m into the hillside
    const edge0 = 1 + (RINGS - 1) * SEG, sk0 = pos.length / 3; for (let k = 0; k < SEG; k++) { const x = pos[(edge0 + k) * 3], y = pos[(edge0 + k) * 3 + 1], z = pos[(edge0 + k) * 3 + 2]; pos.push(x * 1.02, y - 4, z * 1.02); uv.push(x / 6, z / 6); }
    for (let k = 0; k < SEG; k++) { const a = edge0 + k, b = edge0 + (k + 1) % SEG, c = sk0 + k, d = sk0 + (k + 1) % SEG; idx.push(a, c, b, b, c, d); }
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); pg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); pg.setIndex(idx); pg.computeVertexNormals();
    const pad = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ map: texClone(tex.gravel, 1, 1), color: 0x8a8070, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 })); pad.receiveShadow = true; g.add(pad); }
  const wt = MAPD ? MAPD.json.water_tank : polar(200, 13); const tank = new THREE.Group(); const tgh = Math.min(...[[0, 0], [1.5, 1.5], [-1.5, 1.5], [1.5, -1.5], [-1.5, -1.5]].map(([a, b]) => height(wt.x + a, wt.z + b))); tank.position.set(wt.x, tgh + 0.1, wt.z); g.add(tank); T.tankPos = tank.position.clone();
  const tankM = new THREE.MeshStandardMaterial({ map: texClone(tex.planks, 3, 1), normalMap: texClone(tex.planksN, 3, 1), color: 0x7a6a58, roughness: 0.95 });
  const tc = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 2.6, 28), tankM); tc.position.y = 3.9; tc.castShadow = true; tank.add(tc);
  for (const y of [2.9, 3.9, 4.9]) { const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.03, 6, 40), rust); hoop.rotation.x = Math.PI / 2; hoop.position.y = y; tank.add(hoop); }
  const tl = new THREE.Mesh(new THREE.ConeGeometry(1.75, 0.5, 28), new THREE.MeshStandardMaterial({ color: 0x3a3631, roughness: 0.8, metalness: 0.3 })); tl.position.y = 5.45; tank.add(tl);
  for (const [sx, sz] of corners) { tank.add(beam(new THREE.Vector3(sx * 1.2, -4.5, sz * 1.2), new THREE.Vector3(sx * 1.0, 2.7, sz * 1.0), 0.18, 0.18, wood)); // legs run 4+ m into the slope
    const lgh = Math.max(...[[-.3, -.3], [.3, .3], [-.3, .3], [.3, -.3]].map(([a, b]) => height(wt.x + sx * 1.2 + a, wt.z + sz * 1.2 + b))) - tank.position.y; box(0.55, 5 + Math.max(0, lgh), 0.55, new THREE.MeshStandardMaterial({ color: 0x7a7670, roughness: 1 }), sx * 1.2, -2.5 + Math.max(0, lgh) / 2 + 0.25, sz * 1.2, tank); }
  T.bulletMeshes.push(tc);
  // ---- practice target: lit bullseye on a mast just east of the tower, clearly visible from the east windows and the balcony ----
  const tp = { x: 18, z: 0.5 }; const tgh2 = Math.min(height(tp.x - 0.8, tp.z), height(tp.x + 0.8, tp.z), height(tp.x, tp.z - 1), height(tp.x, tp.z + 1));
  const pole = new THREE.Group(); pole.position.set(tp.x, tgh2, tp.z); g.add(pole);
  const MH = 19; // mast height above the ground: the plate sits ~6 m below the cab eye line so you look slightly down at it
  for (const sz of [-1, 1]) box(0.22, MH + 4.5, 0.22, wood, 0, (MH - 4.5) / 2 + 0.0, sz * 1.45, pole); // posts buried 4.5 m
  box(0.18, 0.18, 3.0, wood, -0.05, MH - 0.2, 0, pole); box(0.14, 0.14, 3.0, wood, -0.05, MH - 3.0, 0, pole);
  const tgT = canvasTex(512, 512, (c, w, h) => { c.fillStyle = '#f4efe0'; c.fillRect(0, 0, w, h); for (const [r, col] of [[250, '#c01010'], [205, '#f4efe0'], [160, '#c01010'], [115, '#f4efe0'], [70, '#c01010'], [28, '#f8f8f0']]) { c.fillStyle = col; c.beginPath(); c.arc(w / 2, h / 2, r, 0, 7); c.fill(); } c.strokeStyle = '#111'; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8); });
  const tgMat = new THREE.MeshStandardMaterial({ map: tgT, roughness: 0.8, emissive: 0xffffff, emissiveMap: tgT, emissiveIntensity: 0.1 });
  const target = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.4, 0.06), [wood, wood, wood, wood, tgMat, wood]);
  target.position.set(-0.12, MH - 1.6, 0); target.rotation.y = -Math.PI / 2; target.castShadow = true; pole.add(target); T.target = target; T.bulletMeshes.push(target); target.userData.isTarget = true;
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(3.6, 3.6, 0.3), new THREE.MeshBasicMaterial({ visible: false })); proxy.position.copy(target.position); proxy.rotation.y = -Math.PI / 2; pole.add(proxy); T.hitProxy = proxy; // generous hit area
  // warm work-light on an arm in front of the plate (towards the tower), shining straight onto the bullseye
  const wl = new THREE.Group(); wl.position.set(-2.6, MH + 0.4, 0); pole.add(wl); box(2.6, 0.06, 0.06, metal, 1.3, 0, 0, wl); box(0.3, 0.2, 0.3, new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.6, roughness: 0.4 }), 0, -0.1, 0, wl);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2a8 })); bulb.position.set(0, -0.25, 0); wl.add(bulb);
  const tspot = new THREE.SpotLight(0xffd9a0, 450, 30, 0.34, 0.7, 1.6); tspot.position.set(-2.6, MH + 0.15, 0); tspot.target.position.copy(target.position); pole.add(tspot); pole.add(tspot.target); T.targetLight = tspot;
  const tfill = new THREE.PointLight(0xffd9a0, 60, 6, 2); tfill.position.set(-1.2, MH - 1.2, 0); pole.add(tfill);
  // hit feedback: white flash + expanding ring at the impact
  const flash = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.3, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); flash.position.set(-0.2, 0, 0); flash.rotation.y = Math.PI / 2; target.parent.add(flash); T.hitFlash = flash; T.hitT = 9;
  T.onTargetHit = (pt) => { pole.worldToLocal(flash.position.copy(pt)); flash.position.x = target.position.x - 0.08; flash.rotation.set(0, Math.PI / 2, 0); T.hitT = 0; tgMat.emissiveIntensity = 1.4; };
  T.tgMat = tgMat;
  T.targetPos = new THREE.Vector3(tp.x, tgh2 + MH - 1.6, tp.z);
  const gp = polar(150, 11); const gen = new THREE.Group(); const ggh = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => height(gp.x + a, gp.z + b))); gen.position.set(gp.x, ggh + 0.05, gp.z); gen.rotation.y = 0.6; g.add(gen); T.gen = gen;
  box(1.7, 4, 1.1, new THREE.MeshStandardMaterial({ color: 0x5a564f, roughness: 1 }), 0, -1.95, 0, gen); // buried concrete plinth
  box(1.3, 0.75, 0.7, new THREE.MeshStandardMaterial({ color: 0x8a6a1a, roughness: 0.6, metalness: 0.5 }), 0, 0.5, 0, gen);
  box(1.4, 0.06, 0.8, metal, 0, 0.1, 0, gen); for (const [x, z] of [[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]]) box(0.04, 1.0, 0.04, metal, x, 0.55, z, gen);
  const exh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 10), rust); exh.position.set(0.45, 1.0, 0.2); gen.add(exh);
  T.genPos = gen.position.clone().add(new THREE.Vector3(0, 0.6, 0));
  // power cable up a leg
  g.add(beam(new THREE.Vector3(gp.x, 0.6, gp.z), new THREE.Vector3(legBot * 0.97, 0.5, legBot * 0.97), 0.03, 0.03, new THREE.MeshStandardMaterial({ color: 0x111111 })));
  g.add(beam(new THREE.Vector3(legBot * 0.97, 0.5, legBot * 0.97), new THREE.Vector3(legTop + 0.1, F, legTop + 0.1), 0.03, 0.03, new THREE.MeshStandardMaterial({ color: 0x111111 })));
  const oh = polar(250, 15); const out = new THREE.Group(); out.position.set(oh.x, height(oh.x, oh.z), oh.z); T.outPos = out.position.clone(); out.rotation.y = 1.2; g.add(out);
  box(1.2, 2.2, 1.2, wallMat, 0, 1.1, 0, out); box(1.4, 0.08, 1.4, trim, 0, 2.25, 0, out);
  // ---------- found notes ----------
  const noteSpots = [[-1.0, 0.79, -H + 0.5, -Math.PI / 2, 0, 'flat'], [H - 0.06, 1.45, -0.6, 0, -Math.PI / 2, 'wall'], [-1.3, 0.62, -H + 0.36, Math.PI / 2, 0, 'under'], [H - 0.45, 0.56, 0.2, -Math.PI / 2, 0.3, 'flat'], [0.15, 0.93, 0.2, -Math.PI / 2, 0.8, 'flat'], [0.7, 1.45, H - 0.06, 0, Math.PI, 'wall']];
  const paper = canvasTex(128, 160, (c, w, h) => { c.fillStyle = '#e6dfc8'; c.fillRect(0, 0, w, h); c.strokeStyle = 'rgba(40,40,80,0.55)'; c.lineWidth = 1.4; for (let y = 22; y < h - 10; y += 11) { c.beginPath(); c.moveTo(10, y); for (let x = 10; x < w - 10; x += 6) c.lineTo(x, y + Math.sin(x * 0.7 + y) * 1.2); c.stroke(); } });
  noteSpots.forEach((s, i) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.19), new THREE.MeshStandardMaterial({ map: paper, roughness: 0.9, side: THREE.DoubleSide }));
    m.position.set(s[0], s[1], s[2]); m.rotation.set(s[3], s[4], 0, 'YXZ'); if (s[5] === 'wall') m.rotation.set(0, s[4], 0.05);
    cab.add(m); T.notes.push(m);
    T.interact.push({ id: 'note' + (i + 1), note: i, pos: new THREE.Vector3(s[0], F + s[1], s[2]), r: 1.4, label: () => 'Read note', press: () => { T.onNote && T.onNote(i); T.onSound && T.onSound('paper'); } });
  });
  // ---------- key board by the door: brass Stairs Key on a red tag ----------
  { const kb = new THREE.Group(); kb.position.set(-0.95, 0.84, H - 0.075); kb.rotation.y = Math.PI; cab.add(kb);
    box(0.34, 0.14, 0.022, trimGreen, 0, 0, 0, kb); const kt = canvasTex(128, 32, (c, w, h) => { c.fillStyle = '#ddd5c0'; c.fillRect(0, 0, w, h); c.fillStyle = '#222'; c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.fillText('KEYS', w / 2, 21); });
    const kl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshStandardMaterial({ map: kt, roughness: 0.8 })); kl.position.set(0, 0.045, 0.012); kl.rotation.y = 0; kb.add(kl);
    const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
    for (const x of [-0.11, 0, 0.11]) { const hk = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 6, 12, Math.PI), metal); hk.position.set(x, -0.02, 0.022); hk.rotation.set(0, 0, Math.PI); kb.add(hk); }
    const key = new THREE.Group(); key.position.set(-0.11, -0.03, 0.026); kb.add(key);
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 8, 16), brass); key.add(bow);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.05, 8), brass); sh.position.y = -0.035; key.add(sh);
    for (const [y, w] of [[-0.05, 0.009], [-0.056, 0.006], [-0.042, 0.007]]) { const tb = new THREE.Mesh(new THREE.BoxGeometry(w, 0.004, 0.002), brass); tb.position.set(w / 2, y, 0); key.add(tb); }
    const tagT = canvasTex(64, 128, (c, w, h) => { c.fillStyle = '#b01c14'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 16px sans-serif'; c.textAlign = 'center'; c.save(); c.translate(w / 2, h / 2); c.rotate(-Math.PI / 2); c.fillText('STAIRS', 0, 6); c.restore(); c.beginPath(); c.arc(w / 2, 12, 5, 0, 7); c.fillStyle = '#300'; c.fill(); });
    const tag = new THREE.Mesh(rbox(0.026, 0.06, 0.003, 0.001, 1), new THREE.MeshStandardMaterial({ map: tagT, roughness: 0.55, emissive: 0x400806, emissiveIntensity: 0.6 })); tag.position.set(0.018, -0.04, 0.004); tag.rotation.z = 0.12; key.add(tag);
    T.keyProp = key;
    T.interact.push({ id: 'key', pos: new THREE.Vector3(-0.95, F + 0.8, H - 0.08), r: 1.6, label: () => 'Take the Stairs Key', press: () => { if (!key.visible) return; key.visible = false; T.onTakeKey && T.onTakeKey(); T.onSound && T.onSound('keys'); }, avail: () => key.visible });
  }
  // ---------- emergency light over the door: dim red beacon on the battery when the tower loses power ----------
  { const em = new THREE.Group(); em.position.set(0, 2.32, H - 0.08); cab.add(em); box(0.14, 0.07, 0.05, metal, 0, 0, 0, em);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x701010, emissive: 0xff1a0a, emissiveIntensity: 0.2, roughness: 0.3, transparent: true, opacity: 0.9 })); bulb.rotation.x = Math.PI; bulb.position.set(0, -0.035, -0.01); em.add(bulb);
    const light = new THREE.PointLight(0xff2010, 0, 7, 1.6); light.position.set(0, F + 2.2, H - 0.3); g.add(light); T.emerg = { bulb, light }; }
  // collision footprint helpers (cab-local XZ)
  T.obstacles = [ { type: 'circle', x: 0, z: 0, r: 0.5 }, { type: 'rect', x0: -2.05, x1: -0.45, z0: -H, z1: -H + 0.7 }, { type: 'rect', x0: H - 0.85, x1: H, z0: -0.4, z1: 1.6 }, { type: 'rect', x0: 0.75, x1: 1.25, z0: -1.65, z1: -1.15 }, { type: 'rect', x0: H - 0.85, x1: H, z0: 1.7, z1: H } ];
  T.update = (dt, t) => {
    const d = T.door; d.a += ((d.open ? -1.75 : 0) - d.a) * Math.min(1, dt * 6); d.pivot.rotation.y = -d.a;
    const gt = T.gate; gt.a += ((gt.open ? 1.55 : 0) - gt.a) * Math.min(1, dt * 5); gt.pivot.rotation.y = -gt.a;
    const pk = T.powerK = (T.powerK ?? 1) + (((T.power ?? true) ? 1 : 0) - (T.powerK ?? 1)) * Math.min(1, dt * ((T.power ?? true) ? 3 : 12));
    if (T.deskLamp) { T.deskLamp.intensity = 9 * pk; T.deskBulb.material.emissiveIntensity = 4 * pk; } if (T.radioDial) T.radioDial.material.emissiveIntensity = 0.85 * pk * (T.radioDead ? 0.15 : 1);
    if (T.emerg) { const on = pk < 0.5; const bl = on ? (0.55 + 0.45 * Math.sin(t * 3.2)) : 0; T.emerg.light.intensity = 1.6 * bl; T.emerg.bulb.material.emissiveIntensity = 0.2 + 3 * bl; }
    if (T.hitT < 1) { T.hitT += dt * 3; T.hitFlash.material.opacity = Math.max(0, 1 - T.hitT); T.hitFlash.scale.setScalar(1 + T.hitT * 5); T.tgMat.emissiveIntensity = 0.1 + Math.max(0, 1.2 * (1 - T.hitT * 2)); } else T.hitFlash.material.opacity = 0;
    const dr = T.drawer; const tz = dr.open ? 0.4 : 0.02; dr.g.position.z += (tz - dr.g.position.z) * Math.min(1, dt * 8);
    const fl = T.flood; fl.k += ((fl.on ? 1 : 0) - fl.k) * Math.min(1, dt * (fl.on ? 14 : 9));
    fl.spot.intensity = fl.k * 1800; fl.lens.material.emissiveIntensity = fl.k * 6; fl.beam.visible = fl.k > 0.02; fl.beam.material.uniforms.uI.value = fl.k * (0.92 + 0.08 * Math.sin(t * 50));
    T.floodLever.rotation.x += ((fl.on ? -0.6 : 0.6) - T.floodLever.rotation.x) * Math.min(1, dt * 18);
    const fk = 0.92 + 0.05 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 17.1); T.lantern.intensity = 6 * fk * (0.04 + 0.96 * pk); T.lanternGlobe.material.emissiveIntensity = 2.0 * fk * (0.05 + 0.95 * pk);
  };
  return T;
}
