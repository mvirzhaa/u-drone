// Logika balap: urutan gerbang, pencatat waktu lap, dan ghost (lawan lap terbaik).
import * as THREE from 'three';
import { store } from './store.js';

const GHOST_HZ = 30;

export class Race {
  constructor() { this.listeners = []; }

  setup(world, droneId) {
    this.world = world;
    this.gates = world.gates;
    this.key = `best:${world.id}:${droneId}`;
    const saved = store.get(this.key, null);
    this.best = saved ? saved.time : null;
    this.bestGhost = saved && saved.ghost ? saved.ghost : null;
    this.restart();
  }

  restart() {
    this.next = 0;
    this.running = false;
    this.lapStart = 0;
    this.now = 0;
    this.laps = [];
    this.last = null;
    this.passed = new Set();
    this.rec = [];
    this.splits = [];
    this.world.highlightGates(this.next, this.passed);
  }

  get lapTime() { return this.running ? this.now - this.lapStart : 0; }

  // Dipanggil setiap langkah fisika.
  update(prev, cur, t, quad) {
    this.now = t;
    const gates = this.gates;
    if (!gates.length) return;
    const g = gates[this.next];
    if (crossed(g, prev, cur)) this.onGate(this.next, t);
    if (this.running) {
      const lt = t - this.lapStart;
      if (lt * GHOST_HZ >= this.rec.length / 7) {
        const p = quad.pos, q = quad.quat;
        this.rec.push(r3(p.x), r3(p.y), r3(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w));
      }
    }
  }

  onGate(i, t) {
    const n = this.gates.length;
    if (i === 0) {
      if (this.running && this.passed.size >= n - 1) {
        const lap = t - this.lapStart;
        this.last = lap;
        this.laps.push(lap);
        let isBest = false;
        if (this.best === null || lap < this.best) {
          this.best = lap; isBest = true;
          this.bestGhost = this.rec.slice();
          store.set(this.key, { time: lap, ghost: this.bestGhost });
        }
        this.emit({ type: 'lap', lap, isBest });
      } else if (!this.running) this.emit({ type: 'start' });
      this.running = true;
      this.lapStart = t;
      this.passed = new Set([0]);
      this.rec = [];
    } else {
      this.passed.add(i);
      this.emit({ type: 'gate', i });
    }
    this.next = (i + 1) % n;
    this.world.highlightGates(this.next, this.passed);
  }

  // Posisi ghost pada waktu lap saat ini (interpolasi linear).
  ghostAt(lt, pos, quat) {
    const gst = this.bestGhost;
    if (!gst || !this.running) return false;
    const frames = gst.length / 7;
    const f = lt * GHOST_HZ;
    if (f >= frames - 1) return false;
    const i = Math.floor(f), a = f - i, o = i * 7, b = o + 7;
    pos.set(lerp(gst[o], gst[b], a), lerp(gst[o + 1], gst[b + 1], a), lerp(gst[o + 2], gst[b + 2], a));
    _qa.set(gst[o + 3], gst[o + 4], gst[o + 5], gst[o + 6]);
    _qb.set(gst[b + 3], gst[b + 4], gst[b + 5], gst[b + 6]);
    quat.slerpQuaternions(_qa, _qb, a);
    return true;
  }

  resetBest() {
    store.del(this.key);
    this.best = null; this.bestGhost = null;
  }

  on(fn) { this.listeners.push(fn); }
  emit(e) { this.listeners.forEach(fn => fn(e)); }
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const lerp = (a, b, t) => a + (b - a) * t;
const r3 = v => Math.round(v * 1000) / 1000;

// Apakah segmen prev->cur melewati lubang gerbang dari depan ke belakang?
export function crossed(g, prev, cur) {
  const z0 = localZ(g, prev), z1 = localZ(g, cur);
  if (!(z0 > 0 && z1 <= 0)) return false;
  const a = z0 / (z0 - z1);
  const x = prev.x + (cur.x - prev.x) * a, y = prev.y + (cur.y - prev.y) * a, z = prev.z + (cur.z - prev.z) * a;
  const dx = x - g.x, dz = z - g.z;
  const lx = dx * g.cos + dz * g.sin;
  return Math.abs(lx) <= g.w / 2 && y >= g.base && y <= g.base + g.h;
}
function localZ(g, p) {
  const dx = p.x - g.x, dz = p.z - g.z;
  return -dx * g.sin + dz * g.cos;
}
