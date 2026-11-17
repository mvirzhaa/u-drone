import * as THREE from 'three';
import { Quad, betaflightRate } from './physics.js';
import { DRONES, DRONE_ORDER } from './drones.js';
import { World, MAPS, MAP_ORDER } from './world.js';
import { createDroneMesh, spinProps } from './model.js';
import { Input, Calibrator, CAL_STEPS } from './input.js';
import { Race } from './race.js';
import { store } from './store.js';

// ================= Pengaturan =================
const DEFAULTS = {
  map: 'stadium', drone: 'freestyle5', game: 'race', flightMode: 'acro', altHold: false,
  airmode: true, battery: true, propwash: true, crashMode: 'realistic',
  view: 'fpv', fov: 115, analog: false, quality: 'med', shadows: false, ghost: true,
  tilt: {}, rates: {},
};
const S = Object.assign({}, DEFAULTS, store.get('settings', {}));
const save = () => store.set('settings', S);

function specFor(id) {
  const base = DRONES[id];
  const spec = JSON.parse(JSON.stringify(base));
  if (S.rates[id]) Object.assign(spec.rates, S.rates[id]);
  if (S.tilt[id] !== undefined) spec.camTilt = S.tilt[id];
  return spec;
}

// ================= Render =================
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.domElement.id = 'gl';
document.getElementById('app').prepend(renderer.domElement);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(S.fov, innerWidth / innerHeight, 0.01, 2000);

function applyGraphics() {
  const dpr = devicePixelRatio || 1;
  renderer.setPixelRatio({ low: 0.6, med: Math.min(dpr, 1.25), high: Math.min(dpr, 2) }[S.quality]);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.shadowMap.enabled = S.shadows;
  scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => (m.needsUpdate = true)); });
  document.getElementById('analog').classList.toggle('hidden', !S.analog);
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight, false); });

// ================= Dunia & drone =================
const world = new World(scene, S.quality);
const input = new Input(document.getElementById('sticks'));
const race = new Race();
let quad, mesh, ghostMesh, spawn;
let simTime = 0, flightTime = 0, acc = 0;
let paused = true;

function loadMap() {
  world.load(S.map);
  spawn = world.spawn;
  applyGraphics();
}

function loadDrone() {
  const spec = specFor(S.drone);
  if (mesh) scene.remove(mesh);
  if (ghostMesh) scene.remove(ghostMesh);
  mesh = createDroneMesh(spec);
  ghostMesh = createDroneMesh(spec, { ghost: true });
  ghostMesh.visible = false;
  scene.add(mesh, ghostMesh);
  if (!quad) quad = new Quad(spec);
  else quad.setSpec(spec);
  applyPhysicsOpts();
}

function applyPhysicsOpts() {
  Object.assign(quad.opts, {
    airmode: S.airmode, battery: S.battery, propwash: S.propwash, crashMode: S.crashMode,
    flightMode: S.flightMode, altHold: S.altHold,
  });
}

function resetDrone() {
  const y = spawn.y + quad.spec.radius + 0.02;
  quad.reset(new THREE.Vector3(spawn.x, y, spawn.z), spawn.yaw);
  flightTime = 0;
  input.kbThr = 0;
  race.setup(world, S.drone);
  if (S.game !== 'race') world.highlightGates(-1, null);
  message('');
  updateArmBtn();
}

// ================= Arm / reset =================
function toggleArm(force) {
  if (quad.crashed) { resetDrone(); return; }
  const want = force === undefined ? !quad.armed : !!force;
  if (want && !quad.armed) {
    const thr = input.state.t;
    if (!S.altHold && thr > 0.08) { message('TURUNKAN THROTTLE\nUNTUK ARM', 1.5); return; }
    if (S.altHold && thr > 0.6) { message('THROTTLE KE TENGAH/BAWAH\nUNTUK ARM', 1.5); return; }
  }
  quad.armed = want;
  updateArmBtn();
}
function updateArmBtn() {
  const b = document.getElementById('btn-arm');
  b.classList.toggle('on', quad.armed);
  b.textContent = quad.crashed ? 'ULANG' : quad.armed ? 'DISARM' : 'ARM';
}
input.onArm = toggleArm;
input.onReset = () => resetDrone();
input.onMenu = () => (paused ? closeMenu() : openMenu());

