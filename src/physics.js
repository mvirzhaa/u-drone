// Model fisika quadcopter FPV.
// Kerangka: Three.js, Y ke atas. Badan drone: depan = -Z, kanan = +X, atas = +Y.
// Laju sudut badan: w.x = pitch (positif = hidung naik), w.y = yaw (positif = ke kiri),
// w.z = roll (positif = sisi kanan naik).
import * as THREE from 'three';

export const GRAVITY = 9.81;
const DEG = Math.PI / 180;

// Kurva rate Betaflight (laju sudut dalam derajat/detik).
export function betaflightRate(x, rc, sr, expo) {
  const a = Math.min(1, Math.abs(x));
  let rcRate = rc;
  if (rcRate > 2) rcRate += 14.54 * (rcRate - 2);
  let cmd = x;
  if (expo) cmd = x * a * a * a * expo + x * (1 - expo);
  let rate = 200 * rcRate * cmd;
  if (sr) rate *= 1 / THREE.MathUtils.clamp(1 - a * sr, 0.01, 1);
  return THREE.MathUtils.clamp(rate, -1998, 1998);
}

// Fraksi dorong dari perintah throttle motor (kurva mendekati kuadrat seperti baling-baling nyata).
export function thrustCurve(t) {
  return 0.35 * t + 0.65 * t * t;
}

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qi = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const FWD = new THREE.Vector3(0, 0, -1);
const RIGHT = new THREE.Vector3(1, 0, 0);

export class Quad {
  constructor(spec, opts = {}) {
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.w = new THREE.Vector3();
    this.setSpec(spec);
    this.opts = Object.assign({
      airmode: true, battery: true, propwash: true, crashMode: 'realistic',
      flightMode: 'acro', altHold: false, maxAngle: 55,
    }, opts);
    this.reset();
  }

  setSpec(spec) {
    this.spec = JSON.parse(JSON.stringify(spec));
  }

  reset(pos, yaw = 0) {
    if (pos) this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.w.set(0, 0, 0);
    this.quat.setFromAxisAngle(UP, yaw);
    this.motor = 0;          // throttle motor aktual (0..1) setelah lag
    this.armed = false;
    this.crashed = false;
    this.crashTime = 0;
    this.charge = 1;         // muatan baterai 0..1
    this.voltage = 4.2;      // per sel
    this.thrustN = 0;
    this.grounded = true;
    this.impact = 0;
    this.altTarget = null;
    this.inWater = false;
    this.splash = false;
  }

  // Kembalikan [roll, pitch] dalam radian (roll positif = kanan turun, pitch positif = hidung turun).
  attitude() {
    const r = _v.copy(RIGHT).applyQuaternion(this.quat);
    const f = _v2.copy(FWD).applyQuaternion(this.quat);
    return [-Math.asin(THREE.MathUtils.clamp(r.y, -1, 1)), -Math.asin(THREE.MathUtils.clamp(f.y, -1, 1))];
  }

