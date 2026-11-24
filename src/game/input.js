// Input: auto-detects phone (touch buttons only) vs PC (WASD + pointer-lock mouse). Produces one state object per frame.
export function isPhone() {
  const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  const coarse = !!(window.matchMedia && matchMedia('(pointer: coarse)').matches);
  const ua = navigator.userAgent || ''; const iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1; // iPadOS reports a Mac UA
  return touch && (coarse || iPadOS || /iPhone|iPod|iPad|Android|Mobile/i.test(ua));
}
// only cancel when the browser allows it (avoids Chrome's "Ignored attempt to cancel" error and never blocks UI taps)
const stop = (e) => { if (e.cancelable) e.preventDefault(); };
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings; this.phone = isPhone();
    this.keys = new Set(); this.look = { x: 0, y: 0 }; this.move = { x: 0, z: 0 };
    this.pressed = new Set(); this.held = new Set(); this.enabled = false; this.locked = false; this.onPause = null;
    this.stick = { id: null, x0: 0, y0: 0, x: 0, y: 0 }; this.lookT = { id: null, x: 0, y: 0 };
    this.bindKeys(); this.bindMouse(); this.bindTouch(); this.applyTouchVisibility();
  }
  applyTouchVisibility() {
    const m = this.settings.touch; this.touchOn = m === 'on' || (m === 'auto' && this.phone);
    document.getElementById('touch').classList.toggle('on', this.touchOn && this.enabled); document.body.classList.toggle('touchui', !!this.touchOn);
  }
  setEnabled(on) { this.enabled = on; this.applyTouchVisibility(); if (!on) { this.held.clear(); this.keys.clear(); this.stick.id = null; this.lookT.id = null; this.move.x = this.move.z = 0; if (document.pointerLockElement) try { document.exitPointerLock(); } catch (e) {} } }
  // pointer lock is desktop-only; never let it throw (Safari / touch devices) or block a click
  lock() { if (this.phone || this.touchOn) return; const c = this.canvas; try { const r = c.requestPointerLock && c.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
  press(n) { this.pressed.add(n); }
  bindKeys() {
    const map = { KeyR: 'reload', Digit1: 'gun', Digit2: 'torch', Digit3: 'hose', KeyB: 'bino', KeyF: 'torchToggle' };
    addEventListener('keydown', (e) => {
      if (e.repeat) return; if (!this.enabled) return;
      this.keys.add(e.code);
      if (map[e.code]) this.press(map[e.code]);
      if (e.code === 'KeyE') { this.held.add('use'); this.press('useDown'); }
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause && this.onPause();
      if (e.code === 'Space') this.press('skip');
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); if (e.code === 'KeyE') { this.held.delete('use'); this.press('useUp'); } });
    addEventListener('blur', () => { this.keys.clear(); this.held.clear(); });
  }
  bindMouse() {
    const c = this.canvas;
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touchOn) return;
      if (!document.pointerLockElement) { this.lock(); return; }
      if (e.button === 0) { this.held.add('fire'); this.press('fire'); }
      if (e.button === 2) { this.held.add('aim'); this.press('aimDown'); }
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.held.delete('fire'); if (e.button === 2) { this.held.delete('aim'); this.press('aimUp'); } });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { const was = this.locked; this.locked = document.pointerLockElement === c; if (was && !this.locked && this.enabled && !this.touchOn) this.onPause && this.onPause(true); });
    addEventListener('mousemove', (e) => { if (!this.locked || !this.enabled) return; const k = 0.0022 * this.settings.sens; this.look.x += e.movementX * k; this.look.y += e.movementY * k * (this.settings.invert ? -1 : 1); });
  }
  bindTouch() {
    const sz = document.getElementById('stickZone'), lz = document.getElementById('lookZone');
    const base = document.getElementById('stickBase'), knob = document.getElementById('stickKnob');
    const opts = { passive: false };
    sz.addEventListener('touchstart', (e) => { stop(e); const t = e.changedTouches[0]; if (this.stick.id !== null) return; this.stick = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: 0, y: 0 };
      const zr = sz.getBoundingClientRect(); base.style.left = (t.clientX - zr.left) + 'px'; base.style.top = (t.clientY - zr.top) + 'px'; base.style.opacity = 0.9; }, opts);
    const smove = (e) => { for (const t of e.changedTouches) if (t.identifier === this.stick.id) { let dx = t.clientX - this.stick.x0, dy = t.clientY - this.stick.y0; const L = Math.hypot(dx, dy), R = 52; if (L > R) { dx *= R / L; dy *= R / L; } this.stick.x = dx / R; this.stick.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`; stop(e); } };
    const send = (e) => { for (const t of e.changedTouches) if (t.identifier === this.stick.id) { this.stick.id = null; this.stick.x = this.stick.y = 0; knob.style.transform = ''; base.style.opacity = 0.55; base.style.left = ''; base.style.top = ''; } };
    sz.addEventListener('touchmove', smove, opts); sz.addEventListener('touchend', send); sz.addEventListener('touchcancel', send);
    lz.addEventListener('touchstart', (e) => { stop(e); const t = e.changedTouches[0]; if (this.lookT.id !== null) return; this.lookT = { id: t.identifier, x: t.clientX, y: t.clientY }; }, opts);
    lz.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === this.lookT.id) { const k = 0.0048 * this.settings.sens; this.look.x += (t.clientX - this.lookT.x) * k; this.look.y += (t.clientY - this.lookT.y) * k * (this.settings.invert ? -1 : 1); this.lookT.x = t.clientX; this.lookT.y = t.clientY; stop(e); } }, opts);
    const lend = (e) => { for (const t of e.changedTouches) if (t.identifier === this.lookT.id) this.lookT.id = null; };
    lz.addEventListener('touchend', lend); lz.addEventListener('touchcancel', lend);
    const btn = (id, down, up) => { const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { stop(e); e.stopPropagation(); el.classList.add('down'); el._t = true; down && down(); }, opts);
      const u = (e) => { stop(e); if (!el.classList.contains('down')) return; el.classList.remove('down'); up && up(); }; el.addEventListener('touchend', u, opts); el.addEventListener('touchcancel', u, opts);
      // also usable with a mouse when touch controls are forced on (desktop testing)
      el.addEventListener('mousedown', (e) => { if (el._t) return; e.preventDefault(); e.stopPropagation(); el.classList.add('down'); down && down(); }); el.addEventListener('mouseup', (e) => { if (el._t || !el.classList.contains('down')) return; el.classList.remove('down'); up && up(); }); };
    addEventListener('touchcancel', () => {}, { passive: true });
    this.releaseTouches = () => { this.stick.id = null; this.stick.x = this.stick.y = 0; this.lookT.id = null; knob.style.transform = ''; base.style.left = base.style.top = ''; base.style.opacity = 0.55;
      for (const el of document.querySelectorAll('#touch .tb.down')) el.dispatchEvent(new Event('touchcancel')); };
    btn('tFire', () => { this.held.add('fire'); this.press('fire'); }, () => this.held.delete('fire'));
    btn('tAim', () => { this.held.add('aim'); this.press('aimDown'); }, () => { this.held.delete('aim'); this.press('aimUp'); });
    btn('tReload', () => this.press('reload'));
    btn('tBino', () => this.press('bino'));
    btn('tTorch', () => this.press('torchBtn'));
    btn('tGun', () => this.press('gun'));
    btn('tHose', () => this.press('hose'));
    btn('tFlood', () => this.held.add('flood'), () => this.held.delete('flood'));
    btn('tUse', () => { this.held.add('use'); this.press('useDown'); }, () => { this.held.delete('use'); this.press('useUp'); });
    btn('tPause', () => this.onPause && this.onPause());
  }
  // call once per frame
  frame() {
    const K = this.keys; let x = 0, z = 0;
    if (K.has('KeyW') || K.has('ArrowUp')) z -= 1; if (K.has('KeyS') || K.has('ArrowDown')) z += 1; if (K.has('KeyA') || K.has('ArrowLeft')) x -= 1; if (K.has('KeyD') || K.has('ArrowRight')) x += 1;
    if (this.stick.id !== null) { x = this.stick.x; z = this.stick.y; }
    const L = Math.hypot(x, z); if (L > 1) { x /= L; z /= L; }
    this.move.x = x; this.move.z = z; this.sprint = K.has('ShiftLeft') || K.has('ShiftRight') || (this.stick.id !== null && Math.hypot(this.stick.x, this.stick.y) > 0.9); // phone: push the stick all the way to run
    const out = { move: { ...this.move }, look: { ...this.look }, pressed: new Set(this.pressed), held: new Set(this.held), sprint: this.sprint };
    this.look.x = this.look.y = 0; this.pressed.clear();
    return out;
  }
}