// ================= Pesan & OSD =================
const $ = id => document.getElementById(id);
let msgTimer = 0;
function message(text, secs = 0) { $('osd-msg').innerHTML = text.replace(/\n/g, '<br>'); msgTimer = secs; }
const fmt = t => t === null || t === undefined ? '--:--.--' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;

race.on(e => {
  if (S.game !== 'race') return;
  if (e.type === 'start') message('<span class="good">MULAI!</span>', 1);
  if (e.type === 'lap') {
    message(`${e.isBest ? '<span class="good">LAP TERBAIK!</span><br>' : ''}LAP ${fmt(e.lap)}`, 2.5);
  }
});

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
function updateOSD() {
  const s = quad.spec;
  const cellV = quad.voltage;
  const packV = (cellV * s.cells).toFixed(1);
  const low = S.battery && cellV < 3.5;
  $('osd-tl').innerHTML = `<span class="${low ? 'warn' : ''}">${s.cells}S ${packV}V  ${cellV.toFixed(2)}V/sel</span>\n${S.battery ? Math.round(quad.charge * 100) + '% BATT' : ''}`;
  const ft = Math.floor(flightTime);
  $('osd-tr').textContent = `${String(Math.floor(ft / 60)).padStart(2, '0')}:${String(ft % 60).padStart(2, '0')}\n${s.name}`;
  const kmh = quad.vel.length() * 3.6;
  $('osd-br').textContent = `${kmh.toFixed(0).padStart(3)} KM/J   ALT ${(quad.pos.y - world.heightAt(quad.pos.x, quad.pos.z)).toFixed(1)}M   THR ${Math.round(input.state.t * 100)}%`;
  const mode = S.flightMode === 'acro' ? 'ACRO' : 'ANGLE';
  $('osd-bl').innerHTML = `${mode}${S.altHold ? ' +ALT' : ''}${S.airmode ? ' AIR' : ''}   ${quad.crashed ? '<span class="warn">CRASH</span>' : quad.armed ? '<span class="bad">ARMED</span>' : 'DISARMED'}`;

  if (S.game === 'race' && world.gates.length) {
    const delta = race.running && race.best !== null && race.bestGhost ? '' : '';
    $('osd-race').innerHTML = `LAP ${race.laps.length + (race.running ? 1 : 0)}  ${fmt(race.running ? race.lapTime : null)}\n` +
      `<span style="font-size:.8em">TERBAIK ${fmt(race.best)}  TERAKHIR ${fmt(race.last)}  GERBANG ${race.running ? race.passed.size : 0}/${world.gates.length}</span>${delta}`;
  } else $('osd-race').textContent = S.game === 'free' ? 'FREESTYLE' : '';

  // Penanda gerbang berikutnya
  const gm = $('gate-marker');
  if (S.game === 'race' && world.gates.length && !quad.crashed) {
    const g = world.gates[race.next];
    _v.set(g.x, g.cy, g.z);
    const dist = _v.distanceTo(camera.position);
    _v2.copy(_v).project(camera);
    const behind = _v.clone().applyMatrix4(camera.matrixWorldInverse).z > 0;
    let x = _v2.x, y = _v2.y;
    if (behind) { x = -x; y = -y; }
    const onScreen = !behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.9;
    if (!onScreen) { const m = Math.max(Math.abs(x) / 0.85, Math.abs(y) / 0.68, 1e-3); x /= m; y /= m; }
    gm.style.display = 'flex';
    gm.style.left = ((x + 1) / 2 * innerWidth) + 'px';
    gm.style.top = ((1 - y) / 2 * innerHeight) + 'px';
    const ang = onScreen ? 180 : Math.atan2(x, y) * 180 / Math.PI;
    gm.querySelector('.arrow').style.transform = `rotate(${ang}deg)`;
    gm.querySelector('.dist').textContent = `${race.next + 1} · ${dist.toFixed(0)}m`;
  } else gm.style.display = 'none';

  if (quad.crashed && !msgTimer) message('<span class="warn">CRASH</span>\ntekan ULANG / RESET / re-arm');
  else if (!quad.crashed && msgTimer <= 0 && $('osd-msg').textContent.startsWith('CRASH')) message('');
}

