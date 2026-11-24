// Mount Elgo world: terrain, forest (3 LODs), lake, roads, cabins, sky, fog, lighting presets.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { setTerrainStride, height, forest, polar, LAKE, ROAD, ROAD_H, SPUR, SPUR_H, HALE, MEADOW, LOT, roadInfo, MAPD } from './geo.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mulberry32, fbm } from './noise.js';
import { pineGeometry, pineMaterials, impostorTexture } from './trees.js';

export const QUALITY = {
  low:    { seg: 200, near: 300, nearStep: 11, midStep: 24, farStep: 48, far: 9000, shadows: false, shadowSize: 1024, pixel: 0.7, post: false, bloom: false },
  medium: { seg: 280, near: 400, nearStep: 9, midStep: 18, farStep: 36, far: 11000, shadows: true, shadowSize: 1024, pixel: 0.85, post: true, bloom: false },
  high:   { seg: 360, near: 480, nearStep: 7.5, midStep: 15, farStep: 30, far: 13000, shadows: true, shadowSize: 2048, pixel: 1.0, post: true, bloom: true },
  ultra:  { seg: 440, near: 600, nearStep: 6.5, midStep: 12, farStep: 24, far: 15000, shadows: true, shadowSize: 4096, pixel: 1.25, post: true, bloom: true },
};

