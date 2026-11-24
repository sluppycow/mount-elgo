// MOUNT ELGO - game entry: boot, menus, settings, input, morning intro, night tutorial, 5 nights of watching.
import * as THREE from 'three';
import { loadMap } from './map.js';
import { buildWorld, QUALITY } from './world.js';
import { buildTower, CAB } from './tower.js';
import { TOWER, polar, bearingOf, height, HALE } from './geo.js';
import { ViewModel } from './viewmodel.js';
import { AudioSys } from './audio.js';
import { loadHandAsset } from './hands.js';
import { Input, isPhone } from './game/input.js';
import { Intro } from './game/intro.js';
import { EventDirector, FireDirector, Wildfire } from './game/events.js';
import { Skinwalker } from './skinwalker.js';
import { SFX } from './game/sfx.js';
import { NearFire, HoseStream } from './game/nearfire.js';
import { HoseVM } from './game/hose.js';
import { SHIFTS, SHIFT_START, SHIFT_END, CLOCK_RATE, MOODS, NIGHT_MOODS, SECRETS } from './game/shifts.js';
import { buildGround } from './game/ground.js';

const $ = (id) => document.getElementById(id);
const safe = (f) => { try { const r = f(); if (r && r.catch) r.catch(e => console.log('[safe]', e)); } catch (e) { console.log('[safe]', e && e.message); } };
const show = (id, on = true) => $(id).classList.toggle('hidden', !on);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PHONE = isPhone(); const G_baseExp = { v: 1.15 };
window.__errors = []; addEventListener('error', e => window.__errors.push(String(e.message)));

// ---------------- settings ----------------
const DEF = { quality: 'low', sens: 1, vol: 0.8, fov: 70, touch: 'auto', invert: false, subs: true };
const S = Object.assign({}, DEF, JSON.parse(localStorage.getItem('elgo.settings') || '{}'));
const saveS = () => localStorage.setItem('elgo.settings', JSON.stringify(S));
const qs = new URLSearchParams(location.search); if (qs.get('q')) S.quality = qs.get('q');

// ---------------- data ----------------
const J = async (u) => { try { const r = await fetch(u); if (!r.ok) throw 0; return await r.json(); } catch (e) { return null; } };
const status = (t) => { $('loadMsg').textContent = t; };
status('Loading the mountain...');
const [D_INTRO, D_TUT, D_EV, D_LORE] = await Promise.all(['intro', 'tutorial', 'events', 'lore-ui'].map(n => J(`assets/data/mychief-${n}.json`)));
const M = qs.get('map') === '0' ? null : await loadMap();
status('Building the forest...');

// ---------------- renderer / scene ----------------
const canvas = $('c');
const Q = QUALITY[S.quality] || QUALITY.low;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: S.quality !== 'low', powerPreference: 'high-performance', preserveDrawingBuffer: !!qs.get('shots') });
const DPR = Math.min(window.devicePixelRatio || 1, PHONE ? 1.5 : 2); renderer.setPixelRatio(DPR * Q.pixel);
renderer.setSize(innerWidth, innerHeight); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; /* only the lights that cast are paid for: low uses shadows just for the truck cab */ renderer.autoClear = false;
const scene = new THREE.Scene();
const W = buildWorld(scene, renderer, S.quality, { phone: PHONE });
const T = buildTower(scene, W.tex, W.Q);
const camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 0.05, Q.far || 9000); scene.add(camera);
const audio = new AudioSys(); await audio.init();
status('Waking up the hands...');
await loadHandAsset('./assets/models/hand_r.glb');
const vm = new ViewModel(audio);
const torchW = new THREE.SpotLight(0xfff1dc, 0, 45, 0.36, 0.55, 1.4); torchW.castShadow = false; scene.add(torchW); scene.add(torchW.target);
{ const sp = W.setPreset; W.setPreset = (n) => { sp(n); G_baseExp.v = renderer.toneMappingExposure; }; }
function hideVM() { vm.mode = 'none'; vm.hidden = true; vm.clip = null; vm.torch.visible = false; vm.torchOn = false; vm.torchAnim = null; vm.pendingMode = null; vm.ads = false; }
hideVM();
T.group.updateMatrixWorld(true); T.target.getWorldPosition(T.targetPos); // the plate's true world position
const F = TOWER.floor, H = CAB.H, B = CAB.B, EYE = TOWER.eye;

// ---------------- game state ----------------
const G = window.G = {
  scene, camera, vm, audio, tower: T, world: W, state: 'boot', time: 0, night: 1, clockMin: 21 * 60, clockHour: 21, radioClickT: -9,
  cabCenter: V(0, F + 1.6, 0), doorPos: V(0, F + 1.1, H), halePos: W.hale ? W.hale.position.clone() : V(HALE.x, height(HALE.x, HALE.z), HALE.z),
  has: { bino: false, torch: false, gun: true, key: false, hose: false }, logs: [], notesRead: new Set(),
};
const P = { x: -0.4, z: 0.6, y: TOWER.floor, mode: 'cab', s: 0, stairDir: 1, yaw: 0, pitch: 0, bob: 0, stepT: 0 };
let bino = false, binoHold = false, aimHeld = false, scareT = 0, floodHeld = false;
G.log = (s) => { G.logs.push(s); if (G.logs.length > 200) G.logs.shift(); };
G.sound = (id, pos, vol = 1, o = {}) => { if (!audio.has(id)) return; audio.play(id, Object.assign({ vol, pos: pos || undefined }, o)); };
G.scare = (k = 1) => { scareT = Math.max(scareT, 6 * k); };
G.cold = () => {};
G.inView = (p, tolDeg) => { const d = p.clone().sub(camera.position); const L = d.length(); if (L < 0.01) return false; const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); return f.dot(d) / L > Math.cos(tolDeg * Math.PI / 180); };

// ---------------- v2: the ground, the thing in the trees, the hose, the generator ----------------
let nearFire = null, hoseOn = false, sprayLoop = null, genHum = null, pourL = null, holdTgt = null, panicT = 0, cut = null, hissT = 0, hbT = 0, pullT = 0, swSeen = false;
G.power = true; G.radioDead = false; G.pending = new Set(); G.gen = { running: true, fuel: 1, hasCan: false, pulls: 0 };
const GR = buildGround(scene, T, { onSecret: (d) => openSecret(d) });
const SW = new Skinwalker(scene, {
  sound: (id, p, v, o) => G.sound(id, p, v, o), synth: (n, p, ...a) => { if (SFX[n]) SFX[n](audio, p, ...a); }, step: (p, k) => SFX.thud(audio, p, 0.25 + 0.5 * k), growl: (p) => SFX.growl(audio, p, 1, 1.6), caught: () => onCaught(),
  scared: () => { shiftStats.scares++; G.toast('It ran. MOVE!', 2.5); panicT = Math.max(panicT, 8); },
  charge: () => { panicT = Math.max(panicT, 12); G.toast('IT\u2019S COMING \u2014 SHOOT IT!', 2.5); },
  spotted: () => { panicT = Math.max(panicT, 6); if (!swSeen) { swSeen = true; setTimeout(() => thought('Something is out there. Pacing me. That is not a deer.'), 900); } },
});
const hoseVM = new HoseVM(vm); const stream = new HoseStream(scene);
// night lighting for the hands: cool moon rim from behind, warm cab-lantern fill
vm.rim = new THREE.DirectionalLight(0x9db4e6, 0); vm.rim.position.set(0.6, 1.2, -1.6); vm.scene.add(vm.rim);
vm.warm = new THREE.PointLight(0xffa860, 0, 3.2, 2); vm.warm.position.set(-0.5, 0.15, 0.25); vm.scene.add(vm.warm);
T.hasKey = () => !!G.has.key;
T.onTakeKey = () => { G.has.key = true; G.toast('Took the Stairs Key.', 2.5); };
T.onGate = () => {};
const takeHose = () => { G.has.hose = true; GR.hosePack.visible = false; $('tHose').classList.remove('hidden'); audio.play('magPouch', { vol: 0.8 }); hoseEquip(); G.toast((PHONE || input.touchOn) ? 'Fire hose: hold FIRE to spray. HOSE / 9MM to switch.' : 'Fire hose: hold left click to spray. 1 / 3 to switch.', 4); };
const genIt = { id: 'gen', pos: GR.genWorld.clone(), r: 2.6, avail: () => P.mode === 'ground',
  label: () => G.gen.running ? 'Generator (running)' : (!G.gen.hasCan && G.gen.fuel < 1) ? 'Pick up the red fuel can' : G.gen.fuel < 1 ? 'Hold to refuel the generator' : 'Pull-start the generator',
  use: () => G.gen.running ? 'INSPECT' : G.gen.fuel < 1 ? 'FUEL' : 'START',
  canHold: () => !G.gen.running && G.gen.hasCan && G.gen.fuel < 1,
  holdFn: (dt) => { G.gen.fuel = Math.min(1, G.gen.fuel + dt / 3.2); if (!pourL) pourL = SFX.pourLoop(audio, GR.genWorld); progress(G.gen.fuel, 'Refueling... ' + Math.round(G.gen.fuel * 100) + '%');
    if (G.gen.fuel >= 1) { genIt.holdEnd(); GR.can.visible = true; G.gen.hasCan = false; G.toast('Tank full. Pull the starter (' + (PHONE ? 'START' : 'E') + ').', 3); } },
  holdEnd: () => { if (pourL) { pourL.stop(); pourL = null; } progress(null); },
  press: () => {
    if (G.gen.running) { G.toast('It\u2019s running. Fuel gauge: full.'); return; }
    if (!G.gen.hasCan && G.gen.fuel < 1) { G.gen.hasCan = true; GR.can.visible = false; audio.play('magPouch', { vol: 0.7 }); G.toast('Got the fuel can. Hold ' + (PHONE ? 'FUEL' : 'E') + ' to pour.', 3); return; }
    if (G.gen.fuel < 1) return; if (pullT > 0) return; pullT = 1.1; G.gen.pulls++;
    const ok = G.gen.pulls >= 3 || (G.gen.pulls === 2 && Math.random() < 0.6); SFX.pull(audio, GR.genWorld, ok);
    if (ok) setTimeout(() => { if (!G.gen.running) restorePower(); }, 1300); else G.toast('It sputters and dies. Pull again.', 2);
  } };