// ================= Kamera =================
const tiltQ = new THREE.Quaternion();
const chasePos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
function updateCamera(dt) {
  const s = quad.spec;
  if (S.view === 'fpv') {
    tiltQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), s.camTilt * Math.PI / 180);
    camera.quaternion.copy(quad.quat).multiply(tiltQ);
    _v.set(0, s.size * 0.08, -s.size * 0.3).applyQuaternion(quad.quat);
    camera.position.copy(quad.pos).add(_v);
    camera.fov = S.fov;
    mesh.visible = false;
  } else if (S.view === 'chase') {
    const f = _v.set(0, 0, -1).applyQuaternion(quad.quat); f.y = 0;
    if (f.lengthSq() < 1e-4) f.set(0, 0, -1); f.normalize();
    const dist = Math.max(0.3, s.size * 5);
    _v2.copy(quad.pos).addScaledVector(f, -dist).addScaledVector(UP, dist * 0.35);
    chasePos.lerp(_v2, 1 - Math.exp(-dt * 6));
    if (chasePos.distanceTo(quad.pos) > dist * 5) chasePos.copy(_v2);
    camera.position.copy(chasePos);
    const gy = world.heightAt(chasePos.x, chasePos.z) + 0.15;
    if (world.water != null) camera.position.y = Math.max(camera.position.y, world.water + 0.3);
    camera.position.y = Math.max(camera.position.y, gy);
    camera.lookAt(quad.pos);
    camera.fov = 75;
    mesh.visible = true;
  } else { // LOS: dilihat dari posisi pilot
    const back = new THREE.Vector3(Math.sin(spawn.yaw), 0, Math.cos(spawn.yaw)).multiplyScalar(world.indoor ? 1.5 : 3);
    camera.position.set(spawn.x, spawn.y + 1.6, spawn.z).add(back);
    camera.lookAt(quad.pos);
    camera.fov = 60;
    mesh.visible = true;
  }
  camera.updateProjectionMatrix();
  if (world.skyMesh) world.skyMesh.position.copy(camera.position);
}

// ================= Loop utama =================
const STEP = 1 / 400;
const prev = new THREE.Vector3();
let nearby = [];
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const inp = input.update(dt);
  if (!paused && quad) {
    // broadphase penghalang
    const reach = 3 + quad.vel.length() * dt * 2 + quad.spec.radius;
    nearby = world.colliders.filter(c => {
      const dx = c.x - quad.pos.x, dy = c.y - quad.pos.y, dz = c.z - quad.pos.z;
      const r = c.br + reach;
      return dx * dx + dy * dy + dz * dz < r * r;
    });
    acc += dt;
    while (acc >= STEP) {
      prev.copy(quad.pos);
      quad.step(STEP, inp, nearby, world);
      if (S.game === 'race' && !quad.crashed) race.update(prev, quad.pos, simTime, quad);
      simTime += STEP;
      acc -= STEP;
    }
    if (quad.armed && !quad.crashed) flightTime += dt;
    if (quad.crashed) { quad.crashTime += dt; updateArmBtn(); }
    if (quad.splash) { quad.splash = false; message('<span class="warn">JATUH KE AIR</span>\ntekan ULANG / RESET', 3); }
    if (S.battery && quad.charge <= 0 && quad.armed) message('<span class="warn">BATERAI HABIS</span>', 2);
    if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) message(''); }
  }
  world.update(simTime, paused ? 0 : dt);
  if (quad) {
    mesh.position.copy(quad.pos);
    mesh.quaternion.copy(quad.quat);
    spinProps(mesh, quad.motor, dt);
    // ghost
    ghostMesh.visible = S.game === 'race' && S.ghost && race.ghostAt(race.lapTime, ghostMesh.position, ghostMesh.quaternion);
    if (ghostMesh.visible) spinProps(ghostMesh, 0.5, dt);
    updateCamera(dt);
    if (!paused) updateOSD();
  }
  renderer.render(scene, camera);
  input.draw(!paused);
  if (calibUI) calibUI();
}

