// Code-built micro-compact 9mm (OSP style), generic, no markings. Units: meters.
// Gun frame: bore axis on y=0, slide rear face at z=0, muzzle toward -Z, +X = right side.
import * as THREE from 'three';
// procedural roughness variation + edge-wear speckle (canvas, cached)
let _wear = null;
function wearTex() {
  if (_wear || typeof document === 'undefined') return _wear;
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); const im = x.createImageData(256, 256);
  let sd = 12345; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 256 * 256; i++) { const v = 212 + rnd() * 26 - (rnd() < 0.008 ? 55 : 0); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255; }
  x.putImageData(im, 0, 0); x.globalAlpha = 0.25; for (let k = 0; k < 40; k++) { x.fillStyle = rnd() < 0.5 ? '#fff' : '#888'; x.beginPath(); x.arc(rnd() * 256, rnd() * 256, 6 + rnd() * 30, 0, 7); x.fill(); }
  _wear = new THREE.CanvasTexture(c); _wear.wrapS = _wear.wrapT = THREE.RepeatWrapping; _wear.repeat.set(3, 3); return _wear;
}
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { stippleMaps, diamondKnurl, peelNormal } from './textures.js';

const SLIDE_L = 0.150, SLIDE_W = 0.0232, SLIDE_TOP = 0.0120, SLIDE_BOT = -0.0115, SLIDE_Z0 = 0.020; // slide sits 20 mm further back over the frame (matches the photo)
export const GUN_DIM = { SLIDE_L, SLIDE_W, SLIDE_TOP, SLIDE_BOT, GRIP_ANGLE: 18 * Math.PI / 180, SLIDE_Z0, MAG_L: 0.0765 };

function sideExtrude(pts, holes, width, bevel = 0.002, curveSeg = 3) {
  const sh = new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])));
  for (const h of holes || []) sh.holes.push(new THREE.Path(h.map(p => new THREE.Vector2(p[0], p[1]))));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel * 0.9, bevelThickness: bevel, bevelSegments: curveSeg, curveSegments: 4 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(Math.PI / 2); g.computeVertexNormals();
  return g;
}

const _gl = new THREE.TextureLoader();
function mtex(f, rep, srgb) { const t = _gl.load('assets/tex/mychief/' + f); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
export function buildGunMaterials() {
  // MyChief PBR: polymer stipple (frame) + bead-blasted / worn nitride steel (slide, barrel, small parts)
  const stip = { normal: mtex('mychief-gun-stipple-normal.jpg', 34), rough: mtex('mychief-gun-stipple-rough.jpg', 34) };
  const steelA = mtex('mychief-gun-steel-albedo.jpg', 22, true), steelN = mtex('mychief-gun-steel-normal.jpg', 22), steelR = mtex('mychief-gun-steel-rough.jpg', 22);
  return {
    frame: new THREE.MeshPhysicalMaterial({ color: 0x1b1c1e, roughness: 1.0, roughnessMap: stip.rough, metalness: 0.0, normalMap: stip.normal, normalScale: new THREE.Vector2(1.25, 1.25), sheen: 0.05, sheenColor: new THREE.Color(0x202326), sheenRoughness: 0.9, envMapIntensity: 0.6 }),
    frameSmooth: new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.7, roughnessMap: stip.rough, normalMap: stip.normal, normalScale: new THREE.Vector2(0.08, 0.08), metalness: 0.0, sheen: 0.03, sheenColor: new THREE.Color(0x1a1c1e), envMapIntensity: 0.45 }),
    slide: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: steelA, roughness: 1, roughnessMap: steelR, normalMap: steelN, normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0.88, clearcoat: 0.08, clearcoatRoughness: 0.6, envMapIntensity: 0.9 }),
    edge: new THREE.MeshStandardMaterial({ color: 0x5a5c60, roughness: 0.35, metalness: 0.9 }),
    slideDark: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.55, metalness: 0.4 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xffffff, map: steelA, roughness: 1, roughnessMap: steelR, normalMap: steelN, normalScale: new THREE.Vector2(0.5, 0.5), metalness: 0.92 }),
    hole: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    stainless: new THREE.MeshPhysicalMaterial({ color: 0xd4d7da, roughness: 0.2, metalness: 1.0, clearcoat: 0.1, envMapIntensity: 1.6 }),
    optic: new THREE.MeshPhysicalMaterial({ color: 0x232427, roughness: 0.42, metalness: 0.65 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x6fb4c4, roughness: 0.03, metalness: 0.0, transparent: true, opacity: 0.30, iridescence: 0.6, iridescenceIOR: 1.6, depthWrite: false, clearcoat: 1, envMapIntensity: 1.8, side: THREE.DoubleSide }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }),
    tritium: new THREE.MeshStandardMaterial({ color: 0xd9ff3a, emissive: 0x9fdc1a, emissiveIntensity: 0.55, roughness: 0.4 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc89a46, roughness: 0.28, metalness: 1.0 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xb06a3a, roughness: 0.32, metalness: 1.0 }),
  };
}