  // input: {t: 0..1, y, p, r: -1..1}. colliders: daftar dari world.
  // ground (opsional): { heightAt(x,z,outNormal), water: tinggi air atau null }
  step(dt, input, colliders = [], ground = null) {
    const s = this.spec, o = this.opts;
    const live = this.armed && !this.crashed;

    // ---- Laju target dari stik ----
    const R = s.rates;
    let tgt = _axis.set(0, 0, 0);
    const yawRate = -betaflightRate(input.y, R.yawRc, R.yawSr, R.expo) * DEG;
    if (o.flightMode === 'angle') {
      const [roll, pitch] = this.attitude();
      const max = o.maxAngle * DEG, k = 8;
      tgt.set(-(input.p * max - pitch) * k, yawRate, -(input.r * max - roll) * k);
    } else {
      tgt.set(
        -betaflightRate(input.p, R.rc, R.sr, R.expo) * DEG,
        yawRate,
        -betaflightRate(input.r, R.rc, R.sr, R.expo) * DEG,
      );
    }

    // ---- Throttle (opsional bantuan ketinggian untuk pemula) ----
    let thrCmd = input.t;
    if (o.altHold && live) {
      if (this.altTarget === null) this.altTarget = this.pos.y;
      const climb = (input.t - 0.5) * 2 * 6; // m/s
      if (Math.abs(input.t - 0.5) > 0.06) this.altTarget = this.pos.y + climb * 0.25;
      const up = _v.copy(UP).applyQuaternion(this.quat).y;
      const err = this.altTarget - this.pos.y;
      const accel = GRAVITY + err * 4 - this.vel.y * 3;
      const need = s.mass * accel / Math.max(0.3, up) / (s.maxThrust * this.voltMul());
      thrCmd = THREE.MathUtils.clamp(this.invThrust(need), 0, 1);
    } else this.altTarget = null;

    // ---- Lag motor ----
    const cmd = live ? thrCmd : 0;
    this.motor += (cmd - this.motor) * (1 - Math.exp(-dt / s.motorTau));

    // ---- Otoritas sudut: airmode menjaga kendali saat throttle 0 ----
    let authority = live ? 1 : 0;
    if (live && !o.airmode && this.motor < 0.05) authority = 0.2;
    if (live && this.grounded && input.t < 0.05) authority = 0;

    // Pengendali laju (P dengan batas percepatan sudut)
    const ax = this.w.x, ay = this.w.y, az = this.w.z;
    const g = s.rateGain, lim = s.maxAngAccel * authority;
    const acc = _v2.set(
      THREE.MathUtils.clamp((tgt.x - ax) * g, -lim, lim),
      THREE.MathUtils.clamp((tgt.y - ay) * g * 0.6, -lim * 0.5, lim * 0.5),
      THREE.MathUtils.clamp((tgt.z - az) * g, -lim, lim),
    );
    // Prop wash: turbulensi saat turun menembus aliran udara sendiri
    const upW = _v.copy(UP).applyQuaternion(this.quat);
    const inflow = this.vel.dot(upW);
    if (o.propwash && live && inflow < -2.5 && this.motor > 0.15) {
      const amt = Math.min(1, (-inflow - 2.5) / 8) * 25 * this.motor;
      acc.x += (Math.random() - 0.5) * amt;
      acc.z += (Math.random() - 0.5) * amt;
    }
    this.w.addScaledVector(acc, dt);
    if (!live) this.w.multiplyScalar(Math.exp(-dt * 0.6)); // hanya hambatan udara

    // ---- Orientasi ----
    const wl = this.w.length();
    if (wl > 1e-6) {
      _q.setFromAxisAngle(_axis.copy(this.w).divideScalar(wl), wl * dt);
      this.quat.multiply(_q).normalize();
    }

    // ---- Gaya ----
    const vm = this.voltMul();
    const inflowFactor = THREE.MathUtils.clamp(1 - inflow / s.propSpeed, 0, 1.15);
    this.thrustN = s.maxThrust * thrustCurve(this.motor) * vm * inflowFactor;
    const F = _v.copy(upW).multiplyScalar(this.thrustN);
    F.y -= s.mass * GRAVITY;

    // Hambatan udara anisotropik di kerangka badan
    _qi.copy(this.quat).invert();
    const vb = _v2.copy(this.vel).applyQuaternion(_qi);
    vb.set(
      -s.drag.x * vb.x * Math.abs(vb.x) - s.linDrag * vb.x,
      -s.drag.y * vb.y * Math.abs(vb.y) - s.linDrag * vb.y,
      -s.drag.z * vb.z * Math.abs(vb.z) - s.linDrag * vb.z,
    ).applyQuaternion(this.quat);
    F.add(vb);

    this.vel.addScaledVector(F, dt / s.mass);
    this.pos.addScaledVector(this.vel, dt);

    // ---- Baterai ----
    if (o.battery && live) {
      const f = this.thrustN / s.maxThrust;
      this.charge = Math.max(0, this.charge - dt * (0.0012 + 0.012 * f));
    }
    if (o.battery) {
      const sag = 0.35 * this.motor;
      this.voltage = 3.3 + 0.9 * Math.pow(this.charge, 0.6) - sag;
    } else this.voltage = 4.2;

    this.collide(colliders, ground);
  }

  voltMul() {
    if (!this.opts.battery) return 1;
    return THREE.MathUtils.clamp((this.voltage / 4.2) ** 2, 0.3, 1);
  }

  invThrust(f) {
    // invers thrustCurve: 0.65 t^2 + 0.35 t - f = 0
    f = Math.max(0, f);
    return (-0.35 + Math.sqrt(0.35 * 0.35 + 4 * 0.65 * f)) / (2 * 0.65);
  }

  hoverThrottle() {
    return this.invThrust(this.spec.mass * GRAVITY / this.spec.maxThrust);
  }