// ================= Menu =================
const TABS = [['fly', 'Terbang'], ['drone', 'Drone'], ['cam', 'Kamera'], ['ctrl', 'Kontrol'], ['phys', 'Fisika'], ['gfx', 'Grafis']];
let activeTab = 'fly';
let calibUI = null;
let dirty = { map: false, drone: false };

function openMenu() {
  paused = true;
  document.body.classList.remove('flying');
  $('menu').classList.remove('hidden');
  renderMenu();
}
function closeMenu() {
  if (dirty.map) { loadMap(); }
  if (dirty.drone || dirty.map) { loadDrone(); resetDrone(); }
  dirty = { map: false, drone: false };
  applyPhysicsOpts();
  applyGraphics();
  $('menu').classList.add('hidden');
  document.body.classList.add('flying');
  paused = false;
  last = performance.now(); acc = 0;
  calibUI = null;
  if (S.game !== 'race') world.highlightGates(-1, null); else world.highlightGates(race.next, race.passed);
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const k of kids.flat()) if (k !== null && k !== undefined) e.append(k.nodeType ? k : document.createTextNode(k));
  return e;
}

function seg(label, hint, options, value, onChange) {
  const box = el('div', { class: 'seg' });
  options.forEach(([v, t]) => box.append(el('button', { class: v === value ? 'on' : '', onclick: () => { onChange(v); renderMenu(); } }, t)));
  return el('div', { class: 'row' }, el('label', {}, label, hint ? el('small', {}, hint) : null), box);
}
function toggle(label, hint, value, onChange) {
  return el('div', { class: 'row' }, el('label', {}, label, hint ? el('small', {}, hint) : null),
    el('button', { class: 'switch' + (value ? ' on' : ''), 'aria-pressed': value, onclick: () => { onChange(!value); renderMenu(); } }));
}
function slider(label, hint, min, max, step, value, onInput, fmtv = v => v) {
  const out = el('output', {}, fmtv(value));
  const r = el('input', { type: 'range', min, max, step, value });
  r.addEventListener('input', () => { const v = parseFloat(r.value); out.textContent = fmtv(v); onInput(v); });
  return el('div', { class: 'row' }, el('label', {}, label, hint ? el('small', {}, hint) : null), r, out);
}

const statCache = {};
function droneStats(id) {
  if (statCache[id]) return statCache[id];
  const spec = specFor(id);
  const q = new Quad(spec, { battery: false, propwash: false });
  q.reset(new THREE.Vector3(0, 300, 0)); q.armed = true; q.motor = 1;
  let top = 0;
  const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -65 * Math.PI / 180);
  for (let i = 0; i < 1500; i++) { q.quat.copy(tilt); q.w.set(0, 0, 0); q.step(0.01, { t: 1, y: 0, p: 0, r: 0 }); top = Math.max(top, Math.hypot(q.vel.x, q.vel.z)); }
  return (statCache[id] = {
    twr: spec.maxThrust / (spec.mass * 9.81), hover: q.hoverThrottle(), top: top * 3.6,
    rate: betaflightRate(1, spec.rates.rc, spec.rates.sr, spec.rates.expo),
  });
}