function box(w, h, d, mat, x, y, z, r = Math.min(w, h, d) * 0.22) { // every small part gets a micro-bevel so edges catch a highlight
  const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); return m;
}

export function buildCartridge(M) {
  const g = new THREE.Group();
  const caseG = new THREE.CylinderGeometry(0.00495, 0.00495, 0.0192, 14); caseG.rotateX(Math.PI / 2);
  const c = new THREE.Mesh(caseG, M.brass); g.add(c);
  const bG = new THREE.SphereGeometry(0.0045, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); bG.scale(1, 1.6, 1); bG.rotateX(-Math.PI / 2);
  const b = new THREE.Mesh(bG, M.copper); b.position.z = -0.0096; g.add(b);
  return g;
}
export function buildCasing(M) {
  const caseG = new THREE.CylinderGeometry(0.00495, 0.00495, 0.0192, 12, 1, true); caseG.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(caseG, new THREE.MeshStandardMaterial({ color: 0xc8a050, roughness: 0.3, metalness: 1, side: THREE.DoubleSide }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.0050, 0.0050, 0.0012, 12).rotateX(Math.PI / 2), M.brass); rim.position.z = 0.0096; m.add(rim);
  return m;
}

export function buildMagazine(M) {
  // Local frame: origin at top center of mag body (feed lips); body extends down -Y. Front = -Z.
  const mag = new THREE.Group(); mag.name = 'magazine';
  const L = GUN_DIM.MAG_L, D = 0.0285, W = 0.0172;
  const body = box(W, L, D, M.stainless, 0, -L / 2, 0, 0.0016); mag.add(body);
  // front spine curve hint
  const spine = box(W * 0.9, L * 0.96, 0.004, M.stainless, 0, -L / 2, -D / 2 - 0.0008, 0.0015); mag.add(spine);
  // witness holes (both sides, rear)
  const holeG = new THREE.CircleGeometry(0.00125, 10);
  for (let i = 0; i < 8; i++) for (const s of [-1, 1]) {
    const h = new THREE.Mesh(holeG, M.hole); h.position.set(s * (W / 2 + 0.00012), -0.014 - i * 0.0072, D / 2 - 0.0042);
    h.rotation.y = s * Math.PI / 2; mag.add(h);
  }
  // feed lips & top cartridge
  const lips = box(W * 0.98, 0.003, D * 0.78, M.stainless, 0, 0.0006, 0.001, 0.0008); mag.add(lips);
  const rnd = buildCartridge(M); rnd.position.set(0, 0.0035, -0.0015); rnd.rotation.x = 0.03; mag.add(rnd); mag.userData.topRound = rnd;
  // extended textured baseplate (finger shelf)
  // extended-mag sleeve: flush with the grip (same stipple), small step, then the textured baseplate
  const slG = sideExtrude([[0.0172, 0.004], [0.0172, -0.019], [0.0186, -0.0205], [0.0186, -0.0262], [0.0165, -0.0285], [-0.0222, -0.0285], [-0.0242, -0.0262], [-0.0242, -0.0205], [-0.0228, -0.019], [-0.0228, 0.004]], null, 0.0252, 0.0022);
  const bp = new THREE.Mesh(slG, M.frame); bp.position.y = -L + 0.002; mag.add(bp);
  mag.add(box(0.0262, 0.0010, 0.044, M.slideDark, 0, -L + 0.002 - 0.0195, -0.0028, 0.0004)); // step line
  mag.userData.length = L;
  mag.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return mag;
}