const hoseIt = { id: 'hose', pos: GR.cachePos.clone().add(V(0, 0.8, 0)), r: 2.6, avail: () => P.mode === 'ground' && !G.has.hose, label: () => 'Take the fire hose pack', press: takeHose };
const USE_LABEL = { radio: 'RADIO', key: 'KEY', hose: 'HOSE', secret: 'INSPECT', door: 'DOOR', drawer: 'USE', bino: 'TAKE', flood: 'FLOOD' };
const useLabel = (t) => { if (!t) return 'USE'; if (t.use) return t.use(); if (t.id === 'gate') return T.gate.locked ? (G.has.key ? 'UNLOCK' : 'GATE') : 'GATE'; if (/^note/.test(t.id)) return 'READ'; return USE_LABEL[t.id] || 'USE'; };
// breath mist on cold nights outside the cab
const mistTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const mists = [];
function breathMist(gain) {
  if (G.state !== 'play' && G.state !== 'tutorial') return; const outside = P.mode !== 'cab' || Math.max(Math.abs(P.x), Math.abs(P.z)) > H; if (!outside || mists.length > 6) return;
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, transparent: true, depthWrite: false, opacity: 0, color: 0xc8d2e0, fog: true }));
  s.position.copy(camera.position).addScaledVector(f, 0.32).add(V(0, -0.12, 0)); s.scale.setScalar(0.12); scene.add(s); mists.push({ s, t: 0, v: f.clone().multiplyScalar(0.35).add(V(0, 0.08, 0)), a: Math.min(0.32, 0.12 + gain * 0.4) });
}
audio.onExhale = (delay, gain) => setTimeout(() => breathMist(gain || 0.4), Math.max(0, delay || 0) * 1000);
function mistUpdate(dt) { for (let i = mists.length - 1; i >= 0; i--) { const m = mists[i]; m.t += dt; m.s.position.addScaledVector(m.v, dt); m.s.scale.setScalar(0.12 + m.t * 0.55); m.s.material.opacity = m.a * Math.sin(Math.min(1, m.t / 1.6) * Math.PI); if (m.t > 1.6) { scene.remove(m.s); m.s.material.dispose(); mists.splice(i, 1); } } }
// tutorial step 10: power + the Stairs Key (added to the MyChief tutorial)
if (D_TUT && D_TUT.steps && !D_TUT.steps.some(s => s.id === 's10')) D_TUT.steps.push({ id: 's10', name: 'Power & Stairs Key', objective: 'Take the Stairs Key from the hook by the door.',
  prompt_pc: 'Look at the key board left of the door and press E', prompt_phone: 'Look at the key board left of the door and tap KEY',
  boss_lines: [{ text: 'One more thing. That tower runs off a generator in the shed at the base of the stairs.', duration_s: 4.6 }, { text: 'If you lose power, the lights, the radio and the floodlight all go with it.', duration_s: 4.4 },
    { text: 'The stairs are locked. Stairs Key is on the hook by the door. Unlock the gate, go down, fill the generator from the red can and pull it over.', duration_s: 7 },
    { text: 'And be quick about it. You don\u2019t want anything catching you out there.', duration_s: 4.4 }],
  step_complete_line: { text: 'Good. Keep that key on you. That\u2019s it for training. Your shift runs until two. Elgo, Base out.', duration_s: 5.2 } });