function renderMenu() {
  const tabs = $('tabs'); tabs.innerHTML = '';
  TABS.forEach(([id, t]) => tabs.append(el('button', { class: id === activeTab ? 'active' : '', onclick: () => { activeTab = id; renderMenu(); } }, t)));
  const P = $('panels'); P.innerHTML = '';
  calibUI = null;
  const panel = el('div', { class: 'panel active' });
  P.append(panel);
  ({ fly: panelFly, drone: panelDrone, cam: panelCam, ctrl: panelCtrl, phys: panelPhys, gfx: panelGfx })[activeTab](panel);
}

function panelFly(p) {
  p.append(el('h3', {}, 'Peta'));
  const cards = el('div', { class: 'cards' });
  MAP_ORDER.forEach(id => cards.append(el('div', { class: 'card' + (S.map === id ? ' sel' : ''), onclick: () => { if (S.map !== id) { S.map = id; dirty.map = true; save(); } renderMenu(); } },
    el('b', {}, MAPS[id].name), el('small', {}, MAPS[id].desc))));
  p.append(cards);
  p.append(el('h3', {}, 'Permainan'));
  p.append(seg('Mode', 'Balap: gerbang berurutan, waktu lap, dan ghost lap terbaik. Freestyle: terbang bebas.', [['race', 'Balap'], ['free', 'Freestyle']], S.game, v => { S.game = v; save(); }));
  p.append(seg('Mode terbang', 'Acro = kendali laju penuh seperti drone FPV sungguhan. Angle = drone kembali datar saat stik dilepas.', [['acro', 'Acro'], ['angle', 'Angle']], S.flightMode, v => { S.flightMode = v; save(); }));
  p.append(toggle('Bantuan ketinggian', 'Untuk pemula / layar sentuh: throttle di tengah = melayang di ketinggian tetap.', S.altHold, v => { S.altHold = v; save(); }));
  p.append(el('h3', {}, 'Drone terpilih'));
  const d = DRONES[S.drone];
  p.append(el('div', { class: 'note' }, `${d.name} — ${d.desc} (ganti di tab Drone)`));
  if (S.game === 'race') {
    p.append(el('div', { class: 'row' }, el('label', {}, 'Rekor lap ' + MAPS[S.map].name + ' / ' + d.name,
      el('small', {}, fmt(store.get(`best:${S.map}:${S.drone}`, { time: null }).time))),
      el('button', { class: 'sec', onclick: () => { store.del(`best:${S.map}:${S.drone}`); if (race.world) race.resetBest(); renderMenu(); } }, 'Hapus rekor')));
  }
  p.append(el('div', { class: 'row' }, el('label', {}, 'Layar penuh & landscape', el('small', {}, 'Disarankan di ponsel.')),
    el('button', { class: 'sec', onclick: goFullscreen }, 'Layar penuh')));
}

