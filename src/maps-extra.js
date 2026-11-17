// Peta alam: Lapangan Terbuka, Pantai, Pegunungan + aset prosedural.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Terrain, waterMesh, fbm, smooth, rng } from './terrain.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0);

export function installExtraMaps(World, TEX) {
  const P = World.prototype;

  // ---------- Batching geometri (sedikit draw call, ramah ponsel) ----------
  P.addGeo = function (key, color, geo, x = 0, y = 0, z = 0, rotY = 0, sx = 1, sy = 1, sz = 1, quat = null) {
    if (!this.batches) this.batches = {};
    const b = this.batches[key] || (this.batches[key] = { color, geos: [] });
    if (quat) _q.copy(quat); else _q.setFromAxisAngle(Y, rotY);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(_m);
    b.geos.push(g);
  };
  P.flushBatches = function () {
    if (!this.batches) return;
    for (const b of Object.values(this.batches)) {
      if (!b.geos.length) continue;
      const g = mergeGeometries(b.geos, false);
      b.geos.forEach(x => x.dispose());
      const m = new THREE.Mesh(g, this.mat(b.color, { flatShading: true }));
      m.castShadow = true; m.receiveShadow = true;
      this.root.add(m);
    }
    this.batches = null;
  };
  P.addCyl = function (x, z, r, y0, y1) {
    this.colliders.push({ type: 'cyl', x, z, r, y0, y1, y: (y0 + y1) / 2, br: Math.hypot(r, (y1 - y0) / 2) });
  };
  P.addBox = function (x, y, z, w, h, d, rot = 0) {
    const c = { type: 'box', x, y, z, hx: w / 2, hy: h / 2, hz: d / 2, cos: Math.cos(rot), sin: -Math.sin(rot), br: Math.hypot(w, h, d) / 2 };
    this.colliders.push(c);
    return c;
  };
  P.setTerrain = function (size, segs, fn, colorFn) {
    this.terrain = new Terrain(size, segs, fn, colorFn);
    this.root.add(this.terrain.mesh);
  };
  P.addWater = function (level, size, x = 0, z = 0, color) {
    this.water = level;
    const w = waterMesh(size, level, color);
    w.position.x = x; w.position.z = z;
    this.root.add(w);
    this.ticks.push(t => w.userData.tick(t));
  };
  // Jarak titik ke rute gerbang (agar pohon tidak menutup jalur balap)
  P.nearRoute = function (pts, x, z, d) {
    for (let i = 0; i < pts.length; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
      const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
      if (Math.hypot(x - ax - vx * t, z - az - vz * t) < d) return true;
    }
    return false;
  };

  // ---------- Aset ----------
  const G = {
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    cylHi: new THREE.CylinderGeometry(1, 1, 1, 14),
    cone: new THREE.ConeGeometry(1, 1, 8),
    box: new THREE.BoxGeometry(1, 1, 1),
    sph: new THREE.IcosahedronGeometry(1, 1),
    rock: new THREE.DodecahedronGeometry(1, 0),
  };

  P.pine = function (x, z, s = 1, shade = 0) {
    const y = this.heightAt(x, z);
    this.addGeo('trunk', 0x4a2f1b, G.cyl, x, y + 1 * s, z, 0, 0.22 * s, 2 * s, 0.22 * s);
    const key = shade ? 'pineB' : 'pineA', col = shade ? 0x2a5a34 : 0x1d4a2a;
    this.addGeo(key, col, G.cone, x, y + 3.2 * s, z, s, 2.3 * s, 3.6 * s, 2.3 * s);
    this.addGeo(key, col, G.cone, x, y + 5.0 * s, z, s * 2, 1.75 * s, 3.0 * s, 1.75 * s);
    this.addGeo(key, col, G.cone, x, y + 6.6 * s, z, s * 3, 1.15 * s, 2.6 * s, 1.15 * s);
    this.addCyl(x, z, 0.3 * s, y, y + 1.6 * s);
    this.addCyl(x, z, 1.5 * s, y + 1.6 * s, y + 7.6 * s);
  };

  P.oak = function (x, z, s = 1) {
    const y = this.heightAt(x, z);
    this.addGeo('trunk', 0x4a2f1b, G.cyl, x, y + 1.6 * s, z, 0, 0.35 * s, 3.2 * s, 0.35 * s);
    this.addGeo('oak', 0x3d6b2a, G.sph, x, y + 4.4 * s, z, 0, 2.6 * s, 2.1 * s, 2.6 * s);
    this.addGeo('oak', 0x3d6b2a, G.sph, x + 1.4 * s, y + 3.8 * s, z + 0.6 * s, 1, 1.7 * s, 1.5 * s, 1.7 * s);
    this.addGeo('oak', 0x3d6b2a, G.sph, x - 1.2 * s, y + 3.9 * s, z - 0.8 * s, 2, 1.6 * s, 1.4 * s, 1.6 * s);
    this.addCyl(x, z, 0.4 * s, y, y + 2.5 * s);
    this.addCyl(x, z, 2.6 * s, y + 2.5 * s, y + 6.3 * s);
  };

  P.palm = function (x, z, s = 1, seed = 1) {
    const r = rng(seed), y0 = this.heightAt(x, z);
    const lean = 0.8 + r() * 1.6, dir = r() * Math.PI * 2, H = (6 + r() * 3) * s, N = 6;
    const pt = t => new THREE.Vector3(x + Math.cos(dir) * lean * t * t * s, y0 + H * t, z + Math.sin(dir) * lean * t * t * s);
    for (let i = 0; i < N; i++) {
      const a = pt(i / N), b = pt((i + 1) / N), d = b.clone().sub(a), len = d.length();
      const q = new THREE.Quaternion().setFromUnitVectors(Y, d.normalize());
      const rad = (0.28 - i * 0.025) * s, mid = a.add(b).multiplyScalar(0.5);
      this.addGeo('palmTrunk', 0x8a6a45, G.cyl, mid.x, mid.y, mid.z, 0, rad, len * 1.04, rad, q);
    }
    const top = pt(1);
    const leaf = new THREE.BoxGeometry(0.55, 0.05, 3.4); leaf.translate(0, 0, -1.7);
    for (let k = 0; k < 8; k++) {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.55 - r() * 0.3, k * Math.PI / 4 + r() * 0.3, 0, 'YXZ'));
      this.addGeo('palmLeaf', 0x3f8a2e, leaf, top.x, top.y, top.z, 0, s, s, s, q);
    }
    for (let k = 0; k < 3; k++) this.addGeo('coco', 0x5a3d1f, G.sph, top.x + Math.cos(k * 2.1) * 0.25, top.y - 0.25, top.z + Math.sin(k * 2.1) * 0.25, 0, 0.16, 0.16, 0.16);
    this.addCyl(x, z, 0.32 * s, y0, y0 + H * 0.6);
    this.addCyl(top.x, top.z, 0.4 * s, y0 + H * 0.6, y0 + H);
  };

  P.rock = function (x, z, r = 1.5, seed = 1) {
    const y = this.heightAt(x, z), rr = rng(seed);
    this.addGeo('rock', 0x7d7a74, G.rock, x, y + r * 0.25, z, rr() * 6, r, r * (0.55 + rr() * 0.3), r * (0.8 + rr() * 0.4));
    this.addCyl(x, z, r * 0.85, y - 1, y + r * 0.75);
  };

  P.sailboat = function (x, z, rot = 0, sailColor = 0xffffff, phase = 0) {
    const L = 9, W = 3, grp = new THREE.Group();
    const hull = new THREE.Shape();
    hull.moveTo(L / 2, 0);
    hull.quadraticCurveTo(L * 0.25, W / 2, -L / 2, W * 0.4);
    hull.lineTo(-L / 2, -W * 0.4);
    hull.quadraticCurveTo(L * 0.25, -W / 2, L / 2, 0);
    const hg = new THREE.ExtrudeGeometry(hull, { depth: 1.3, bevelEnabled: false });
    hg.rotateX(-Math.PI / 2); hg.translate(0, -0.6, 0);
    const hm = new THREE.Mesh(hg, this.mat(0xf4f4f0, { roughness: 0.4 }));
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(hull), this.mat(0xa77b4f));
    deck.rotation.x = -Math.PI / 2; deck.position.y = 0.71; deck.scale.setScalar(0.94);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(L * 0.8, 0.15, W * 0.86), this.mat(0x1f4fa0));
    stripe.position.set(-L * 0.05, 0.25, 0);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 1.6), this.mat(0xe8e8e2));
    cabin.position.set(-0.8, 1.05, 0);
    const mx = L * 0.1, mastH = 10.5;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, mastH, 8), this.mat(0xcfd3d8, { metalness: 0.6 }));
    mast.position.set(mx, 0.7 + mastH / 2, 0);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, L * 0.45, 6), this.mat(0xcfd3d8));
    boom.rotation.z = Math.PI / 2; boom.position.set(mx - L * 0.225, 2, 0);
    const sm = new THREE.MeshStandardMaterial({ color: sailColor, side: THREE.DoubleSide, roughness: 0.8 });
    const main = new THREE.Shape(); main.moveTo(0, 0); main.lineTo(-L * 0.45, 0); main.quadraticCurveTo(-L * 0.2, 4, 0, 8.6); main.lineTo(0, 0);
    const mainS = new THREE.Mesh(new THREE.ShapeGeometry(main), sm);
    mainS.position.set(mx, 2.05, 0); mainS.rotation.y = 0.25;
    const jib = new THREE.Shape(); jib.moveTo(0, 0); jib.lineTo(L * 0.47 - mx, 0); jib.lineTo(0, 7.8); jib.lineTo(0, 0);
    const jibS = new THREE.Mesh(new THREE.ShapeGeometry(jib), sm);
    jibS.position.set(mx, 1.0, 0); jibS.rotation.y = -0.15;
    grp.add(hm, deck, stripe, cabin, mast, boom, mainS, jibS);
    grp.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    grp.position.set(x, this.water, z); grp.rotation.y = rot;
    this.root.add(grp);
    const hullC = this.addBox(x, this.water + 0.1, z, L * 0.9, 1.4, W * 0.8, rot);
    const mwx = x + Math.cos(rot) * mx, mwz = z - Math.sin(rot) * mx;
    this.addCyl(mwx, mwz, 0.2, this.water, this.water + 0.7 + mastH);
    this.addBox(x + Math.cos(rot) * (mx - L * 0.2), this.water + 6, z - Math.sin(rot) * (mx - L * 0.2), L * 0.42, 8, 0.4, rot); // layar
    const lvl = this.water;
    this.ticks.push(t => {
      grp.position.y = lvl + Math.sin(t * 0.9 + phase) * 0.15;
      grp.rotation.z = Math.sin(t * 0.7 + phase) * 0.05;
      grp.rotation.x = Math.cos(t * 0.55 + phase) * 0.035;
      hullC.y = grp.position.y + 0.1;
    });
  };

  P.bear = function (cx, cz, radius = 10, speed = 1, phase = 0, walking = true) {
    const brown = this.mat(0x5b3a22), dark = this.mat(0x2a1a0e), light = this.mat(0x8a6a4a);
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
    add(G.sph, brown, 0, 0.88, 0, 0.45, 0.42, 0.85);       // badan
    add(G.sph, brown, 0, 1.13, -0.38, 0.36, 0.32, 0.4);     // punuk
    add(G.sph, brown, 0, 1.02, -0.98, 0.3, 0.28, 0.3);      // kepala
    add(G.box, light, 0, 0.95, -1.25, 0.18, 0.15, 0.24);    // moncong
    add(G.sph, dark, 0, 0.98, -1.38, 0.05, 0.05, 0.05);     // hidung
    add(G.sph, brown, 0.17, 1.27, -0.92, 0.09, 0.09, 0.06); // telinga
    add(G.sph, brown, -0.17, 1.27, -0.92, 0.09, 0.09, 0.06);
    add(G.sph, dark, 0.12, 1.09, -1.2, 0.035, 0.035, 0.035); // mata
    add(G.sph, dark, -0.12, 1.09, -1.2, 0.035, 0.035, 0.035);
    const legs = [];
    for (const [lx, lz, ph] of [[0.25, -0.5, 0], [-0.25, -0.5, Math.PI], [0.25, 0.5, Math.PI], [-0.25, 0.5, 0]]) {
      const pivot = new THREE.Group(); pivot.position.set(lx, 0.78, lz);
      const leg = new THREE.Mesh(G.cyl, brown); leg.scale.set(0.13, 0.75, 0.13); leg.position.y = -0.37; leg.castShadow = true;
      const paw = new THREE.Mesh(G.box, dark); paw.scale.set(0.2, 0.08, 0.26); paw.position.set(0, -0.74, -0.04);
      pivot.add(leg, paw); g.add(pivot); legs.push([pivot, ph]);
    }
    this.root.add(g);
    const col = { type: 'cyl', x: cx, z: cz, r: 0.75, y0: 0, y1: 1.4, y: 0.7, br: 1.2 };
    this.colliders.push(col);
    let a = phase;
    this.ticks.push((t, dt) => {
      let x = cx, z = cz, hx = 0, hz = -1;
      if (walking) {
        a += speed / radius * dt;
        x = cx + Math.cos(a) * radius; z = cz + Math.sin(a) * radius;
        hx = -Math.sin(a); hz = Math.cos(a);
        legs.forEach(([p, ph]) => (p.rotation.x = Math.sin(t * speed * 4 + ph) * 0.45));
      } else {
        g.children[2].rotation.x = Math.sin(t * 0.8) * 0.1; // kepala mengendus
      }
      const y = this.heightAt(x, z);
      g.position.set(x, y, z);
      if (walking) g.rotation.y = Math.atan2(-hx, -hz); else g.rotation.y = phase;
      col.x = x; col.z = z; col.y0 = y; col.y1 = y + 1.4; col.y = y + 0.7;
    });
  };

  P.cabin = function (x, z, rot = 0) {
    const y = this.heightAt(x, z);
    this.box(x, y + 1.6, z, 7, 3.2, 5, { rot, color: 0x7a4b2a });
    const roof = new THREE.Shape(); roof.moveTo(-4, 0); roof.lineTo(4, 0); roof.lineTo(0, 2.6); roof.lineTo(-4, 0);
    const rg = new THREE.ExtrudeGeometry(roof, { depth: 6, bevelEnabled: false }); rg.translate(0, 0, -3);
    const rm = new THREE.Mesh(rg, this.mat(0x3b2a20)); rm.position.set(x, y + 3.2, z); rm.rotation.y = rot + Math.PI / 2; rm.castShadow = true;
    this.root.add(rm);
    this.addBox(x, y + 4.2, z, 4, 2, 6, rot + Math.PI / 2);
    this.box(x + 1.8, y + 5, z, 0.7, 2.2, 0.7, { rot, color: 0x666666 });
  };

  P.barn = function (x, z, rot = 0) {
    this.box(x, 4, z, 14, 8, 20, { rot, color: 0x9b2d20 });
    const roof = new THREE.Shape(); roof.moveTo(-7.8, 0); roof.lineTo(7.8, 0); roof.lineTo(0, 5); roof.lineTo(-7.8, 0);
    const rg = new THREE.ExtrudeGeometry(roof, { depth: 21, bevelEnabled: false }); rg.translate(0, 0, -10.5);
    const rm = new THREE.Mesh(rg, this.mat(0x3a3a3a)); rm.position.set(x, 8, z); rm.rotation.y = rot; rm.castShadow = true;
    this.root.add(rm);
    this.addBox(x, 10, z, 8, 4, 21, rot);
    this.box(x + Math.sin(rot) * -10.05, 2.6, z + Math.cos(rot) * -10.05, 5, 5.2, 0.15, { rot, color: 0xf2f2f2, collide: false });
    // silo
    const sx = x + Math.cos(rot) * 11, sz = z - Math.sin(rot) * 11;
    this.cyl(sx, sz, 3, 16, { color: 0xb8bcc2, seg: 18 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), this.mat(0x8f949b));
    dome.position.set(sx, 16, sz); this.root.add(dome);
    this.addCyl(sx, sz, 2.4, 16, 18.8);
  };

  P.windTurbine = function (x, z, phase = 0) {
    const y = this.heightAt(x, z), H = 34;
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, H, 14), this.mat(0xf2f3f5));
    tower.position.set(x, y + H / 2, z); tower.castShadow = true; this.root.add(tower);
    this.addCyl(x, z, 1.2, y, y + H);
    const nac = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 4), this.mat(0xe6e8eb));
    nac.position.set(x, y + H + 0.6, z + 0.6); this.root.add(nac);
    this.addBox(x, y + H + 0.6, z + 0.6, 1.6, 1.6, 4);
    const rotor = new THREE.Group(); rotor.position.set(x, y + H + 0.6, z - 1.6);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 8), this.mat(0xffffff)); rotor.add(hub);
    for (let i = 0; i < 3; i++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.9, 15, 0.25), this.mat(0xfafafa));
      bl.geometry.translate(0, 7.8, 0); bl.rotation.z = i * Math.PI * 2 / 3; bl.castShadow = true; rotor.add(bl);
    }
    this.root.add(rotor);
    // bilah ikut bertabrakan: tiap bilah didekati 7 kubus kecil yang ikut berputar
    const parts = [];
    for (let i = 0; i < 3; i++) for (let k = 0; k < 7; k++) parts.push([i, 1.6 + k * 2, this.addBox(x, 0, z - 1.6, 1.8, 1.8, 0.8)]);
    this.ticks.push(t => {
      const a = t * 1.1 + phase;
      rotor.rotation.z = a;
      for (const [i, d, c] of parts) {
        const ang = a + i * Math.PI * 2 / 3;
        c.x = x - Math.sin(ang) * d; c.y = rotor.position.y + Math.cos(ang) * d;
      }
    });
  };

  P.hay = function (x, z, rot = 0, stack = false) {
    const y = this.heightAt(x, z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, Math.PI / 2));
    this.addGeo('hay', 0xd9b55a, G.cylHi, x, y + 0.7, z, 0, 0.7, 1.3, 0.7, q);
    this.addBox(x, y + 0.7, z, 1.3, 1.4, 1.4, rot);
    if (stack) {
      const dx = Math.sin(rot) * 1.45, dz = Math.cos(rot) * 1.45;
      this.addGeo('hay', 0xd9b55a, G.cylHi, x + dx, y + 0.7, z + dz, 0, 0.7, 1.3, 0.7, q);
      this.addGeo('hay', 0xd9b55a, G.cylHi, x + dx / 2, y + 1.9, z + dz / 2, 0, 0.7, 1.3, 0.7, q);
      this.addBox(x + dx, y + 0.7, z + dz, 1.3, 1.4, 1.4, rot);
      this.addBox(x + dx / 2, y + 1.9, z + dz / 2, 1.3, 1.4, 1.4, rot);
    }
  };

  P.umbrella = function (x, z, color) {
    const y = this.heightAt(x, z);
    this.addGeo('pole', 0xdddddd, G.cyl, x, y + 1.2, z, 0, 0.04, 2.4, 0.04);
    this.addGeo('umb' + color, color, G.cone, x, y + 2.45, z, 0, 1.5, 0.55, 1.5);
    this.addCyl(x, z, 0.08, y, y + 2.2);
    this.addCyl(x, z, 1.4, y + 2.2, y + 2.7);
    this.addGeo('towel' + color, color, G.box, x + 1.2, y + 0.03, z + 0.4, 0.4, 0.9, 0.04, 1.8);
  };

  P.lifeguard = function (x, z) {
    const y = this.heightAt(x, z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.addGeo('lgLeg', 0xf4f4f4, G.box, x + dx, y + 1.5, z + dz, 0, 0.15, 3, 0.15);
    this.box(x, y + 3.1, z, 2.6, 0.2, 2.6, { color: 0xc9a46a });
    this.box(x, y + 4.1, z, 2.2, 1.8, 2.2, { color: 0xe23c3c });
    this.box(x, y + 5.15, z, 2.8, 0.3, 2.8, { color: 0xf4f4f4 });
    this.addBox(x, y + 1.5, z, 2.2, 3, 2.2);
  };

  P.pier = function (x0, x1, z, deck) {
    const len = x1 - x0, cx = (x0 + x1) / 2;
    this.box(cx, deck, z, len, 0.3, 3.2, { color: 0x8b6a45 });
    for (let x = x0 + 1; x <= x1; x += 5) for (const dz of [-1.4, 1.4]) {
      const yb = Math.min(this.heightAt(x, z + dz), this.water) - 2;
      this.addGeo('post', 0x5a4330, G.cyl, x, (yb + deck) / 2, z + dz, 0, 0.18, deck - yb, 0.18);
      this.addCyl(x, z + dz, 0.2, yb, deck);
      this.addGeo('post', 0x5a4330, G.cyl, x, deck + 0.5, z + dz, 0, 0.06, 1, 0.06);
    }
    for (const dz of [-1.5, 1.5]) this.box(cx, deck + 1, z + dz, len, 0.08, 0.08, { color: 0x5a4330 });
  };

  P.wallInvisible = function (x, y, z, w, h, d) { this.addBox(x, y, z, w, h, d); };

  // =================== PETA: Lapangan Terbuka ===================
  P.field = function () {
    this.ground(TEX.grass(), 1400);
    this.sky(0x76b4f5, 0xe4f1fc, 420);
    const B = 160;
    // pagar kayu + dinding tak terlihat (batas area terbang)
    for (let i = -B; i <= B; i += 6) for (const [x, z] of [[i, -B], [i, B], [-B, i], [B, i]])
      this.addGeo('fencePost', 0x6b4a2b, G.box, x, 0.7, z, 0, 0.14, 1.4, 0.14);
    for (const h of [0.55, 1.15]) {
      this.box(0, h, -B, 2 * B, 0.08, 0.06, { color: 0x7b5634, collide: false });
      this.box(0, h, B, 2 * B, 0.08, 0.06, { color: 0x7b5634, collide: false });
      this.box(-B, h, 0, 0.06, 0.08, 2 * B, { color: 0x7b5634, collide: false });
      this.box(B, h, 0, 0.06, 0.08, 2 * B, { color: 0x7b5634, collide: false });
    }
    const HW = 150;
    this.wallInvisible(0, HW / 2, -B - 1, 2 * B + 4, HW, 2);
    this.wallInvisible(0, HW / 2, B + 1, 2 * B + 4, HW, 2);
    this.wallInvisible(-B - 1, HW / 2, 0, 2, HW, 2 * B + 4);
    this.wallInvisible(B + 1, HW / 2, 0, 2, HW, 2 * B + 4);
    this.wallInvisible(0, HW + 1, 0, 2 * B + 4, 2, 2 * B + 4);
    // deretan pohon di luar pagar
    const r = rng(7);
    for (let i = 0; i < 90; i++) {
      const side = i % 4, t = (r() - 0.5) * 2 * (B + 30), off = B + 8 + r() * 30;
      const [x, z] = side === 0 ? [t, -off] : side === 1 ? [t, off] : side === 2 ? [-off, t] : [off, t];
      if (r() < 0.6) this.pine(x, z, 1.1 + r() * 0.8, i % 2); else this.oak(x, z, 1 + r() * 0.6);
    }
    // isi lapangan
    this.barn(-105, -100, 0.3);
    this.windTurbine(95, -110, 0);
    this.windTurbine(120, 40, 2);
    const gatePts = [[0, 0], [35, -40], [40, -95], [-10, -120], [-55, -60], [-90, 10], [-40, 70], [30, 60]];
    for (let i = 0; i < 26; i++) {
      const x = (r() - 0.5) * 280, z = (r() - 0.5) * 280;
      if (this.nearRoute(gatePts, x, z, 9) || Math.hypot(x + 105, z + 100) < 25) continue;
      this.hay(x, z, r() * 3, r() < 0.3);
    }
    for (const [x, z, s] of [[-20, 30, 1.3], [70, -20, 1.5], [-120, 60, 1.2], [110, 110, 1.4], [5, -60, 1.1], [-70, -130, 1.3]]) this.oak(x, z, s);
    // slalom cone
    for (let i = 0; i < 10; i++) this.addGeo('cone', 0xff6a00, G.cone, 60 + i * 6, 0.4, 100 + (i % 2) * 4, 0, 0.3, 0.8, 0.3);
    // bando (rangka) untuk freestyle
    for (const [x, z, rot, w, h] of [[100, 70, 0.4, 6, 3], [-120, -20, 1.2, 8, 4], [60, 130, 0, 5, 2.5]]) {
      const c = Math.cos(rot), s = Math.sin(rot);
      this.box(x - c * w / 2, h / 2, z + s * w / 2, 0.3, h, 0.3, { rot, color: 0x444b55 });
      this.box(x + c * w / 2, h / 2, z - s * w / 2, 0.3, h, 0.3, { rot, color: 0x444b55 });
      this.box(x, h + 0.15, z, w + 0.3, 0.3, 0.3, { rot, color: 0x444b55 });
    }
    gatePts.forEach(([x, z], i) => this.gate(x, z, { base: [0, 1, 0, 3, 0, 1.5, 0, 0.5][i], w: 2.2, h: 2.2 }));
    this.flushBatches();
    this.spawnLight(0, 0, 170);
  };

  // =================== PETA: Pantai ===================
  P.beach = function () {
    this.sky(0x4ea3f5, 0xd5ecfb, 450);
    const height = (x, z) => {
      const inland = 1 - smooth(-60, -15, x);
      let h = 2.2 + fbm(x * 0.02, z * 0.02, 4, 3) * 3 * inland;
      const shore = smooth(-25, 35, x);
      h = h * (1 - shore) - 3 * shore;
      h -= smooth(35, 220, x) * 10;
      h += 30 * Math.exp(-((x + 30) ** 2 + (z + 200) ** 2) / (2 * 50 * 50));   // tanjung berbatu
      h += 16 * Math.exp(-((x - 150) ** 2 + (z - 70) ** 2) / (2 * 20 * 20));   // pulau kecil
      h += (fbm(x * 0.15, z * 0.15, 2, 9) - 0.5) * 0.3;
      return h;
    };
    const sand = new THREE.Color(0xe6d3a3), wet = new THREE.Color(0xb59e6e), grass = new THREE.Color(0x6f9a3e), rock = new THREE.Color(0x7c7568), sea = new THREE.Color(0x3d8d8a);
    this.setTerrain(800, 160, height, (h, slope, x, z, c) => {
      if (h < -0.4) c.copy(sea).lerp(sand, Math.max(0, 1 + h / 6));
      else if (h < 0.35) c.copy(wet);
      else if (slope > 0.35) c.copy(rock);
      else if (h < 2.0 || x > -30) c.copy(sand);
      else c.copy(sand).lerp(grass, Math.min(1, (h - 2) / 1.5));
      if (h > 9 && slope > 0.2) c.copy(rock);
    });
    this.addWater(0, 1600, 200, 0, 0x1e7fb8);
    // dermaga
    this.pier(-14, 78, 55, 2.0);
    // perahu layar
    [[100, -50, 0.4, 0xffffff], [128, 4, 2.2, 0xffd23c], [160, -90, 1.1, 0xffffff], [75, 112, -0.6, 0xe84545], [195, 30, 2.8, 0xffffff], [86, 62, 0, 0x3c8dff]]
      .forEach(([x, z, rot, c], i) => this.sailboat(x, z, rot, c, i * 1.7));
    // pelampung
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), this.mat(i % 2 ? 0xffffff : 0xff3a2a));
      const bx = 32, bz = -100 + i * 22, ph = i;
      b.position.set(bx, 0, bz); this.root.add(b);
      this.ticks.push(t => (b.position.y = Math.sin(t * 1.4 + ph) * 0.12));
    }
    // pohon kelapa
    const r = rng(11);
    const gatePts = [[-6, 15], [10, -30], [50, -65], [110, -25], [125, 40], [80, 90], [30, 100], [-18, 70]];
    for (let i = 0; i < 60; i++) {
      const x = -80 + r() * 64, z = -150 + r() * 300;
      if (this.nearRoute(gatePts, x, z, 8) || Math.abs(z - 55) < 5) continue;
      this.palm(x, z, 0.9 + r() * 0.4, 100 + i);
    }
    for (let i = 0; i < 5; i++) this.palm(140 + r() * 18, 60 + r() * 18, 0.9, 300 + i);   // di pulau
    // payung & handuk
    const umb = [0xff4d4d, 0x2fa6ff, 0xffd23c, 0x26c281];
    for (let i = 0; i < 12; i++) { const z = -100 + i * 17 + r() * 5; if (Math.abs(z - 55) < 6 || Math.abs(z - 15) < 6) continue; this.umbrella(-10 + r() * 7, z, umb[i % 4]); }
    this.lifeguard(-4, -50);
    // pondok pantai
    for (let i = 0; i < 4; i++) {
      const x = -48, z = -60 + i * 26, y = this.heightAt(x, z);
      this.box(x, y + 1.3, z, 4, 2.6, 3.5, { color: [0x2fa6ff, 0xff8a3d, 0x26c281, 0xff4d4d][i] });
      this.box(x, y + 2.8, z, 4.8, 0.3, 4.3, { color: 0xf5f0e6 });
    }
    // batu di tanjung & pulau
    for (let i = 0; i < 25; i++) this.rock(-30 + (r() - 0.5) * 90, -200 + (r() - 0.5) * 80, 1 + r() * 2.5, 400 + i);
    for (let i = 0; i < 6; i++) this.rock(150 + (r() - 0.5) * 30, 70 + (r() - 0.5) * 30, 0.8 + r() * 1.5, 500 + i);
    gatePts.forEach(([x, z], i) => this.gate(x, z, { base: [0, 0.5, 1.5, 1, 3, 1.5, 0.8, 0][i], w: 2.2, h: 2.2 }));
    // titik mulai di pasir, menghadap gerbang pertama
    const sx = -14, sz = 35, g0 = gatePts[0];
    this.spawn = { x: sx, z: sz, yaw: Math.atan2(-(g0[0] - sx), -(g0[1] - sz)) };
    this.flushBatches();
    this.spawnLight(30, 0, 200);
  };

  // =================== PETA: Pegunungan ===================
  P.mountains = function () {
    this.sky(0x6fa8e6, 0xe3edf6, 700);
    const LX = 60, LZ = -40, LR = 45;
    const height = (x, z) => {
      const r = Math.hypot(x * 1.0, z * 0.85);
      let h = 3 + fbm(x * 0.015, z * 0.015, 3, 5) * 6;
      const m = smooth(130, 340, r);
      h += m * (80 + fbm(x * 0.004, z * 0.004, 4, 21) * 160);
      h += smooth(110, 300, r) * Math.abs(fbm(x * 0.01, z * 0.01, 3, 31) * 2 - 1) * 45;
      const d = Math.hypot(x - LX, z - LZ);
      if (d < LR) h -= 9 * (1 - (d / LR) ** 2);
      return h;
    };
    const grass = new THREE.Color(0x5d8a3a), forest = new THREE.Color(0x3f6a2c), rock = new THREE.Color(0x7a746c), snow = new THREE.Color(0xf4f7fb), mud = new THREE.Color(0x7d6a4c);
    this.setTerrain(1400, 220, height, (h, slope, x, z, c) => {
      if (h < 2.2) c.copy(mud);
      else if (h > 115 + (slope * 60) && slope < 0.55) c.copy(snow);
      else if (slope > 0.42) c.copy(rock).lerp(snow, smooth(150, 230, h));
      else if (h > 25) c.copy(forest).lerp(rock, smooth(60, 110, h));
      else c.copy(grass);
    });
    this.addWater(1.5, 110, LX, LZ, 0x2a6f9a);
    const gatePts = [[-20, 0], [10, -55], [60, -40], [118, -75], [135, 15], [65, 70], [-38, 58]];
    const r = rng(23);
    // hutan pinus
    let placed = 0;
    for (let i = 0; i < 2200 && placed < 380; i++) {
      const a = r() * Math.PI * 2, rad = 35 + r() * 290, x = Math.cos(a) * rad, z = Math.sin(a) * rad / 0.85;
      const h = this.heightAt(x, z, _p);
      if (h < 2.5 || h > 95 || _p.y < 0.82) continue;
      if (Math.hypot(x - LX, z - LZ) < LR + 4) continue;
      if (this.nearRoute(gatePts, x, z, 13)) continue;
      if (rad < 120 && r() < 0.55) continue;           // lembah lebih jarang
      this.pine(x, z, 1 + r() * 0.9, placed % 2);
      placed++;
    }
    // batu besar
    for (let i = 0; i < 40; i++) {
      const a = r() * Math.PI * 2, rad = 30 + r() * 200, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
      if (this.nearRoute(gatePts, x, z, 8) || Math.hypot(x - LX, z - LZ) < LR) continue;
      this.rock(x, z, 1 + r() * 3, 700 + i);
    }
    // pondok
    this.cabin(-70, 20, 0.5);
    this.cabin(-58, -35, -0.3);
    // beruang (berjalan memutar, satu diam di tepi danau)
    [[-10, 30, 9, 1.1], [40, 25, 12, 0.9], [100, -20, 10, 1.2], [-55, -10, 8, 0.8], [20, -95, 11, 1.0]]
      .forEach(([x, z, rad, sp], i) => this.bear(x, z, rad, sp, i * 1.3, true));
    this.bear(LX - LR - 3, LZ + 6, 0, 0, 1.2, false);
    gatePts.forEach(([x, z], i) => this.gate(x, z, { base: [0, 1, 2, 0.5, 3, 1, 2][i], w: 2.4, h: 2.4 }));
    this.flushBatches();
    this.spawnLight(30, 0, 220);
  };
}