function loadTex(loader, url, rep, srgb) {
  const t = loader.load(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep, rep);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

// ---------------- SKY ----------------
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uMoon: { value: new THREE.Vector3(0, 1, 0) }, uNight: { value: 1 }, uTime: { value: 0 }, uFog: { value: new THREE.Color() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun, uMoon, uFog; uniform float uNight, uTime;
      float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        // day / morning
        vec3 zen = vec3(0.30,0.48,0.78), hor = vec3(0.86,0.80,0.72);
        float sd = max(dot(d, uSun), 0.0);
        vec3 day = mix(hor, zen, pow(max(y,0.0), 0.55));
        day += vec3(1.0,0.62,0.3) * pow(sd, 8.0) * 0.5 * (1.0 - smoothstep(0.0,0.5,y)) + vec3(1.0,0.85,0.6)*pow(sd, 900.0)*12.0;
        day = mix(day, vec3(0.92,0.72,0.55), (1.0-smoothstep(-0.02,0.18,y))*0.55);
        // night
        vec3 nz = vec3(0.010,0.016,0.035), nh = vec3(0.040,0.055,0.085);
        vec3 night = mix(nh, nz, pow(max(y,0.0), 0.45));
        float md = max(dot(d, uMoon), 0.0);
        night += vec3(0.55,0.62,0.75) * pow(md, 30.0) * 0.18 + vec3(0.6,0.65,0.75)*pow(md, 4.0)*0.03;
        float disc = smoothstep(0.99955, 0.99975, md);
        vec3 mcol = vec3(1.0,0.97,0.9) * 2.2 * (0.85 + 0.15*h3(floor(d*900.0)));
        night = mix(night, mcol, disc);
        // stars (two layers, twinkle), milky way band
        vec3 sp = d * 420.0; vec3 cell = floor(sp); float r = h3(cell); vec3 f = fract(sp) - 0.5;
        float star = step(0.985, r) * smoothstep(0.18, 0.0, length(f)) * (0.6 + 0.4*sin(uTime*2.0 + r*80.0));
        vec3 sp2 = d * 1100.0; float r2 = h3(floor(sp2)); float star2 = step(0.993, r2) * smoothstep(0.25, 0.0, length(fract(sp2)-0.5)) * 0.5;
        float band = exp(-pow(dot(d, normalize(vec3(0.3,0.5,0.8))) * 3.2, 2.0)) * (0.5 + 0.5*h3(floor(d*60.0)));
        night += (star + star2) * smoothstep(0.0, 0.15, y) * vec3(0.9,0.93,1.0) * (1.0 - disc) + band * vec3(0.03,0.035,0.05) * smoothstep(0.0,0.3,y);
        vec3 col = mix(day, night, uNight);
        // horizon haze toward fog colour
        col = mix(col, uFog, (1.0 - smoothstep(-0.05, 0.12, y)) * 0.85);
        if (y < -0.02) col = uFog;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, depthTest: true,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat); m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ---------------- MYCHIEF MAP TERRAIN ----------------
function mapTerrainGeometry(M, k) {
  const n = M.n, seg = Math.floor((n - 1) / k), size = seg * k * M.step;
  const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position; const fo = new Float32Array(pos.count);
  for (let r = 0; r <= seg; r++) for (let c = 0; c <= seg; c++) { const i = r * (seg + 1) + c; pos.setY(i, M.heights[(r * k) * n + c * k]); fo[i] = forest(pos.getX(i) - (M.half - size / 2), pos.getZ(i) - (M.half - size / 2)); }
  g.translate(-(M.half - size / 2), 0, -(M.half - size / 2));
  g.setAttribute('aForest', new THREE.BufferAttribute(fo, 1)); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
function mapTerrainMaterial(M, tex, phone) {
  const L = new THREE.TextureLoader();
  const alb = L.load(M.base + (phone ? 'mychief-map-albedo-2048.jpg' : 'mychief-map-albedo-4096.jpg')); alb.colorSpace = THREE.SRGBColorSpace; alb.anisotropy = phone ? 4 : 8;
  const splat = L.load(M.base + 'mychief-map-splat-1024.png');
  const m = new THREE.MeshStandardMaterial({ map: alb, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGround: { value: tex.ground }, tRock: { value: tex.rock }, tLeaves: { value: tex.leaves }, tGravel: { value: tex.gravel }, tSplat: { value: splat } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tGround, tRock, tLeaves, tGravel, tSplat; varying vec3 vWP;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        { // near detail: tiled CC0 textures weighted by the splat, modulating the satellite albedo; fades out by ~800 m
          float dist = length(vWP - cameraPosition); float nearK = 1.0 - smoothstep(250.0, 800.0, dist);
          if (nearK > 0.0) { vec4 sp = texture2D(tSplat, vMapUv); vec2 wp = vWP.xz; float tot = sp.r + sp.g + sp.b + sp.a + 1e-3;
            vec3 det = (texture2D(tLeaves, wp / 6.0).rgb * sp.r + texture2D(tRock, wp / 8.0).rgb * sp.g + texture2D(tGround, wp / 5.0).rgb * sp.b + texture2D(tGravel, wp / 4.0).rgb * sp.a) / tot;
            float l = dot(det, vec3(0.333)); diffuseColor.rgb *= mix(vec3(1.0), det / max(0.05, l) * 0.5 + 0.5 * l / 0.35, nearK * 0.75); } }`);
  };
  return m;
}
// ---------------- TERRAIN ----------------
function terrainGeometry(seg, R = 7600, pow = 1.9) {
  const n = seg + 1; const pos = new Float32Array(n * n * 3); const fo = new Float32Array(n * n); const uv = new Float32Array(n * n * 2);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = i / seg * 2 - 1, v = j / seg * 2 - 1;
    const x = Math.sign(u) * Math.pow(Math.abs(u), pow) * R, z = Math.sign(v) * Math.pow(Math.abs(v), pow) * R;
    const k = j * n + i; pos[k * 3] = x; pos[k * 3 + 1] = height(x, z); pos[k * 3 + 2] = z; fo[k] = forest(x, z);
    uv[k * 2] = x / 6; uv[k * 2 + 1] = z / 6;
  }
  const idx = new Uint32Array(seg * seg * 6); let t = 0;
  for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aForest', new THREE.BufferAttribute(fo, 1));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals(); g.computeBoundingSphere();
  return g;
}
function terrainMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, normalMap: tex.groundN, normalScale: new THREE.Vector2(0.8, 0.8) });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tGround: { value: tex.ground }, tRock: { value: tex.rock }, tLeaves: { value: tex.leaves }, uLake: { value: new THREE.Vector4(LAKE.x, LAKE.z, LAKE.r, LAKE.level) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aForest; varying float vForest; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vForest = aForest; vWP = (modelMatrix * vec4(transformed,1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D tGround, tRock, tLeaves; uniform vec4 uLake; varying float vForest; varying vec3 vWP; varying vec3 vWN;
      float th(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(th(i),th(i+vec2(1,0)),f.x), mix(th(i+vec2(0,1)),th(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        vec2 wp = vWP.xz; float dist = length(vWP - cameraPosition);
        vec3 g1 = texture2D(tGround, wp / 5.0).rgb, g2 = texture2D(tGround, wp / 41.0).rgb;
        vec3 ground = mix(g1, g2, 0.45) * vec3(0.95, 0.95, 0.85);
        vec3 leaves = texture2D(tLeaves, wp / 7.0).rgb * vec3(0.85, 0.9, 0.8);
        vec3 rock = mix(texture2D(tRock, wp / 9.0).rgb, texture2D(tRock, wp / 63.0).rgb, 0.5) * vec3(0.92,0.92,0.95);
        float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
        float macro = vn(wp / 180.0) * 0.6 + vn(wp / 37.0) * 0.4;
        vec3 col = mix(ground, leaves, smoothstep(0.15, 0.6, vForest) * 0.8);
        // dry meadow grass tint in open areas
        col = mix(col, col * vec3(1.05, 1.0, 0.7), (1.0 - smoothstep(0.0, 0.3, vForest)) * smoothstep(0.4, 0.7, macro) * 0.6);
        col = mix(col, rock, smoothstep(0.32, 0.55, slope + macro * 0.15));
        // far canopy: forested areas read as dark conifer cover
        float canopy = smoothstep(0.25, 0.65, vForest) * smoothstep(300.0, 1600.0, dist);
        vec3 can = vec3(0.045, 0.062, 0.045) * (0.7 + 0.6 * vn(wp / 25.0));
        col = mix(col, can, canopy * 0.92);
        // wet shoreline
        float dl = length(wp - uLake.xy); float shore = smoothstep(uLake.w + 2.5, uLake.w + 0.2, vWP.y) * (1.0 - smoothstep(uLake.z*1.6, uLake.z*1.9, dl));
        col *= 1.0 - shore * 0.45;
        col *= 0.82 + macro * 0.32;
        diffuseColor.rgb *= col;`)
      .replace('#include <normal_fragment_maps>', `
        #ifdef USE_NORMALMAP
          vec3 mapN = texture2D( normalMap, vWP.xz / 5.0 ).xyz * 2.0 - 1.0; mapN.xy *= normalScale * (1.0 - smoothstep(30.0, 200.0, length(vWP - cameraPosition)));
          normal = normalize( tbn * mapN );
        #endif`);
  };
  m.customProgramCacheKey = () => 'elgo-terrain';
  return m;
}

// ---------------- TREES ----------------
function needleTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  const r = mulberry32(21); g.clearRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const x = r() * 128, y = r() * 128; const a = Math.PI * 0.5 + (r() - 0.5) * 1.2; const L = 6 + r() * 12;
    const v = 30 + r() * 50 | 0; g.strokeStyle = `rgba(${v * 0.55 | 0},${v},${v * 0.5 | 0},${0.85})`; g.lineWidth = 1 + r() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
function pineGeometryOld(layers, radial, seed, alpha) {
  const r = mulberry32(seed); const parts = [];
  const trunk = new THREE.CylinderGeometry(0.06, 0.22, 1.0, Math.max(5, radial - 2), 1, true); trunk.translate(0, 0.5, 0);
  colorGeo(trunk, [0.22, 0.16, 0.11]); markPart(trunk, 0); parts.push(trunk);
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1); const y0 = 0.18 + t * 0.72; const rad = (1 - t) * 0.33 + 0.05; const h = 0.26 - t * 0.08;
    const c = new THREE.ConeGeometry(rad, h, radial, 2, true); const p = c.attributes.position;
    for (let k = 0; k < p.count; k++) { const yy = p.getY(k); if (yy < h / 2 - 1e-4) { const a = Math.atan2(p.getZ(k), p.getX(k)); const j = 0.75 + 0.5 * r(); p.setX(k, p.getX(k) * j); p.setZ(k, p.getZ(k) * j); p.setY(k, yy - 0.04 * (0.5 + r())); } }
    c.translate(0, y0 + h / 2, 0); c.rotateY(r() * 6.28);
    const shade = 0.75 + 0.25 * t; colorGeo(c, [0.07 * shade, 0.12 * shade, 0.07 * shade]); markPart(c, 1); parts.push(c);
  }
  const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); g.computeVertexNormals();
  return g;
}
function colorGeo(g, c) { const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
function markPart(g, v) { const n = g.attributes.position.count; g.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(v), 1)); g.deleteAttribute('uv'); }
function impostorTextureOld() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d'); const r = mulberry32(9);
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 26; i++) { const t = i / 25; const y = 118 - t * 112; const w = (1 - t) * 28 + 2;
    g.fillStyle = `rgb(${18 + r() * 10 | 0},${30 + r() * 14 | 0},${20 + r() * 8 | 0})`; g.beginPath(); g.moveTo(32 - w, y); g.lineTo(32 + w, y); g.lineTo(32 + (r() - 0.5) * 4, y - 14); g.fill(); }
  g.fillStyle = '#2a1e14'; g.fillRect(30, 112, 4, 16);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function scatterTrees(Q, rnd) {
  const near = [], mid = [], far = [];
  const bins = [[100, Q.near, Q.nearStep, near], [Q.near, 1900, Q.midStep, mid], [1900, 6800, Q.farStep, far]];
  for (const [r0, r1, step, out] of bins) {
    for (let x = -r1; x <= r1; x += step) for (let z = -r1; z <= r1; z += step) {
      const px = x + (rnd() - 0.5) * step * 0.9, pz = z + (rnd() - 0.5) * step * 0.9; const d = Math.hypot(px, pz);
      if (d < r0 || d >= r1) continue;
      const f = forest(px, pz); if (rnd() > f) continue;
      const s = 0.65 + rnd() * 0.75; out.push([px, height(px, pz) - 0.3, pz, s, rnd() * 6.28]);
    }
  }
  return { near, mid, far };
}
function instanced(geo, mat, list, hScale) {
  const m = new THREE.InstancedMesh(geo, mat, list.length); const o = new THREE.Object3D(); const col = new THREE.Color();
  list.forEach((t, i) => { const H = (14 + 14 * (t[3] - 0.65) / 0.75) * hScale; o.position.set(t[0], t[1], t[2]); o.rotation.set(0, t[4], 0); o.scale.set(H * (0.85 + 0.3 * ((i * 7919) % 13) / 13), H, H * 0.95); o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    col.setHSL(0.22 + 0.08 * ((i * 104729) % 17) / 17, 0.28, 0.62 + 0.3 * ((i * 31) % 11) / 11); m.setColorAt(i, col); });
  m.instanceMatrix.needsUpdate = true; m.computeBoundingSphere(); return m;
}

