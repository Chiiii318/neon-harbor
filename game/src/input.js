// Neon Harbor — keyboard, mouse-look and touch input, unified into one state.
// Game code reads `input.moveX/moveZ`, `input.run`, edge-triggered action flags
// via consume(), and `input.lookDX` for camera yaw on foot.

export class Input {
  constructor(domElement) {
    this.keys = {};
    this.moveX = 0;      // strafe: -1 left, +1 right
    this.moveZ = 0;      // forward: -1 forward (W), +1 back (S)
    this.run = false;
    this.brake = false;  // space handbrake while driving
    this.lookDX = 0;     // accumulated mouse movement, consumed per frame
    this._pressed = {};  // edge-triggered one-shot flags
    this.touch = { active: false, joyX: 0, joyZ: 0, run: false };
    this._bindKeyboard();
    this._bindMouse(domElement);
    this._bindTouchButtons();
  }

  _bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this._pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }

  _bindMouse(domElement) {
    this._yawDrag = false;
    domElement.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') return;
      this._yawDrag = true;
      this._lastX = e.clientX;
    });
    window.addEventListener('pointerup', () => { this._yawDrag = false; });
    window.addEventListener('pointermove', (e) => {
      if (!this._yawDrag) return;
      const dx = e.clientX - (this._lastX || e.clientX);
      this._lastX = e.clientX;
      this.lookDX += dx;
    });
  }

  _bindTouchButtons() {
    // Virtual joystick + buttons are DOM elements created in index.html.
    const joy = document.getElementById('touch-joy');
    const stick = document.getElementById('touch-stick');
    if (!joy) return;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch) document.body.classList.add('has-touch');
    let joyId = null;
    const setStick = (dx, dy) => {
      const max = 34;
      const len = Math.hypot(dx, dy) || 1;
      const scale = Math.min(1, max / len);
      if (stick) stick.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
      this.touch.joyX = Math.max(-1, Math.min(1, dx / max));
      this.touch.joyZ = Math.max(-1, Math.min(1, dy / max));
    };
    joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(joyId); const r = joy.getBoundingClientRect(); setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); });
    joy.addEventListener('pointermove', (e) => { if (e.pointerId !== joyId) return; const r = joy.getBoundingClientRect(); setStick(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); });
    const endJoy = (e) => { if (e.pointerId !== joyId) return; joyId = null; this.touch.joyX = 0; this.touch.joyZ = 0; if (stick) stick.style.transform = 'translate(0px,0px)'; };
    joy.addEventListener('pointerup', endJoy);
    joy.addEventListener('pointercancel', endJoy);
    const bindBtn = (id, code) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this._pressed[code] = true; this.keys[code] = true; if (code === 'ShiftLeft') this.touch.run = true; });
      el.addEventListener('pointerup', () => { this.keys[code] = false; if (code === 'ShiftLeft') this.touch.run = false; });
      el.addEventListener('pointerleave', () => { this.keys[code] = false; if (code === 'ShiftLeft') this.touch.run = false; });
    };
    bindBtn('btn-action', 'KeyE');
    bindBtn('btn-punch', 'KeyF');
    bindBtn('btn-run', 'ShiftLeft');
  }

  // Refresh the continuous axes from the keyboard each frame.
  poll() {
    let x = 0;
    let z = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) x -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) x += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) z -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) z += 1;
    if (this.touch.joyX !== 0 || this.touch.joyZ !== 0) { x = this.touch.joyX; z = this.touch.joyZ; }
    this.moveX = x;
    this.moveZ = z;
    this.run = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.touch.run);
    this.brake = !!this.keys['Space'];
  }

  // One-shot action query: true only on the frame the key went down.
  consume(code) {
    if (this._pressed[code]) { this._pressed[code] = false; return true; }
    return false;
  }

  takeLookDX() {
    const v = this.lookDX;
    this.lookDX = 0;
    return v;
  }
}
