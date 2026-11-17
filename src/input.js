// Input: stik sentuh (mode 1/2), gamepad / radio transmitter USB (OTG), keyboard.
import { store } from './store.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = { t: 0, y: 0, p: 0, r: 0 };
    this.source = 'touch';
    this.cfg = Object.assign({ stickMode: 2, stickSize: 0.16, opacity: 0.5, deadband: 0.02 }, store.get('input', {}));
    this.map = store.get('padmap', null);
    this.touch = {
      L: { id: null, x: 0, y: 1 },   // y: -1 atas .. 1 bawah. throttle mulai di bawah
      R: { id: null, x: 0, y: 0 },
    };
    this.keys = new Set();
    this.kbThr = 0;
    this.onArm = null; this.onReset = null; this.onMenu = null;
    this.prevButtons = [];
    this.prevArmAxis = null;
    this.bind();
    this.resize();
  }

  saveCfg() { store.set('input', this.cfg); }

  bind() {
    const c = this.canvas;
    const opt = { passive: false };
    c.addEventListener('touchstart', e => this.onTouch(e, 'start'), opt);
    c.addEventListener('touchmove', e => this.onTouch(e, 'move'), opt);
    c.addEventListener('touchend', e => this.onTouch(e, 'end'), opt);
    c.addEventListener('touchcancel', e => this.onTouch(e, 'end'), opt);
    // mouse untuk uji di desktop
    let mouseSide = null;
    c.addEventListener('mousedown', e => { mouseSide = e.clientX < innerWidth / 2 ? 'L' : 'R'; this.moveStick(mouseSide, e.clientX, e.clientY); this.source = 'touch'; });
    addEventListener('mousemove', e => { if (mouseSide) this.moveStick(mouseSide, e.clientX, e.clientY); });
    addEventListener('mouseup', () => { if (mouseSide) this.release(mouseSide); mouseSide = null; });
    addEventListener('keydown', e => {
      if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
      this.keys.add(e.code); this.source = 'keyboard';
      if (e.code === 'Space') { e.preventDefault(); this.onArm && this.onArm(); }
      if (e.code === 'KeyR') this.onReset && this.onReset();
      if (e.code === 'Escape') this.onMenu && this.onMenu();
      if (e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
    this.dpr = dpr;
  }

  stickGeom(side) {
    const R = Math.min(innerWidth, innerHeight) * this.cfg.stickSize;
    const pad = R * 1.35;
    return { cx: side === 'L' ? pad : innerWidth - pad, cy: innerHeight - pad, R };
  }

  onTouch(e, kind) {
    e.preventDefault();
    this.source = 'touch';
    for (const t of e.changedTouches) {
      if (kind === 'start') {
        const side = t.clientX < innerWidth / 2 ? 'L' : 'R';
        if (this.touch[side].id === null) { this.touch[side].id = t.identifier; this.moveStick(side, t.clientX, t.clientY); }
      } else {
        for (const side of ['L', 'R']) {
          if (this.touch[side].id !== t.identifier) continue;
          if (kind === 'move') this.moveStick(side, t.clientX, t.clientY);
          else { this.touch[side].id = null; this.release(side); }
        }
      }
    }
  }

  // Sumbu vertikal yang tidak memegas (throttle) bergantung mode stik.
  thrSide() { return this.cfg.stickMode === 2 ? 'L' : 'R'; }

  moveStick(side, px, py) {
    const g = this.stickGeom(side);
    const s = this.touch[side];
    s.x = clamp((px - g.cx) / g.R, -1, 1);
    s.y = clamp((py - g.cy) / g.R, -1, 1);
  }

  release(side) {
    const s = this.touch[side];
    s.x = 0;
    if (side !== this.thrSide()) s.y = 0;
  }

  // ---------- Gamepad ----------
  pad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  defaultMap(p) {
    if (p.mapping === 'standard') {
      // Gamepad biasa: stik kiri = throttle/yaw, stik kanan = pitch/roll (mode 2)
      return { kind: 'gamepad', t: { a: 1, c: 1, f: -1 }, y: { a: 0, c: 0, f: 1 }, p: { a: 3, c: 0, f: -1 }, r: { a: 2, c: 0, f: 1 }, arm: { type: 'button', i: 0 }, reset: { type: 'button', i: 3 } };
    }
    // Radio EdgeTX/OpenTX sebagai joystick USB: Ail, Ele, Thr, Rud
    return { kind: 'radio', t: { a: 2, c: -1, f: 1 }, y: { a: 3, c: 0, f: 1 }, p: { a: 1, c: 0, f: 1 }, r: { a: 0, c: 0, f: 1 }, arm: null, reset: null };
  }

  axisVal(p, m) {
    const v = p.axes[m.a] ?? 0;
    return (v - m.c) / ((m.f - m.c) || 1);
  }

  readPad() {
    const p = this.pad();
    if (!p) return false;
    const m = this.map || this.defaultMap(p);
    const db = this.cfg.deadband;
    const dz = v => Math.abs(v) < db ? 0 : v;
    const any = p.axes.some(a => Math.abs(a) > 0.15) || p.buttons.some(b => b.pressed);
    if (any && this.source !== 'gamepad') this.source = 'gamepad';
    if (this.source !== 'gamepad') return false;
    this.state.t = clamp(this.axisVal(p, m.t), 0, 1);
    this.state.y = clamp(dz(this.axisVal(p, m.y)), -1, 1);
    this.state.p = clamp(dz(this.axisVal(p, m.p)), -1, 1);
    this.state.r = clamp(dz(this.axisVal(p, m.r)), -1, 1);
    // tombol arm / reset
    const pressed = p.buttons.map(b => b.pressed);
    const edge = i => pressed[i] && !this.prevButtons[i];
    if (m.arm) {
      if (m.arm.type === 'button' && edge(m.arm.i)) this.onArm && this.onArm();
      if (m.arm.type === 'axis') {
        const on = (p.axes[m.arm.i] - m.arm.c) * m.arm.s > 0.5 * Math.abs(m.arm.s);
        if (this.prevArmAxis !== null && on !== this.prevArmAxis) this.onArm && this.onArm(on);
        this.prevArmAxis = on;
      }
    }
    if (m.reset && m.reset.type === 'button' && edge(m.reset.i)) this.onReset && this.onReset();
    if (m.menu && m.menu.type === 'button' && edge(m.menu.i)) this.onMenu && this.onMenu();
    this.prevButtons = pressed;
    return true;
  }

  // ---------- Polling ----------
  update(dt) {
    if (this.readPad()) return this.state;
    if (this.source === 'keyboard') {
      const k = c => this.keys.has(c) ? 1 : 0;
      this.kbThr = clamp(this.kbThr + (k('KeyW') - k('KeyS')) * dt * 0.8, 0, 1);
      this.state.t = this.kbThr;
      this.state.y = k('KeyD') - k('KeyA');
      this.state.p = k('ArrowUp') - k('ArrowDown');
      this.state.r = k('ArrowRight') - k('ArrowLeft');
      return this.state;
    }
    // sentuh
    const L = this.touch.L, R = this.touch.R;
    if (this.cfg.stickMode === 2) {
      this.state.t = clamp((1 - L.y) / 2, 0, 1); this.state.y = L.x;
      this.state.p = -R.y; this.state.r = R.x;
    } else {
      this.state.p = -L.y; this.state.y = L.x;
      this.state.t = clamp((1 - R.y) / 2, 0, 1); this.state.r = R.x;
    }
    return this.state;
  }

  draw(visible) {
    const g = this.ctx, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (!visible || this.source !== 'touch') return;
    for (const side of ['L', 'R']) {
      const s = this.touch[side], geo = this.stickGeom(side);
      g.globalAlpha = this.cfg.opacity;
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.strokeRect(geo.cx - geo.R, geo.cy - geo.R, geo.R * 2, geo.R * 2);
      g.beginPath(); g.moveTo(geo.cx - geo.R, geo.cy); g.lineTo(geo.cx + geo.R, geo.cy);
      g.moveTo(geo.cx, geo.cy - geo.R); g.lineTo(geo.cx, geo.cy + geo.R); g.globalAlpha = this.cfg.opacity * 0.4; g.stroke();
      g.globalAlpha = this.cfg.opacity + 0.2;
      g.fillStyle = side === this.thrSide() ? '#ffb020' : '#30c0ff';
      g.beginPath(); g.arc(geo.cx + s.x * geo.R, geo.cy + s.y * geo.R, geo.R * 0.28, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
}

// ---------- Wizard kalibrasi radio / gamepad ----------
// Langkah: baseline (stik tengah, throttle bawah) -> throttle atas -> yaw kanan -> pitch depan -> roll kanan -> (opsional) saklar arm.
export const CAL_STEPS = [
  { key: 'base', text: 'Lepaskan semua stik ke tengah dan turunkan throttle ke paling bawah. Lalu tekan Lanjut.' },
  { key: 't', text: 'Dorong THROTTLE ke paling atas dan tahan, lalu tekan Lanjut.' },
  { key: 'y', text: 'Kembalikan throttle ke bawah. Gerakkan YAW penuh ke KANAN dan tahan, lalu tekan Lanjut.' },
  { key: 'p', text: 'Dorong PITCH penuh ke DEPAN (atas) dan tahan, lalu tekan Lanjut.' },
  { key: 'r', text: 'Gerakkan ROLL penuh ke KANAN dan tahan, lalu tekan Lanjut.' },
  { key: 'arm', text: 'Opsional: nyalakan saklar ARM di radio atau tekan tombol yang ingin dipakai untuk ARM, lalu tekan Lanjut. Tekan Lewati bila tidak perlu.' },
];

export class Calibrator {
  constructor(input) { this.input = input; this.step = 0; this.base = null; this.map = { kind: 'custom' }; this.used = new Set(); }

  snapshot() {
    const p = this.input.pad();
    return p ? { axes: [...p.axes], buttons: p.buttons.map(b => b.pressed) } : null;
  }

  next(skip = false) {
    const st = CAL_STEPS[this.step], snap = this.snapshot();
    if (!snap) return { error: 'Kontroler tidak terdeteksi. Sambungkan radio lewat kabel USB OTG (mode Joystick/HID) lalu gerakkan stiknya.' };
    if (st.key === 'base') this.base = snap;
    else if (st.key === 'arm') {
      if (!skip) {
        const bi = snap.buttons.findIndex((b, i) => b && !this.base.buttons[i]);
        if (bi >= 0) this.map.arm = { type: 'button', i: bi };
        else {
          const ai = this.bestAxis(snap);
          if (ai >= 0) this.map.arm = { type: 'axis', i: ai, c: this.base.axes[ai], s: snap.axes[ai] - this.base.axes[ai] };
          else return { error: 'Tidak ada perubahan saklar/tombol yang terdeteksi. Coba lagi atau tekan Lewati.' };
        }
      } else this.map.arm = null;
    } else {
      const ai = this.bestAxis(snap);
      if (ai < 0) return { error: 'Gerakan stik tidak terdeteksi. Pastikan stik ditahan penuh, lalu coba lagi.' };
      this.used.add(ai);
      this.map[st.key] = { a: ai, c: this.base.axes[ai], f: snap.axes[ai] };
    }
    this.step++;
    if (this.step >= CAL_STEPS.length) {
      this.map.reset = null;
      this.input.map = this.map;
      store.set('padmap', this.map);
      return { done: true };
    }
    return { ok: true };
  }

  bestAxis(snap) {
    let best = -1, bd = 0.4;
    snap.axes.forEach((v, i) => {
      if (this.used.has(i)) return;
      const d = Math.abs(v - this.base.axes[i]);
      if (d > bd) { bd = d; best = i; }
    });
    return best;
  }
}