function panelDrone(p) {
  p.append(el('h3', {}, 'Pilih drone'));
  const cards = el('div', { class: 'cards' });
  DRONE_ORDER.forEach(id => {
    const d = DRONES[id], st = droneStats(id);
    cards.append(el('div', { class: 'card' + (S.drone === id ? ' sel' : ''), onclick: () => { if (S.drone !== id) { S.drone = id; dirty.drone = true; save(); } renderMenu(); } },
      el('b', {}, el('span', { class: 'swatch', style: `background:#${d.color.toString(16).padStart(6, '0')}` }), d.name),
      el('small', {}, d.desc),
      el('div', { class: 'stats', html: `Massa ${Math.round(d.mass * 1000)} g · TWR ${st.twr.toFixed(1)}<br>Hover ±${Math.round(st.hover * 100)}% · Puncak ±${Math.round(st.top)} km/j<br>Rate maks ${Math.round(st.rate)}°/s · Kamera ${specFor(id).camTilt}°` })));
  });
  p.append(cards);

  const id = S.drone, spec = specFor(id);
  const R = Object.assign({}, spec.rates);
  p.append(el('h3', {}, `Rates (Betaflight) — ${DRONES[id].name}`));
  const cv = el('canvas', { class: 'curve', width: 720, height: 300 });
  const setR = (k, v) => { R[k] = v; S.rates[id] = Object.assign({}, R); save(); delete statCache[id]; dirty.drone = true; drawCurve(cv, R); };
  const two = el('div', { class: 'two' });
  const left = el('div'), right = el('div');
  left.append(
    slider('RC Rate roll/pitch', null, 0.3, 2.5, 0.01, R.rc, v => setR('rc', v), v => v.toFixed(2)),
    slider('Super Rate roll/pitch', null, 0, 0.95, 0.01, R.sr, v => setR('sr', v), v => v.toFixed(2)),
    slider('Expo', 'Melembutkan tengah stik', 0, 1, 0.01, R.expo, v => setR('expo', v), v => v.toFixed(2)),
    slider('RC Rate yaw', null, 0.3, 2.5, 0.01, R.yawRc, v => setR('yawRc', v), v => v.toFixed(2)),
    slider('Super Rate yaw', null, 0, 0.95, 0.01, R.yawSr, v => setR('yawSr', v), v => v.toFixed(2)),
  );
  right.append(cv, el('div', { class: 'row' }, el('button', { class: 'sec', onclick: () => { delete S.rates[id]; save(); delete statCache[id]; dirty.drone = true; renderMenu(); } }, 'Kembalikan rates bawaan')));
  two.append(left, right);
  p.append(two);
  requestAnimationFrame(() => drawCurve(cv, R));
}

function drawCurve(cv, R) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  g.clearRect(0, 0, W, H);
  const max = 1200;
  g.strokeStyle = '#26354c'; g.lineWidth = 1;
  for (let v = 200; v < max; v += 200) { const y = H - v / max * H; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); g.fillStyle = '#5f7088'; g.font = '20px monospace'; g.fillText(v + '°/s', 6, y - 4); }
  const plot = (rc, sr, col) => {
    g.strokeStyle = col; g.lineWidth = 4; g.beginPath();
    for (let i = 0; i <= 100; i++) { const x = i / 100, r = betaflightRate(x, rc, sr, R.expo); const px = x * W, py = H - r / max * H; i ? g.lineTo(px, py) : g.moveTo(px, py); }
    g.stroke();
  };
  plot(R.rc, R.sr, '#ff7a00'); plot(R.yawRc, R.yawSr, '#2f7dff');
  g.fillStyle = '#ff9a3c'; g.font = 'bold 22px monospace';
  g.fillText(`Roll/Pitch ${Math.round(betaflightRate(1, R.rc, R.sr, R.expo))}°/s`, W - 330, 30);
  g.fillStyle = '#6aa4ff'; g.fillText(`Yaw ${Math.round(betaflightRate(1, R.yawRc, R.yawSr, R.expo))}°/s`, W - 330, 58);
}

function panelCam(p) {
  p.append(el('h3', {}, 'Kamera'));
  p.append(seg('Tampilan', 'FPV = kacamata, Chase = dari belakang, LOS = dari posisi pilot.', [['fpv', 'FPV'], ['chase', 'Chase'], ['los', 'LOS']], S.view, v => { S.view = v; save(); }));
  const id = S.drone;
  p.append(slider('Sudut kamera (uptilt)', 'Semakin besar, semakin cepat drone bisa terbang sambil tetap melihat ke depan.', 0, 60, 1, specFor(id).camTilt, v => { S.tilt[id] = v; quad.spec.camTilt = v; save(); }, v => v + '°'));
  p.append(slider('FOV', 'Bidang pandang kamera FPV.', 70, 150, 1, S.fov, v => { S.fov = v; save(); }, v => v + '°'));
  p.append(toggle('Efek video analog', 'Garis pindai dan vignette seperti video FPV analog.', S.analog, v => { S.analog = v; save(); applyGraphics(); }));
}