export const FRAME_OUTER = [
    // top edge (under the slide), dust cover, rounded front
    [-0.0205, -0.0112], [0.0, -0.0112], [0.113, -0.0112], [0.1185, -0.0145], [0.1185, -0.0262], [0.1155, -0.0295],
    // trigger guard: slightly raked front, big rounded lower corner, flat bottom, undercut sweeping up into the front strap
    [0.0920, -0.0298], [0.0886, -0.0318], [0.0873, -0.0360], [0.0868, -0.0430], [0.0859, -0.0490], [0.0838, -0.0537], [0.0802, -0.0574], [0.0752, -0.0597], [0.0692, -0.0607],
    [0.0560, -0.0607], [0.0505, -0.0601], [0.0462, -0.0583], [0.0428, -0.0553], [0.0398, -0.0524], [0.0384, -0.0526],
    // front strap (no finger grooves), shorter grip
    [0.0372, -0.0560], [0.0350, -0.0620], [0.0322, -0.0700], [0.0290, -0.0800], [0.0262, -0.0880], [0.0248, -0.0920], [0.0228, -0.0935],
    // backstrap: straight at the 18 deg grip angle
    [-0.0230, -0.0935], [-0.0258, -0.0914], [-0.0215, -0.0790], [-0.0150, -0.0590], [-0.0118, -0.0492], [-0.0090, -0.0405],
    // web notch + short, low, rounded beavertail tang just behind the slide
    [-0.0072, -0.0352], [-0.0068, -0.0318], [-0.0082, -0.0285], [-0.0118, -0.0248], [-0.0165, -0.0215], [-0.0205, -0.0192],
    [-0.0232, -0.0176], [-0.0246, -0.0158], [-0.0246, -0.0138], [-0.0232, -0.0121],
  ];
export const FRAME_HOLE = [[0.0828, -0.0335], [0.0826, -0.0430], [0.0815, -0.0490], [0.0790, -0.0530], [0.0745, -0.0556], [0.0690, -0.0564], [0.0520, -0.0564], [0.0470, -0.0548], [0.0435, -0.0515], [0.0412, -0.0470], [0.0405, -0.0335]];