// ---------------- LAKE ----------------
function makeLake() {
  let geo;
  if (LAKE.poly) { const sh = new THREE.Shape(LAKE.poly.map(p => new THREE.Vector2((p.x - LAKE.x) * 1.04, -(p.z - LAKE.z) * 1.04))); geo = new THREE.ShapeGeometry(sh, 4); geo.rotateX(-Math.PI / 2); }
  else { geo = new THREE.CircleGeometry(LAKE.r * 1.75, 96); geo.rotateX(-Math.PI / 2); }
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uMoon: { value: new THREE.Vector3() }, uSky: { value: new THREE.Color(0x0a1020) }, uNight: { value: 1 }, uSunCol: { value: new THREE.Color(1, 0.8, 0.6) } }]),
    vertexShader: `varying vec3 vWP; #include <fog_pars_vertex>
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vWP = wp.xyz; vec4 mvPosition = viewMatrix * wp; gl_Position = projectionMatrix * mvPosition; #include <fog_vertex> }`.replace(/#include <fog_pars_vertex>/, '\n#include <fog_pars_vertex>\n').replace(/#include <fog_vertex>/, '\n#include <fog_vertex>\n'),
    fragmentShader: `uniform float uTime, uNight; uniform vec3 uMoon, uSky, uSunCol; varying vec3 vWP;
      #include <fog_pars_fragment>
      float hh(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
      void main(){
        vec2 p = vWP.xz; float t = uTime;
        float e = 0.6; vec2 g = vec2(wn(p*0.08 + vec2(t*0.05,0.)) - wn(p*0.08 + vec2(e+t*0.05,0.)), wn(p*0.08+vec2(0.,t*0.04)) - wn(p*0.08 + vec2(0., e+t*0.04)));
        g += 0.5*vec2(wn(p*0.31 - t*0.12) - wn(p*0.31 + vec2(e,0.) - t*0.12), wn(p*0.31 + t*0.1) - wn(p*0.31 + vec2(0.,e) + t*0.1));
        vec3 n = normalize(vec3(g.x*0.25, 1.0, g.y*0.25));
        vec3 v = normalize(cameraPosition - vWP); vec3 r = reflect(-v, n);
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 sky = mix(uSky * 1.4, uSky * 0.6, clamp(r.y, 0.0, 1.0));
        float glint = pow(max(dot(r, normalize(uMoon)), 0.0), 600.0) * 6.0 + pow(max(dot(r, normalize(uMoon)), 0.0), 60.0) * 0.25;
        vec3 deep = mix(vec3(0.004,0.008,0.012), vec3(0.03,0.05,0.06), 1.0 - uNight);
        vec3 col = mix(deep, sky, fres) + glint * mix(uSunCol, vec3(0.8,0.85,1.0), uNight);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`, fog: true,
  });
  const m = new THREE.Mesh(geo, mat); m.position.set(LAKE.x, LAKE.level, LAKE.z); return m;
}