function panelCtrl(p) {
  const c = input.cfg;
  p.append(el('h3', {}, 'Stik layar sentuh'));
  p.append(seg('Mode stik', 'Mode 2: throttle & yaw di kiri. Mode 1: pitch & yaw di kiri, throttle di kanan.', [[2, 'Mode 2'], [1, 'Mode 1']], c.stickMode, v => { c.stickMode = v; input.saveCfg(); }));
  p.append(slider('Ukuran stik', null, 0.1, 0.25, 0.01, c.stickSize, v => { c.stickSize = v; input.saveCfg(); }, v => Math.round(v * 100) + '%'));
  p.append(slider('Transparansi stik', null, 0.15, 0.9, 0.05, c.opacity, v => { c.opacity = v; input.saveCfg(); }, v => Math.round(v * 100) + '%'));

  p.append(el('h3', {}, 'Radio transmitter / gamepad'));
  p.append(el('div', { class: 'note', html: 'Sambungkan radio (EdgeTX/OpenTX/ELRS) ke ponsel dengan <b>kabel USB OTG</b> dan pilih mode <b>USB Joystick (HID)</b> di radio. Gamepad USB atau Bluetooth juga didukung. Gerakkan stik agar terdeteksi, lalu jalankan kalibrasi.' }));
  const status = el('div', { class: 'note' });
  const axes = el('div', { class: 'axes' });
  p.append(status, axes);
  p.append(el('div', { class: 'row' },
    el('button', { class: 'sec', onclick: startCalibration }, 'Kalibrasi kontroler'),
    el('button', { class: 'sec', onclick: () => { input.map = null; store.del('padmap'); renderMenu(); } }, 'Pakai pemetaan bawaan')));
  p.append(slider('Deadband', 'Abaikan gerakan kecil di tengah stik.', 0, 0.1, 0.005, c.deadband, v => { c.deadband = v; input.saveCfg(); }, v => (v * 100).toFixed(1) + '%'));
  let lastN = -1;
  calibUI = () => {
    const pad = input.pad();
    if (!pad) { status.textContent = 'Belum ada kontroler terdeteksi.'; axes.innerHTML = ''; lastN = -1; return; }
    status.textContent = `Terdeteksi: ${pad.id} · pemetaan: ${input.map ? 'hasil kalibrasi' : 'bawaan (' + input.defaultMap(pad).kind + ')'}`;
    if (lastN !== pad.axes.length) {
      axes.innerHTML = '';
      pad.axes.forEach((_, i) => axes.append(el('div', {}, `Sumbu ${i} `, el('div', { class: 'bar' }, el('i')))));
      lastN = pad.axes.length;
    }
    pad.axes.forEach((v, i) => {
      const bar = axes.children[i]?.querySelector('i'); if (!bar) return;
      const x = (v + 1) / 2 * 100; bar.style.left = Math.min(50, x) + '%'; bar.style.width = Math.abs(x - 50) + '%';
    });
  };

  p.append(el('h3', {}, 'Keyboard (desktop)'));
  p.append(el('div', { class: 'note', html: '<span class="kbd">W</span>/<span class="kbd">S</span> throttle · <span class="kbd">A</span>/<span class="kbd">D</span> yaw · <span class="kbd">↑</span>/<span class="kbd">↓</span> pitch · <span class="kbd">←</span>/<span class="kbd">→</span> roll · <span class="kbd">Spasi</span> arm · <span class="kbd">R</span> reset · <span class="kbd">Esc</span> menu' }));
}