// ---------------- radio: beep + typed text, NO spoken voice ----------------
const radioQ = []; let radioCur = null;
function tone(t0, f0, f1, dur, vol, type = 'square') {
  const c = audio.ctx; if (!c) return; const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t0 + dur);
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.005); g.gain.setValueAtTime(vol, t0 + dur - 0.01); g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.7; o.connect(bp).connect(g).connect(audio.voice); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noiseBuf() { const c = audio.ctx; if (G._nb) return G._nb; const b = c.createBuffer(1, c.sampleRate, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return (G._nb = b); }
function squelch(t0, dur, vol) { const c = audio.ctx; const s = c.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.6; const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(vol, t0 + 0.02); g.gain.setValueAtTime(vol, t0 + dur - 0.06); g.gain.linearRampToValueAtTime(0.0001, t0 + dur); s.connect(bp).connect(g).connect(audio.voice); s.start(t0); s.stop(t0 + dur + 0.05); }
// MyChief radio pack (OGG + MP3 fallback); the old synth tones stay as a fallback if a sample is not decoded yet
const RS = (id) => audio.buffers.has('radio-' + id);
function radioPreload() { for (const k of ['in-start', 'in-end', 'player-ptt', 'text-blip', 'static-bed']) audio.load('radio-' + k); }
function radioKeyIn(player) { const c = audio.ctx; if (!c) return; radioPreload();
  if (player && RS('player-ptt')) { audio.play('radio-player-ptt', { cat: 'voice' }); return; }
  if (!player && RS('in-start')) { audio.play('radio-in-start', { cat: 'voice' }); return; }
  const t = c.currentTime + 0.01;
  if (player) { tone(t, 1250, 1250, 0.07, 0.10); squelch(t, 0.09, 0.05); } else { squelch(t, 0.16, 0.10); tone(t + 0.12, 1750, 1750, 0.06, 0.09); tone(t + 0.19, 2150, 2150, 0.07, 0.09); } }
function radioKeyOut(player) { const c = audio.ctx; if (!c) return;
  if (!player && RS('in-end')) { audio.play('radio-in-end', { cat: 'voice' }); return; }
  if (player && RS('player-ptt')) { audio.play('radio-player-ptt', { cat: 'voice', rate: 0.82, vol: 0.8 }); return; } // un-key: same click, lower
  const t = c.currentTime + 0.01;
  if (player) { tone(t, 1000, 820, 0.12, 0.09); } else { tone(t, 2300, 2300, 0.07, 0.09); tone(t + 0.08, 1600, 1600, 0.11, 0.09); } squelch(t + 0.1, 0.2, 0.09); }
let bed = null;
function staticBed(on, player) { const c = audio.ctx; if (!c) return;
  if (RS('static-bed') || bed?.sample) { if (on && !bed) { audio.loop('radioBed', 'radio-static-bed', player ? 0.5 : 1, 'voice', 0.15); bed = { sample: true }; } else if (!on && bed) { audio.stopLoop('radioBed', 0.25); bed = null; } return; }
  if (on && !bed) { const s = c.createBufferSource(); s.buffer = noiseBuf(); s.loop = true; const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = player ? 1500 : 2200; bp.Q.value = 0.9; const g = c.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(player ? 0.008 : 0.016, c.currentTime, 0.05); s.connect(bp).connect(g).connect(audio.voice); s.start(); bed = { s, g }; }
  else if (!on && bed) { const b = bed; bed = null; b.g.gain.setTargetAtTime(0.0001, c.currentTime, 0.04); setTimeout(() => { try { b.s.stop(); } catch (e) {} }, 300); } }
function blip(player) { const c = audio.ctx; if (!c) return; if (RS('text-blip')) { audio.play('radio-text-blip', { cat: 'voice', rate: player ? 0.8 : 0.95 + Math.random() * 0.1 }); return; } const t = c.currentTime; tone(t, player ? 900 : 1500 + Math.random() * 300, player ? 900 : 1500, 0.018, 0.022, 'triangle'); }
G.radioSay = (text, o = {}) => { radioQ.push({ text, speaker: o.speaker || 'DISPATCH \u2014 D. MARSH', player: !!o.player, thought: !!o.thought, dur: Math.max(o.dur || 0, 1.6 + text.length * 0.055), onDone: o.onDone }); };
G.radioBusy = () => !!radioCur || radioQ.length > 0;
function radioUpdate(dt) {
  if (!radioCur && radioQ.length) { radioCur = radioQ.shift(); radioCur.t = 0; radioCur.shown = 0; if (!radioCur.thought) { radioKeyIn(radioCur.player); staticBed(true, radioCur.player); } G.radioClickT = G.time; }
  const r = radioCur; if (!r) return;
  r.t += dt * (window.RADIOFAST || 1); const startT = 0.28, rate = 55; // chars per second
  const n = Math.min(r.text.length, Math.max(0, Math.floor((r.t - startT) * rate)));
  if (n > r.shown) { if (Math.floor(n / 3) > Math.floor(r.shown / 3)) blip(r.player); r.shown = n; }
  $('subs').classList.toggle('panic', !!r.thought && panicT > 0); $('subs').innerHTML = `<b>${r.speaker}</b>${esc(r.text.slice(0, n))}<span class="caret">${n < r.text.length ? '\u258d' : ''}</span>`; $('subs').style.opacity = 1;
  if (r.t > r.dur && !r.out) { r.out = true; if (!r.thought) { radioKeyOut(r.player); staticBed(false); } }
  if (r.t > r.dur + 0.45) { radioCur = null; if (!radioQ.length) $('subs').style.opacity = 0; r.onDone && r.onDone(); }
}
const esc = (s) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
G.subtitle = (who, text) => { if (!who) { radioQ.length = 0; radioCur = null; staticBed(false); $('subs').style.opacity = 0; } };
let toastT = 0; G.toast = (t, d = 3) => { $('toast').textContent = t; $('toast').style.opacity = 1; toastT = d; };
G.fadeTo = (v, s = 1.2) => { const f = $('fade'); f.style.transition = `opacity ${s}s`; f.style.opacity = v; };

// ---------------- input ----------------
const input = new Input(canvas, S);
input.onPause = (fromLock) => { if (G.state === 'play' || G.state === 'tutorial' || G.state === 'intro') pause(); };
// tower callbacks
T.onSound = (id, pos) => { if (id === 'unlock') { SFX.unlock(audio, pos); return; } if (id === 'keys') { SFX.keys(audio); return; } const map = { gate: 'tower-creak-2', drawer: 'magPouch', pickup: 'magPouch', paper: 'slideGrab' }; const s = map[id] || id; if (audio.has(s)) audio.play(s, { pos, vol: 0.8 }); };
T.onMessage = (m) => G.toast(m);
T.onTakeTorch = () => { G.has.torch = true; G.toast(PHONE ? 'Flashlight: tap LIGHT' : 'Flashlight: press 2'); };
T.onTakeBino = () => { G.has.bino = true; G.toast(PHONE ? 'Binoculars: tap BINO' : 'Binoculars: hold right mouse or press B'); };
T.onRadio = () => radioPress();
T.onNote = (i) => { const n = D_LORE && D_LORE.found_notes[i % D_LORE.found_notes.length]; if (!n) return; G.notesRead.add(n.id); $('noteText').innerHTML = `<h3>${esc(n.title)}</h3><p class="small">${esc(n.author || '')}</p><p>${esc(n.text)}</p>`; show('note'); G.noteOpen = true; input.setEnabled(false); };
$('noteClose').onclick = () => { show('note', false); G.noteOpen = false; input.setEnabled(true); input.lock(); };

// ---------------- vm events ----------------
let tut = null; let shots = 0;
vm.onEvent = (n) => {
  if (n === 'fire') { shots++; shoot(); audio.duckBreath(); }
  if (n === 'reloadDone' && tut) tut.flags.reload = true;
  if (n === 'torch' && tut) { if (vm.torchOn) tut.flags.torchOn = true; else if (tut.flags.torchOn) tut.flags.torchOff = true; }
  if (n === 'magDropped' || n === 'casing') {}
};
const ray = new THREE.Raycaster();
function shoot() {
  ray.setFromCamera(new THREE.Vector2(0, 0), camera); ray.far = 1500;
  const th = ray.intersectObjects([T.target, T.hitProxy], false)[0]; const list = [...director.targets(), W.terrain]; let hit = ray.intersectObjects(list, false)[0]; if (th && (!hit || hit.object === W.terrain || th.distance < hit.distance)) hit = th;
  const sh = SW.model.visible && SW.state !== 'bolt' ? ray.intersectObjects(SW.meshes, false)[0] : null; if (sh && (!hit || sh.distance < hit.distance + 0.5)) { if (SW.scare()) G.toast('HIT — it shrieks and runs!', 2.5); return; }
  if (!hit) return; if (hit.object === T.target || hit.object === T.hitProxy) { if (tut) tut.flags.hit = true; if (tut && tut.step && tut.step.id === 's8' && !tut.cutStarted) { tut.cutStarted = true; setTimeout(() => startCutscene(() => { if (tut) tut.flags.cutDone = true; }), 650); } G.toast('TARGET HIT!', 1.5); T.onTargetHit && T.onTargetHit(hit.point); audio.play('gateRattle', { vol: 0.8 }); audio.play('bulletHit', { vol: 0.9 }); return; }
  else if (director.shotAt(hit.object)) {}
  // the shot echoes down the valley
  audio.play('far-branch-snap-2', { pos: hit.point, vol: 0.2, ref: 30, delay: Math.min(1.5, hit.distance / 340) });
}

// ---------------- directors ----------------
const director = new EventDirector(G, D_EV || { events: [] }, M && M.json);
const fires = new FireDirector(G, M && M.json);
let fireTimes = [];
function radioPress() {
  G.radioClickT = G.time; if (G.radioDead || !G.power) { radioDeadPress(); return; } const rep = fires.report();
  if (tut && tut.step && tut.step.id === 's5') { if (tut.flags.plume) { tut.flags.radio = true; const b = Math.round(bearingOf(tut.fire.pos.x, tut.fire.pos.z)); G.radioSay(`Kettle Base, Elgo Tower. Smoke on the east ridge, bearing ${String(b).padStart(3, '0')}.`, { speaker: 'YOU', player: true }); } else G.toast('Find the smoke in the binoculars first.'); return; }
  if (rep) { G.radioSay(`Kettle Base, Elgo Tower. Smoke, bearing ${String(rep.bearing).padStart(3, '0')}, about ${rep.km} kilometres.`, { speaker: 'YOU', player: true }); G.radioSay(`Copy, Elgo. Bearing ${String(rep.bearing).padStart(3, '0')}. Crew is rolling. Good eyes.`, {}); return; }
  if (G.pendingCheckin) { G.pendingCheckin = false; G.radioSay('Elgo Tower. Copy, Base. All quiet up here.', { speaker: 'YOU', player: true }); return; }
  if (fires.fires.some(f => !f.reported)) { G.radioSay('Kettle Base, Elgo Tower. Radio check.', { speaker: 'YOU', player: true }); G.radioSay('Copy, Elgo. If you have smoke, get it in the binoculars and give me a bearing.', {}); return; }
  G.radioSay('Kettle Base, Elgo Tower. Radio check.', { speaker: 'YOU', player: true }); G.radioSay('Loud and clear, Elgo.', {});
}

// ---------------- player movement: cab + balcony, the exterior stairs, and the ground ----------------
const obstHit = (x, z) => { for (const o of T.obstacles) { if (o.type === 'circle' && Math.hypot(x - o.x, z - o.z) < o.r + 0.25) return true; if (o.type === 'rect' && x > o.x0 - 0.22 && x < o.x1 + 0.22 && z > o.z0 - 0.22 && z < o.z1 + 0.22) return true; } return false; };
let hatchMsgT = 0;
function walkable(x, z) {
  const m = Math.max(Math.abs(x), Math.abs(z));
  if (m <= H - 0.25) return !obstHit(x, z);
  if (Math.abs(T.door.a) > 1.0 && Math.abs(x) < 0.34 && z > H - 0.4 && z < H + 0.45) return true;
  if (m >= H + 0.2 && m <= H + B - 0.22) { const h = T.hatch; if (x > h.x0 - 0.1 && x < h.x1 + 0.1 && z > h.z0 - 0.1 && z < h.z1 + 0.1) return false; return true; }
  return false;
}
const ST = T.stairs;
const gyH = (x, z) => height(x, z) + (Math.hypot(x, z) < 15 ? 0.07 : 0);
function stairAt(s) { s = Math.max(0, Math.min(ST.L, s)); let i = 1; while (i < ST.cum.length - 1 && ST.cum[i] < s) i++; const a = ST.pts[i - 1], b = ST.pts[i]; const f = (s - ST.cum[i - 1]) / Math.max(1e-6, ST.cum[i] - ST.cum[i - 1]); return { p: a.clone().lerp(b, f), d: b.clone().sub(a).setY(0).normalize() }; }
function groundOK(x, z) {
  if (Math.hypot(x, z) > 175) return false; for (const o of GR.obstacles) if (Math.hypot(x - o.x, z - o.z) < o.r + 0.28) return false;
  const r = GR.stairRect; if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) return false;
  if (nearFire && !nearFire.out && Math.hypot(x - nearFire.pos.x, z - nearFire.pos.z) < nearFire.R * (0.3 + 0.55 * nearFire.hp)) { if (hatchMsgT <= 0) { G.toast('Too hot to get closer. Use the hose.'); hatchMsgT = 3; } return false; }
  return true;
}
function onReachGround() { if (!G.groundOnce) { G.groundOnce = true; G.toast('On the ground. Stay on the trail markers.', 3); } SW.cool = Math.min(SW.cool, G.state === 'play' ? 5 + Math.random() * 5 : 99); }
function movePlayer(dt, inp) {
  const run = inp.sprint, gnd = P.mode === 'ground'; const sp = run ? (gnd ? 3.4 : 2.6) : (gnd ? 1.75 : 1.55);
  const mx = inp.move.x, mz = inp.move.z; const Lm = Math.hypot(mx, mz); if (Lm < 0.05) return 0;
  const s = Math.sin(P.yaw), c = Math.cos(P.yaw); const dx = (mx * c + mz * s) * sp * dt, dz = (-mx * s + mz * c) * sp * dt;
  const ox = P.x, oz = P.z, oy = P.y;
  if (P.mode === 'cab') {
    const h = T.hatch; const nx = P.x + dx, nz = P.z + dz;
    if (T.gate.open && T.gate.a > 1.0 && nx > h.x0 && nx < h.x1 && nz < h.z1 + 0.5 && nz > h.z1 - 0.6 && dz < 0) { P.mode = 'stairs'; P.stairDir = 1; P.s = Math.max(0, ST.pts[0].z - nz); }
    else if (walkable(nx, nz)) { P.x = nx; P.z = nz; } else if (walkable(nx, P.z)) P.x = nx; else if (walkable(P.x, nz)) P.z = nz;
    else if (nx > h.x0 - 0.3 && nx < h.x1 + 0.3 && nz > h.z0 - 0.3 && nz < h.z1 + 0.7 && hatchMsgT <= 0) { G.toast(T.gate.locked ? (G.has.key ? 'Unlock the stair gate first (' + (PHONE ? 'UNLOCK' : 'E') + ').' : 'The stair gate is locked. The Stairs Key hangs on the hook by the door.') : 'Open the stair gate (' + (PHONE ? 'USE' : 'E') + ').'); hatchMsgT = 3; }
    P.y = F;
  } else if (P.mode === 'stairs') {
    const fwd = -mz; const ds = fwd * sp * dt * (P.stairDir || 1) * 0.85; P.s += ds;
    if (P.s < 0) { P.mode = 'cab'; const t0 = ST.pts[0]; P.x = t0.x; P.z = t0.z + 0.05; P.y = F; onReachCab(); }
    else if (P.s > ST.L) { P.mode = 'ground'; const b = ST.bottom; P.x = b.x; P.z = b.z - 0.2; P.y = gyH(P.x, P.z); onReachGround(); }
    else { const a = stairAt(P.s); P.x = a.p.x; P.z = a.p.z; P.y = a.p.y;
      if (fwd > 0.2) { const dir = a.d.clone().multiplyScalar(Math.sign(ds) || 1); const want = Math.atan2(-dir.x, -dir.z); let dy = want - P.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); P.yaw += dy * Math.min(1, dt * 3.2); } }
  } else {
    const nx = P.x + dx, nz = P.z + dz; const b = ST.bottom;
    if (Math.hypot(nx - b.x, nz - b.z) < 0.8 && dz > 0) { P.mode = 'stairs'; P.stairDir = -1; P.s = ST.L - 0.02; const a = stairAt(P.s); P.x = a.p.x; P.z = a.p.z; P.y = a.p.y; }
    else { if (groundOK(nx, nz)) { P.x = nx; P.z = nz; } else if (groundOK(nx, P.z)) P.x = nx; else if (groundOK(P.x, nz)) P.z = nz; P.y = gyH(P.x, P.z); }
  }
  const moved = Math.hypot(P.x - ox, P.z - oz, (P.y - oy) * 0.5); P.stepT += moved;
  if (P.stepT > (P.mode === 'ground' ? (run ? 0.85 : 0.7) : 0.55)) { P.stepT = 0;
    if (P.mode === 'ground') SFX.crunch(audio, { x: P.x, y: P.y + 0.05, z: P.z }, run ? 0.6 : 0.42);
    else { const id = 'footstep-wood-' + (1 + Math.floor(Math.random() * 8)); audio.play(id, { vol: P.mode === 'stairs' ? 0.65 : 0.5, pos: { x: P.x, y: P.y + 0.05, z: P.z }, ref: 3, rate: P.mode === 'stairs' ? 0.92 : 1 }); } }
  return moved;
}
function onReachCab() { if (G.pending && G.pending.has('return') && !G.pending.has('fire') && !G.pending.has('power')) finishReturn(); }

