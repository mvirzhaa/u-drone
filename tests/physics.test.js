import * as THREE from 'three';
import { Quad, betaflightRate } from '../src/physics.js';
import { DRONES, DRONE_ORDER } from '../src/drones.js';

const dt = 1 / 500;
const rows = [];
let fail = 0;
for (const id of DRONE_ORDER) {
  const s = DRONES[id];
  const q = new Quad(s, { battery: false, propwash: false });
  const hover = q.hoverThrottle();
  // 1) hover: throttle hover harus menjaga ketinggian
  q.reset(new THREE.Vector3(0, 10, 0)); q.armed = true; q.motor = hover;
  for (let i = 0; i < 2500; i++) q.step(dt, { t: hover, y: 0, p: 0, r: 0 });
  const drift = Math.abs(q.pos.y - 10);
  // 2) kecepatan puncak: miring 65 derajat, throttle penuh, tahan ketinggian kasar
  q.reset(new THREE.Vector3(0, 200, 0)); q.armed = true;
  let top = 0;
  for (let i = 0; i < 15000; i++) {
    q.quat.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -65 * Math.PI / 180); q.w.set(0, 0, 0);
    q.step(dt, { t: 1, y: 0, p: 0, r: 0 });
    top = Math.max(top, Math.hypot(q.vel.x, q.vel.z));
  }
  // 3) panjat vertikal maksimum
  q.reset(new THREE.Vector3(0, 10, 0)); q.armed = true;
  let climb = 0;
  for (let i = 0; i < 10000; i++) { q.quat.identity(); q.w.set(0,0,0); q.step(dt, { t: 1, y: 0, p: 0, r: 0 }); climb = Math.max(climb, q.vel.y); }
  // 4) respons laju roll: waktu mencapai 90% target
  q.reset(new THREE.Vector3(0, 50, 0)); q.armed = true; q.motor = hover;
  const target = betaflightRate(1, s.rates.rc, s.rates.sr, s.rates.expo);
  let t90 = null;
  for (let i = 0; i < 1000; i++) {
    q.step(dt, { t: hover, y: 0, p: 0, r: 1 });
    if (t90 === null && -q.w.z * 180 / Math.PI >= 0.9 * target) t90 = (i + 1) * dt;
  }
  const twr = s.maxThrust / (s.mass * 9.81);
  rows.push({ drone: s.name, TWR: twr.toFixed(1), hover: (hover * 100).toFixed(0) + '%', drift_m: drift.toFixed(3),
    top_kmh: (top * 3.6).toFixed(0), climb_ms: climb.toFixed(1), maxRate_dps: target.toFixed(0), t90_ms: t90 ? (t90 * 1000).toFixed(0) : '>2000' });
  if (drift > 0.05 || !t90 || top < 5) fail++;
}
console.table(rows);

// Baterai: throttle hover sampai habis
const q = new Quad(DRONES.freestyle5, { battery: true, propwash: false });
q.reset(new THREE.Vector3(0, 10, 0)); q.armed = true;
let t = 0; while (q.charge > 0.05 && t < 1200) { q.step(1/100, { t: q.hoverThrottle() * 1.05, y: 0, p: 0, r: 0 }); t += 0.01; }
console.log('5" Freestyle: waktu terbang hover ~', (t / 60).toFixed(1), 'menit, sel akhir', q.voltage.toFixed(2), 'V');

// Tumbukan: jatuh ke tanah dari 20 m dengan motor mati => crash (5") tapi tidak crash (whoop)
for (const id of ['freestyle5', 'whoop65']) {
  const d = new Quad(DRONES[id], { battery: false }); d.reset(new THREE.Vector3(0, 20, 0)); d.armed = true;
  for (let i = 0; i < 5000; i++) d.step(dt, { t: 0, y: 0, p: 0, r: 0 });
  console.log(DRONES[id].name, 'jatuh 20 m -> crashed =', d.crashed, 'y =', d.pos.y.toFixed(3));
}
console.log(fail ? `GAGAL: ${fail}` : 'SEMUA LULUS');
process.exit(fail ? 1 : 0);