// ---------------- ROADS ----------------
function resamplePath(path, hs, step = 2.5) { // dense, terrain-following centreline (no ribbons bridging over dips)
  const out = [], oh = [];
  for (let i = 0; i < path.length - 1; i++) { const [x0, z0] = path[i], [x1, z1] = path[i + 1]; const L = Math.hypot(x1 - x0, z1 - z0); const n = Math.max(1, Math.ceil(L / step));
    for (let k = 0; k < n; k++) { const t = k / n; out.push([x0 + (x1 - x0) * t, z0 + (z1 - z0) * t]); oh.push(hs[i] + (hs[i + 1] - hs[i]) * t); } }
  out.push(path[path.length - 1]); oh.push(hs[hs.length - 1]); return [out, oh];
}
// gravel forest road: crowned centre, two packed tyre tracks, ragged grassy shoulders that fade into the terrain
function roadMesh(path0, hs0, width, mat) {
  const [path, hs] = resamplePath(path0, hs0); const pos = [], uv = [], idx = []; let acc = 0; const AC = [-0.62, -0.5, -0.3, -0.12, 0, 0.12, 0.3, 0.5, 0.62]; const DY = AC.map(() => 0); const n = AC.length;
  for (let i = 0; i < path.length; i++) {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    const nx = -dz, nz = dx; const [x, z] = path[i]; if (i > 0) acc += Math.hypot(x - path[i - 1][0], z - path[i - 1][1]);
    const hc = height(x, z); const yc = Math.min(Math.max(hs[i], hc), hc + 0.35);
    for (let ci = 0; ci < n; ci++) { const s = AC[ci]; const px = x + nx * width * s, pz = z + nz * width * s; const ht = height(px, pz); const crown = 0.05 * (1 - Math.min(1, Math.abs(s) / 0.5) ** 2);
      const y = Math.abs(s) > 0.5 ? ht + 0.05 : Math.min(Math.max(yc, ht - 0.25), ht + 0.3) + crown; pos.push(px, y + 0.05 + DY[ci], pz); uv.push(s + 0.5, acc / width); }
    if (i < path.length - 1) { const k = i * n; for (let q = 0; q < n - 1; q++) idx.push(k + q, k + q + n, k + q + 1, k + q + 1, k + q + n, k + q + n + 1); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.userData.path = path; m.userData.width = width; return m;
}
function roadMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex.gravel, color: 0xb0a490, roughness: 1, polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -3 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tLeaves: { value: tex.leaves }, tGround: { value: tex.ground } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vRUv; varying vec3 vRW;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvRUv = uv;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvRW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      varying vec2 vRUv; varying vec3 vRW; uniform sampler2D tLeaves, tGround;
      float rh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float rn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(rh(i),rh(i+vec2(1,0)),f.x), mix(rh(i+vec2(0,1)),rh(i+vec2(1,1)),f.x), f.y); }`)
      .replace('#include <map_fragment>', `
        vec2 wp = vRW.xz; float u = vRUv.x - 0.5; float au = abs(u);
        vec3 grav = mix(texture2D(map, wp / 3.2).rgb, texture2D(map, wp / 11.0).rgb, 0.4);
        float n1 = rn(wp * 0.35), n2 = rn(wp * 2.1);
        // packed tyre tracks: darker, finer, a little smoother
        float track = (1.0 - smoothstep(0.03, 0.085, abs(au - 0.2 + (n1 - 0.5) * 0.04)));
        vec3 col = grav * mix(1.0, 0.72, track) * (0.9 + 0.2 * n2);
        col = mix(col, col * vec3(1.08, 1.04, 0.95), smoothstep(0.08, 0.0, au) * 0.6); // loose gravel ridge on the crown
        // shoulders: dirt + needles/grass, ragged edge that dissolves into the terrain
        float sh = smoothstep(0.36, 0.5, au + (n1 - 0.5) * 0.12);
        vec3 verge = mix(texture2D(tGround, wp / 4.0).rgb, texture2D(tLeaves, wp / 5.0).rgb, n1) * vec3(0.95, 0.95, 0.85);
        col = mix(col, verge, sh);
        float edge = smoothstep(0.5, 0.62, au + (n2 - 0.5) * 0.12 + (n1 - 0.5) * 0.1);
        if (edge > 0.5 + 0.45 * (rh(floor(gl_FragCoord.xy)) - 0.5)) discard;
        diffuseColor.rgb *= col;
        float roughK = mix(1.0, 0.86, track);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor *= roughK;');
  };
  m.customProgramCacheKey = () => 'elgo-road'; return m;
}
// wooden delineator posts with reflectors along the downhill side; timber rail where the drop is steep
function roadPosts(road, tex) {
  const path = road.userData.path, w = road.userData.width; const posts = [], rails = []; let acc = 0, last = -1e9;
  for (let i = 1; i < path.length - 1; i++) { acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); if (acc - last < 16) continue; last = acc;
    const a = path[i - 1], b = path[i + 1]; let dx = b[0] - a[0], dz = b[1] - a[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; const nx = -dz, nz = dx;
    const off = w * 0.5 + 1.2; const hl = height(path[i][0] + nx * (off + 3), path[i][1] + nz * (off + 3)), hr = height(path[i][0] - nx * (off + 3), path[i][1] - nz * (off + 3));
    const s = hl < hr ? 1 : -1; const drop = height(path[i][0], path[i][1]) - Math.min(hl, hr);
    const px = path[i][0] + nx * off * s, pz = path[i][1] + nz * off * s; posts.push([px, height(px, pz), pz, Math.atan2(dx, dz), drop > 1.6]); }
  const g = new THREE.Group(); const o = new THREE.Object3D();
  const woodM = new THREE.MeshStandardMaterial({ map: tex.planks, color: 0x8a7a66, roughness: 0.95 });
  const pm = new THREE.InstancedMesh(new RoundedBoxGeometry(0.14, 1.15, 0.14, 2, 0.02), woodM, posts.length);
  const rm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.06), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 0.05, roughness: 0.25, metalness: 0.4 }), posts.length);
  posts.forEach((p, i) => { o.position.set(p[0], p[1] + 0.45, p[2]); o.rotation.set(0, p[3], 0); o.updateMatrix(); pm.setMatrixAt(i, o.matrix); o.position.y = p[1] + 0.92; o.updateMatrix(); rm.setMatrixAt(i, o.matrix); });
  for (let i = 0; i < posts.length - 1; i++) { const a = posts[i], b = posts[i + 1]; continue; /* timber rails removed: straight chords cut across bends and clipped the road/truck; delineator posts stay */ if (!(a[4] && b[4])) continue; const L = Math.hypot(b[0] - a[0], b[2] - a[2]); if (L > 22) continue; rails.push([a, b, L]); }
  const railM = new THREE.InstancedMesh(new RoundedBoxGeometry(0.12, 0.22, 1, 2, 0.03), woodM, Math.max(1, rails.length)); railM.count = rails.length;
  rails.forEach(([a, b, L], i) => { o.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.68, (a[2] + b[2]) / 2); o.lookAt(b[0], b[1] + 0.68, b[2]); o.scale.set(1, 1, L); o.updateMatrix(); railM.setMatrixAt(i, o.matrix); o.scale.set(1, 1, 1); });
  for (const m of [pm, rm, railM]) { m.castShadow = true; m.receiveShadow = true; m.computeBoundingSphere(); g.add(m); }
  return g;
}