  collide(colliders, ground) {
    const r = this.spec.radius;
    this.grounded = false;
    this.impact = 0;
    // Tanah / terrain
    const h = ground ? ground.heightAt(this.pos.x, this.pos.z, _gn) : 0;
    if (!ground) _gn.set(0, 1, 0);
    // Air: menyentuh permukaan air = mendarat di air
    const water = ground && ground.water != null ? ground.water : -Infinity;
    if (water > h && this.pos.y < water + r * 0.5) {
      this.inWater = true;
      if (this.armed && !this.crashed && this.opts.crashMode === 'realistic') { this.crashed = true; this.crashTime = 0; this.splash = true; }
      if (this.opts.crashMode === 'realistic') {
        this.pos.y = water + r * 0.5 - 0.02;
        this.vel.multiplyScalar(0.9); this.vel.y = Math.max(this.vel.y, 0);
        this.w.multiplyScalar(0.9);
      } else this.resolve(_v.set(0, 1, 0), water + r * 0.5 - this.pos.y, true);
    } else this.inWater = false;
    for (let k = 0; k < 2; k++) {
      const hh = ground ? ground.heightAt(this.pos.x, this.pos.z, _gn) : 0;
      const gap = this.pos.y - hh;
      if (gap >= r) break;
      this.resolve(_v.copy(_gn), (r - gap) * _gn.y, _gn.y > 0.7);
    }

    for (const c of colliders) {
      const hit = sphereVs(c, this.pos, r);
      if (hit) this.resolve(hit.n, hit.d, hit.n.y > 0.7);
    }
  }

  resolve(n, depth, floorLike) {
    this.pos.addScaledVector(n, depth);
    const vn = this.vel.dot(n);
    if (vn >= 0) { if (floorLike) this.grounded = true; return; }
    const impact = -vn;
    this.impact = Math.max(this.impact, impact);
    const s = this.spec;
    const bouncy = s.ducted ? 0.45 : 0.25;
    this.vel.addScaledVector(n, -(1 + bouncy) * vn);
    // gesekan tangensial
    const vt = _v2.copy(this.vel).addScaledVector(n, -this.vel.dot(n));
    this.vel.addScaledVector(vt, floorLike ? -0.25 : -0.15);
    if (floorLike && impact < 2) this.grounded = true;
    // tumbukan memutar drone
    if (impact > 1.5) {
      const spin = Math.min(impact * 2, 25) * (s.ducted ? 0.4 : 1);
      this.w.x += (Math.random() - 0.5) * spin;
      this.w.z += (Math.random() - 0.5) * spin;
    }
    if (this.armed && !this.crashed && this.opts.crashMode === 'realistic' && impact > s.crashSpeed) {
      this.crashed = true;
      this.crashTime = 0;
    }
  }
}

// ---- Tumbukan bola vs penghalang ----
const _l = new THREE.Vector3();
const _gn = new THREE.Vector3(0, 1, 0);
export function sphereVs(c, p, r) {
  if (c.type === 'box') {
    // ke kerangka lokal (rotasi Y)
    const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
    const lx = dx * c.cos + dz * c.sin;
    const lz = -dx * c.sin + dz * c.cos;
    const cx = THREE.MathUtils.clamp(lx, -c.hx, c.hx);
    const cy = THREE.MathUtils.clamp(dy, -c.hy, c.hy);
    const cz = THREE.MathUtils.clamp(lz, -c.hz, c.hz);
    let nx = lx - cx, ny = dy - cy, nz = lz - cz;
    let d2 = nx * nx + ny * ny + nz * nz;
    if (d2 > r * r) return null;
    let d = Math.sqrt(d2), depth;
    if (d < 1e-6) {
      // pusat di dalam kotak: dorong lewat sisi terdekat
      const px = c.hx - Math.abs(lx), py = c.hy - Math.abs(dy), pz = c.hz - Math.abs(lz);
      if (px < py && px < pz) { nx = Math.sign(lx) || 1; ny = 0; nz = 0; depth = px + r; }
      else if (py < pz) { nx = 0; ny = Math.sign(dy) || 1; nz = 0; depth = py + r; }
      else { nx = 0; ny = 0; nz = Math.sign(lz) || 1; depth = pz + r; }
    } else { nx /= d; ny /= d; nz /= d; depth = r - d; }
    // kembali ke dunia
    const n = new THREE.Vector3(nx * c.cos - nz * c.sin, ny, nx * c.sin + nz * c.cos);
    return { n, d: depth };
  }
  if (c.type === 'cyl') {
    if (p.y < c.y0 - r || p.y > c.y1 + r) return null;
    const dx = p.x - c.x, dz = p.z - c.z;
    const dist = Math.hypot(dx, dz);
    if (p.y > c.y1) { // tutup atas
      const ex = Math.max(0, dist - c.r);
      const ey = p.y - c.y1;
      const dd = Math.hypot(ex, ey);
      if (dd > r) return null;
      if (ex === 0) return { n: new THREE.Vector3(0, 1, 0), d: r - ey };
      return { n: new THREE.Vector3(dx / dist * ex / dd, ey / dd, dz / dist * ex / dd), d: r - dd };
    }
    if (dist > c.r + r) return null;
    if (dist < 1e-6) return { n: new THREE.Vector3(1, 0, 0), d: c.r + r };
    return { n: _l.set(dx / dist, 0, dz / dist).clone(), d: c.r + r - dist };
  }
  return null;
}