export function buildGun(M = buildGunMaterials()) {
  const gun = new THREE.Group(); gun.name = 'pistol';
  // ---------- FRAME (side profile, s = forward) ----------
  const frameOuter = FRAME_OUTER, guardHole = FRAME_HOLE;
  const frame = new THREE.Mesh(sideExtrude(frameOuter, [guardHole], 0.0248, 0.0024), M.frameSmooth);
  // stippled grip sleeve below the smooth band (wraps both panels, front strap and backstrap)
  const GP = [[0.0378, -0.0560], [0.0356, -0.0620], [0.0328, -0.0700], [0.0296, -0.0800], [0.0268, -0.0880], [0.0253, -0.0915], [-0.0252, -0.0915], [-0.0219, -0.0790], [-0.0154, -0.0590], [-0.0142, -0.0548], [0.0386, -0.0548]];
  const sleeve = new THREE.Mesh(sideExtrude(GP, null, 0.0272, 0.0030), M.frame); sleeve.castShadow = true; gun.add(sleeve); gun.userData.gripSleeve = sleeve;
  // large stippled pad on each side of the frame above the trigger guard (index / thumb rest)
  for (const sx of [-1, 1]) { const pad = new THREE.Mesh(sideExtrude([[0.054, -0.0205], [0.009, -0.0205], [0.006, -0.0235], [0.006, -0.0385], [0.040, -0.0385], [0.054, -0.0330]], null, 0.0006, 0.0002), M.frame);
    pad.position.x = sx * 0.01255; gun.add(pad); }
  frame.castShadow = true; gun.add(frame);
  // smooth (non stippled) dust cover overlay + index pad
  const dust = new THREE.Mesh(sideExtrude([[0.086, -0.0118], [0.113, -0.0118], [0.1178, -0.0148], [0.1178, -0.0258], [0.115, -0.0288], [0.086, -0.0291]], null, 0.0256, 0.0018), M.frameSmooth);
  gun.add(dust);
  // accessory rail: two ledges + one cross slot
  for (const s of [-1, 1]) gun.add(box(0.0035, 0.0022, 0.026, M.frameSmooth, s * 0.0085, -0.0300, -0.1035));
  gun.add(box(0.0262, 0.0026, 0.0035, M.hole, 0, -0.0293, -0.0985));
  // mag well opening (dark) seen when mag out
  const well = new THREE.Mesh(new THREE.PlaneGeometry(0.0185, 0.031), M.hole); well.rotation.x = -Math.PI / 2 - 0.0; well.position.set(0, -0.0934, 0.0);
  well.rotation.z = 0; well.rotateX(0); gun.add(well); gun.userData.well = well;
  // ---------- TRIGGER ----------
  const trig = new THREE.Group(); trig.position.set(0, -0.0335, -0.0575); gun.add(trig); gun.userData.trigger = trig;
  const blade = new THREE.Mesh(sideExtrude([[0.0030, 0], [0.0042, -0.0060], [0.0046, -0.0110], [0.0052, -0.0160], [0.0070, -0.0190], [0.0045, -0.0196], [0.0015, -0.0165], [0.0006, -0.0110], [0.0000, -0.0055], [-0.0008, 0]], null, 0.0060, 0.0007), M.frameSmooth);
  trig.add(blade);
  const safety = box(0.0022, 0.009, 0.0016, M.slideDark, 0, -0.011, -0.0024, 0.0004); trig.add(safety);
  // ---------- small controls (left side) ----------
  const L = -1; // left side x sign
  const ribbedTab = (sCtr, y, len, h, nRib, mat) => { const g = new THREE.Group(); g.position.set(L * 0.0131, y, -sCtr);
    g.add(box(0.0020, h, len, mat, -0.0004, 0, 0, Math.min(h, len) * 0.35));
    for (let i = 0; i < nRib; i++) g.add(box(0.0006, h * 0.18, len * 0.82, M.hole, -0.0015, -h * 0.32 + i * (h * 0.64 / Math.max(1, nRib - 1)), 0)); gun.add(g); return g; };
  ribbedTab(0.024, -0.0165, 0.0115, 0.0042, 3, M.slideDark);          // slide stop lever (ribbed tab)
  ribbedTab(0.073, -0.0142, 0.0105, 0.0040, 3, M.slideDark);          // takedown lever (ribbed)
  gun.add(box(0.0016, 0.0042, 0.016, M.slideDark, L * 0.0128, -0.0160, -0.034, 0.0006)); // slide stop arm
  const magRel = ribbedTab(0.041, -0.0455, 0.0125, 0.0068, 4, M.frameSmooth); gun.userData.magRelease = magRel; // textured mag release
  for (const [ss, y] of [[0.0565, -0.0152], [0.067, -0.0182], [0.0075, -0.0365]]) for (const sx of [-1, 1]) { // pin holes
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.00085, 10), M.hole); p.position.set(sx * 0.01262, y, -ss); p.rotation.y = sx * Math.PI / 2; gun.add(p); }
  // slide stop pin head (right side) + extra rail slot
  { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.0008, 12).rotateZ(Math.PI / 2), M.steel); p.position.set(0.0128, -0.0145, -0.047); gun.add(p); }
  gun.add(box(0.0262, 0.0026, 0.0035, M.hole, 0, -0.0293, -0.1085));
  // pins
  for (const [z, y] of [[-0.0275, -0.019], [-0.088, -0.020]]) for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(0.0013, 10), M.steel); p.position.set(s * 0.01255, y, z); p.rotation.y = s * Math.PI / 2; gun.add(p); }
  // ---------- SLIDE (moves) ----------
  const slide = new THREE.Group(); slide.name = 'slide'; slide.position.z = SLIDE_Z0; gun.add(slide); gun.userData.slide = slide; gun.userData.slideZ0 = SLIDE_Z0;
  const W2 = SLIDE_W / 2, ch = 0.0042;
  const xs = new THREE.Shape([new THREE.Vector2(-W2, SLIDE_BOT), new THREE.Vector2(W2, SLIDE_BOT), new THREE.Vector2(W2, SLIDE_TOP - ch),
    new THREE.Vector2(W2 - ch * 0.75, SLIDE_TOP), new THREE.Vector2(-W2 + ch * 0.75, SLIDE_TOP), new THREE.Vector2(-W2, SLIDE_TOP - ch)]);
  const NOSE = 0.011;
  const sg = new THREE.ExtrudeGeometry(xs, { depth: SLIDE_L - NOSE - 0.001, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.001, bevelSegments: 2 });
  sg.translate(0, 0, -(SLIDE_L - NOSE) + 0.0005); sg.computeVertexNormals();
  const slideMesh = new THREE.Mesh(sg, M.slide); slideMesh.castShadow = true; slide.add(slideMesh);
  // beveled nose: same section inset by the bevel and extruded with a deep chamfer, so the muzzle end tapers on all edges
  { const b = 0.0024, bt = 0.0042; const xi = new THREE.Shape([new THREE.Vector2(-W2 + b, SLIDE_BOT + b), new THREE.Vector2(W2 - b, SLIDE_BOT + b), new THREE.Vector2(W2 - b, SLIDE_TOP - ch),
      new THREE.Vector2(W2 - ch * 0.75, SLIDE_TOP - b), new THREE.Vector2(-W2 + ch * 0.75, SLIDE_TOP - b), new THREE.Vector2(-W2 + b, SLIDE_TOP - ch)]);
    const ng = new THREE.ExtrudeGeometry(xi, { depth: NOSE + 0.002 - bt * 2, bevelEnabled: true, bevelSize: b, bevelThickness: bt, bevelSegments: 3, curveSegments: 2 });
    ng.translate(0, 0, -SLIDE_L + bt); ng.computeVertexNormals(); const nose = new THREE.Mesh(ng, M.slide); nose.castShadow = true; slide.add(nose); }
  // muzzle-end lower bevel (dark wedge illusion)
  // serrations: rear and front, angled, both sides + front top
  // slanted serrations (deep dark grooves with a light lower lip), rear and front
  const serr = (z0, n, step, len, ang) => {
    for (let i = 0; i < n; i++) for (const sx of [-1, 1]) {
      const r = box(0.0009, len, 0.0016, M.hole, sx * (W2 + 0.0004), SLIDE_BOT + 0.0035 + len / 2, z0 - i * step); r.rotation.x = ang; slide.add(r);
      const lip = box(0.0004, len, 0.0005, M.steel, sx * (W2 + 0.0007), SLIDE_BOT + 0.0035 + len / 2, z0 - i * step + 0.0011); lip.rotation.x = ang; lip.material = M.edge; slide.add(lip);
    }
  };
  serr(-0.0080, 7, 0.0052, 0.0150, 0.22);    // rear: 7 long slanted cuts
  serr(-0.1150, 4, 0.0052, 0.0135, -0.22);   // front: 4 slanted cuts
  for (let i = 0; i < 4; i++) { const r = box(SLIDE_W - 0.008, 0.0008, 0.0014, M.hole, 0, SLIDE_TOP + 0.0001, -0.117 - i * 0.0052); slide.add(r); } // top front cuts
  // beveled nose: dark chamfer strips on the lower front corners and the muzzle face
  // ejection port (right side + top)
  slide.add(box(0.0012, 0.0080, 0.031, M.hole, W2 + 0.0002, 0.0036, -0.050));
  const hood = box(0.0124, 0.0012, 0.030, M.steel, 0.0032, SLIDE_TOP + 0.00015, -0.0505); slide.add(hood);
  slide.add(box(0.0016, 0.0042, 0.006, M.slideDark, W2 + 0.0003, 0.0046, -0.0332, 0.0006)); // extractor
  // muzzle: barrel crown + bore + recoil guide rod
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0062, 0.0035, 24).rotateX(Math.PI / 2), M.steel); crown.position.set(0, 0, -SLIDE_L - 0.0005); slide.add(crown);
  const bore = new THREE.Mesh(new THREE.CircleGeometry(0.0046, 20), M.hole); bore.position.set(0, 0, -SLIDE_L - 0.0024); bore.rotation.y = Math.PI; slide.add(bore);
  const rod = new THREE.Mesh(new THREE.CircleGeometry(0.0034, 16), M.hole); rod.position.set(0, -0.0205, -0.1188); rod.rotation.y = Math.PI; gun.add(rod);
  // rear face plate (striker channel cover)
  slide.add(box(0.0168, 0.0160, 0.0008, M.slideDark, 0, 0.0000, 0.0004, 0.0006));
  for (let i = 0; i < 5; i++) slide.add(box(0.0098, 0.0005, 0.0005, M.edge, -0.0012, -0.0015 + i * 0.0013, 0.0011)); // horizontal ribs on the backplate
  { const ind = new THREE.Mesh(new THREE.TorusGeometry(0.0021, 0.0004, 6, 18), M.edge); ind.position.set(0.0062, 0.0005, 0.0011); slide.add(ind); }   // round indicator / pin
  slide.add(box(0.0042, 0.0026, 0.0006, M.hole, -0.0012, 0.0060, 0.0010)); // striker channel cutout (top)
  for (const [x, y, w, h] of [[-0.0055, -0.0086, 0.0045, 0.0035], [0.0030, -0.0094, 0.0085, 0.0022], [0.0062, -0.0078, 0.0028, 0.0030]]) slide.add(box(w, h, 0.0006, M.hole, x, y, 0.0010)); // lower stepped cutouts
  // ---------- SIGHTS ----------
  // rear U-dot: two ears + base, white U outline and dot
  const rs = new THREE.Group(); rs.position.set(0, SLIDE_TOP, -0.0065); slide.add(rs);
  rs.add(box(0.0185, 0.0030, 0.0075, M.optic, 0, 0.0015, 0, 0.0006));
  for (const s of [-1, 1]) rs.add(box(0.0060, 0.0050, 0.0070, M.optic, s * 0.0062, 0.0049, 0, 0.0008));
  const uG = new THREE.TorusGeometry(0.0027, 0.00042, 6, 18, Math.PI); const u = new THREE.Mesh(uG, M.white);
  u.rotation.z = Math.PI; u.position.set(0, 0.0068, 0.0036); rs.add(u);
  for (const s of [-1, 1]) { const l = box(0.0008, 0.0022, 0.0004, M.white, s * 0.0027, 0.0078, 0.0036); rs.add(l); }

  // front post with luminescent ring
  const fs = new THREE.Group(); fs.position.set(0, SLIDE_TOP, -0.1405); slide.add(fs);
  fs.add(box(0.0034, 0.0060, 0.0060, M.optic, 0, 0.0030, 0, 0.0006));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.00125, 0.00045, 8, 20), M.tritium); ring.position.set(0, 0.0040, 0.0031); fs.add(ring);
  const ringc = new THREE.Mesh(new THREE.CircleGeometry(0.0009, 12), new THREE.MeshStandardMaterial({ color: 0xc8c8a0, emissive: 0x405010, emissiveIntensity: 0.6 })); ringc.position.set(0, 0.0040, 0.00315); fs.add(ringc);
  // ---------- MICRO RED DOT (on slide) ----------
  const od = new THREE.Group(); od.position.set(0, SLIDE_TOP, -0.031); slide.add(od); gun.userData.optic = od;
  // profile in (s forward, y up), optic-local: rear wall tall, front face slopes down to the base
  const OP = [[-0.0140, 0.0], [0.0150, 0.0], [0.0150, 0.0042], [0.0010, 0.0165], [-0.0120, 0.0168], [-0.0140, 0.0150]];
  od.add(new THREE.Mesh(sideExtrude([[-0.0140, 0], [0.0150, 0], [0.0150, 0.0042], [-0.0140, 0.0042]], null, 0.0215, 0.0008), M.optic)); // base
  for (const sx of [-1, 1]) { const w = new THREE.Mesh(sideExtrude(OP, null, 0.0026, 0.0006), M.optic); w.position.x = sx * 0.00945; od.add(w); }
  od.add(box(0.0215, 0.0016, 0.0030, M.optic, 0, 0.0050, 0.0125, 0.0004)); // low rear lip (window is open from the rear)
  od.add(box(0.0215, 0.0022, 0.0030, M.optic, 0, 0.0157, 0.0125, 0.0006)); // rear top bar (window frame)
  { const top = box(0.0215, 0.0018, 0.0175, M.optic, 0, 0.0104, -0.0078, 0.0006); top.rotation.x = -Math.atan2(0.0123, 0.014); od.add(top); } // sloped front hood
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0017, 0.0017, 0.0012, 14).rotateZ(Math.PI / 2), M.steel); btn.position.set(0.0110, 0.0085, 0.0095); od.add(btn); // small round button
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.0162, 0.0105), M.glass); glass.position.set(0, 0.0098, -0.0055); glass.rotation.x = -0.30; od.add(glass);
  glass.renderOrder = 5; gun.userData.glass = glass;
  // red dot reticle projected on glass (visible from behind)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false });
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.00055, 14), dotMat); dot.position.set(0, 0.0102, -0.0050); dot.renderOrder = 6; od.add(dot); gun.userData.dot = dot;
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.0016, 16), new THREE.MeshBasicMaterial({ color: 0xff2040, transparent: true, opacity: 0.30, depthWrite: false, toneMapped: false })); halo.position.copy(dot.position); halo.position.z += 0.00005; halo.renderOrder = 6; od.add(halo);
  // ---------- MAGAZINE ----------
  const magPivot = new THREE.Group(); magPivot.name = 'magPivot';
  magPivot.position.set(0, -0.0255, -0.0195); magPivot.rotation.x = -GUN_DIM.GRIP_ANGLE; gun.add(magPivot);
  const mag = buildMagazine(M); magPivot.add(mag);
  gun.userData.magPivot = magPivot; gun.userData.mag = mag;
  // chambered round indicator (not visible) / ejection origin
  const ej = new THREE.Object3D(); ej.position.set(W2, 0.008, -0.050); slide.add(ej); gun.userData.ejectPort = ej;
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0, -SLIDE_L - 0.004); slide.add(muzzle); gun.userData.muzzle = muzzle;
  gun.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  glass.castShadow = false; dot.castShadow = false; halo.castShadow = false;
  gun.userData.materials = M;
  return gun;
}