// ---------------- CABINS ----------------
export function makeCabin(tex, lit = false) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ map: tex.planksDark, color: 0x8a7a6a, roughness: 0.9 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x2a2622, roughness: 0.85, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 5.5), wall); body.position.y = 1.5; body.castShadow = body.receiveShadow = true; g.add(body);
  const rg = new THREE.CylinderGeometry(0.01, 4.6, 2.2, 4, 1); rg.rotateY(Math.PI / 4); rg.scale(1.15, 1, 0.9);
  const r = new THREE.Mesh(rg, roof); r.position.y = 4.1; r.castShadow = true; g.add(r);
  const chim = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2, 0.6), new THREE.MeshStandardMaterial({ color: 0x4a4440, roughness: 1 })); chim.position.set(2, 4.4, 1); g.add(chim);
  const windows = [];
  for (const [x, z, ry] of [[-1.8, 2.76, 0], [1.8, 2.76, 0], [3.51, 0, Math.PI / 2], [-3.51, 0.6, -Math.PI / 2]]) {
    const wm = new THREE.MeshStandardMaterial({ color: 0x0a0c10, emissive: 0xffb55a, emissiveIntensity: 0, roughness: 0.2 });
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.9), wm); w.position.set(x, 1.7, z); w.rotation.y = ry; g.add(w); windows.push(w);
  }
  const door = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 2.0), new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 })); door.position.set(0, 1.0, 2.76); g.add(door);
  g.userData.windows = windows;
  g.userData.setLit = (k, which) => windows.forEach((w, i) => { if (which === undefined || which === i) w.material.emissiveIntensity = k; });
  if (lit) g.userData.setLit(1.2);
  return g;
}