// ---------------- binoculars ----------------
function setBino(on) {
  if (on && !G.has.bino) { G.toast(PHONE ? 'The binoculars are on the desk by the radio.' : 'The binoculars are on the desk by the radio.'); return; }
  if (on === bino) return; bino = on; $('bino').classList.toggle('on', on); vm.setADS(false);
  audio.play('slideGrab', { vol: 0.25 });
}

// ---------------- tutorial ----------------
class Tutorial {
  constructor(data) { this.steps = data.steps; this.i = -1; this.flags = {}; this.done = false; this.next(); }
  say(lines, then) { lines.forEach((l, k) => G.radioSay(l.text, { dur: l.duration_s, onDone: k === lines.length - 1 ? then : null })); }
  next() {
    this.i++; this.flags = {}; this.acc = { look: 0, move: 0, bino: 0, flood: 0, ads: 0 }; this.ready = false;
    if (this.i >= this.steps.length) { this.done = true; $('objective').textContent = ''; startNight(1, true); return; }
    const s = this.step = this.steps[this.i];
    if (s.id === 's5') { const z = M && M.json.smoke_wildfire_spawn_zones.find(z => /tutorial/.test(z.id)); const p = z ? V(z.center.x, z.center.y, z.center.z) : (() => { const q = polar(96, 2290); return V(q.x, height(q.x, q.z), q.z); })(); this.fire = new Wildfire(scene, p, { id: 'tutorial', scale: 1.2 }); }
    if (s.id === 's6') { /* pistol is in the cab with you */ }
    this.say(s.boss_lines, () => { this.ready = true; });
    this.ready = true;
    this.updatePrompt();
  }
  updatePrompt() {
    const s = this.step; if (!s) return; let p = PHONE || input.touchOn ? s.prompt_phone : s.prompt_pc;
    if ((s.id === 's2' || s.id === 's5') && !G.has.bino) p = 'Pick up the binoculars on the desk (' + (PHONE ? 'USE' : 'E') + ')';
    if (s.id === 's4' && !G.has.torch) p = 'Take the flashlight from the desk drawer (' + (PHONE ? 'USE' : 'E') + ')';
    if (s.id === 's5') p = PHONE || input.touchOn ? 'Look at the radio on the desk and tap RADIO (the USE button)' : 'Look at the radio on the desk and press E';
    if (s.id === 's8') p = 'Look out the east window or step onto the balcony: shoot the lit practice target on the tall mast. ' + (PHONE || input.touchOn ? 'Tap FIRE' : 'Left click');
    $('objective').innerHTML = `<b>${esc(s.name)}</b><br>${esc(s.objective)}<br><span class="small">${esc(p)}</span>`;
  }
  update(dt, ctx) {
    if (this.done || !this.step) return; const f = this.flags, a = this.acc, s = this.step; this.updatePrompt();
    a.look += Math.abs(ctx.dyaw) * 180 / Math.PI; a.move += ctx.moved;
    if (bino) a.bino += dt;
    if (T.flood.on) { a.flood += dt; } else if (a.flood >= 2) f.floodDone = true;
    if (vm.mode === 'torch' || vm.mode === 'torchEquip') f.torchEq = true;
    if (vm.mode === 'gun' && !vm.hidden) f.gun = true;
    if (vm.ads && vm.mode === 'gun') a.ads += dt;
    /* the on-screen pointer is drawn by drawWaypoint() */
    if (s.id === 's5' && bino && this.fire && (G.inView(this.fire.top, 5) || G.inView(this.fire.pos.clone().add(V(0, 60, 0)), 5))) f.plume = true;
    let ok = false;
    switch (s.id) {
      case 's1': ok = a.look >= 120 && a.move >= 4; break;
      case 's2': ok = a.bino >= 2; break;
      case 's3': ok = !!f.floodDone; break;
      case 's4': ok = f.torchEq && f.torchOn && f.torchOff; break;
      case 's5': ok = f.plume && f.radio; break;
      case 's6': ok = f.gun; break;
      case 's7': ok = a.ads >= 1; break;
      case 's8': ok = shots >= 1 && f.hit && f.cutDone; break;
      case 's10': ok = !!G.has.key; break;
      case 's9': ok = !!f.reload; break;
    }
    if (ok && !this.completing) { this.completing = true; const l = s.step_complete_line; const go = () => { this.completing = false; if (s.id === 's5' && this.fire) { const fr = this.fire; setTimeout(() => fr.dispose(), 30000); } this.next(); };
      G.radioSay(l.text, { dur: l.duration_s, onDone: go }); }
  }
}