// Tactical/duty LED flashlight, ~150 mm long, 25 mm body. Hard-anodized black aluminium with fine diamond knurling,
// slightly flared head with a crenellated bezel, orange-peel reflector + LED behind the glass, rubber tail-cap click
// button and a pocket clip. Beam along -Z; z=+0.0655 is the tail button face.
export const TORCH_DIM = { bodyR: 0.0125, bodyZ0: -0.046, bodyZ1: 0.047, headR: 0.0165, headZ0: -0.085, headZ1: -0.058, tailR: 0.0131, tailZ1: 0.062, btnZ: 0.0655 };
export function buildFlashlight() {
  const g = new THREE.Group(); g.name = 'flashlight'; const D = TORCH_DIM;
  const kn = diamondKnurl(1); kn.repeat.set(6, 7); kn.anisotropy = 8;
  const ano = new THREE.MeshPhysicalMaterial({ color: 0x141517, roughness: 0.42, metalness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5, roughnessMap: wearTex() });
  const knurl = new THREE.MeshPhysicalMaterial({ color: 0x141517, roughness: 0.5, metalness: 0.55, normalMap: kn, normalScale: new THREE.Vector2(1.3, 1.3), clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const bare = new THREE.MeshStandardMaterial({ color: 0x8c8f93, roughness: 0.3, metalness: 1.0 }); // worn bezel teeth edges
  const lathe = (prof, mat, seg = 40) => { if (prof[0][1] > prof[prof.length - 1][1]) prof = prof.slice().reverse(); const m = new THREE.Mesh(new THREE.LatheGeometry(prof.map(([r, z]) => new THREE.Vector2(r, z)), seg).rotateX(-Math.PI / 2), mat); g.add(m); return m; };
  // profile (radius, z) along the light; LatheGeometry revolves around Y, rotated so +Y -> -Z (z values negated below)
  const P = (pts) => pts.map(([r, z]) => [r, -z]);
  // head: bezel lip, head barrel with two shallow grooves, flare down to the body
  lathe(P([[0.0150, -0.0852], [0.0168, -0.0852], [0.0172, -0.0845], [0.0172, -0.0790], [0.0165, -0.0785], [0.0165, -0.0705], [0.0160, -0.0700], [0.0160, -0.0690], [0.0165, -0.0685],
    [0.0165, -0.0640], [0.0160, -0.0635], [0.0160, -0.0625], [0.0165, -0.0620], [0.0165, -0.0580], [0.0150, -0.0540], [0.0134, -0.0490], [0.0128, -0.0465], [0.0122, -0.0460]]), ano, 48);
  // crenellations: 5 notches cut into the bezel lip (dark recesses + bare-metal tooth edges)
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.3; const n = new THREE.Mesh(new THREE.BoxGeometry(0.0062, 0.0030, 0.0032), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.7 }));
    n.position.set(Math.cos(a) * 0.0163, Math.sin(a) * 0.0163, -0.0838); n.rotation.z = a + Math.PI / 2; g.add(n);
    for (const e of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.0004, 0.0028, 0.0034), bare); const aa = a + e * 0.205; t.position.set(Math.cos(aa) * 0.0168, Math.sin(aa) * 0.0168, -0.0838); t.rotation.z = aa; g.add(t); } }
  // knurled body tube + smooth rings at both ends
  const body = new THREE.Mesh(new THREE.CylinderGeometry(D.bodyR, D.bodyR, 0.074, 48, 1, true).rotateX(Math.PI / 2), knurl); body.position.z = 0.000; g.add(body);
  lathe(P([[0.0122, -0.0462], [0.0126, -0.0450], [0.0126, -0.0390], [0.0121, -0.0385], [0.0121, -0.0375], [0.0126, -0.0370], [0.0125, -0.0370]]), ano);
  lathe(P([[0.0125, 0.0370], [0.0126, 0.0370], [0.0121, 0.0378], [0.0121, 0.0388], [0.0126, 0.0393], [0.0126, 0.0470], [0.0131, 0.0476]]), ano);
  // tail cap with grip flats look (two grooves) and the rubber click button
  lathe(P([[0.0131, 0.0476], [0.0131, 0.0560], [0.0127, 0.0565], [0.0127, 0.0575], [0.0131, 0.0580], [0.0131, 0.0610], [0.0122, 0.0622], [0.0080, 0.0622]]), ano);
  const rub = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.92 });
  const btnG = new THREE.LatheGeometry([[0.0001, 0.0040], [0.0040, 0.0036], [0.0066, 0.0020], [0.0074, 0.0], [0.0074, -0.0012]].map(([r, z]) => new THREE.Vector2(r, z)), 28).rotateX(Math.PI / 2);
  const btn = new THREE.Mesh(btnG, rub); btn.position.z = D.btnZ - 0.0040; g.add(btn); g.userData.button = btn; g.userData.buttonZ = btn.position.z;
  // pocket clip on the tail cap, running forward along the body (spring steel, black)
  const clipM = new THREE.MeshPhysicalMaterial({ color: 0x0e0f10, roughness: 0.35, metalness: 0.8, clearcoat: 0.3 });
  const clip = new THREE.Group(); clip.rotation.z = -2.2; g.add(clip); g.userData.clip = clip; // angle around the body (set clear of the fingers)
  clip.add(box(0.0060, 0.0012, 0.0110, clipM, 0, 0.0138, 0.0560, 0.0004));
  { const arm = box(0.0042, 0.0010, 0.0200, clipM, 0, 0.0143, 0.0420, 0.0004); arm.rotation.x = -0.03; clip.add(arm); }
  clip.add(box(0.0046, 0.0016, 0.0030, clipM, 0, 0.0137, 0.0320, 0.0006));
  // reflector (orange-peel chrome) + LED die + lens
  const pn = peelNormal(1); pn.repeat.set(2, 2);
  const refl = new THREE.Mesh(new THREE.CylinderGeometry(0.0150, 0.0040, 0.0120, 40, 1, true).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 1, roughness: 0.12, normalMap: pn, side: THREE.BackSide }));
  refl.position.z = -0.0775; g.add(refl);
  const ledBase = new THREE.Mesh(new THREE.CylinderGeometry(0.0040, 0.0040, 0.0008, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.5 })); ledBase.position.z = -0.0713; g.add(ledBase);
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0022, 0.0008), new THREE.MeshStandardMaterial({ color: 0xe9d36a, emissive: 0xfff6e0, emissiveIntensity: 0, roughness: 0.4 })); led.position.z = -0.0719; g.add(led); g.userData.led = led;
  const lensMat = new THREE.MeshPhysicalMaterial({ color: 0xdfe6ea, emissive: 0xfff4e0, emissiveIntensity: 0, roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.18, clearcoat: 1, envMapIntensity: 1.5, depthWrite: false });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0150, 40), lensMat); lens.position.z = -0.0838; lens.rotation.y = Math.PI; lens.renderOrder = 3; g.add(lens);
  g.userData.lens = lens;
  const tip = new THREE.Object3D(); tip.position.z = -0.087; g.add(tip); g.userData.tip = tip;
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); lens.castShadow = false;
  return g;
}