export function buildWorld(scene, renderer, qualityName = 'low', opts = {}) {
  const Q = QUALITY[qualityName] || QUALITY.low; const M = MAPD; const phone = !!opts.phone;
  if (M) setTerrainStride({ low: 4, medium: 2, high: 2, ultra: 1 }[qualityName] || 4);
  const L = new THREE.TextureLoader();
  const tex = {
    ground: loadTex(L, 'assets/tex/forest_ground_04_diffuse.jpg', 1, true), groundN: loadTex(L, 'assets/tex/forest_ground_04_nor_gl.jpg', 1),
    rock: loadTex(L, 'assets/tex/rocky_terrain_02_diffuse.jpg', 1, true), leaves: loadTex(L, 'assets/tex/forest_leaves_04_diffuse.jpg', 1, true),
    gravel: loadTex(L, 'assets/tex/gravel_road_diffuse.jpg', 1, true), bark: loadTex(L, 'assets/tex/pine_bark_diffuse.jpg', 1, true),
    planks: loadTex(L, 'assets/tex/weathered_planks_diffuse.jpg', 1, true), planksN: loadTex(L, 'assets/tex/weathered_planks_nor_gl.jpg', 1), planksR: loadTex(L, 'assets/tex/weathered_planks_rough.jpg', 1),
    planksDark: loadTex(L, 'assets/tex/dark_wooden_planks_diffuse.jpg', 2, true), planksDarkN: loadTex(L, 'assets/tex/dark_wooden_planks_nor_gl.jpg', 2),
    brown: loadTex(L, 'assets/tex/brown_planks_05_diffuse.jpg', 1, true), brownN: loadTex(L, 'assets/tex/brown_planks_05_nor_gl.jpg', 1), brownR: loadTex(L, 'assets/tex/brown_planks_05_rough.jpg', 1),
    rockN: loadTex(L, 'assets/tex/rocky_terrain_02_nor_gl.jpg', 1),
  };
  const W = { tex, Q, group: new THREE.Group(), cabins: [], colliders: [] };
  scene.add(W.group);
  // sky
  W.sky = makeSky(); W.group.add(W.sky);
  // terrain
  W.map = M;
  const tg = M ? mapTerrainGeometry(M, { low: 4, medium: 2, high: 2, ultra: 1 }[qualityName] || 4) : terrainGeometry(Q.seg);
  W.terrain = new THREE.Mesh(tg, M ? mapTerrainMaterial(M, tex, phone) : terrainMaterial(tex)); W.terrain.receiveShadow = true; W.terrain.name = 'terrain'; W.group.add(W.terrain);
  // distant ring mountains (silhouettes beyond the playable map)
  {
    const seg = 160, rings = 6, R0 = 7400, R1 = 14000; const pos = [], idx = [];
    for (let j = 0; j <= rings; j++) for (let i = 0; i <= seg; i++) {
      const a = i / seg * Math.PI * 2, t = j / rings, R = R0 + (R1 - R0) * t;
      let x = Math.sin(a) * R, z = -Math.cos(a) * R;
      if (M) { const e = M.half - 2, sx = Math.sin(a), sz = -Math.cos(a), k0 = e / Math.max(Math.abs(sx), Math.abs(sz)); const RR = k0 + (14000 - k0) * t; x = sx * RR; z = sz * RR; }
      const h = (j === 0 ? height(x * 0.999, z * 0.999) : (150 + 900 * Math.max(0, fbm(x / 3000, z / 3000, 4) + 0.35) * Math.sin(t * Math.PI) ** 0.6));
      pos.push(x, h, z);
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    W.ring = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1a2018, roughness: 1 })); W.group.add(W.ring);
  }
  // lake
  W.lake = makeLake(); W.group.add(W.lake);
  // roads
  const roadMat = roadMaterial(tex);
  tex.gravel.repeat.set(1, 1);
  const mainRoad = roadMesh(ROAD, ROAD_H, 5.2, roadMat); W.group.add(mainRoad); W.group.add(roadMesh(SPUR, SPUR_H, 3.6, roadMat));
  W.group.add(roadPosts(mainRoad, tex));
  // trees
  const rnd = mulberry32(42);
  const sc = scatterTrees(Q, rnd); W.treeCounts = { near: sc.near.length, mid: sc.mid.length, far: sc.far.length };
  // conifers: drooping needle bough cards with soft crown normals (near), lighter cards (mid), impostors (far)
  const nearGeo = pineGeometry(qualityName === 'low' ? { whorls: 15, per: 8, segs: 2, across: 3, seed: 1, radius: 0.27 } : { whorls: 18, per: 8, segs: 3, across: 3, seed: 1, radius: 0.27 });
  W.treesNear = instanced(nearGeo, pineMaterials(), sc.near, 1); W.treesNear.castShadow = true; W.treesNear.receiveShadow = true; W.group.add(W.treesNear);
  const midGeo = pineGeometry({ whorls: 9, per: 6, segs: 1, across: 2, seed: 2, trunkSides: 4, cardW: 1.1, radius: 0.27 });
  W.treesMid = instanced(midGeo, pineMaterials({ dense: true }), sc.mid, 1); W.group.add(W.treesMid);
  const q1 = new THREE.PlaneGeometry(0.62, 1, 1, 1); q1.translate(0, 0.5, 0); const q2 = q1.clone().rotateY(Math.PI / 2);
  const farGeo = mergeGeometries([q1, q2]);
  W.treesFar = instanced(farGeo, new THREE.MeshStandardMaterial({ map: impostorTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }), sc.far, 1); W.group.add(W.treesFar);
  W.treePositions = sc.near; // used for shot raycasts near the tower
  // cabins: Hale cabin + two by the valley road
  if (M) { for (const c of M.json.cabins) { const cb = makeCabin(tex); cb.position.set(c.x, height(c.x, c.z), c.z); cb.rotation.y = Math.PI - c.face_bearing_deg * Math.PI / 180; cb.name = c.id; W.group.add(cb); W.cabins.push(cb); if (c.id === 'hale_cabin') W.hale = cb; } }
  else { const hale = makeCabin(tex); hale.position.set(HALE.x, height(HALE.x, HALE.z), HALE.z); hale.rotation.y = -0.9; W.group.add(hale); W.cabins.push(hale); W.hale = hale; }
  if (!M) for (const [b, d, rot] of [[176, 1330, 0.4], [196, 1460, -0.3]]) { const p = polar(b, d); const ri = roadInfo(p.x, p.z); const c = makeCabin(tex); const off = 16; c.position.set(p.x + off, height(p.x + off, p.z), p.z); c.rotation.y = rot; W.group.add(c); W.cabins.push(c); }
  // ---------------- LIGHTS ----------------
  W.hemi = new THREE.HemisphereLight(0x2a3858, 0x0a0c10, 0.35); scene.add(W.hemi);
  W.sun = new THREE.DirectionalLight(0x9fb4e0, 0.5); W.sun.castShadow = Q.shadows;
  W.sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); const sc2 = W.sun.shadow.camera; sc2.left = -45; sc2.right = 45; sc2.top = 45; sc2.bottom = -45; sc2.near = 1; sc2.far = 400;
  W.sun.shadow.bias = -0.0004; W.sun.shadow.normalBias = 0.04; scene.add(W.sun); scene.add(W.sun.target);
  scene.fog = new THREE.FogExp2(0x0b1018, 0.00022);
  W.time = 0;
  if (M) { // MyChief CC0 skies (Poly Haven) as background + PMREM environment
    const L2 = new THREE.TextureLoader(); const pm = new THREE.PMREMGenerator(renderer); W.skies = {};
    for (const nm of ['night', 'morning']) { const t = L2.load(M.base + `mychief-sky-${nm}-${phone ? '2048x1024' : '4096x2048'}.jpg`); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; W.skies[nm] = { bg: t, env: null };
      new RGBELoader().load(M.base + `mychief-sky-${nm}-env-1k.hdr`, h => { W.skies[nm].env = pm.fromEquirectangular(h).texture; h.dispose(); if (W.preset === nm) scene.environment = W.skies[nm].env; }); }
    W.sky.visible = false;
  }
  W.setPreset = (name) => setPreset(W, scene, renderer, name);
  W.setPreset('night');
  W.update = (dt, cam) => {
    W.time += dt; W.sky.position.copy(cam.position); W.sky.material.uniforms.uTime.value = W.time;
    W.lake.material.uniforms.uTime.value = W.time;
    // keep the shadow frustum around the camera (tower / intro truck)
    const c = cam.position; W.sun.target.position.set(c.x, c.y - 10, c.z); W.sun.position.copy(W.sun.target.position).addScaledVector(W.lightDir, 200);
  };
  W.raycastTargets = [W.terrain];
  return W;
}

