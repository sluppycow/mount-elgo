// Code-built articulated bare hands + forearms (fair skin, nails, knuckles).
// Hand local frame (neutral): origin at wrist center, fingers along -Z, back of hand +Y, palm -Y.
// Right hand thumb on -X; left hand mirrored (thumb on +X).
import * as THREE from 'three';
import { skinNormal, skinColor } from './textures.js';

let SKIN = null, NAIL = null;
const _tl = new THREE.TextureLoader();
function tex(url, srgb) { const t = _tl.load(url); t.flipY = false; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
// phones get 1K hand maps (the hands never cover more than ~1000 px of an iPhone screen) to stay well inside Safari's memory budget
const HK = (('ontouchstart' in window) || navigator.maxTouchPoints > 0) && /iPhone|iPod|iPad|Android|Mobile|Macintosh/.test(navigator.userAgent) && Math.min(screen.width, screen.height) < 900 ? '_1k' : '';
export function skinMaterials() {
  if (SKIN) return { skin: SKIN, nail: NAIL };
  // Maps baked by tools/hand_textures.py into the MakeHuman-derived hand UVs (pores, creases, veins, prints).
  SKIN = new THREE.MeshPhysicalMaterial({
    map: tex(`assets/tex/hand_albedo${HK}.jpg`, true), normalMap: tex(`assets/tex/hand_normal${HK}.jpg`), normalScale: new THREE.Vector2(1, 1),
    roughnessMap: tex(`assets/tex/hand_rough${HK}.jpg`), roughness: 1.0, metalness: 0,
    sheen: 0.22, sheenColor: new THREE.Color(0xffc4b0), sheenRoughness: 0.6, specularIntensity: 0.55,
  });
  SKIN.color.setRGB(1.0, 0.8, 0.66); SKIN.emissive = new THREE.Color(0x3a1408); SKIN.emissiveIntensity = 0.55; // warm natural skin even in dim night light (no white clay)
  // MyChief skin PBR as a tiled micro-detail layer on top of the baked hand maps (skin only: the nail material is untouched).
  // Albedo is normalised around its mean so it adds pores/blotches without changing the hand's overall tone.
  const dA = tex('assets/tex/mychief/mychief-skin-albedo.jpg', true), dN = tex('assets/tex/mychief/mychief-skin-normal.jpg'), dR = tex('assets/tex/mychief/mychief-skin-rough.jpg');
  for (const t of [dA, dN, dR]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.flipY = true; }
  // cheap subsurface: wrap lighting with a red bleed near the terminator + thin-edge translucency
  SKIN.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tSkA: { value: dA }, tSkN: { value: dN }, tSkR: { value: dR } });
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tSkA, tSkN, tSkR;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec2 skUv = vMapUv * 9.0; vec3 skA = texture2D(tSkA, skUv).rgb; diffuseColor.rgb *= mix(vec3(1.0), skA / vec3(0.56, 0.27, 0.19), 0.28);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * mix(1.0, texture2D(tSkR, skUv).g * 2.0, 0.3), 0.25, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 dn = texture2D(tSkN, skUv).xyz * 2.0 - 1.0; dn.xy *= 0.6; normal = normalize(normal + tbn * vec3(dn.xy, 0.0)); }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        float wrapAmt = 0.0;
        #if NUM_DIR_LIGHTS > 0
          for (int i = 0; i < NUM_DIR_LIGHTS; i++) { float nl = dot(normal, directionalLights[i].direction);
            wrapAmt += max(0.0, (nl + 0.5) / 1.5) * (1.0 - max(nl, 0.0)) * length(directionalLights[i].color); }
        #endif
        #if NUM_POINT_LIGHTS > 0
          for (int i = 0; i < NUM_POINT_LIGHTS; i++) { vec3 lv = pointLights[i].position - geometryPosition; float dl = length(lv);
            float nl = dot(normal, lv / dl); float att = getDistanceAttenuation(dl, pointLights[i].distance, pointLights[i].decay);
            wrapAmt += max(0.0, (nl + 0.5) / 1.5) * (1.0 - max(nl, 0.0)) * length(pointLights[i].color) * att; }
        #endif
        #if NUM_SPOT_LIGHTS > 0
          for (int i = 0; i < NUM_SPOT_LIGHTS; i++) { vec3 lv = spotLights[i].position - geometryPosition; float dl = length(lv); vec3 L = lv / dl;
            float cs = dot(L, spotLights[i].direction); float sa = smoothstep(spotLights[i].coneCos, spotLights[i].penumbraCos, cs);
            float nl = dot(normal, L); float att = getDistanceAttenuation(dl, spotLights[i].distance, spotLights[i].decay);
            wrapAmt += max(0.0, (nl + 0.5) / 1.5) * (1.0 - max(nl, 0.0)) * length(spotLights[i].color) * att * sa; }
        #endif
        reflectedLight.directDiffuse += diffuseColor.rgb * vec3(0.62, 0.20, 0.12) * wrapAmt * 0.16;
      }`);
  };
  NAIL = new THREE.MeshPhysicalMaterial({ map: tex('assets/tex/nail_albedo.jpg', true), normalMap: tex('assets/tex/nail_normal.jpg'), roughness: 0.32, clearcoat: 0.45, clearcoatRoughness: 0.3, specularIntensity: 0.7 });
  return { skin: SKIN, nail: NAIL };
}

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

let HAND_ASSET = null;
export async function loadHandAsset(url = 'assets/models/hand_r.glb') {
  if (HAND_ASSET) return HAND_ASSET;
  const g = await new GLTFLoader().loadAsync(url); HAND_ASSET = g.scene; return HAND_ASSET;
}
const BONES = ['forearm', 'hand', 'index1', 'index2', 'index3', 'middle1', 'middle2', 'middle3', 'ring1', 'ring2', 'ring3', 'pinky1', 'pinky2', 'pinky3', 'thumb1', 'thumb2', 'thumb3'];
const FN = ['index', 'middle', 'ring', 'pinky'];

// Skinned hand built in Blender (blender/make_hand.py). Root: wrist at origin, fingers -Z, back of hand +Y.
// Right hand thumb on -X; the left hand is a mirrored clone.
export function buildHand(side = 'R') {
  const { skin, nail } = skinMaterials();
  const S = side === 'R' ? 1 : -1;
  const root = new THREE.Group(); root.name = 'hand' + side;
  const inner = SkeletonUtils.clone(HAND_ASSET); root.add(inner);
  if (S < 0) inner.scale.x = -1;
  const bones = {}; const rest = {};
  inner.traverse(o => {
    if (o.isBone && BONES.includes(o.name)) { bones[o.name] = o; rest[o.name] = o.quaternion.clone(); }
    if (o.isMesh) { o.material = o.name.startsWith('nail') || (o.material && o.material.name === 'nail') ? nail : skin; o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
  });
  root.userData = { side, S, bones, rest };
  return root;
}
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
function setBone(u, name, x, y = 0, z = 0) {
  const b = u.bones[name]; if (!b) return;
  _e.set(x, y * u.S, z * u.S, 'XYZ'); _q.setFromEuler(_e); b.quaternion.copy(u.rest[name]).multiply(_q);
}
// pose: { f: [[mcp,pip,dip] x4] (radians, + curls toward palm), spread:[4], t:[yaw, pitch, mcp, ip], tRoll, wrist:[x,y,z] }
export function poseHand(hand, pose) {
  const u = hand.userData; const C = HAND_CURL;
  for (let i = 0; i < 4; i++) {
    const c = pose.f[i]; const n = FN[i];
    setBone(u, n + '1', C * c[0], 0, -(pose.spread ? pose.spread[i] : 0));
    setBone(u, n + '2', C * c[1]); setBone(u, n + '3', C * c[2]);
  }
  const t = pose.t;
  setBone(u, 'thumb1', C * t[1], -t[0] * 0.6, -(t[0]) - (pose.tRoll || 0));
  setBone(u, 'thumb2', C * t[2], 0, t[4] || 0); setBone(u, 'thumb3', C * t[3], 0, t[5] || 0);
  const w = pose.wrist || [0, 0, 0]; setBone(u, 'hand', w[0], w[1], w[2]);
}
export let HAND_CURL = -1;
// Swing the forearm about the wrist so the elbow points at elbowWorld, keeping the hand's world pose.
const _m = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _wp = new THREE.Vector3();
export function aimForearm(hand, elbowWorld) {
  const u = hand.userData; const hb = u.bones.hand; if (!hb) return;
  hand.updateWorldMatrix(true, true);
  const desired = hb.matrixWorld.clone();
  hand.getWorldPosition(_wp);
  _v1.set(0, 0, 1).applyQuaternion(hand.getWorldQuaternion(_qa)).normalize();
  _v2.copy(elbowWorld).sub(_wp).normalize();
  const delta = _qb.setFromUnitVectors(_v1, _v2);
  const parentQ = hand.parent ? hand.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  hand.quaternion.copy(parentQ.clone().invert().multiply(_qa.premultiply(delta)));
  hand.updateWorldMatrix(true, true);
  _m.copy(hb.parent.matrixWorld).invert().multiply(desired);
  const sc = new THREE.Vector3(); _m.decompose(hb.position, hb.quaternion, sc);
}
export function lerpPose(a, b, k) {
  const L = (x, y) => x + (y - x) * k;
  return { f: a.f.map((v, i) => v.map((x, j) => L(x, b.f[i][j]))), spread: a.spread.map((x, i) => L(x, b.spread[i])), t: [0, 1, 2, 3, 4, 5].map(i => L(a.t[i] || 0, b.t[i] || 0)), tRoll: L(a.tRoll || 0, b.tRoll || 0), wrist: [0, 1, 2].map(i => L((a.wrist || [0, 0, 0])[i], (b.wrist || [0, 0, 0])[i])) };
}
export const HAND_POSES = {
  relaxed: { f: [[0.25, 0.35, 0.2], [0.3, 0.45, 0.25], [0.35, 0.5, 0.3], [0.4, 0.55, 0.3]], spread: [0.05, 0, -0.04, -0.09], t: [0.0, 0.0, 0.2, 0.15] },
  gripR: { f: [[0.18, 0.12, 0.08], [1.25, 1.55, 0.75], [1.3, 1.6, 0.8], [1.35, 1.6, 0.8]], spread: [0.02, 0.0, -0.02, -0.06], t: [0.45, 0.3, 0.15, 0.1], tRoll: 0.0 },
  triggerR: { f: [[0.55, 0.85, 0.35], [1.25, 1.55, 0.75], [1.3, 1.6, 0.8], [1.35, 1.6, 0.8]], spread: [0.02, 0.0, -0.02, -0.06], t: [0.45, 0.3, 0.15, 0.1] },
  supportL: { f: [[1.0, 1.25, 0.55], [1.1, 1.35, 0.6], [1.15, 1.4, 0.6], [1.2, 1.45, 0.6]], spread: [0.0, 0.0, -0.02, -0.05], t: [0.35, 0.25, 0.1, 0.1] },
  pinchL: { f: [[0.9, 1.0, 0.5], [1.0, 1.1, 0.55], [1.15, 1.3, 0.6], [1.25, 1.4, 0.6]], spread: [0.0, 0.0, -0.03, -0.06], t: [0.3, 0.5, 0.35, 0.3] },
  holdMagL: { f: [[0.65, 0.55, 0.3], [1.0, 1.1, 0.5], [1.15, 1.35, 0.6], [1.25, 1.45, 0.6]], spread: [0.0, 0.0, -0.03, -0.06], t: [0.5, 0.2, 0.3, 0.25] },
  rackL: { f: [[1.1, 1.0, 0.5], [1.2, 1.1, 0.5], [1.25, 1.2, 0.55], [1.3, 1.3, 0.55]], spread: [0.0, 0.0, -0.03, -0.06], t: [0.2, 0.1, 0.35, 0.3] },
  fistTorch: { f: [[1.15, 1.35, 0.6], [1.25, 1.5, 0.7], [1.3, 1.55, 0.7], [1.35, 1.55, 0.7]], spread: [0.0, 0.0, -0.02, -0.05], t: [0.55, 0.4, 0.2, 0.1] },
};