function startCalibration() {
  const cal = new Calibrator(input);
  const show = (err) => {
    const st = CAL_STEPS[cal.step];
    $('modal-body').innerHTML = '';
    $('modal-body').append(
      el('h3', {}, `Kalibrasi ${cal.step + 1}/${CAL_STEPS.length}`),
      el('div', { class: 'note' }, st.text),
      err ? el('div', { class: 'err' }, err) : null,
      el('div', { class: 'actions' },
        el('button', { class: 'sec', onclick: () => $('modal').classList.add('hidden') }, 'Batal'),
        st.key === 'arm' ? el('button', { class: 'sec', onclick: () => step(true) }, 'Lewati') : null,
        el('button', { class: 'primary', onclick: () => step(false) }, 'Lanjut')));
  };
  const step = (skip) => {
    const r = cal.next(skip);
    if (r.error) return show(r.error);
    if (r.done) {
      $('modal-body').innerHTML = '';
      $('modal-body').append(el('h3', {}, 'Kalibrasi selesai'), el('div', { class: 'note' }, 'Pemetaan disimpan. Kembali ke tab Kontrol untuk memeriksa sumbu.'),
        el('div', { class: 'actions' }, el('button', { class: 'primary', onclick: () => { $('modal').classList.add('hidden'); renderMenu(); } }, 'Selesai')));
      return;
    }
    show();
  };
  $('modal').classList.remove('hidden');
  show();
}

function panelPhys(p) {
  p.append(el('h3', {}, 'Model fisika'));
  p.append(toggle('Airmode', 'Kendali sudut tetap penuh walau throttle 0 (wajib untuk flip & roll).', S.airmode, v => { S.airmode = v; save(); }));
  p.append(toggle('Simulasi baterai', 'Tegangan turun (sag) saat throttle tinggi dan seiring waktu, dorongan ikut melemah.', S.battery, v => { S.battery = v; save(); }));
  p.append(toggle('Prop wash', 'Guncangan saat drone turun menembus aliran udaranya sendiri.', S.propwash, v => { S.propwash = v; save(); }));
  p.append(seg('Tabrakan', 'Realistis: benturan keras membuat drone jatuh. Memantul: tidak pernah crash.', [['realistic', 'Realistis'], ['bounce', 'Memantul']], S.crashMode, v => { S.crashMode = v; save(); }));
  p.append(el('div', { class: 'note', html:
    'Model yang dipakai: integrasi 400 Hz; kurva rate Betaflight (RC Rate, Super Rate, Expo); pengendali laju dengan batas percepatan sudut per drone; ' +
    'respons motor orde-1 (spool-up); kurva dorong mendekati kuadrat; dorong berkurang seiring kecepatan aliran masuk (batas kecepatan baling-baling); ' +
    'hambatan udara kuadratik berbeda per sumbu badan (depan, samping, atas); sag baterai; prop wash; tumbukan dengan pantulan, gesekan, dan putaran.' }));
}

function panelGfx(p) {
  p.append(el('h3', {}, 'Grafis'));
  p.append(seg('Kualitas', 'Turunkan bila ponsel terasa patah-patah.', [['low', 'Rendah'], ['med', 'Sedang'], ['high', 'Tinggi']], S.quality, v => { S.quality = v; save(); applyGraphics(); }));
  p.append(toggle('Bayangan', 'Lebih realistis, lebih berat.', S.shadows, v => { S.shadows = v; save(); applyGraphics(); }));
  p.append(toggle('Ghost lap terbaik', 'Balap melawan rekaman lap terbaikmu sendiri.', S.ghost, v => { S.ghost = v; save(); }));
}

function goFullscreen() {
  const d = document.documentElement;
  (d.requestFullscreen ? d.requestFullscreen() : Promise.resolve()).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
}

// ================= Tombol HUD =================
$('btn-menu').addEventListener('click', openMenu);
$('btn-arm').addEventListener('click', () => toggleArm());
$('btn-reset').addEventListener('click', resetDrone);
$('btn-view').addEventListener('click', () => { S.view = { fpv: 'chase', chase: 'los', los: 'fpv' }[S.view]; save(); });
$('btn-fly').addEventListener('click', closeMenu);

// ================= Mulai =================
loadMap();
loadDrone();
resetDrone();
openMenu();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && location.protocol.startsWith('http') && !import.meta.env.DEV && !window.Capacitor?.isNativePlatform?.()) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
// akses untuk pengujian
window.__sim = { S, get quad() { return quad; }, race, world, input, closeMenu, openMenu, toggleArm, resetDrone };