function setPreset(W, scene, renderer, name) {
  const U = W.sky.material.uniforms; W.preset = name;
  if (name === 'morning') {
    W.lightDir = new THREE.Vector3(polar(98, 1).x, 0.16, polar(98, 1).z).normalize(); // low sun from the east
    U.uSun.value.copy(W.lightDir); U.uMoon.value.set(0.3, 0.2, 0.9).normalize(); U.uNight.value = 0;
    W.sun.color.set(0xffc58a); W.sun.intensity = 3.2; W.hemi.color.set(0xa8c0dc); W.hemi.groundColor.set(0x4a3a28); W.hemi.intensity = 0.9;
    scene.fog.color.set(0xc4b8a8); scene.fog.density = 0.00032; renderer.toneMappingExposure = 0.95;
    W.lake.material.uniforms.uNight.value = 0; W.lake.material.uniforms.uSky.value.set(0x8aa4c4); W.lake.material.uniforms.uMoon.value.copy(W.lightDir);
    W.ring.material.color.set(0x5a6670);
  } else {
    W.lightDir = new THREE.Vector3(polar(235, 1).x, 0.55, polar(235, 1).z).normalize(); // moon in the SW
    U.uMoon.value.copy(W.lightDir); U.uSun.value.set(0, -1, 0); U.uNight.value = 1;
    W.sun.color.set(0x8ea6dc); W.sun.intensity = 0.55; W.hemi.color.set(0x24324e); W.hemi.groundColor.set(0x07080b); W.hemi.intensity = 0.42;
    scene.fog.color.set(0x0c121c); scene.fog.density = 0.00020; renderer.toneMappingExposure = 1.15;
    W.lake.material.uniforms.uNight.value = 1; W.lake.material.uniforms.uSky.value.set(0x0e1626); W.lake.material.uniforms.uMoon.value.copy(W.lightDir);
    W.ring.material.color.set(0x141a20);
  }
  if (W.map) { // light from the sky image's moon / sun (bearing ~126 deg), background + env from the skies
    const el = name === 'morning' ? 0.13 : 0.30; const b = polar(W.skyBearing ?? 126, 1);
    W.lightDir = new THREE.Vector3(b.x * Math.cos(el), Math.sin(el), b.z * Math.cos(el)).normalize();
    const S = W.skies[name]; scene.background = S.bg; scene.backgroundRotation.set(0, W.skyRot || 0, 0); scene.environmentRotation.set(0, W.skyRot || 0, 0);
    if (S.env) scene.environment = S.env; scene.environmentIntensity = name === 'morning' ? 0.6 : 0.25; scene.backgroundIntensity = name === 'morning' ? 1.0 : 0.9;
    scene.fog.density = name === 'morning' ? 1 / 3200 : 1 / 5000; if (name === 'morning') { scene.fog.color.set(0xd6c3a6); W.sun.color.set(0xffc27a); W.sun.intensity = 2.5; W.hemi.color.set(0xb4c8e0); W.hemi.groundColor.set(0x5a4630); W.hemi.intensity = 0.75; renderer.toneMappingExposure = 1.0; }
    W.lake.material.uniforms.uMoon.value.copy(W.lightDir);
  }
  U.uFog.value.copy(scene.fog.color);
}