// ---------------- shifts (v2): 9 PM to 2 AM; power outages, dead radio, the fire road, secrets ----------------
function hhmm(min) { const m = ((Math.floor(min) % 1440) + 1440) % 1440; let h = Math.floor(m / 60); const mm = String(m % 60).padStart(2, '0'); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${mm} ${ap}`; }
let sched = [], shiftStats = { fires: 0, outages: 0, scares: 0, reported: 0 };
const SEC_KEY = 'elgo.secrets'; const found = new Set(JSON.parse(localStorage.getItem(SEC_KEY) || '[]').filter(id => SECRETS.some(s => s.id === id)));
const secretsLine = () => `Secrets Found (${found.size} / ${SECRETS.length})`;
function shiftDef(n) { if (SHIFTS[n]) return SHIFTS[n]; const r = (a, b) => a + Math.random() * (b - a); const k = 2 + (n % 6);
  return { n, title: `Endless Shift ${n - 7}`, mood: SHIFTS[k].mood, intro: SHIFTS[k].intro, sched: [{ at: Math.round(r(21 * 60 + 35, 22 * 60 + 20)), type: 'outage' }, { at: Math.round(r(22 * 60 + 50, 23 * 60 + 50)), type: 'deadfire' }, { at: 24 * 60 + 40, type: 'fire' }], aggr: 1 }; }
function applyMood(name) { const M = MOODS[name]; if (!M) return; scene.fog.color.set(M.fog); scene.fog.density = M.dens; W.sun.color.set(M.sun); W.sun.intensity = M.sunI; W.hemi.color.set(M.hemi); W.hemi.intensity = M.hemiI; renderer.toneMappingExposure = M.exp; G_baseExp.v = M.exp; scene.backgroundIntensity = M.bg; if (W.sky && W.sky.material.uniforms.uFog) W.sky.material.uniforms.uFog.value.copy(scene.fog.color); }
function nightMood(n) { const M = NIGHT_MOODS[n > 7 ? 2 + (n % 6) : n]; if (!M) return; if (M.fog) scene.fog.color.set(M.fog); if (M.dens) scene.fog.density = M.dens; if (M.hemiI) W.hemi.intensity = M.hemiI; if (M.hemi) W.hemi.color.set(M.hemi); if (W.sky && W.sky.material.uniforms.uFog) W.sky.material.uniforms.uFog.value.copy(scene.fog.color); }
function thought(text, o = {}) { G.radioSay(text, Object.assign({ speaker: 'YOU', player: true, thought: true }, o)); }
function setObjective(title, text) { G.objTitle = title; $('objective').innerHTML = title ? `<b>${esc(title)}</b><br><span class="small">${esc(text)}</span>` : ''; }
function progress(k, text) { const el = $('progress'); if (k == null) { el.style.display = 'none'; return; } el.style.display = 'block'; $('progressBar').style.width = Math.round(Math.max(0, Math.min(1, k)) * 100) + '%'; $('progressText').textContent = text || ''; }
function hoseOff() { hoseOn = false; hoseVM.show(false); hoseVM.spray = false; stream.on = false; if (sprayLoop) { sprayLoop.stop(); sprayLoop = null; } }
function hoseEquip() { if (!G.has.hose) { G.toast('The hose pack is in the red fire cache at the trailhead.'); return; } if (hoseOn) return; setBino(false); vm.setADS(false); aimHeld = false; vm.equip('none'); hoseOn = true; hoseVM.show(true); audio.play('slideGrab', { vol: 0.35 }); }
function resetShift(keepKey) {
  G.power = true; T.power = true; T.radioDead = false; G.radioDead = false; G.pending = new Set(); G.groundOnce = false; G.reportTried = false; $('power').style.display = 'none';
  if (nearFire) { nearFire.dispose(); nearFire = null; } hoseOff(); G.has.hose = false; GR.hosePack.visible = true; $('tHose').classList.add('hidden');
  if (!keepKey) { G.has.key = false; T.keyProp.visible = true; } T.gate.locked = true; T.gate.open = false; T.gate.chain.visible = true;
  G.gen = { running: true, fuel: 1, hasCan: false, pulls: 0 }; GR.can.visible = true; GR.genLamp.material.emissiveIntensity = 2.2; if (!genHum) genHum = SFX.genLoop(audio, GR.genWorld);
  SW.hide(); SW.cool = 8; cut = null; document.body.classList.remove('cine'); if (holdTgt && holdTgt.holdEnd) holdTgt.holdEnd(); holdTgt = null; panicT = 0; progress(null); setObjective('', '');
  P.mode = 'cab'; P.y = F; P.s = 0;
}
function startNight(n, fromTutorial = false) {
  G.night = n; G.state = 'play'; G.clockMin = SHIFT_START; G.clockHour = 21; G.nightT = 0; localStorage.setItem('elgo.night', String(n));
  director.startNight(Math.min(n, 5)); if (!fromTutorial) fires.clear();
  resetShift(fromTutorial); const D = G.shift = shiftDef(n); sched = D.sched.map(e => ({ ...e, done: false })); GR.setNight(n); W.setPreset('night'); nightMood(n);
  shiftStats = { fires: 0, outages: 0, scares: 0, reported: fires.reported };
  G.toast(D.title, 4); setObjective('', ''); $('objective').innerHTML = `<span class="small">Watch the ridges until 2:00 AM. Report smoke on the radio. Keep the lights on.</span>`;
  setTimeout(() => { if (G.state === 'play' && !G.objTitle) $('objective').innerHTML = ''; }, 16000);
}
function runEvent(e) {
  if (e.type === 'checkin') { if (G.power && !G.radioDead) { G.radioSay(e.text); G.pendingCheckin = true; } }
  else if (e.type === 'fire') { if (G.power && !G.radioDead) fires.spawnRandom(); }
  else if (e.type === 'outage') outage();
  else if (e.type === 'deadfire') deadFire();
}
function outage() {
  if (!G.power) return; G.power = false; T.power = false; G.gen.running = false; G.gen.fuel = 0; G.gen.pulls = 0; G.gen.hasCan = false; GR.can.visible = true; GR.genLamp.material.emissiveIntensity = 0;
  if (genHum) { genHum.stop(); genHum = null; } T.flood.on = false; audio.hum(false); SFX.breaker(audio); G.subtitle(null); G.pending.add('power'); panicT = Math.max(panicT, 9); shiftStats.outages++;
  $('power').textContent = 'TOWER POWER: OFF \u2014 GENERATOR DRY'; $('power').style.display = 'block'; G.toast('POWER OUT', 3);
  setTimeout(() => thought(G.has.key ? 'No, no, no... power is out. Gate, stairs, generator. Move.' : 'Everything just died. Generator... the Stairs Key is on the hook by the door. Move.'), 1300);
  setObjective('POWER OUT', 'Refill and restart the generator at the base of the tower. Be quick.');
}
function restorePower() {
  G.power = true; T.power = true; G.gen.running = true; GR.genLamp.material.emissiveIntensity = 2.2; if (!genHum) genHum = SFX.genLoop(audio, GR.genWorld); G.pending.delete('power'); if (P.mode !== 'cab') G.pending.add('return');
  $('power').style.display = 'none'; G.toast('POWER RESTORED', 3); thought('It caught. Lights are back up there. Now get back up. Fast.');
  setObjective('POWER RESTORED', 'Get back up the stairs into the watchtower.');
}
function deadFire() {
  if (nearFire) return; nearFire = new NearFire(scene, GR.firePos, { sound: { loop: (p) => SFX.fireLoop(audio, p) } }); nearFire.onOut = () => fireOut();
  G.radioDead = true; T.radioDead = true; G.pending.add('fire'); G.reportTried = false; G.fireT = 0; shiftStats.fires++;
  G.toast('SMOKE \u2014 close, right below on the fire road!', 4); setTimeout(() => thought('That is close. Right below the tower, on the fire road. Get on the radio.'), 1500);
  setObjective('WILDFIRE', 'Fire on the road below the tower. Report it on the desk radio.');
}
function radioDeadPress() {
  SFX.deadRadio(audio, 1.4);
  if (nearFire && !nearFire.out && !G.reportTried) { G.reportTried = true; panicT = Math.max(panicT, 12);
    G.radioSay('Kettle Base, Elgo Tower! Smoke on the fire road, right below the tower! How copy?', { speaker: 'YOU', player: true });
    G.radioSay('[ dead static ]', { speaker: 'KETTLE BASE', dur: 2.4, onDone: () => SFX.deadRadio(audio, 2.0) });
    thought('Come on... Marsh? Marsh! ...Radio\u2019s dead. I have to put it out myself.');
    setObjective('WILDFIRE \u2014 RADIO DEAD', 'Nobody is answering. Get the hose from the trailhead fire cache and put it out yourself.'); return; }
  G.toast(!G.power ? 'Dead. No power to the radio.' : 'Nothing but static.', 2.5);
}
function fireOut() {
  if (!nearFire) return; SFX.hiss(audio, nearFire.pos.clone().add(V(0, 1, 0)), 0.9, 2.6); G.pending.delete('fire'); G.pending.add('return'); hoseVM.spray = false;
  G.toast('FIRE OUT \u2014 Return to the watchtower!', 5); thought('It\u2019s out. It\u2019s out. Now walk back. Don\u2019t look at the trees.');
  setObjective('FIRE OUT', 'Return to the watchtower: follow the trail markers back to the stairs.'); progress(null);
  const f = nearFire; setTimeout(() => { if (nearFire === f && G.state !== 'play') { f.dispose(); nearFire = null; } }, 60000);
}
function finishReturn() {
  G.pending.delete('return'); setObjective('', ''); G.toast('Back in the tower.', 2.5);
  if (G.radioDead) { G.radioDead = false; T.radioDead = false; setTimeout(() => { G.radioSay('Elgo, Base... finally. Repeater is back up. Elgo, are you there?'); G.radioSay('I\u2019m here. Fire\u2019s out. I put it out myself.', { speaker: 'YOU', player: true }); G.radioSay('...Copy. Stay up top. Do not go back down there tonight.'); }, 1800); }
  if (nearFire && nearFire.out) { const f = nearFire; nearFire = null; setTimeout(() => f.dispose(), 20000); }
}
function nightUpdate(dt) {
  G.nightT += dt; const hold = G.pending.size > 0 && G.clockMin >= SHIFT_END - 6;
  if (!hold) G.clockMin = Math.min(SHIFT_END, G.clockMin + dt * CLOCK_RATE * (window.CLOCKFAST || 1)); G.clockHour = Math.floor(G.clockMin / 60) % 24;
  for (const e of sched) if (!e.done && G.clockMin >= e.at) { e.done = true; runEvent(e); }
  if (G.pending.has('return') && P.mode === 'cab' && !G.pending.has('fire') && !G.pending.has('power')) finishReturn();
  if (nearFire && G.pending.has('fire') && !G.reportTried) { G.fireT += dt; if (G.fireT > 25 && P.mode === 'cab') { G.fireT = -999; thought('Radio. Use the radio. Report it.'); } }
  const deep = G.clockMin >= 23 * 60 + 30 && G.clockMin < 25 * 60 + 30;
  director.update(dt, { bino, deep });
  if (G.clockMin >= SHIFT_END && !G.pending.size && P.mode === 'cab') shiftComplete();
}
function shiftComplete() {
  const n = G.night; G.state = 'dawn'; director.clear(); SW.hide(); hoseOff(); input.setEnabled(false); G.fadeTo(1, 2.2); audio.stopLoop('wind', 2); progress(null);
  const last = n === 7; if (n >= 7) localStorage.setItem('elgo.unlocked', '1');
  setTimeout(() => {
    const Lm = D_LORE && D_LORE.menu_text;
    $('dawnTitle').textContent = last ? '2:00 AM \u2014 SEASON CLOSED' : `2:00 AM \u2014 SHIFT COMPLETE`;
    const stats = `${shiftDef(n).title} &middot; Fires knocked down: ${shiftStats.fires} &middot; Power restored: ${shiftStats.outages} &middot; Rounds left: ${vm.total} &middot; ${secretsLine()}`;
    const body = last ? (Lm ? Lm.ending.body : 'The season is over.') + ' Marsh\u2019s truck is coming up the road. You can hear it from here. You keep watching the trees anyway.' : 'Your relief does not come. Nobody ever comes. You sleep in the cot with the pistol on your chest until the sun is up, and then the radio wakes you.';
    $('dawnText').innerHTML = `<p>${esc(body)}</p><p class="small">${stats}</p>${last ? '<p class="small">Shift Select and Endless Shifts unlocked on the main menu.</p>' : '<p class="small" id="dawnCount"></p>'}`;
    $('dawnGo').textContent = last ? 'Main Menu' : `Drive up for Night ${n + 1}`; show('dawn'); show('hud', false);
    let cd = 9; const go = () => { clearInterval(G._dawnT); show('dawn', false); show('hud'); if (last) { localStorage.setItem('elgo.night', '8'); toMenu(); } else { safe(() => audio.unlock()); startIntro(n + 1); } };
    clearInterval(G._dawnT); if (!last) G._dawnT = setInterval(() => { cd--; const el = $('dawnCount'); if (el) el.textContent = `Next shift in ${cd}...`; if (cd <= 0) go(); }, 1000);
    $('dawnGo').onclick = go;
  }, 2400);
}
// ---------------- secrets ----------------
function openSecret(def) {
  const isNew = !found.has(def.id); found.add(def.id); localStorage.setItem(SEC_KEY, JSON.stringify([...found]));
  $('noteText').innerHTML = `<h3>${esc(def.title)}</h3><p class="small">${def.type === 'body' ? 'Missing lookout' : 'Found on the mountain'} &middot; ${secretsLine()}</p><p>${esc(def.text)}</p>`; show('note'); G.noteOpen = true; input.setEnabled(false);
  if (isNew) { G.toast(`Secret found (${found.size} / ${SECRETS.length})`, 3); if (def.type === 'body') { G.sound('stinger-1', null, 0.5); panicT = Math.max(panicT, 5); } else audio.play('paper', { vol: 0.6 }); }
}
// ---------------- the practice-shot cutscene: something bolts out of the brush ----------------
const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const angLerp = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };
function startCutscene(onDone) {
  if (cut) return; cut = { t: 0, yaw0: P.yaw, pitch0: P.pitch, fov0: camera.fov, cy: P.yaw, cp: P.pitch, bolted: false, onDone };
  document.body.classList.add('cine'); vm.setADS(false); aimHeld = false; setBino(false); hoseOff();
  SFX.rustle(audio, GR.bushPos, 0.7, 0.5); GR.shakeBushes(0.35);
}
function cutUpdate(dt) {
  const c = cut; c.t += dt; const t = c.t; const e = V(P.x, P.y + EYE, P.z);
  const look = (p) => { const d = p.clone().sub(e); return { y: Math.atan2(-d.x, -d.z), p: Math.atan2(d.y, Math.hypot(d.x, d.z)) }; };
  if (!c.bolted && t > 1.15) { c.bolted = true; SW.bolt(GR.bushPos.clone(), GR.boltTo.clone(), 12.5); GR.shakeBushes(1); SFX.rustle(audio, GR.bushPos, 1.3, 1.6); G.sound('far-branch-snap-3', GR.bushPos, 1.3, { ref: 25 }); G.sound('stinger-2', null, 0.45); SFX.growl(audio, GR.bushPos, 0.5, 1.0); GR.moon.intensity = 55; }
  const bushL = look(GR.bushPos.clone().add(V(0, 1.1, 0))); const swL = SW.state === 'bolt' ? look(SW.model.position.clone().add(V(0, 1.4, 0))) : bushL;
  let yaw, pitch, fov;
  if (t < 1.1) { const k = ease(t / 1.1); yaw = angLerp(c.yaw0, bushL.y, k); pitch = c.pitch0 + (bushL.p - c.pitch0) * k; fov = c.fov0 + (24 - c.fov0) * k; c.cy = yaw; c.cp = pitch; }
  else if (t < 3.4) { const k = Math.min(1, dt * 5); c.cy = angLerp(c.cy, swL.y, k); c.cp += (swL.p - c.cp) * k; yaw = c.cy; pitch = c.cp; fov = 24 + (t - 1.1) * 3; c.ey = yaw; c.ep = pitch; c.ef = fov; }
  else { const k = ease(Math.min(1, (t - 3.4) / 1.1)); yaw = angLerp(c.ey, c.yaw0, k); pitch = c.ep + (c.pitch0 - c.ep) * k; fov = c.ef + (c.fov0 - c.ef) * k; }
  camera.position.copy(e); camera.rotation.set(pitch, yaw, 0, 'YXZ'); if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); } camera.updateMatrixWorld();
  if (t >= 4.5) { const done = c.onDone; cut = null; document.body.classList.remove('cine'); SW.hide(); GR.moon.intensity = 0; P.yaw = c.yaw0; P.pitch = c.pitch0; prevYaw = P.yaw;
    thought(Math.random() < 0.5 ? 'Whoa... just a deer or a coyote. Relax.' : 'Probably just an elk spooked by the shot. Relax.', { onDone: done }); }
}
// ---------------- caught: grab, blackout, retry the shift ----------------
function onCaught() {
  if (G.state !== 'play') return; G.state = 'caught'; hoseOff(); vm.setADS(false); setBino(false); progress(null);
  const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).setY(0).normalize(); const p = V(P.x + f.x * 0.85, 0, P.z + f.z * 0.85);
  SW.place(p, Math.atan2(-f.x, -f.z)); SW.setState('caught'); for (let i = 0; i < 6; i++) SW.animate(0.1, 'flinch', { lit: 1 });
  SFX.growl(audio, camera.position, 1.6, 1.2); G.sound('stinger-3', null, 1); G.sound('far-scream-2', camera.position, 0.8);
  setTimeout(() => { G.fadeTo(1, 0.15); }, 450);
  setTimeout(() => { G.toast('It caught you. Restarting the shift...', 2.6); }, 900);
  setTimeout(() => { const n = G.night; continueNight(n); G.toast('Shift restarted. Stay in the light. Shoot it if it comes.', 4); }, 3200);
}

// ---------------- scene flow ----------------
let intro = null;
// the truck cab is lit by a tight sun shadow (roof, pillars, dash shade the cabin) on every quality
function introShadows(on) {
  const sun = W.sun, sc = sun.shadow.camera; const S = on ? 4.5 : 45; sc.left = -S; sc.right = S; sc.top = S; sc.bottom = -S; sc.updateProjectionMatrix();
  const size = on ? (Q.shadows ? 2048 : 1024) : Q.shadowSize; if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  sun.castShadow = on || !!Q.shadows; sun.shadow.normalBias = on ? 0.01 : 0.04; W.treesNear.castShadow = !!Q.shadows && !on;
}
function enterTower() {
  W.setPreset('night'); nightMood(G.night || 1); P.x = -0.4; P.z = 0.6; P.y = F; P.mode = 'cab'; P.yaw = Math.PI * 0.05; P.pitch = -0.05; scene.add(camera);
  audio.loop('wind', 'wind-night-loop', 0.7, 'ambience'); G.fadeTo(0, 2.5); input.setEnabled(true); show('hud');
  input.lock();
}
// every shift opens with the drive up the mountain: Night 1 is the original morning drive, later nights have new radio talk and a new sky
function startIntro(n = 1) {
  G.state = 'intro'; G.night = n; audio.stopLoop('music', 1.5); hideScreens(); hoseOff(); SW.hide(); W.setPreset('morning'); applyMood(shiftDef(n).mood); show('hud'); $('ammo').textContent = ''; $('clock').textContent = '';
  const data = JSON.parse(JSON.stringify(n === 1 ? D_INTRO : shiftDef(n).intro));
  introShadows(true); intro = new Intro(G, data); intro.start(); G.fadeTo(0, 2); input.setEnabled(true); $('objective').innerHTML = `<b>${esc(shiftDef(n).title)}</b><span class="small">${PHONE ? 'Hold USE' : 'Hold E'} to skip</span>`; 
  setTimeout(() => { if (G.state === 'intro') $('objective').innerHTML = ''; }, 7000);
  G.onIntroDone = () => { intro = null; introShadows(false); if (n === 1) startTutorial(); else continueNight(n); };
}
function startTutorial() {
  G.state = 'tutorial'; G.night = 1; hideVM(); G.has = { bino: false, torch: false, gun: true, key: false, hose: false }; T.drawer.hasTorch = true; if (T.torchProp) T.torchProp.visible = true;
  resetShift(false); G.state = 'tutorial'; GR.setNight(1);
  enterTower(); G.clockMin = 21 * 60; G.clockHour = 21; vm.ammo = { mag: 9, chamber: 1, reserve: 40, cap: 10 };
  setTimeout(() => { if (G.state === 'tutorial' && !tut) tut = new Tutorial(D_TUT); }, 2500);
}
function continueNight(n) { hideScreens(); tut = null; $('objective').innerHTML = ''; audio.stopLoop('music', 1.5); G.has = { bino: true, torch: true, gun: true, key: false, hose: false }; if (T.binoProp) T.binoProp.visible = false; T.interact = T.interact.filter(i => i.id !== 'bino'); T.drawer.hasTorch = false; if (T.torchProp) T.torchProp.visible = false; hideVM(); if (vm.total < 20) vm.ammo = { mag: 9, chamber: 1, reserve: 30, cap: 10 }; G.night = n; enterTower(); startNight(n); }
function hideScreens() { for (const s of ['splash', 'menu', 'settings', 'log', 'pause', 'dawn', 'shiftSel']) show(s, false); }
function toMenu() {
  G.state = 'menu'; hideScreens(); show('menu'); show('hud', false); input.setEnabled(false); director.clear(); fires.clear(); tut = null; G.subtitle(null); clearInterval(G._dawnT);
  if (intro) { intro.finish(); intro = null; }
  resetShift(false); show('note', false); G.noteOpen = false;
  audio.stopLoop('wind', 1); audio.hum(false); audio.loop('music', 'menu-music', 1, 'music', 2);
  const n = +localStorage.getItem('elgo.night') || 0; show('mNight', n > 1); $('mNight').textContent = n > 7 ? `Continue: Endless Shift ${n - 7}` : `Continue: Night ${n}`; show('mContinue', false); show('mShift', !!localStorage.getItem('elgo.unlocked'));
  W.setPreset('night'); P.x = 0; P.z = 0; P.y = F; P.mode = 'cab'; P.yaw = 2.2; P.pitch = -0.04; G.fadeTo(0, 1.5);
  $('menuHint').textContent = (PHONE ? 'Touch controls on. Best in landscape with headphones.' : 'Mouse + keyboard. Click the screen to capture the mouse. Headphones recommended.') + ' ' + secretsLine() + '.';
}
let prevState = null;
function pause() { if (G.state === 'paused') return; prevState = G.state; G.state = 'paused'; show('pause'); $('pSecrets').textContent = secretsLine(); input.setEnabled(false); vm.setADS(false); audio.hum(false); audio.suspendSafe(); $('controlsHelp').innerHTML = controlsHTML(); }
function resume() { show('pause', false); G.state = prevState; input.setEnabled(true); audio.resumeSafe(); input.lock(); }
function controlsHTML() { return (PHONE || input.touchOn ? 'Left stick: walk (push all the way to run) &middot; drag right side: look &middot; FIRE &middot; AIM (hold) &middot; R reload &middot; BINO &middot; LIGHT (flashlight) &middot; 9MM &middot; HOSE &middot; FLOOD (hold) &middot; USE (doors, radio, key, gate, fuel, hose, inspect)'
  : 'WASD walk &middot; Shift run &middot; Mouse look &middot; Left click fire / flashlight / spray &middot; Right click aim (gun) or binoculars &middot; B binoculars &middot; R reload &middot; 1 pistol &middot; 2 flashlight &middot; 3 fire hose &middot; E use (hold: floodlight, refuel) &middot; Esc pause') + `<br><br>${secretsLine()}`; }

// ---------------- menus / settings UI ----------------
$('mPlay').onclick = () => { safe(() => audio.unlock()); startIntro(); };
$('mNight').onclick = () => { safe(() => audio.unlock()); startIntro(Math.max(2, +localStorage.getItem('elgo.night') || 2)); };
$('mShift').onclick = () => { show('menu', false); show('shiftSel'); const L = $('shiftList'); L.innerHTML = '';
  for (let n = 1; n <= 8; n++) { const b = document.createElement('button'); const d = shiftDef(n); b.textContent = n <= 7 ? `${d.title}` : 'Endless Shifts'; b.onclick = () => { safe(() => audio.unlock()); show('shiftSel', false); startIntro(n); }; L.appendChild(b); } };
$('shiftBack').onclick = () => { show('shiftSel', false); show('menu'); };
$('mSettings').onclick = () => { show('menu', false); openSettings('menu'); };
$('mLog').onclick = () => { show('menu', false); show('log'); const L = D_LORE; let h = L ? `<h3>${esc(L.intro_note.title)}</h3><p>${esc(L.intro_note.text).replace(/\n/g, '<br>')}</p>` : ''; if (L) for (const n of L.found_notes) if (G.notesRead.has(n.id)) h += `<h3>${esc(n.title)}</h3><p>${esc(n.text)}</p>`; $('logText').innerHTML = h; };
$('logBack').onclick = () => { show('log', false); show('menu'); };
$('pResume').onclick = resume; $('pMenu').onclick = () => { show('pause', false); audio.resumeSafe(); toMenu(); };
$('pSettings').onclick = () => { show('pause', false); openSettings('pause'); };
let settingsFrom = 'menu';
function openSettings(from) {
  settingsFrom = from; show('settings'); $('sQuality').value = S.quality; $('sSens').value = S.sens; $('sVol').value = S.vol; $('sFov').value = S.fov; $('sFovV').textContent = S.fov + '\u00b0'; $('sTouch').value = S.touch; $('sInvert').checked = S.invert; $('sSubs').checked = S.subs;
  $('sNote').textContent = 'Graphics Quality reloads the game. Everything else applies now and is saved on this device.';
}
$('sSens').oninput = (e) => { S.sens = +e.target.value; saveS(); };
$('sVol').oninput = (e) => { S.vol = +e.target.value; audio.setVolume(S.vol); saveS(); };
$('sFov').oninput = (e) => { S.fov = +e.target.value; $('sFovV').textContent = S.fov + '\u00b0'; saveS(); };
$('sTouch').onchange = (e) => { S.touch = e.target.value; saveS(); input.applyTouchVisibility(); };
$('sInvert').onchange = (e) => { S.invert = e.target.checked; saveS(); };
$('sSubs').onchange = (e) => { S.subs = e.target.checked; saveS(); $('subs').classList.toggle('large', S.subs); };
$('subs').classList.toggle('large', S.subs);
$('sQuality').onchange = (e) => { S.quality = e.target.value; saveS(); };
$('sBack').onclick = () => { show('settings', false); const q = QUALITY[S.quality]; if (q !== Q) { location.reload(); return; } show(settingsFrom); };
audio.setVolume(S.vol);
$('splashGo').onclick = () => { safe(() => audio.unlock()); safe(radioPreload); show('splash', false); toMenu(); };

// ---------------- vm lighting from the environment ----------------
const tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), invCam = new THREE.Matrix4();
function lightVM() {
  vm.scene.environment = scene.environment; vm.scene.environmentIntensity = (scene.environmentIntensity || 0.25) * 1.4;
  vm.hemi.color.copy(W.hemi.color); vm.hemi.groundColor.copy(W.hemi.groundColor); vm.hemi.intensity = W.hemi.intensity * 1.2;
  invCam.copy(camera.matrixWorld).invert(); const md = W.lightDir.clone().transformDirection(invCam); vm.key.position.copy(md).multiplyScalar(2); vm.key.color.copy(W.sun.color); vm.key.intensity = W.sun.intensity * 0.8;
  const night = G.state === 'play' || G.state === 'tutorial' || G.state === 'caught'; const pk = T.powerK ?? 1; const inCab = P.mode === 'cab' && Math.max(Math.abs(P.x), Math.abs(P.z)) < H + 0.1;
  // the cab lantern as a warm local fill, in camera space (dies with the power)
  const lp = T.lantern.position.clone().applyMatrix4(invCam); const dist = lp.length(); vm.fill.color.set(0xffb070); vm.fill.position.copy(lp.clampLength(0, 2.2)); vm.fill.distance = 4; vm.fill.intensity = (Math.max(0, 3.4 - dist * 0.9) * pk + (T.flood.k * 0.6)) * (inCab ? 1 : 0.35);
  vm.warm.intensity = night ? (inCab ? 1.1 * pk : 0) : 0; vm.warm.color.set(pk < 0.5 ? 0xff2a1a : 0xffa860); if (pk < 0.5 && inCab) vm.warm.intensity = 0.5 * (Math.sin(G.time * 5) > 0 ? 1 : 0.25);
  // cool moon rim on the slide edge / knuckles; stronger outside
  vm.rim.intensity = night ? (inCab ? 0.55 : 1.0) : 0.15;
  if (torchW.visible) vm.fill.intensity += 0.6;
}
function syncTorch() {
  const on = vm.torchOn && vm.mode === 'torch' && !bino; torchW.intensity = on ? 60 : 0; torchW.visible = on; if (!on) return;
  vm.camera.updateMatrixWorld(); vm.torch.updateWorldMatrix(true, true); const tip = vm.torch.userData.tip; tip.updateWorldMatrix(true, false);
  const vInv = vm.camera.matrixWorld.clone().invert(); const p = new THREE.Vector3().setFromMatrixPosition(tip.matrixWorld).applyMatrix4(vInv).applyMatrix4(camera.matrixWorld);
  const d = new THREE.Vector3(0, 0, -1).transformDirection(vm.torch.matrixWorld).transformDirection(vInv).transformDirection(camera.matrixWorld);
  torchW.position.copy(p); torchW.target.position.copy(p).addScaledVector(d, 6); torchW.target.updateMatrixWorld();
}

// ---------------- main loop ----------------
let resizeTick = 0; const touchEl = $('touch');
let last = performance.now(), creakT = 15, prevYaw = 0, fps = 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000) * (window.TIMESCALE || 1); last = now; fps = fps * 0.95 + (1 / Math.max(dt, 1e-3)) * 0.05; G.fps = fps;
  if ((++resizeTick & 15) === 0) resize(); touchEl.classList.toggle('intro', G.state === 'intro' || !!cut);
  if (G.state === 'paused' || G.state === 'boot') { render(false); return; }
  G.time += dt; const inp = input.frame(); hatchMsgT -= dt; pullT -= dt; hissT -= dt;
  radioUpdate(dt);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').style.opacity = 0; }
  if (G.state === 'intro' && intro) { intro.update(dt, inp); W.update(dt, camera); T.update(dt, G.time); listener(); render(false); return; }
  if (G.state === 'menu') { P.yaw += dt * 0.03; camera.position.set(0.3, F + EYE, 0.3); camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ'); camera.fov = 62; camera.updateProjectionMatrix(); W.update(dt, camera); T.update(dt, G.time); render(false); return; }
  if (cut && (G.state === 'play' || G.state === 'tutorial')) {
    cutUpdate(dt); SW.update(dt, {}); GR.update(dt); W.update(dt, camera); T.update(dt, G.time); $('tgtMark').style.display = 'none'; $('prompt').style.display = 'none';
    renderer.toneMappingExposure = G_baseExp.v * 1.7; audio.breathing('scared'); listener(); render(false); return; }
  if (G.state === 'play' || G.state === 'tutorial') gameUpdate(dt, inp);
  if (G.state === 'caught') { listener(); render(false); return; }
  render(!bino && (vm.mode !== 'none' || hoseVM.g.visible));
}
function waypoint() {
  if (tut && tut.step) { if (tut.step.id === 's8') return { p: T.targetPos, l: 'TARGET' }; if (tut.step.id === 's10' && !G.has.key) return { p: T.keyProp.getWorldPosition(V(0, 0, 0)), l: 'KEY' }; return null; }
  if (G.state !== 'play' || !G.pending.size) return null; const pd = G.pending;
  if (P.mode === 'cab') { if (pd.has('return') && !pd.has('fire') && !pd.has('power')) return null; if (!G.has.key) return { p: T.keyProp.getWorldPosition(V(0, 0, 0)), l: 'KEY' }; return { p: V(T.gate.x ?? (T.hatch.x0 + T.hatch.x1) / 2, F + 0.6, T.hatch.z1 - 0.4), l: T.gate.locked ? 'GATE' : 'STAIRS' }; }
  if (P.mode === 'stairs') return null;
  if (pd.has('power')) return { p: GR.genWorld, l: 'GENERATOR' };
  if (pd.has('fire') && nearFire) { if (!G.has.hose) return { p: GR.cachePos.clone().add(V(0, 1, 0)), l: 'HOSE' }; return { p: nearFire.pos.clone().add(V(0, 1.5, 0)), l: 'FIRE ' + Math.round(Math.hypot(P.x - nearFire.pos.x, P.z - nearFire.pos.z)) + ' m' }; }
  if (pd.has('return')) return { p: ST.bottom.clone().add(V(0, 1.5, 0)), l: 'TOWER ' + Math.round(Math.hypot(P.x - ST.bottom.x, P.z - ST.bottom.z)) + ' m' };
  return null;
}
function drawWaypoint() {
  const mk = $('tgtMark'); const w = !bino && waypoint(); if (!w) { mk.style.display = 'none'; return; }
  const v = w.p.clone().project(camera), behind = v.z > 1; let x = v.x, y = v.y; if (behind) { x = -x; y = -y; }
  const inside = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85; if (!inside) { const m = Math.max(Math.abs(x), Math.abs(y), 1e-3); x = x / m * 0.88; y = y / m * 0.8; }
  mk.style.display = 'block'; mk.style.left = (50 + x * 50) + '%'; mk.style.top = (50 - y * 50) + '%'; const t = inside ? '\u25BC ' + w.l : (x < -0.5 ? '\u25C0 ' + w.l : x > 0.5 ? w.l + ' \u25B6' : w.l); if (mk.textContent !== t) mk.textContent = t;
}
function gameUpdate(dt, inp) {
  const P_ = inp.pressed, Hh = inp.held;
  // ---- actions ----
  if (P_.has('hose')) { if (hoseOn) { hoseOff(); vm.equip('gun'); } else hoseEquip(); }
  if (hoseOn && (P_.has('gun') || P_.has('torch') || P_.has('torchBtn') || P_.has('bino'))) hoseOff();
  const gunOut = vm.mode === 'gun' && !vm.hidden;
  if (P_.has('bino')) setBino(!bino);
  if (P_.has('aimDown')) { if (gunOut && !bino) aimHeld = true; else if (!hoseOn && (!PHONE || !gunOut)) { binoHold = true; setBino(true); } }
  if (P_.has('aimUp')) { aimHeld = false; if (binoHold) { binoHold = false; setBino(false); } }
  if (!Hh.has('aim')) aimHeld = false;
  vm.setADS(aimHeld && !bino);
  if (P_.has('fire') && !bino && !hoseOn) { if (vm.mode === 'gun') vm.fire(); else if (vm.mode === 'torch') vm.toggleTorch(); }
  if (P_.has('fire') && bino && !binoHold) setBino(false);
  if (P_.has('reload') && !hoseOn) vm.reload();
  if (P_.has('gun')) { setBino(false); if (vm.mode !== 'gun') vm.equip('gun'); }
  if (P_.has('torch') || P_.has('torchBtn')) { setBino(false); if (!G.has.torch) G.toast('The flashlight is in the desk drawer.'); else if (vm.mode === 'torch') { if (P_.has('torchBtn')) vm.toggleTorch(); } else vm.equip('torch'); }
  if (P_.has('torchToggle') && vm.mode === 'torch') vm.toggleTorch();
  // ---- interact ----
  const eye = V(P.x, P.y + EYE, P.z); const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  let tgt = null, bestS = -1; for (const it of [...T.interact, ...GR.interact, genIt, hoseIt]) { if (it.avail && !it.avail()) continue; const d = it.pos.clone().sub(eye); const L = d.length(); if (L > it.r) continue; const s = fwd.dot(d) / L; if (s > 0.55 && s - L * 0.1 > bestS) { bestS = s - L * 0.1; tgt = it; } }
  const pr = $('prompt'); if (tgt && !bino) { pr.style.display = 'block'; const t = (PHONE || input.touchOn ? useLabel(tgt) + ': ' : 'E: ') + tgt.label(); if (pr.textContent !== t) pr.textContent = t; } else pr.style.display = 'none';
  { const ub = $('tUse'), want = tgt && !bino ? useLabel(tgt) : 'USE'; if (ub.textContent !== want) ub.textContent = want; }
  if (P_.has('useDown')) { if (tgt && tgt.canHold && tgt.canHold()) holdTgt = tgt; else if (tgt && !tgt.hold) tgt.press(); else floodHeld = true; }
  if (holdTgt) { if (Hh.has('use') && tgt === holdTgt && holdTgt.canHold()) holdTgt.holdFn(dt); else { holdTgt.holdEnd && holdTgt.holdEnd(); holdTgt = null; } }
  if (P_.has('useUp') || !Hh.has('use')) floodHeld = false;
  const floodOn = G.power && (((floodHeld && Hh.has('use')) || Hh.has('flood')));
  if (floodOn !== T.flood.on) { T.flood.on = floodOn; audio.hum(floodOn); audio.play('slideRelease', { vol: 0.3 }); }
  if (!G.power && (Hh.has('flood') || floodHeld) && hatchMsgT <= 0) { G.toast('No power to the floodlight.'); hatchMsgT = 3; }
  // ---- look + move ----
  const zoom = bino ? 7 : 1; const sensK = bino ? 0.16 : (vm.ads ? 0.6 : 1);
  P.yaw -= inp.look.x * sensK; P.pitch = THREE.MathUtils.clamp(P.pitch - inp.look.y * sensK, -1.45, 1.35);
  const dyaw = P.yaw - prevYaw; prevYaw = P.yaw;
  const moved = bino ? 0 : movePlayer(dt, inp);
  const moving = moved / Math.max(dt, 1e-3);
  camera.position.set(P.x, P.y + EYE, P.z); /* no camera bob or shake: only the hands sway */ camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  const zf = Math.tan(vm.camera.fov * Math.PI / 360) / Math.tan(52 * Math.PI / 360); let fov = 2 * Math.atan(Math.tan(S.fov * Math.PI / 360) * zf) * 180 / Math.PI; if (bino) fov = 2 * Math.atan(Math.tan(S.fov * Math.PI / 360) / zoom) * 180 / Math.PI;
  if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  camera.updateMatrixWorld();
  if (bino) { const b = Math.round(bearingOf(fwd.x, fwd.z)); $('binoInfo').textContent = `BRG ${String(b).padStart(3, '0')}\u00b0   7x50`; }
  // ---- viewmodel + hose ----
  const lookV = { x: inp.look.x * 400, y: inp.look.y * 400 };
  vm.update(dt, { moveAmt: Math.min(1, moving / 1.6), looking: Math.abs(inp.look.x) + Math.abs(inp.look.y) > 0.002, look: lookV, noInspect: bino || hoseOn });
  hoseVM.update(dt, { look: lookV, moveAmt: Math.min(1, moving / 1.6) });
  const spraying = hoseOn && hoseVM.active && Hh.has('fire') && !bino; hoseVM.spray = spraying; stream.on = spraying;
  let noz = null, sdir = null; if (hoseVM.g.visible) { const tl = hoseVM.tipLocal(); noz = tl.p.clone().applyMatrix4(camera.matrixWorld); sdir = fwd.clone().add(V(0, 0.06, 0)).normalize(); }
  stream.update(dt, noz, sdir, nearFire && !nearFire.out ? nearFire : null, (p) => { if (hissT <= 0) { hissT = 0.28; SFX.hiss(audio, p, 0.35, 0.5); } });
  if (spraying && !sprayLoop) sprayLoop = SFX.sprayLoop(audio); else if (!spraying && sprayLoop) { sprayLoop.stop(); sprayLoop = null; }
  // ---- world ----
  W.update(dt, camera); T.update(dt, G.time); fires.update(dt, { bino }); GR.update(dt); mistUpdate(dt); if (nearFire) nearFire.update(dt);
  if (!holdTgt) { if (nearFire && !nearFire.out && P.mode === 'ground' && Math.hypot(P.x - nearFire.pos.x, P.z - nearFire.pos.z) < 28) progress(1 - nearFire.hp, 'Fire knocked down: ' + Math.round((1 - nearFire.hp) * 100) + '%'); else progress(null); }
  if (tut) { tut.update(dt, { dyaw, moved }); if (tut.fire) tut.fire.update(dt); }
  if (G.state === 'play') nightUpdate(dt); else { G.clockHour = 21; }
  // ---- the thing in the trees (only when you are on the ground at night) ----
  const swActive = G.state === 'play' && P.mode === 'ground' && !G.noteOpen && (G.shift ? G.shift.aggr : 0) > 0;
  const swHead = SW.model.position.clone().add(V(0, 1.6, 0)); const lit = (torchW.visible && G.inView(swHead, 22) ? 1 : 0) + (T.flood.k > 0.3 ? 0.5 : 0);
  SW.update(dt, { player: V(P.x, P.y, P.z), active: swActive, aggr: G.shift ? G.shift.aggr : 0, lit: Math.min(1, lit + 0.15), viewDir: fwd });
  const swNear = SW.state === 'charge' || (SW.state === 'stalk' && SW.model.position.distanceTo(V(P.x, P.y, P.z)) < 18);
  hbT -= dt; if (swNear && hbT < 0) { hbT = SW.state === 'charge' ? 0.5 : 0.85; SFX.heartbeat(audio, SW.state === 'charge' ? 0.75 : 0.4); }
  if (G.pending.has('power') || (G.radioDead && P.mode !== 'cab') || swNear) panicT = Math.max(panicT, 1.5);
  // creaks + breathing (calm / stairs + trail / panic / held on ADS)
  creakT -= dt; if (creakT < 0) { creakT = 18 + Math.random() * 30; audio.play('tower-creak-' + (1 + Math.floor(Math.random() * 6)), { vol: 0.5, pos: { x: (Math.random() - 0.5) * 4, y: F - 2 - Math.random() * 8, z: (Math.random() - 0.5) * 4 }, ref: 6 }); }
  scareT -= dt; panicT -= dt;
  audio.breathing((vm.ads || bino) ? 'hold' : panicT > 0 ? 'panic' : scareT > 0 ? 'scared' : (P.mode === 'stairs' && moving > 0.2) ? 'stairs' : moving > 2.8 ? 'sprint' : (moving > 2 || (P.mode === 'ground' && moving > 1.2)) ? 'run' : moving > 0.2 ? 'move' : 'idle');
  // ---- HUD ----
  $('clock').textContent = G.state === 'tutorial' ? 'Night 1 \u00b7 9:00 PM' : `${G.night > 7 ? 'Endless ' + (G.night - 7) : 'Night ' + G.night} \u00b7 ${hhmm(G.clockMin)}`;
  $('ammo').textContent = hoseOn ? 'HOSE' : vm.mode === 'gun' && !vm.hidden ? `${vm.ammo.mag + vm.ammo.chamber} | ${vm.ammo.reserve}` : '';
  $('cross').style.display = bino || vm.ads ? 'none' : 'block';
  drawWaypoint();
  renderer.toneMappingExposure = G_baseExp.v * (bino ? (T.flood.k > 0.2 ? 0.55 : 1.8) : 1) * (P.mode === 'cab' ? 1 : 1.25);
  syncTorch(); listener();
}
function listener() {
  const c = audio.ctx; if (!c) return; const L = c.listener; const p = camera.getWorldPosition(tmpV); const f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(tmpQ)); const u = new THREE.Vector3(0, 1, 0).applyQuaternion(tmpQ);
  if (L.positionX) { L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z; L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z; L.upX.value = u.x; L.upY.value = u.y; L.upZ.value = u.z; }
  else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z); }
}
function render(withVM) {
  renderer.clear(); renderer.render(scene, camera);
  if (withVM) { lightVM(); renderer.clearDepth(); vm.camera.updateMatrixWorld(); renderer.render(vm.scene, vm.camera); }
}
let vpW = 0, vpH = 0;
function viewSize() { const vv = window.visualViewport; const w = Math.round(document.documentElement.clientWidth || innerWidth), h = Math.round(Math.min(innerHeight, vv && vv.scale === 1 ? vv.height + 0.5 : 1e9)); return [w || innerWidth, h || innerHeight]; }
function resize() { const [w, h] = viewSize(); if (w === vpW && h === vpH) return; const rot = vpW && (w > h) !== (vpW > vpH); vpW = w; vpH = h;
  renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); vm.camera.aspect = w / h; vm.camera.updateProjectionMatrix();
  document.documentElement.style.setProperty('--vh', h + 'px'); if (rot) { input.releaseTouches && input.releaseTouches(); window.scrollTo(0, 0); } }
const resizeSoon = () => { resize(); setTimeout(resize, 150); setTimeout(resize, 400); setTimeout(resize, 900); };
addEventListener('resize', resizeSoon); addEventListener('orientationchange', resizeSoon); window.visualViewport && visualViewport.addEventListener('resize', resizeSoon);
screen.orientation && screen.orientation.addEventListener && screen.orientation.addEventListener('change', resizeSoon); resize();
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); G.state = 'paused'; show('pause'); $('controlsHelp').textContent = 'The phone ran low on graphics memory. Tap "Return to Station" or reload the page (Graphics: Low helps).'; }, false);
document.addEventListener('visibilitychange', () => { if (document.hidden && (G.state === 'play' || G.state === 'tutorial' || G.state === 'intro')) pause(); });

// ---------------- go ----------------
W.setPreset('night'); camera.position.set(0.3, F + EYE, 0.3); camera.rotation.set(-0.04, 2.2, 0, 'YXZ'); W.update(0.016, camera); T.update(0.016, 0);
G.state = 'menuWait'; render(false);
G.state = 'boot'; status(PHONE ? 'Ready.' : 'Ready.'); show('splashGo'); $('loadMsg').classList.add('small');
requestAnimationFrame(frame);
// test hooks (headless checks)
window.__game = { camera, torchW, radio: () => ({ cur: radioCur && { t: radioCur.t, dur: radioCur.dur, shown: radioCur.shown, out: radioCur.out }, q: radioQ.length, state: G.state }), G, P, input, vm, T, W, startIntro, startTutorial, continueNight, toMenu, tutorial: () => tut, intro: () => intro, setBino, director, fires, shoot, radioPress, GR, SW, hoseVM, stream, get nearFire() { return nearFire; }, outage, deadFire, restorePower, startCutscene, shiftComplete, resetShift, startNight, startIntro, hoseEquip, takeHose, genIt, hoseIt, fireOut, found, secretsLine, openSecret, cut: () => cut, ST, stairAt, waypoint };
window.THREE = THREE; window.gameReady = true;
