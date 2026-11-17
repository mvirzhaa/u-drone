// Model 3D drone prosedural (tanpa aset eksternal).
import * as THREE from 'three';

export function createDroneMesh(spec, { ghost = false } = {}) {
  const g = new THREE.Group();
  const s = spec.size;           // jarak diagonal motor-ke-motor
  const d = s / 2 / Math.SQRT2;  // offset motor pada x dan z
  const pr = spec.propD / 2;
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.6, metalness: 0.2,
    transparent: ghost, opacity: ghost ? 0.35 : 1, depthWrite: !ghost, ...extra,
  });
  const frameMat = mat(ghost ? 0x66ccff : 0x222428);
  const accent = mat(ghost ? 0x66ccff : spec.color);
  const motorMat = mat(ghost ? 0x66ccff : 0x9aa0a8, { metalness: 0.7, roughness: 0.3 });

  // Badan / stack
  const body = new THREE.Mesh(new THREE.BoxGeometry(s * 0.28, s * 0.12, s * 0.42), accent);
  body.position.y = s * 0.05;
  g.add(body);

  // Lengan (X)
  const armGeo = new THREE.BoxGeometry(s * 0.07, s * 0.03, s * 0.55);
  for (const a of [Math.PI / 4, -Math.PI / 4]) {
    const arm = new THREE.Mesh(armGeo, frameMat);
    arm.rotation.y = a;
    g.add(arm);
  }

  // Motor, baling-baling, duct
  g.userData.props = [];
  const propMat = new THREE.MeshBasicMaterial({ color: ghost ? 0x66ccff : spec.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
  const bladeGeo = new THREE.BoxGeometry(pr * 2, pr * 0.02 + 0.001, pr * 0.22);
  const discGeo = new THREE.CircleGeometry(pr, 24);
  const motorGeo = new THREE.CylinderGeometry(pr * 0.22, pr * 0.22, pr * 0.3, 12);
  const ductGeo = new THREE.TorusGeometry(pr * 1.08, pr * 0.09, 6, 24);
  [[d, -d], [-d, -d], [d, d], [-d, d]].forEach(([x, z], i) => {
    const m = new THREE.Mesh(motorGeo, motorMat);
    m.position.set(x, pr * 0.12, z);
    g.add(m);
    const prop = new THREE.Group();
    prop.position.set(x, pr * 0.32, z);
    const b1 = new THREE.Mesh(bladeGeo, accent); prop.add(b1);
    const b2 = b1.clone(); b2.rotation.y = Math.PI / 2; prop.add(b2);
    const disc = new THREE.Mesh(discGeo, propMat); disc.rotation.x = -Math.PI / 2; disc.visible = false;
    prop.add(disc);
    prop.userData = { dir: i === 0 || i === 3 ? 1 : -1, disc, blades: [b1, b2] };
    g.add(prop);
    g.userData.props.push(prop);
    if (spec.ducted) {
      const duct = new THREE.Mesh(ductGeo, frameMat);
      duct.rotation.x = Math.PI / 2;
      duct.position.set(x, pr * 0.3, z);
      g.add(duct);
    }
  });

  // Kamera FPV di depan
  const cam = new THREE.Mesh(new THREE.BoxGeometry(s * 0.12, s * 0.1, s * 0.1), frameMat);
  cam.position.set(0, s * 0.08, -s * 0.24);
  cam.rotation.x = (spec.camTilt || 0) * Math.PI / 180;
  g.add(cam);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.035, s * 0.035, s * 0.03, 10), mat(0x111111));
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0, -s * 0.06);
  cam.add(lens);

  // Antena / lampu belakang
  const led = new THREE.Mesh(new THREE.BoxGeometry(s * 0.16, s * 0.02, s * 0.02),
    new THREE.MeshBasicMaterial({ color: ghost ? 0x66ccff : 0xff2020, transparent: ghost, opacity: ghost ? 0.4 : 1 }));
  led.position.set(0, s * 0.03, s * 0.22);
  g.add(led);

  g.traverse(o => { if (o.isMesh && !ghost) { o.castShadow = true; } });
  return g;
}

// Putar baling-baling sesuai throttle motor.
export function spinProps(mesh, motor, dt) {
  for (const p of mesh.userData.props) {
    const speed = motor * 300 + (motor > 0.001 ? 40 : 0);
    p.rotation.y += p.userData.dir * speed * dt;
    const fast = motor > 0.08;
    p.userData.disc.visible = fast;
    for (const b of p.userData.blades) b.visible = !fast;
  }
}
