// Peta: geometri, penghalang (collider), dan gerbang balap.
import * as THREE from 'three';
import { installExtraMaps } from './maps-extra.js';

export const MAPS = {
  field: { name: 'Lapangan Terbuka', desc: 'Padang rumput luas berpagar 320 × 320 m: lumbung, kincir angin, jerami.' },
  beach: { name: 'Pantai', desc: 'Pasir, pohon kelapa, dermaga, dan perahu layar yang bergoyang di laut.' },
  mountains: { name: 'Pegunungan', desc: 'Lembah dikelilingi gunung bersalju, hutan pinus, danau, dan beruang.' },
  stadium: { name: 'Stadion Balap', desc: 'Lapangan terbuka, 8 gerbang berliku dengan variasi ketinggian.' },
  industrial: { name: 'Kawasan Industri', desc: 'Gedung, jembatan, kontainer, pohon. Ideal untuk freestyle.' },
  warehouse: { name: 'Gudang Whoop', desc: 'Ruangan tertutup dengan rak dan gerbang kecil untuk drone mungil.' },
};
export const MAP_ORDER = ['stadium', 'field', 'beach', 'mountains', 'industrial', 'warehouse'];

function canvasTex(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const TEX = {
  grass: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#4f7d35'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2; i++) { g.fillStyle = i ? '#55853a' : '#4a7631'; g.fillRect(0, i * s / 2, s, s / 2); }
    for (let i = 0; i < 4000; i++) {
      const l = 60 + Math.random() * 60;
      g.fillStyle = `rgba(${l * 0.6},${l + 40},${l * 0.4},0.35)`;
      g.fillRect(Math.random() * s, Math.random() * s, 1.5, 1.5);
    }
  }, 120),
  asphalt: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#4a4c50'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 6000; i++) {
      const l = 50 + Math.random() * 70;
      g.fillStyle = `rgba(${l},${l},${l},0.4)`;
      g.fillRect(Math.random() * s, Math.random() * s, 1, 1);
    }
    g.strokeStyle = 'rgba(230,230,230,0.5)'; g.lineWidth = 3; g.setLineDash([24, 24]);
    g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s); g.stroke();
  }, 60),
  concrete: () => canvasTex(256, (g, s) => {
    g.fillStyle = '#8d8f92'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {
      const l = 110 + Math.random() * 60;
      g.fillStyle = `rgba(${l},${l},${l},0.3)`;
      g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    }
    g.strokeStyle = 'rgba(60,60,60,0.5)'; g.lineWidth = 2;
    g.strokeRect(0, 0, s, s);
  }, 12),
  windows: () => {
    const t = canvasTex(128, (g, s) => {
      g.fillStyle = '#6f7782'; g.fillRect(0, 0, s, s);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
        g.fillStyle = Math.random() < 0.3 ? '#cfe3ff' : '#2b3848';
        g.fillRect(x * 32 + 5, y * 32 + 6, 22, 18);
      }
    }, 1);
    return t;
  },
};

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.root = null;
  }

  load(id) {
    if (this.root) { this.scene.remove(this.root); dispose(this.root); }
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.colliders = [];
    this.gates = [];
    this.id = id;
    this.indoor = false;
    this.spawn = null;
    this.terrain = null;
    this.water = null;
    this.ticks = [];
    this[id]();
    this.finalizeGates();
    return this;
  }

  // Permukaan tanah untuk fisika & penempatan objek
  heightAt(x, z, out) {
    if (this.terrain) return this.terrain.heightAt(x, z, out);
    if (out) out.set(0, 1, 0);
    return 0;
  }

  update(t, dt) { for (const f of this.ticks) f(t, dt); }

  // ---------- Helper ----------
  mat(color, extra = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...extra }); }

  box(x, y, z, w, h, d, { rot = 0, color = 0x888888, mat, collide = true, shadow = true } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || this.mat(color));
    m.position.set(x, y, z); m.rotation.y = rot;
    m.castShadow = shadow; m.receiveShadow = true;
    this.root.add(m);
    if (collide) this.colliders.push({
      type: 'box', x, y, z, hx: w / 2, hy: h / 2, hz: d / 2,
      cos: Math.cos(rot), sin: -Math.sin(rot), br: Math.hypot(w, h, d) / 2,
    });
    return m;
  }

  cyl(x, z, r, h, { y0 = 0, color = 0x777777, mat, collide = true, seg = 12 } = {}) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), mat || this.mat(color));
    m.position.set(x, y0 + h / 2, z); m.castShadow = true; m.receiveShadow = true;
    this.root.add(m);
    if (collide) this.colliders.push({ type: 'cyl', x, z, r, y0, y1: y0 + h, y: y0 + h / 2, br: Math.hypot(r, h / 2) });
    return m;
  }

  tree(x, z, s = 1) {
    this.cyl(x, z, 0.25 * s, 3 * s, { color: 0x5b3a1f });
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(2.2 * s, 6 * s, 8), this.mat(0x2f6b2a));
    leaves.position.set(x, 3 * s + 2.6 * s, z); leaves.castShadow = true;
    this.root.add(leaves);
    this.colliders.push({ type: 'cyl', x, z, r: 1.3 * s, y0: 3 * s, y1: 8 * s, y: 5.5 * s, br: 4 * s });
  }

  ground(tex, size = 1200) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.receiveShadow = true;
    this.root.add(m);
  }

  // Start pad tipis (tanpa collider) agar kamera drone mungil tidak masuk ke dalamnya.
  pad(x, z, rot = 0, size = 1.2, y = 0) {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.mat(0x2a2a2a, { polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.set(-Math.PI / 2, 0, rot); m.position.y = 0.012; m.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.RingGeometry(size * 0.36, size * 0.4, 40),
      new THREE.MeshBasicMaterial({ color: 0xd9a400, polygonOffset: true, polygonOffsetFactor: -4 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.014;
    grp.add(m, ring);
    // ikuti kemiringan tanah
    const n = new THREE.Vector3(); this.heightAt(x, z, n);
    grp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    grp.position.set(x, y, z);
    this.root.add(grp);
  }

  // Gerbang: lubang w x h, alas lubang pada ketinggian base.
  gate(x, z, { w = 1.8, h = 1.8, base = 0, t = 0.12, rot = null, y } = {}) {
    if (y === undefined) y = Math.max(this.heightAt(x, z), this.water ?? -Infinity, this.terrain ? -Infinity : 0);
    this.gates.push({ x, z, w, h, base: base + y, t, rot, floor: y });
  }

  finalizeGates() {
    const n = this.gates.length;
    this.gateMeshes = [];
    this.gates.forEach((g, i) => {
      if (g.rot === null) {
        const prev = this.gates[(i - 1 + n) % n], next = this.gates[(i + 1) % n];
        const dx = next.x - prev.x, dz = next.z - prev.z;
        g.rot = Math.atan2(-dx, -dz);
      }
      g.cos = Math.cos(g.rot); g.sin = -Math.sin(g.rot);
      g.cy = g.base + g.h / 2;
      const grp = new THREE.Group();
      grp.position.set(g.x, 0, g.z); grp.rotation.y = g.rot;
      const mat = new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0xff7a00, emissiveIntensity: 0.35, roughness: 0.5 });
      const { w, h, t, base } = g;
      const bar = (lx, ly, bw, bh) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, t), mat);
        m.position.set(lx, ly, 0); m.castShadow = true; grp.add(m);
        // collider dunia
        const wx = g.x + lx * Math.cos(g.rot), wz = g.z - lx * Math.sin(g.rot);
        this.colliders.push({ type: 'box', x: wx, y: ly, z: wz, hx: bw / 2, hy: bh / 2, hz: t / 2, cos: g.cos, sin: g.sin, br: Math.hypot(bw, bh) / 2 });
      };
      bar(0, base + h + t / 2, w + 2 * t, t);                         // atas
      if (base > g.floor + 0.01) bar(0, base - t / 2, w + 2 * t, t);  // bawah
      const sideH = base + h - g.floor;
      bar(-(w / 2 + t / 2), g.floor + sideH / 2, t, sideH);             // kiri
      bar(w / 2 + t / 2, g.floor + sideH / 2, t, sideH);                // kanan
      // nomor gerbang
      const lbl = labelSprite(String(i + 1));
      lbl.position.set(0, base + h + t + Math.max(0.3, w * 0.25), 0);
      lbl.scale.setScalar(Math.max(0.4, w * 0.4));
      grp.add(lbl);
      this.root.add(grp);
      this.gateMeshes.push({ grp, mat });
    });
    // titik mulai: di belakang gerbang 1, menghadap ke arahnya
    if (!this.spawn && n) {
      const g = this.gates[0];
      const fx = -Math.sin(g.rot), fz = -Math.cos(g.rot);
      const back = Math.max(4, g.w * 4);
      this.spawn = { x: g.x - fx * back, z: g.z - fz * back, yaw: g.rot };
    }
    if (this.spawn) {
      if (this.spawn.y === undefined) this.spawn.y = this.heightAt(this.spawn.x, this.spawn.z);
      this.pad(this.spawn.x, this.spawn.z, this.spawn.yaw, this.indoor ? 0.35 : 1.2, this.spawn.y);
    }
  }

  highlightGates(next, done) {
    this.gateMeshes.forEach((m, i) => {
      const c = i === next ? 0x18ff6a : (done && done.has(i) ? 0x2f7dff : 0xff7a00);
      m.mat.color.setHex(c); m.mat.emissive.setHex(c);
      m.mat.emissiveIntensity = i === next ? 0.9 : 0.35;
    });
  }

  // ---------- Peta ----------
  stadium() {
    this.ground(TEX.grass());
    this.sky(0x8ec5ff, 0xdfeefc, 260);
    const pts = [[0, 0, 0], [30, -25, 1.5], [55, -60, 0], [35, -95, 4], [-5, -100, 0], [-40, -75, 2], [-50, -35, 0], [-25, -5, 0.8]];
    pts.forEach(([x, z, b]) => this.gate(x, z, { base: b }));
    // tribun
    for (let i = 0; i < 4; i++) {
      this.box(-95, 2 + i * 1.5, -50, 6 - i * 0.6, 1.5, 90, { color: 0x6a7380 });
      this.box(105, 2 + i * 1.5, -50, 6 - i * 0.6, 1.5, 90, { color: 0x6a7380 });
    }
    this.box(-95, 9, -50, 8, 0.3, 92, { color: 0xd9dde2 });
    // tiang lampu
    for (const [x, z] of [[-80, 0], [-80, -100], [90, 0], [90, -100]]) {
      this.cyl(x, z, 0.3, 22, { color: 0xb0b6bd });
      this.box(x, 22.5, z, 4, 1.2, 1, { color: 0xeeeeee });
    }
    // penghalang tiup (air block)
    const red = 0xe83b3b, wht = 0xf2f2f2;
    [[15, -45, red], [45, -80, wht], [10, -75, red], [-25, -55, wht], [-15, -30, red], [20, -10, wht]].forEach(([x, z, c], i) =>
      this.box(x, 1, z, 2.5, 2, 2.5, { rot: i * 0.7, color: c }));
    // pipa melengkung (bendera) sebagai penanda
    for (let i = 0; i < 10; i++) this.cyl(70, -10 - i * 10, 0.05, 3, { color: i % 2 ? 0xffffff : 0xff3030, collide: true, seg: 6 });
    this.spawnLight(0, -50, 60);
  }

  industrial() {
    this.ground(TEX.asphalt(), 1200);
    this.sky(0x9cb8d6, 0xe8ecef, 320);
    const win = TEX.windows();
    const bmat = (h) => { const t = win.clone(); t.needsUpdate = true; t.repeat.set(3, Math.round(h / 4)); return this.mat(0xffffff, { map: t }); };
    const bld = [[-40, -40, 18, 30, 16], [-40, 10, 14, 12, 20], [25, -30, 16, 45, 16], [25, 25, 20, 22, 14], [-5, -90, 40, 14, 12], [60, -80, 12, 60, 12]];
    bld.forEach(([x, z, w, h, d]) => this.box(x, h / 2, z, w, h, d, { mat: bmat(h) }));
    // jembatan antar gedung (bando)
    this.box(-7, 12, -35, 50, 1.2, 4, { color: 0x6e6e6e });
    this.cyl(-12, -35, 0.6, 11.4, { color: 0x6e6e6e });
    this.cyl(-2, -35, 0.6, 11.4, { color: 0x6e6e6e });
    // kontainer
    const cc = [0xc0392b, 0x2471a3, 0x229954, 0xd68910, 0x7d3c98];
    for (let i = 0; i < 10; i++) {
      const x = -60 + (i % 5) * 7, z = 50 + Math.floor(i / 5) * 3;
      this.box(x, 1.3, z, 6, 2.6, 2.5, { color: cc[i % 5] });
      if (i % 3 === 0) this.box(x, 3.9, z, 6, 2.6, 2.5, { color: cc[(i + 2) % 5] });
    }
    // menara air
    this.cyl(55, 20, 0.4, 14, { color: 0x888888 });
    this.cyl(60, 20, 0.4, 14, { color: 0x888888 });
    this.cyl(57.5, 20, 4, 5, { y0: 14, color: 0xa8b2bd, seg: 18 });
    // pohon
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2, r = 95 + (i % 3) * 8;
      this.tree(Math.cos(a) * r, Math.sin(a) * r - 20, 0.8 + (i % 4) * 0.15);
    }
    for (const [x, z] of [[0, 30], [8, 34], [-10, 38], [45, -5]]) this.tree(x, z, 0.9);
    // rute gerbang
    [[0, 0, 0, 0], [-7, -25, 0, 0], [-7, -45, 0, 0], [5, -65, 3, 0], [42, -55, 0, 0], [42, 0, 6, 0], [10, 45, 0, 0]].forEach(([x, z, b]) =>
      this.gate(x, z, { base: b, w: 2.2, h: 2.2 }));
    this.spawnLight(0, -20, 80);
  }

  warehouse() {
    this.indoor = true;
    this.sky(0x2a2d33, 0x3a3d44, 70);
    const W = 34, L = 24, H = 7;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ map: TEX.concrete(), roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.root.add(floor);
    const wall = this.mat(0xb7b2a8, { side: THREE.DoubleSide });
    this.box(0, H / 2, -L / 2 - 0.25, W, H, 0.5, { mat: wall, shadow: false });
    this.box(0, H / 2, L / 2 + 0.25, W, H, 0.5, { mat: wall, shadow: false });
    this.box(-W / 2 - 0.25, H / 2, 0, 0.5, H, L, { mat: wall, shadow: false });
    this.box(W / 2 + 0.25, H / 2, 0, 0.5, H, L, { mat: wall, shadow: false });
    this.box(0, H + 0.25, 0, W, 0.5, L, { color: 0x55585e, shadow: false });
    // balok atap
    for (let i = -3; i <= 3; i++) this.box(i * 5, H - 0.6, 0, 0.3, 0.6, L, { color: 0x3b3f46 });
    // rak
    for (let r = 0; r < 3; r++) {
      const z = -6 + r * 6;
      for (const sx of [-1, 1]) {
        const x = sx * 9;
        for (let lv = 0; lv < 4; lv++) this.box(x, 0.6 + lv * 1.2, z, 8, 0.08, 1.2, { color: 0xd35400 });
        for (const px of [-4, 0, 4]) this.box(x + px, 2.4, z, 0.1, 4.8, 1.2, { color: 0x2c3e50 });
        for (let k = 0; k < 6; k++) this.box(x - 3.2 + k * 1.3, 0.95 + (k % 4) * 1.2, z, 0.9, 0.6, 0.8, { color: 0xc8a46e });
      }
    }
    // kotak-kotak dan tong
    for (const [x, z] of [[2, 9], [3, 9.6], [-2, -9], [13, 8], [-14, -8]]) this.box(x, 0.4, z, 0.8, 0.8, 0.8, { color: 0xb08850 });
    for (const [x, z] of [[14, -9], [14.8, -9.4], [-14, 9]]) this.cyl(x, z, 0.3, 0.9, { color: 0x1f6fb2 });
    // gerbang kecil
    [[0, 6, 0], [-12, 3, 0.6], [-13, -3, 0], [0, -3, 1.2], [12, -3, 0], [12, 3, 0.4], [4, 10, 0]].forEach(([x, z, b]) =>
      this.gate(x, z, { w: 0.7, h: 0.6, base: b, t: 0.05 }));
    // lampu
    this.scene.fog = new THREE.Fog(0x2a2d33, 20, 60);
    for (let i = -1; i <= 1; i++) {
      const p = new THREE.PointLight(0xfff1d6, 25, 25, 1.6);
      p.position.set(i * 11, H - 1, 0); this.root.add(p);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      lamp.position.set(i * 11, H - 0.9, 0); this.root.add(lamp);
    }
    this.spawnLight(0, 0, 18, 0.5);
  }

  sky(top, bottom, fogFar) {
    const geo = new THREE.SphereGeometry(900, 24, 12);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.15,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0);}',
    });
    const s = new THREE.Mesh(geo, mat);
    s.renderOrder = -1;
    s.userData.follow = true;
    this.root.add(s);
    this.skyMesh = s;
    this.scene.fog = new THREE.Fog(bottom, fogFar * 0.4, fogFar * 2.2);
  }

  spawnLight(cx, cz, range, intensity = 1) {
    const hemi = new THREE.HemisphereLight(0xdfefff, 0x4a4030, 0.9 * intensity + 0.3);
    this.root.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.8 * intensity);
    sun.position.set(cx + range * 0.6, range * 1.2, cz + range * 0.4);
    sun.target.position.set(cx, 0, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const c = sun.shadow.camera;
    c.left = c.bottom = -range * 1.3; c.right = c.top = range * 1.3; c.near = 1; c.far = range * 4;
    sun.shadow.bias = -0.0005;
    this.root.add(sun, sun.target);
    this.sun = sun;
  }
}

installExtraMaps(World, TEX);

function labelSprite(text) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff'; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false }));
}

function dispose(o) {
  o.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      const ms = Array.isArray(c.material) ? c.material : [c.material];
      ms.forEach(m => { if (m.map) m.map.dispose(); m.dispose(); });
    }
  });
}
