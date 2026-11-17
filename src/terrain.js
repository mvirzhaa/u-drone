// Terrain heightfield: mesh dan tumbukan memakai segitiga yang sama persis.
import * as THREE from 'three';

// ---------- Noise deterministik ----------
function hash(i, j, seed) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 144269504);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const fade = t => t * t * (3 - 2 * t);
export function noise2(x, z, seed = 1) {
  const i = Math.floor(x), j = Math.floor(z), fx = fade(x - i), fz = fade(z - j);
  const a = hash(i, j, seed), b = hash(i + 1, j, seed), c = hash(i, j + 1, seed), d = hash(i + 1, j + 1, seed);
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz; // 0..1
}
export function fbm(x, z, oct = 4, seed = 1) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) { s += amp * noise2(x * f, z * f, seed + o * 17); norm += amp; amp *= 0.5; f *= 2.03; }
  return s / norm; // 0..1
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Rentang acak deterministik
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export class Terrain {
  // fn(x,z) -> tinggi; colorFn(h, slope, x, z) -> THREE.Color
  constructor(size, segs, fn, colorFn) {
    this.size = size; this.segs = segs; this.cell = size / segs; this.half = size / 2;
    const n = segs + 1;
    this.h = new Float32Array(n * n);
    for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++)
      this.h[iz * n + ix] = fn(-this.half + ix * this.cell, -this.half + iz * this.cell);
    this.n = n;
    this.mesh = this.buildMesh(colorFn);
  }

  buildMesh(colorFn) {
    const geo = new THREE.PlaneGeometry(this.size, this.size, this.segs, this.segs);
    geo.rotateX(-Math.PI / 2); // vertex (ix, iy) -> z = -half + iy*cell
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, this.h[i]);
    geo.computeVertexNormals();
    const nor = geo.attributes.normal, cols = new Float32Array(pos.count * 3), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      colorFn(pos.getY(i), 1 - nor.getY(i), pos.getX(i), pos.getZ(i), c);
      const j = (hash(i, 7, 3) - 0.5) * 0.06;
      cols[i * 3] = c.r + j; cols[i * 3 + 1] = c.g + j; cols[i * 3 + 2] = c.b + j;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    m.receiveShadow = true;
    return m;
  }

  // Tinggi persis di permukaan segitiga mesh.
  heightAt(x, z, out) {
    const n = this.n, c = this.cell;
    let gx = (x + this.half) / c, gz = (z + this.half) / c;
    gx = Math.min(Math.max(gx, 0), this.segs - 1e-4); gz = Math.min(Math.max(gz, 0), this.segs - 1e-4);
    const ix = Math.floor(gx), iz = Math.floor(gz), u = gx - ix, v = gz - iz;
    const ha = this.h[iz * n + ix], hd = this.h[iz * n + ix + 1];
    const hb = this.h[(iz + 1) * n + ix], hc = this.h[(iz + 1) * n + ix + 1];
    let h, dx, dz;
    if (u + v <= 1) { h = ha + (hd - ha) * u + (hb - ha) * v; dx = (hd - ha) / c; dz = (hb - ha) / c; }
    else { h = hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v); dx = (hc - hb) / c; dz = (hc - hd) / c; }
    if (out) out.set(-dx, 1, -dz).normalize();
    return h;
  }
}

// Permukaan air beranimasi ringan
export function waterMesh(size, level, color = 0x1d6fa5) {
  const geo = new THREE.PlaneGeometry(size, size, 64, 64);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.82 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = { value: 0 };
    mat.userData.shader = sh;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n transformed.y += sin(position.x*0.08+uTime*1.3)*0.12 + cos(position.z*0.11+uTime*0.9)*0.1;');
  };
  const m = new THREE.Mesh(geo, mat);
  m.position.y = level;
  m.receiveShadow = true;
  m.userData.tick = t => { if (mat.userData.shader) mat.userData.shader.uniforms.uTime.value = t; };
  return m;
}
