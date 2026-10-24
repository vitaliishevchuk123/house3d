import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { plot, house, walls, floors, ceilingDrop } from './plan.js';

// ---------- сцена ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9cc7e8);
scene.fog = new THREE.Fog(0x9cc7e8, 60, 160);

const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x8c8c82, 0.8));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
sun.position.set(25, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
scene.add(sun);

// ---------- матеріали ----------
const mat = {
  wallOut: new THREE.MeshStandardMaterial({ color: 0x65777a, roughness: 0.95 }), // фасад
  wallIn: new THREE.MeshStandardMaterial({ color: 0x8a7f75, roughness: 0.95 }), // внутрішні перегородки: теплий сіро-коричневий (грейдж)
  white: new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.7 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.7 }),
  foundation: new THREE.MeshStandardMaterial({ color: 0x8a8d8c, roughness: 1 }),
  brick: new THREE.MeshStandardMaterial({ color: 0x9c5a45, roughness: 1 }),
  floor: new THREE.MeshStandardMaterial({ color: 0xb08a5e, roughness: 0.8 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x604744, roughness: 0.8, side: THREE.DoubleSide }),
  glass: new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.35, roughness: 0.1 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x5b4328 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1 }),
};

function grassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#5c8f3d';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `hsl(${90 + Math.random() * 25}, ${35 + Math.random() * 20}%, ${28 + Math.random() * 16}%)`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------- ділянка ----------
const colliders = []; // AABB {minX,maxX,minZ,maxZ} у світових координатах

const gt = grassTexture();
gt.repeat.set(plot.w / 2, plot.d / 2);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(plot.w, plot.d), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// земля за межами ділянки
const outer = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x7a8f55, roughness: 1 }));
outer.rotation.x = -Math.PI / 2;
outer.position.y = -0.02;
outer.receiveShadow = true;
scene.add(outer);

function box(w, h, d, material, x, y, z, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// паркан
(function buildFence() {
  const hw = plot.w / 2, hd = plot.d / 2, fh = plot.fenceHeight, step = 2.5;
  const gx0 = plot.gate.x - plot.gate.width / 2, gx1 = plot.gate.x + plot.gate.width / 2;

  function run(x1, z1, x2, z2, skip) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.round(len / step);
    const dx = (x2 - x1) / len, dz = (z2 - z1) / len;
    const rot = Math.atan2(-dz, dx);
    for (let i = 0; i <= n; i++) {
      const x = x1 + dx * (len * i / n), z = z1 + dz * (len * i / n);
      if (skip && skip(x)) continue;
      box(0.12, fh, 0.12, mat.wood, x, fh / 2, z);
    }
    // дошки між стовпами
    const segs = skip ? [[x1, gx0], [gx1, x2]] : [[x1, x2]];
    for (const [a, b] of segs) {
      const horizontal = z1 === z2;
      const l = horizontal ? Math.abs(b - a) : len;
      if (l <= 0) continue;
      const cx = horizontal ? (a + b) / 2 : x1;
      const cz = horizontal ? z1 : (z1 + z2) / 2;
      for (const y of [fh * 0.3, fh * 0.75]) {
        horizontal ? box(l, 0.1, 0.04, mat.wood, cx, y, cz) : box(0.04, 0.1, l, mat.wood, cx, y, cz);
      }
    }
  }
  run(-hw, -hd, hw, -hd);
  run(-hw, hd, hw, hd, x => x > gx0 + 0.01 && x < gx1 - 0.01);
  run(-hw, -hd, -hw, hd);
  run(hw, -hd, hw, hd);
})();

// дерева
[[-18, -12], [17, -14], [-20, 6], [19, 10], [-12, 15], [12, -4]].forEach(([x, z]) => {
  box(0.35, 3, 0.35, mat.trunk, x, 1.5, z);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), mat.leaf);
  crown.position.set(x, 4.6, z);
  crown.castShadow = true;
  scene.add(crown);
});

// ---------- хата ----------
const houseGroup = new THREE.Group();
houseGroup.position.set(house.position[0], 0, house.position[1]);
scene.add(houseGroup);

box(house.w + 0.4, 0.2, house.d + 0.4, mat.floor, house.w / 2, 0.1 - 0.0, house.d / 2, houseGroup).receiveShadow = true;
const FLOOR_Y = 0.2;

function addPiece(minX, maxX, minY, maxY, minZ, maxZ, material = mat.wallOut) {
  if (maxX - minX < 1e-4 || maxZ - minZ < 1e-4 || maxY - minY < 1e-4) return;
  box(maxX - minX, maxY - minY, maxZ - minZ, material,
    (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, houseGroup);
  if (minY < 1.0) {
    colliders.push({
      minX: minX + house.position[0], maxX: maxX + house.position[0],
      minZ: minZ + house.position[1], maxZ: maxZ + house.position[1],
    });
  }
}

function buildWall(w) {
  const [ax, az] = w.a, [bx, bz] = w.b;
  const alongX = az === bz;
  const L = alongX ? Math.abs(bx - ax) : Math.abs(bz - az);
  const half = w.t / 2;
  // piece(s0,s1,y0,y1): відрізок стіни в локальних координатах уздовж осі
  const wm = w.t < 0.3 ? mat.wallIn : mat.wallOut;
  const piece = (s0, s1, y0, y1) => alongX
    ? addPiece(ax + s0, ax + s1, FLOOR_Y + y0, FLOOR_Y + y1, az - half, az + half, wm)
    : addPiece(ax - half, ax + half, FLOOR_Y + y0, FLOOR_Y + y1, az + s0, az + s1, wm);
  // біла лиштва навколо прорізу (без колізії)
  const trim = (s0, s1, y0, y1) => {
    const d = w.t + 0.08;
    const m = alongX
      ? box(s1 - s0, y1 - y0, d, mat.white, ax + (s0 + s1) / 2, FLOOR_Y + (y0 + y1) / 2, az, houseGroup)
      : box(d, y1 - y0, s1 - s0, mat.white, ax, FLOOR_Y + (y0 + y1) / 2, az + (s0 + s1) / 2, houseGroup);
    return m;
  };
  const T = 0.1;

  let cursor = -half;
  const ops = [...w.openings].sort((p, q) => p.at - q.at);
  for (const o of ops) {
    const l = o.at - o.w / 2, r = o.at + o.w / 2;
    piece(cursor, l, 0, w.h);
    if (o.sill > 0) piece(l, r, 0, o.sill);
    piece(l, r, o.sill + o.h, w.h);
    if (w.t >= 0.3 || o.type === 'window') {
      trim(l - T, l, o.sill, o.sill + o.h + T);          // ліва
      trim(r, r + T, o.sill, o.sill + o.h + T);          // права
      trim(l - T, r + T, o.sill + o.h, o.sill + o.h + T); // верх
      if (o.type === 'window') trim(l - T, r + T, o.sill - T, o.sill);  // підвіконня
    }
    if (o.leaf) {
      const leaf = alongX
        ? box(o.w, o.h, 0.06, mat.dark, ax + o.at, FLOOR_Y + o.h / 2, az, houseGroup)
        : box(0.06, o.h, o.w, mat.dark, ax, FLOOR_Y + o.h / 2, az + o.at, houseGroup);
    }
    if (o.type === 'window') {
      const gy = FLOOR_Y + o.sill + o.h / 2;
      const pane = new THREE.Mesh(
        alongX ? new THREE.BoxGeometry(o.w, o.h, 0.04) : new THREE.BoxGeometry(0.04, o.h, o.w), mat.glass);
      pane.position.set(alongX ? ax + o.at : ax, gy, alongX ? az : az + o.at);
      houseGroup.add(pane);
    }
    cursor = r;
  }
  piece(cursor, L + half, 0, w.h);
}
walls.forEach(buildWall);

// підлога: темний дуб (лінолеум під дошку) і білі плінтуси
function oakTexture(tile = false, light = false) {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rows = 12, rh = S / rows;
  for (let r = 0; r < rows; r++) {
    let x = -Math.random() * 500;
    while (x < S) {
      const len = 380 + Math.random() * 300;
      const l = 24 + Math.random() * 7;
      g.fillStyle = light ? `hsl(${32 + Math.random() * 5}, ${42 + Math.random() * 10}%, ${60 + Math.random() * 7}%)` : tile ? `hsl(${30 + Math.random() * 6}, ${52 + Math.random() * 10}%, ${40 + Math.random() * 8}%)` : `hsl(${24 + Math.random() * 6}, ${48 + Math.random() * 10}%, ${l}%)`;
      g.fillRect(x, r * rh, len, rh);
      g.strokeStyle = light ? 'rgba(120,80,40,.25)' : tile ? 'rgba(214,200,176,.9)' : 'rgba(30,15,5,.35)'; g.lineWidth = light ? 1 : tile ? 3 : 2;
      g.strokeRect(x, r * rh, len, rh);
      g.strokeStyle = 'rgba(40,20,5,.18)'; g.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        const y = r * rh + Math.random() * rh;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (Math.random() - .5) * 4); g.stroke();
      }
      x += len;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const oak = oakTexture(), oakTile = oakTexture(true);
const doorGaps = (axis, c) => {
  const gaps = [];
  for (const w of walls) {
    const alongX = w.a[1] === w.b[1];
    if (alongX !== (axis === 'x')) continue;
    if (Math.abs((alongX ? w.a[1] : w.a[0]) - c) > 0.3) continue;
    for (const o of w.openings) {
      if (o.type !== 'door') continue;
      const m = (alongX ? w.a[0] : w.a[1]) + o.at;
      gaps.push([m - o.w / 2, m + o.w / 2]);
    }
  }
  return gaps.sort((p, q) => p[0] - q[0]);
};
function skirting(axis, c, from, to, inward) {
  const H = 0.08, T = 0.015;
  let cur = from;
  const piece = (a, b) => {
    if (b - a < 0.02) return;
    const m = (a + b) / 2, l = b - a;
    axis === 'x'
      ? box(l, H, T, mat.white, m, FLOOR_Y + H / 2, c + inward * T / 2, houseGroup)
      : box(T, H, l, mat.white, c + inward * T / 2, FLOOR_Y + H / 2, m, houseGroup);
  };
  for (const [a, b] of doorGaps(axis, c)) {
    if (b <= from || a >= to) continue;
    piece(cur, Math.max(cur, a));
    cur = Math.min(to, Math.max(cur, b));
  }
  piece(cur, to);
}
// стіни санвузла: та сама плитка під дерево, по всій висоті до стелі
const tileWallMat = new THREE.MeshStandardMaterial({ map: oakTile, roughness: 0.35, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
function clad(f) {
  const top = house.wallHeight - ceilingDrop;
  // ділянка стіни [s0,s1] x [y0,y1] на лінії c; UV у світових метрах, щоб шви йшли безперервно
  const panel = (axis, c, inward, s0, s1, y0, y1) => {
    if (s1 - s0 < 1e-3 || y1 - y0 < 1e-3) return;
    const g = new THREE.PlaneGeometry(s1 - s0, y1 - y0);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (s0 + uv.getX(i) * (s1 - s0)) / 2.4, (y0 + uv.getY(i) * (y1 - y0)) / 2.4);
    }
    const m = new THREE.Mesh(g, tileWallMat);
    const sm = (s0 + s1) / 2, y = FLOOR_Y + (y0 + y1) / 2, off = inward * 0.003;
    if (axis === 'x') { m.position.set(sm, y, c + off); m.rotation.y = inward > 0 ? 0 : Math.PI; }
    else { m.position.set(c + off, y, sm); m.rotation.y = inward > 0 ? Math.PI / 2 : -Math.PI / 2; }
    m.receiveShadow = true;
    houseGroup.add(m);
  };
  const edge = (axis, c, from, to, inward) => {
    const ops = [];
    for (const w of walls) {
      const alongX = w.a[1] === w.b[1];
      if (alongX !== (axis === 'x') || Math.abs((alongX ? w.a[1] : w.a[0]) - c) > 0.3) continue;
      for (const o of w.openings) {
        const m = (alongX ? w.a[0] : w.a[1]) + o.at;
        if (m + o.w / 2 > from && m - o.w / 2 < to) ops.push({ l: m - o.w / 2, r: m + o.w / 2, y0: o.sill, y1: o.sill + o.h });
      }
    }
    ops.sort((p, q) => p.l - q.l);
    let cur = from;
    for (const o of ops) {
      panel(axis, c, inward, cur, o.l, 0, top);
      panel(axis, c, inward, o.l, o.r, 0, o.y0);
      panel(axis, c, inward, o.l, o.r, o.y1, top);
      cur = o.r;
    }
    panel(axis, c, inward, cur, to, 0, top);
  };
  edge('x', f.z0, f.x0, f.x1, 1);
  edge('x', f.z1, f.x0, f.x1, -1);
  edge('z', f.x0, f.z0, f.z1, 1);
  edge('z', f.x1, f.z0, f.z1, -1);
}

for (const f of floors) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0;
  const t = (f.tile ? oakTile : oak).clone();
  t.needsUpdate = true;
  t.repeat.set(w / 2.4, d / 2.4);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: t, roughness: f.tile ? 0.35 : 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((f.x0 + f.x1) / 2, FLOOR_Y + 0.002, (f.z0 + f.z1) / 2);
  m.receiveShadow = true;
  houseGroup.add(m);
  if (f.tile) { clad(f); continue; }
  skirting('x', f.z0, f.x0, f.x1, 1);
  skirting('x', f.z1, f.x0, f.x1, -1);
  skirting('z', f.x0, f.z0, f.z1, 1);
  skirting('z', f.x1, f.z0, f.z1, -1);
}

// дах (двосхилий, гребінь уздовж x)
const roof = new THREE.Group();
roof.position.y = FLOOR_Y + house.wallHeight;
houseGroup.add(roof);
(function buildRoof() {
  const o = house.roofOverhang, rise = house.roofRise;
  const halfD = house.d / 2 + o;
  const slope = Math.hypot(halfD, rise);
  const ang = Math.atan2(rise, halfD);
  const len = house.w + o * 2;
  for (const s of [-1, 1]) {
    const m = box(len, 0.12, slope, mat.roof, house.w / 2, rise / 2, house.d / 2 + s * halfD / 2, roof);
    m.rotation.x = s * ang;
    // білий карниз-фасцiя, ринва й білі планки по краях фронтонів
    box(len, 0.2, 0.05, mat.white, house.w / 2, -0.06, house.d / 2 + s * (halfD + 0.02), roof);
    box(len, 0.09, 0.11, mat.white, house.w / 2, -0.2, house.d / 2 + s * (halfD + 0.08), roof);
    for (const x of [-o, house.w + o]) {
      const rake = box(0.06, 0.2, slope, mat.white, x, rise / 2 + 0.08, house.d / 2 + s * halfD / 2, roof);
      rake.rotation.x = s * ang;
    }
  }
  // водостічні труби по кутах фасаду
  for (const x of [-o + 0.15, house.w + o - 0.15]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, house.wallHeight + 0.2, 8), mat.white);
    pipe.position.set(x, -(house.wallHeight + 0.2) / 2 + 0.0, house.d / 2 + halfD + 0.08);
    roof.add(pipe);
  }
  // фронтони
  const shape = new THREE.Shape([new THREE.Vector2(-house.d / 2, 0), new THREE.Vector2(house.d / 2, 0), new THREE.Vector2(0, rise)]);
  for (const x of [0, house.w]) {
    const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat.wallOut);
    g.rotation.y = Math.PI / 2;
    g.position.set(x, 0, house.d / 2);
    g.castShadow = true;
    roof.add(g);
  }
})();

// фундамент (сірий цоколь)
(function buildFoundation() {
  const o = 0.2 + 0.05, h = 0.6, w = house.w, d = house.d;
  box(w + 2 * o, h, 0.1, mat.foundation, w / 2, h / 2 - 0.1, -o, houseGroup);
  box(w + 2 * o, h, 0.1, mat.foundation, w / 2, h / 2 - 0.1, d + o, houseGroup);
  box(0.1, h, d + 2 * o, mat.foundation, -o, h / 2 - 0.1, d / 2, houseGroup);
  box(0.1, h, d + 2 * o, mat.foundation, w + o, h / 2 - 0.1, d / 2, houseGroup);
})();

// плитка-сходинка біля дверей котельні (східна стіна)
box(0.9, 0.2, 1.3, mat.foundation, house.w + 0.2 + 0.45, 0.1, 5.19, houseGroup);

// ванна вздовж східної стіни (під вікном) + умивальник зразу ліворуч від дверей
(function buildBathFixtures() {
  const g = houseGroup, base = FLOOR_Y;
  const acrylic = new THREE.MeshStandardMaterial({ color: 0xf8f8f6, roughness: 0.25 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.2 });
  const b = (w, hh, d, x, y, z, m = acrylic) => box(w, hh, d, m, x, base + y, z, g);

  // ванна 1.7 x 0.7, довга сторона вздовж z
  const x0 = 10.1, x1 = 10.8, z0 = 5.96, z1 = 7.66, h = 0.55, wall = 0.07;
  const L = z1 - z0, W = x1 - x0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, side = h - 0.12;
  b(W, 0.12, L, cx, 0.06, cz);
  b(W, side, wall, cx, 0.12 + side / 2, z0 + wall / 2);
  b(W, side, wall, cx, 0.12 + side / 2, z1 - wall / 2);
  b(wall, side, L, x0 + wall / 2, 0.12 + side / 2, cz);
  b(wall, side, L, x1 - wall / 2, 0.12 + side / 2, cz);
  b(W - 2 * wall, 0.02, L - 2 * wall, cx, 0.13, cz, new THREE.MeshStandardMaterial({ color: 0xe6eef2, roughness: 0.2 }));
  b(0.04, 0.05, 0.04, cx, h + 0.025, z0 + 0.05, chrome);   // змішувач
  b(0.16, 0.04, 0.04, cx - 0.06, h + 0.07, z0 + 0.05, chrome);
  addCollider(x0, x1, z0, z1);

  // умивальник: тумба 0.6 x 0.42 біля північної стіни, зразу ліворуч від дверей
  const sx0 = 9.1, sx1 = 9.7, sz0 = 5.96, sz1 = 6.38;
  const scx = (sx0 + sx1) / 2, scz = (sz0 + sz1) / 2;
  b(sx1 - sx0, 0.5, sz1 - sz0 - 0.02, scx, 0.3 + 0.0 + 0.25 - 0.3 + 0.3, scz, mat.floor); // тумба (під дерево)
  b(sx1 - sx0 + 0.02, 0.05, sz1 - sz0 + 0.02, scx, 0.88, scz);                              // стільниця-раковина
  b(0.04, 0.1, 0.04, scx, 0.96, sz0 + 0.06, chrome);                                        // кран
  b(0.5, 0.7, 0.02, scx, 1.55, sz0 + 0.01, new THREE.MeshStandardMaterial({ color: 0xdfe8ee, metalness: 0.6, roughness: 0.1 })); // дзеркало
  addCollider(sx0, sx1, sz0, sz1);
})();

// унітаз біля східної стіни (під вікном), обличчям до дверей
(function buildToilet() {
  const g = houseGroup, base = FLOOR_Y, zc = 8.325;
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf8f8f6, roughness: 0.2 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.2 });
  const cyl = (r, h, x, y, mt = ceramic) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mt);
    m.scale.x = 1.3; // овальна чаша, довша вздовж x
    m.position.set(x, base + y, zc);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  };
  cyl(0.17, 0.4, 10.35, 0.2);                     // чаша
  cyl(0.19, 0.03, 10.35, 0.415);                  // сидіння
  box(0.2, 0.45, 0.38, ceramic, 10.7, base + 0.625, zc, g); // бачок
  box(0.04, 0.02, 0.1, chrome, 10.7, base + 0.86, zc, g);   // кнопка змиву
  addCollider(10.1, 10.8, zc - 0.2, zc + 0.2);
})();

// кутова кухня в північно-східному куті вітальні: уздовж північної стіни (x 6.2..8.925) і східної (z до 6.15)
// сантехніка — біля стіни санвузла/котельні (x=9): мийка на східній ділянці
(function buildKitchen() {
  const g = houseGroup, base = FLOOR_Y;
  const front = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.45 });
  const top = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.3 });           // темні деталі: цоколь, конфорки
  const woodTex = oakTexture(false, true);
  woodTex.repeat.set(0.8, 0.5);
  const counter = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.5 }); // стільниця: світле дерево
  const steel = new THREE.MeshStandardMaterial({ color: 0xbfc4c7, metalness: 0.85, roughness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x15181a, roughness: 0.1 });
  const blk = (x0, x1, y0, y1, z0, z1, m) =>
    box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2, g);

  const WX = 8.925, NZ = 4.575;     // кут: східна й північна стіни (чисті поверхні)
  const D = 0.6, BH = 0.85, TH = 0.04;

  // нижні шафи: цоколь + корпус + стільниця
  const baseRun = (x0, x1, z0, z1) => {
    blk(x0, x1, 0, 0.1, z0 + 0.04, z1 - 0.04, top);                 // цоколь
    blk(x0 + 0.005, x1 - 0.005, 0.1, BH, z0, z1, front);
    blk(x0 - 0.01, x1 + 0.01, BH, BH + TH, z0, z1 + 0.02, counter); // стільниця
    addCollider(x0, x1, z0, z1);
  };
  // північна ділянка, з заходу на схід: холодильник | шафа | плита | кутова шафа
  blk(6.2, 6.8, 0, 1.85, NZ, NZ + 0.65, steel);                      // холодильник
  addCollider(6.2, 6.8, NZ, NZ + 0.65);
  baseRun(6.8, 7.45, NZ, NZ + D);
  baseRun(7.45, 8.05, NZ, NZ + D);                                   // під плитою
  baseRun(8.05, WX, NZ, NZ + D);
  // східна ділянка: мийка (вздовж стіни x=9, там труби)
  baseRun(WX - D, WX, NZ + D, 6.15);
  // розділяючі лінії між фасадами на північній ділянці
  for (const x of [7.45, 8.05]) blk(x - 0.004, x + 0.004, 0.1, BH, NZ + D, NZ + D + 0.004, top);
  // ручки
  for (const x of [7.125, 7.75, 8.49]) blk(x - 0.12, x + 0.12, 0.72, 0.745, NZ + D, NZ + D + 0.02, steel);
  blk(WX - D, WX - D + 0.02, 0.72, 0.745, NZ + D + 0.2, 6.15 - 0.2, steel);

  // варильна поверхня на плиті
  blk(7.5, 8.0, BH + TH, BH + TH + 0.01, NZ + 0.04, NZ + 0.56, glass);
  for (const [bx, bz] of [[7.62, 0.17], [7.88, 0.17], [7.62, 0.42], [7.88, 0.42]]) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.004, 20), new THREE.MeshStandardMaterial({ color: 0x555a5c }));
    b.position.set(bx, base + BH + TH + 0.012, NZ + bz);
    g.add(b);
  }
  // мийка + змішувач
  blk(WX - 0.5, WX - 0.1, BH + TH, BH + TH + 0.012, NZ + D + 0.18, 6.15 - 0.18, steel);
  blk(WX - 0.06, WX - 0.02, BH + TH, BH + TH + 0.2, NZ + D + 0.45, NZ + D + 0.49, steel);
  blk(WX - 0.18, WX - 0.02, BH + TH + 0.17, BH + TH + 0.21, NZ + D + 0.45, NZ + D + 0.49, steel);

  // верхні шафи + витяжка
  const up = (x0, x1, z0, z1) => blk(x0 + 0.005, x1 - 0.005, 1.5, 2.2, z0, z1, front);
  up(6.8, 7.45, NZ, NZ + 0.35);
  up(8.05, WX, NZ, NZ + 0.35);
  up(WX - 0.35, WX, NZ + 0.35, 6.15);
  blk(7.45, 8.05, 1.5, 1.6, NZ, NZ + 0.5, steel);                    // витяжка
  blk(7.65, 7.85, 1.6, 2.75, NZ, NZ + 0.2, steel);                  // короб до стелі
})();

// вітальня: ТБ на кронштейні на північній стіні зліва від дверей спалень + диван навпроти біля фасаду
(function buildLiving() {
  const g = houseGroup, base = FLOOR_Y;
  const blk = (x0, x1, y0, y1, z0, z1, m) =>
    box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2, g);
  const NZ = 4.575, cx = 1.9;

  // ТБ 65": 1.45 x 0.84, центр на висоті 1.4 м від підлоги
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.4 });
  const screen = new THREE.MeshStandardMaterial({ color: 0x0b0d0e, roughness: 0.08, metalness: 0.3 });
  blk(cx - 0.15, cx + 0.15, 1.25, 1.55, NZ, NZ + 0.012, dark);                // настінна планка
  // кронштейн із нахилом: ТБ відсунутий від стіни, верх висунутий вперед на 8° — екран дивиться трохи вниз, на тих, хто сидить на дивані
  blk(cx - 0.03, cx + 0.03, 1.37, 1.43, NZ + 0.012, NZ + 0.108, dark);        // виніс кронштейна
  const tv = new THREE.Group();
  tv.position.set(cx, base + 1.4, NZ + 0.14);
  tv.rotation.x = 0.14;
  g.add(tv);
  box(0.2, 0.2, 0.012, dark, 0, 0, -0.026, tv);                                // VESA-плита
  box(1.45, 0.84, 0.04, dark, 0, 0, 0, tv);                                    // корпус
  box(1.42, 0.81, 0.003, screen, 0, 0, 0.0215, tv);                            // екран

  // шкіряне крісло-реклайнер (як у серіалі «Друзі») і кутовий тканинний диван: темно-коричнева шкіра, товсті підлокітники, високі спинки з валиком.
  const leather = new THREE.MeshStandardMaterial({ color: 0x35221a, roughness: 0.45 });
  const piece = (grp, w, h, d, r, x, y, z, rotX = 0) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 6, r), leather);
    m.position.set(x, y, z);
    m.rotation.x = rotX;
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
  };
  // у локальних координатах: обличчям до -z, спинкою до +z, y — вгору від підлоги
  const seatSet = (width, seats, headrest) => {
    const grp = new THREE.Group(), D = 0.9, arm = 0.16;
    piece(grp, width, 0.3, D, 0.12, 0, 0.2, 0);                                   // основа
    for (const sx of [-1, 1]) piece(grp, arm, 0.34, D - 0.02, 0.08, sx * (width / 2 - arm / 2), 0.5, 0); // підлокітники
    const inner = width - 2 * arm - 0.02, sw = inner / seats;
    for (let i = 0; i < seats; i++) {
      const x = -inner / 2 + sw * (i + 0.5);
      piece(grp, sw - 0.02, 0.2, D - 0.22, 0.1, x, 0.45, -0.08);                  // подушка сидіння
      piece(grp, sw - 0.02, headrest ? 0.62 : 0.55, 0.26, 0.12, x, headrest ? 0.68 : 0.66, 0.3, 0.2); // спинка
      if (headrest) piece(grp, sw - 0.02, 0.2, 0.3, 0.1, x, 1.0, 0.36, 0.2);   // валик-підголівник
    }
    return grp;
  };
  const place = (grp, x, z, yaw, hw, hd) => {
    grp.position.set(x, base, z);
    grp.rotation.y = yaw;
    g.add(grp);
    addCollider(x - hw, x + hw, z - hd, z + hd);
  };
  // шкіряне крісло-реклайнер з боку, ближчого до столу, розвернуте прямо на ТБ (як півколо з диваном)
  place(seatSet(0.9, 1, true), 3.55, 8.17, 0.42, 0.58, 0.58);

  // кутовий тканинний диван у південно-західному куті: довга частина вздовж південної стіни, шезлонг висунутий на північ
  const oat = new THREE.MeshStandardMaterial({ color: 0xb9b0a2, roughness: 0.97 });
  const oatSoft = new THREE.MeshStandardMaterial({ color: 0xc8bfb0, roughness: 0.97 });
  const soft = (m, x0, x1, y0, y1, z0, z1, r) => {
    const o = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 5, r), m);
    o.position.set((x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
  };
  const X0 = 0.25, X1 = 2.85, ZB = 8.78, ZF = 7.83, ZC = 7.0, XC = 1.2, arm = 0.18;
  soft(oat, X0, X1, 0.06, 0.36, ZF, ZB, 0.08);                    // основа довгої частини
  soft(oat, X0, XC, 0.06, 0.36, ZC, ZF, 0.08);                    // основа шезлонга
  soft(oat, X0, X0 + arm, 0.3, 0.68, ZC, ZB, 0.08);              // підлокітник із західного боку (вздовж шезлонга й дивана)
  soft(oat, X1 - arm, X1, 0.3, 0.68, ZF, ZB, 0.08);              // підлокітник зі східного боку
  const lw = (X1 - X0 - 2 * arm) / 3;
  for (let i = 0; i < 3; i++) {
    const x0 = X0 + arm + lw * i;
    soft(oatSoft, x0 + 0.01, x0 + lw - 0.01, 0.36, 0.55, ZF, ZB - 0.2, 0.08);   // подушки сидіння
    soft(oat, x0 + 0.01, x0 + lw - 0.01, 0.36, 0.88, ZB - 0.25, ZB, 0.11);       // спинки
  }
  soft(oatSoft, X0 + arm + 0.01, XC - 0.01, 0.36, 0.55, ZC, ZF, 0.08);           // подушка шезлонга
  addCollider(X0, X1, ZF, ZB);
  addCollider(X0, XC, ZC, ZF);

  // ТБ-тумба 1.6 x 0.4 x 0.47 з світлого дерева (як стільниця) на ніжках, під ТБ по центру:
  // зліва й справа шухляди, посередині відкрита ніша
  const tex = oakTexture(false, true);
  tex.repeat.set(0.8, 0.5);
  const lightWood = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const cX0 = cx - 0.8, cX1 = cx + 0.8, cZ0 = NZ + 0.015, cZ1 = cZ0 + 0.4, cy0 = 0.14, cy1 = 0.47;
  blk(cX0, cX1, cy0, cy1, cZ0, cZ1, lightWood);                                   // корпус
  blk(cX0 - 0.02, cX1 + 0.02, cy1, cy1 + 0.025, cZ0 - 0.005, cZ1 + 0.015, lightWood); // стільниця
  blk(cX0 + 0.015, cX0 + 0.515, cy0 + 0.02, cy1 - 0.02, cZ1, cZ1 + 0.008, lightWood);  // шухляда зліва
  blk(cX1 - 0.515, cX1 - 0.015, cy0 + 0.02, cy1 - 0.02, cZ1, cZ1 + 0.008, lightWood);  // шухляда справа
  blk(cX0 + 0.53, cX1 - 0.53, cy0 + 0.02, cy1 - 0.02, cZ1 - 0.004, cZ1 + 0.004, dark); // відкрита ніша
  blk(cX0 + 0.19, cX0 + 0.34, 0.385, 0.4, cZ1 + 0.008, cZ1 + 0.03, dark);              // ручки
  blk(cX1 - 0.34, cX1 - 0.19, 0.385, 0.4, cZ1 + 0.008, cZ1 + 0.03, dark);
  for (const x of [cX0 + 0.1, cX1 - 0.1]) for (const z of [cZ0 + 0.07, cZ1 - 0.07]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.018, cy0, 4), lightWood);
    leg.position.set(x, base + cy0 / 2, z);
    leg.rotation.y = Math.PI / 4;
    leg.castShadow = true;
    g.add(leg);
  }
  addCollider(cX0 - 0.02, cX1 + 0.02, cZ0, cZ1 + 0.03);

  // скляний журнальний столик 1.0 x 0.55 x 0.42 перед диваном: загартоване скло в тонкій темній металевій рамі
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xcfe8e4, transparent: true, opacity: 0.3, roughness: 0.05, depthWrite: false });
  const tx0 = 1.55, tx1 = 2.55, tz0 = 6.825, tz1 = 7.375, th = 0.42, bar = 0.022;
  blk(tx0, tx1, th, th + 0.012, tz0, tz1, glassMat);                                        // скло
  blk(tx0, tx1, th - bar, th, tz0, tz0 + bar, dark);                                        // рама під склом
  blk(tx0, tx1, th - bar, th, tz1 - bar, tz1, dark);
  blk(tx0, tx0 + bar, th - bar, th, tz0, tz1, dark);
  blk(tx1 - bar, tx1, th - bar, th, tz0, tz1, dark);
  for (const x of [tx0, tx1 - bar]) for (const z of [tz0, tz1 - bar]) blk(x, x + bar, 0, th - bar, z, z + bar, dark); // ніжки
  blk(tx0, tx1, 0.1, 0.1 + bar, tz0, tz0 + bar, dark);                                      // нижня обв'язка
  blk(tx0, tx1, 0.1, 0.1 + bar, tz1 - bar, tz1, dark);
  blk(tx0, tx0 + bar, 0.1, 0.1 + bar, tz0, tz1, dark);
  blk(tx1 - bar, tx1, 0.1, 0.1 + bar, tz0, tz1, dark);
  addCollider(tx0, tx1, tz0, tz1);
})();

// обідня зона: стіл 1.6 x 0.9 вздовж південної стіни з відступом 0.65 м (щоб між столом і стіною можна було сидіти)
// і 6 стільців. Вигляд: білий стіл із заокругленою стільницею та точеними ніжками, білі стільці з високою
// спинкою на планках і сірими м'якими сидіннями
(function buildDining() {
  const g = houseGroup, base = FLOOR_Y;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.4 });
  const fabric = new THREE.MeshStandardMaterial({ color: 0x5f6469, roughness: 0.95 });
  const mesh = (geo, m, x, y, z) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, base + y, z);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const blk = (x0, x1, y0, y1, z0, z1, m = white) =>
    box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2, g);
  // ніжка, що звужується донизу
  const leg = (x, z, y0, y1, rTop, rBot) => {
    const o = mesh(new THREE.CylinderGeometry(rTop, rBot, y1 - y0, 4), white, x, (y0 + y1) / 2, z);
    o.rotation.y = Math.PI / 4;
  };

  const cx = 5.5, L = 1.6, W = 0.9, cz = 8.15 - W / 2;
  const tx0 = cx - L / 2, tx1 = cx + L / 2, tz0 = cz - W / 2, tz1 = cz + W / 2;

  // стільниця: прямокутник із закругленими кутами
  const r = 0.1, hw = L / 2, hd = W / 2;
  const sh = new THREE.Shape();
  sh.moveTo(-hw + r, -hd);
  sh.lineTo(hw - r, -hd); sh.quadraticCurveTo(hw, -hd, hw, -hd + r);
  sh.lineTo(hw, hd - r);  sh.quadraticCurveTo(hw, hd, hw - r, hd);
  sh.lineTo(-hw + r, hd); sh.quadraticCurveTo(-hw, hd, -hw, hd - r);
  sh.lineTo(-hw, -hd + r); sh.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const topGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 2, curveSegments: 8 });
  topGeo.rotateX(-Math.PI / 2);
  mesh(topGeo, white, cx, 0.72, cz);
  blk(tx0 + 0.07, tx1 - 0.07, 0.65, 0.72, tz0 + 0.07, tz1 - 0.07);                       // царга
  for (const x of [tx0 + 0.13, tx1 - 0.13]) for (const z of [tz0 + 0.13, tz1 - 0.13]) {
    blk(x - 0.05, x + 0.05, 0.6, 0.72, z - 0.05, z + 0.05);                               // верх ніжки
    leg(x, z, 0, 0.62, 0.05, 0.025);                                                        // ніжка
  }
  addCollider(tx0, tx1, tz0, tz1);

  // стілець; ax — вісь спинки ('z' або 'x'), dir — куди дивиться спинка (+1/-1 уздовж осі)
  const chair = (x, z, ax, dir) => {
    const bb = (u0, u1, v0, v1, y0, y1, m = white) => {            // u — вздовж спинки (+ до спинки), v — убік
      ax === 'z'
        ? blk(x + v0, x + v1, y0, y1, z + Math.min(u0 * dir, u1 * dir), z + Math.max(u0 * dir, u1 * dir), m)
        : blk(x + Math.min(u0 * dir, u1 * dir), x + Math.max(u0 * dir, u1 * dir), y0, y1, z + v0, z + v1, m);
    };
    const h = 0.21;
    // задні стійки суцільні від підлоги до верху спинки; сидіння стоїть між ними і не перерізає їх
    for (const v of [-0.2, 0.2]) bb(0.162, 0.198, v - 0.018, v + 0.018, 0, 1.02);
    bb(-h, 0.162, -0.182, 0.182, 0.42, 0.47);                       // рама сидіння
    bb(-h + 0.01, 0.152, -0.172, 0.172, 0.47, 0.52, fabric);        // м'яке сидіння
    for (const v of [-0.18, 0.18]) {                                // передні ніжки звужені
      const u = -0.18, px = ax === 'z' ? x + v : x + u * dir, pz = ax === 'z' ? z + u * dir : z + v;
      leg(px, pz, 0, 0.42, 0.022, 0.015);
    }
    bb(0.162, 0.198, -0.2, 0.2, 0.96, 1.02);                        // верхня планка
    bb(0.165, 0.195, -0.182, 0.182, 0.58, 0.62);                    // нижня планка
    for (let i = 0; i < 5; i++) {
      const v = -0.115 + i * 0.0575;
      bb(0.168, 0.192, v - 0.01, v + 0.01, 0.62, 0.96);              // планки спинки
    }
    addCollider(x - h, x + h, z - h, z + h);
  };
  // по два стільці з обох довгих сторін (з боку стіни теж) і по одному з торців
  for (const x of [cx - 0.4, cx + 0.4]) { chair(x, tz0 - 0.1, 'z', -1); chair(x, tz1 + 0.1, 'z', +1); }
  chair(tx0 - 0.1, cz, 'x', -1);
  chair(tx1 + 0.1, cz, 'x', +1);
})();

// ---------- картини ----------
// Усе намальовано процедурно: сімейні «полотна» (мама, тато, двоє малих і немовля) та ікона «Таємна вечеря», вишита бісером.
// Щоб замінити на справжні фото, поклади файли в папку art/ з іменами canvas1.jpg, canvas2.jpg, canvas3.jpg, supper.jpg.
const art = (() => {
  const skinTones = ['#f1c9a5', '#e8b88f', '#f5d3b5'];
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

  // повна постать: feet — лінія ніг, h — висота, kind: 'man' | 'woman' | 'kid'
  function figure(g, x, feet, h, o) {
    const kid = o.kind === 'kid', r = h * (kid ? 0.13 : 0.085);
    const legH = h * (kid ? 0.32 : 0.45), torsoH = h * (kid ? 0.3 : 0.33), bw = h * (kid ? 0.2 : 0.17);
    const hipY = feet - legH, shoulderY = hipY - torsoH, headY = shoulderY - r * 1.15;
    g.lineCap = 'round';
    if (o.kind === 'woman' && o.dress) {                                 // сукня
      g.fillStyle = o.top;
      g.beginPath(); g.moveTo(x - bw * 0.5, shoulderY); g.lineTo(x + bw * 0.5, shoulderY);
      g.lineTo(x + bw * 0.95, hipY + legH * 0.55); g.lineTo(x - bw * 0.95, hipY + legH * 0.55); g.closePath(); g.fill();
      g.strokeStyle = o.skin; g.lineWidth = h * 0.03;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * bw * 0.25, hipY + legH * 0.55); g.lineTo(x + s * bw * 0.25, feet); g.stroke(); }
    } else {
      g.strokeStyle = o.bottom; g.lineWidth = h * (kid ? 0.065 : 0.055);
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * bw * 0.22, hipY); g.lineTo(x + s * bw * 0.28, feet - h * 0.02); g.stroke(); }
      g.fillStyle = o.top;
      g.beginPath(); g.roundRect(x - bw / 2, shoulderY, bw, torsoH + h * 0.02, bw * 0.25); g.fill();
    }
    g.strokeStyle = o.top; g.lineWidth = h * 0.045;                       // руки
    const ah = o.arms || 'down';
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(x + s * bw / 2, shoulderY + h * 0.03);
      if (ah === 'hold') g.lineTo(x + s * bw * 0.35, shoulderY + torsoH * 0.75); else g.lineTo(x + s * (bw / 2 + h * 0.03), hipY + h * 0.03);
      g.stroke();
    }
    g.fillStyle = o.skin;                                                  // шия й голова
    g.fillRect(x - r * 0.3, headY + r * 0.7, r * 0.6, r * 0.6);
    g.beginPath(); g.arc(x, headY, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = o.hair;                                                  // волосся
    if (o.kind === 'woman' && !o.short) { g.beginPath(); g.ellipse(x, headY + r * 0.2, r * 1.15, r * 1.4, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = o.skin; g.beginPath(); g.arc(x, headY + r * 0.15, r * 0.88, 0, Math.PI * 2); g.fill(); g.fillStyle = o.hair; }
    g.beginPath(); g.arc(x, headY - r * 0.15, r * 1.02, Math.PI * 1.05, Math.PI * 1.95); g.fill();
    g.fillStyle = '#3a2a22';                                                // очі й посмішка
    g.beginPath(); g.arc(x - r * 0.35, headY, r * 0.08, 0, 7); g.arc(x + r * 0.35, headY, r * 0.08, 0, 7); g.fill();
    g.strokeStyle = '#a5594c'; g.lineWidth = r * 0.1; g.beginPath(); g.arc(x, headY + r * 0.2, r * 0.38, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
  }
  function baby(g, x, y, s, skin, wrap) {                                  // немовля у пелюшці
    g.fillStyle = wrap; g.beginPath(); g.ellipse(x, y + s * 0.5, s * 0.62, s * 0.8, 0.3, 0, 7); g.fill();
    g.fillStyle = skin; g.beginPath(); g.arc(x - s * 0.1, y - s * 0.25, s * 0.5, 0, 7); g.fill();
    g.fillStyle = '#3a2a22'; g.beginPath(); g.arc(x - s * 0.27, y - s * 0.25, s * 0.05, 0, 7); g.arc(x + s * 0.07, y - s * 0.25, s * 0.05, 0, 7); g.fill();
  }
  const dad = (skin) => ({ kind: 'man', skin, hair: '#3d2b1f', top: '#4f6f8a', bottom: '#3c4650' });
  const mom = (skin) => ({ kind: 'woman', skin, hair: '#8a5a3a', top: '#b0504a', bottom: '#4a4a52', dress: true, arms: 'hold' });
  const kid1 = (skin) => ({ kind: 'kid', skin, hair: '#5a3a24', top: '#e0a63a', bottom: '#3c5a7a' });
  const kid2 = (skin) => ({ kind: 'kid', skin, hair: '#c9923a', top: '#6aa57e', bottom: '#8a5a6a' });

  function landscape(g, w, h) {
    const sky = g.createLinearGradient(0, 0, 0, h * 0.7);
    sky.addColorStop(0, '#9cc7e8'); sky.addColorStop(1, '#f1e6cf');
    g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6d36b'; g.beginPath(); g.arc(w * 0.82, h * 0.2, h * 0.07, 0, 7); g.fill();
    g.fillStyle = '#7da26a'; g.beginPath(); g.moveTo(0, h * 0.6); g.quadraticCurveTo(w * 0.3, h * 0.45, w * 0.6, h * 0.62); g.quadraticCurveTo(w * 0.85, h * 0.5, w, h * 0.58); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#5f8a55'; g.fillRect(0, h * 0.78, w, h * 0.22);
  }

  // полотно 1: уся родина на лузі біля хати (альбомне)
  function canvas1() {
    const [c, g] = mk(1200, 800);
    landscape(g, 1200, 800);
    g.fillStyle = '#65777a'; g.fillRect(820, 330, 260, 170);                                   // хата
    g.fillStyle = '#604744'; g.beginPath(); g.moveTo(800, 335); g.lineTo(950, 250); g.lineTo(1100, 335); g.fill();
    g.fillStyle = '#f2f0e8'; g.fillRect(880, 390, 50, 50); g.fillRect(970, 390, 50, 50);
    g.fillStyle = '#4f7a46'; g.beginPath(); g.arc(120, 330, 90, 0, 7); g.fill(); g.fillStyle = '#5b4328'; g.fillRect(110, 400, 20, 130);
    const feet = 740;
    figure(g, 380, feet, 560, dad(skinTones[0]));
    figure(g, 520, feet, 530, mom(skinTones[1]));
    baby(g, 555, feet - 330, 60, skinTones[1], '#f3e9d8');
    figure(g, 640, feet, 300, kid1(skinTones[0]));
    figure(g, 730, feet, 260, kid2(skinTones[2]));
    return c;
  }
  // полотно 2: батьки з немовлям, портрет (вертикальне)
  function canvas2() {
    const [c, g] = mk(720, 960);
    const bg = g.createLinearGradient(0, 0, 0, 960); bg.addColorStop(0, '#e9d3b4'); bg.addColorStop(1, '#c9a27a');
    g.fillStyle = bg; g.fillRect(0, 0, 720, 960);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(360, 360, 300, 0, 7); g.fill();
    figure(g, 250, 900, 820, dad(skinTones[0]));
    figure(g, 470, 900, 780, mom(skinTones[1]));
    baby(g, 480, 500, 80, skinTones[1], '#f6efe3');
    return c;
  }
  // полотно 3: двоє малих із кульками (вертикальне, менше)
  function canvas3() {
    const [c, g] = mk(600, 780);
    landscape(g, 600, 780);
    g.strokeStyle = '#6b6b6b'; g.lineWidth = 3;
    for (const [bx, by, col] of [[210, 150, '#d9534f'], [300, 110, '#f0ad4e'], [400, 160, '#5b9bd5']]) {
      g.beginPath(); g.moveTo(bx, by + 55); g.lineTo(bx + 25 * (bx < 300 ? 1 : -1), 470); g.stroke();
      g.fillStyle = col; g.beginPath(); g.ellipse(bx, by, 50, 62, 0, 0, 7); g.fill();
    }
    figure(g, 230, 700, 340, kid1(skinTones[0]));
    figure(g, 370, 700, 300, kid2(skinTones[2]));
    return c;
  }

  // ікона «Таємна вечеря», вишита бісером: малюємо спрощену композицію на сітці 280 x 148 «намистин»
  // і перетворюємо кожну клітинку на намистинку з відблиском
  function supper() {
    const GW = 280, GH = 148, B = 5;
    const [sm, g] = mk(GW, GH);
    g.fillStyle = '#b8862a'; g.fillRect(0, 0, GW, GH);                       // золоте тло
    for (const ax of [50, 140, 230]) {                                       // три арки позаду
      g.fillStyle = '#6b3d1f'; g.beginPath(); g.moveTo(ax - 28, 90); g.lineTo(ax - 28, 30); g.arc(ax, 30, 28, Math.PI, 0); g.lineTo(ax + 28, 90); g.fill();
      g.fillStyle = '#d9a94a'; g.beginPath(); g.moveTo(ax - 22, 90); g.lineTo(ax - 22, 31); g.arc(ax, 31, 22, Math.PI, 0); g.lineTo(ax + 22, 90); g.fill();
    }
    const robes = ['#7a5cab', '#3f7d5c', '#b0504a', '#4f6f8a', '#c0873a', '#7a8f4a', null, '#8a3f3f', '#3b6d8a', '#a0722d', '#5a4a8a', '#4a7a5a', '#b06a3a'];
    const n = 13, x0 = 22, step = (GW - 2 * x0) / (n - 1);
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, c = i === 6, hy = c ? 55 : 62;
      const w = c ? 24 : 17, hr = c ? 8 : 6.5, halo = c ? 13 : 9.5;
      g.fillStyle = c ? '#b02a2a' : robes[i];                                // одяг
      g.beginPath(); g.moveTo(x - w * 0.35, hy + hr); g.lineTo(x + w * 0.35, hy + hr); g.lineTo(x + w * 0.6, 100); g.lineTo(x - w * 0.6, 100); g.fill();
      if (c) { g.fillStyle = '#2a4f9b'; g.beginPath(); g.moveTo(x - w * 0.5, hy + hr + 2); g.lineTo(x - w * 0.12, hy + hr + 2); g.lineTo(x - w * 0.3, 100); g.lineTo(x - w * 0.62, 100); g.fill();
               g.beginPath(); g.moveTo(x + w * 0.5, hy + hr + 2); g.lineTo(x + w * 0.12, hy + hr + 2); g.lineTo(x + w * 0.3, 100); g.lineTo(x + w * 0.62, 100); g.fill(); }
      g.fillStyle = '#f4d35e'; g.beginPath(); g.arc(x, hy, halo, 0, 7); g.fill();                  // німб
      g.strokeStyle = '#7b5a12'; g.lineWidth = 1.2; g.beginPath(); g.arc(x, hy, halo, 0, 7); g.stroke();
      if (c) { g.strokeStyle = '#b02a2a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(x, hy - halo + 1.5); g.lineTo(x, hy + halo - 1.5); g.moveTo(x - halo + 1.5, hy); g.lineTo(x + halo - 1.5, hy); g.stroke(); }
      g.fillStyle = '#e8b88f'; g.beginPath(); g.arc(x, hy, hr, 0, 7); g.fill();                    // обличчя
      g.fillStyle = i % 3 === 0 ? '#d8d2c4' : i % 3 === 1 ? '#5a3a24' : '#3d2b1f';                  // волосся й борода
      g.beginPath(); g.arc(x, hy - hr * 0.25, hr * 1.02, Math.PI * 1.05, Math.PI * 1.95); g.fill();
      g.beginPath(); g.arc(x, hy + hr * 0.55, hr * 0.7, 0.1, Math.PI - 0.1); g.fill();
      g.fillStyle = '#2a1a10'; g.fillRect(x - hr * 0.45, hy - 1, 1.2, 1.2); g.fillRect(x + hr * 0.3, hy - 1, 1.2, 1.2);
    }
    g.fillStyle = '#f1ead6'; g.fillRect(12, 94, GW - 24, 30);                                       // скатертина
    g.fillStyle = '#cfc6ab'; for (let x = 20; x < GW - 12; x += 14) g.fillRect(x, 100, 1.5, 24);    // складки
    g.fillStyle = '#d7b448'; g.fillRect(12, 94, GW - 24, 2);                                        // галун
    for (let i = 0; i < n; i++) {                                                                    // тарілки
      const x = x0 + i * step; g.fillStyle = '#c9a227'; g.beginPath(); g.ellipse(x, 104, 5, 2.4, 0, 0, 7); g.fill();
    }
    g.fillStyle = '#e8d9a0'; g.beginPath(); g.ellipse(140, 101, 6, 2.6, 0, 0, 7); g.fill();       // хліб і чаша Христа
    g.fillStyle = '#a02020'; g.fillRect(150, 96, 4, 5);
    g.strokeStyle = '#7b1f1a'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, GW - 5, GH - 5);              // червона рамка з бісеру
    g.strokeStyle = '#f4d35e'; g.lineWidth = 1.5; g.strokeRect(6.5, 6.5, GW - 13, GH - 13);
    // тло під бісер і намистинки
    const px = g.getImageData(0, 0, GW, GH).data;
    const [c, o] = mk(GW * B, GH * B);
    o.fillStyle = '#1a1208'; o.fillRect(0, 0, GW * B, GH * B);
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
      const k = (y * GW + x) * 4, j = (Math.random() - 0.5) * 18;
      o.fillStyle = `rgb(${Math.max(0, Math.min(255, px[k] + j))},${Math.max(0, Math.min(255, px[k + 1] + j))},${Math.max(0, Math.min(255, px[k + 2] + j))})`;
      o.beginPath(); o.arc(x * B + B / 2, y * B + B / 2, B * 0.47, 0, 7); o.fill();
      o.fillStyle = 'rgba(255,255,255,0.4)'; o.beginPath(); o.arc(x * B + B * 0.36, y * B + B * 0.34, B * 0.15, 0, 7); o.fill();
    }
    return c;
  }

  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  // спробувати підтягнути справжнє фото з art/<name>.jpg; якщо файла нема — лишається намальоване
  const material = (name, draw) => {
    const m = new THREE.MeshStandardMaterial({ map: tex(draw()), roughness: 0.7 });
    new THREE.TextureLoader().load(`art/${name}.jpg`, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; m.map = t; m.needsUpdate = true; }, undefined, () => {});
    return m;
  };
  return { canvas1: () => material('canvas1', canvas1), canvas2: () => material('canvas2', canvas2), canvas3: () => material('canvas3', canvas3), supper: () => material('supper', supper) };
})();

// розвішування на південній стіні: над диваном три полотна, над обіднім столом ікона «Таємна вечеря»
(function hangArt() {
  const g = houseGroup, base = FLOOR_Y, WALL = 8.8;
  const edge = new THREE.MeshStandardMaterial({ color: 0xe9e2d2, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  // полотно на підрамнику: товщина 3.5 см
  const canvasOn = (x, y, w, h, mt) => {
    const d = 0.035;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [edge, edge, edge, edge, edge, mt]); // -z — лицьова грань (дивиться на північ)
    m.position.set(x, base + y, WALL - d / 2 - 0.003);
    m.castShadow = true;
    g.add(m);
  };
  canvasOn(1.0, 1.55, 1.1, 0.75, art.canvas1());
  canvasOn(1.95, 1.58, 0.6, 0.8, art.canvas2());
  canvasOn(3.55, 1.5, 0.5, 0.65, art.canvas3());

  // ікона 1.1 x 0.58 у темній горіховій рамі з тонким золотим кантом
  const cw = 1.1, ch = 0.58, cx = 5.5, cy = 1.78, d = 0.04, fr = 0.04;
  const walnut = new THREE.MeshStandardMaterial({ color: 0x3b2616, roughness: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.6, roughness: 0.35 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(cw - 2 * fr, ch - 2 * fr), art.supper());
  front.rotation.y = Math.PI;                                                  // дивитись на північ (-z)
  front.position.set(cx, base + cy, WALL - 0.006);
  g.add(front);
  const bar = (w, h, x, y, m, dd) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); b.position.set(x, base + y, WALL - dd / 2 - 0.003); g.add(b); };
  bar(cw, fr, cx, cy + ch / 2 - fr / 2, walnut, d); bar(cw, fr, cx, cy - ch / 2 + fr / 2, walnut, d);
  bar(fr, ch - 2 * fr, cx - cw / 2 + fr / 2, cy, walnut, d); bar(fr, ch - 2 * fr, cx + cw / 2 - fr / 2, cy, walnut, d);
  const k = 0.008, ix = cw - 2 * fr, iy = ch - 2 * fr;                          // золотий кант усередині рами
  bar(ix, k, cx, cy + iy / 2 - k / 2, gold, d + 0.004); bar(ix, k, cx, cy - iy / 2 + k / 2, gold, d + 0.004);
  bar(k, iy - 2 * k, cx - ix / 2 + k / 2, cy, gold, d + 0.004); bar(k, iy - 2 * k, cx + ix / 2 - k / 2, cy, gold, d + 0.004);
})();

// ґанок: настил, білі колони, перила, дашок, сходинка
(function buildPorch() {
  const x0 = 5.0, x1 = 11.4, z0 = 9.2, z1 = 11.4, deckTop = 0.3;
  const g = houseGroup;
  box(x1 - x0, deckTop, z1 - z0, mat.foundation, (x0 + x1) / 2, deckTop / 2, (z0 + z1) / 2, g);
  box(1.6, 0.15, 0.5, mat.wood, 8.25, 0.075, z1 + 0.25, g); // сходинка до входу

  const colX = [5.3, 7.2, 9.3, 11.1], colH = 2.4, zc = z1 - 0.2;
  for (const x of colX) {
    box(0.16, colH, 0.16, mat.white, x, deckTop + colH / 2, zc, g);
    addCollider(x - 0.1, x + 0.1, zc - 0.1, zc + 0.1);
  }
  // перила: між колонами, крім проходу до сходинки (7.2..9.3), і з боків
  const rail = (xa, za, xb, zb) => {
    const len = Math.hypot(xb - xa, zb - za), cx = (xa + xb) / 2, cz = (za + zb) / 2;
    const alongX = za === zb;
    for (const y of [deckTop + 0.9, deckTop + 0.1]) {
      alongX ? box(len, 0.07, 0.07, mat.white, cx, y, cz, g) : box(0.07, 0.07, len, mat.white, cx, y, cz, g);
    }
    const n = Math.max(2, Math.round(len / 0.14));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = xa + (xb - xa) * t, z = za + (zb - za) * t;
      box(0.04, 0.85, 0.04, mat.white, x, deckTop + 0.5, z, g);
    }
    alongX ? addCollider(Math.min(xa, xb), Math.max(xa, xb), cz - 0.05, cz + 0.05)
           : addCollider(cx - 0.05, cx + 0.05, Math.min(za, zb), Math.max(za, zb));
  };
  rail(5.3, zc, 7.2, zc);
  rail(9.3, zc, 11.1, zc);
  rail(5.3, z0, 5.3, zc);
  rail(11.1, z0, 11.1, zc);

  // дашок ґанку: схил від стіни вниз до колон, тим самим темно-коричневим
  const rz0 = z0 - 0.2, rz1 = z1 + 0.1, hi = 2.95, lo = 2.62;
  const roofLen = Math.hypot(rz1 - rz0, hi - lo);
  const pr = box(x1 - x0 + 0.5, 0.1, roofLen, mat.roof, (x0 + x1) / 2, (hi + lo) / 2 + 0.05, (rz0 + rz1) / 2, g);
  pr.rotation.x = Math.atan2(hi - lo, rz1 - rz0);
  box(x1 - x0 + 0.5, 0.18, 0.05, mat.white, (x0 + x1) / 2, lo - 0.05, rz1 + 0.02, g);
})();

// доріжка від воріт до ґанку (цегляна)
(function buildPath() {
  const hx = house.position[0], hz = house.position[1];
  const px = hx + 8.25, pz = hz + 12.1;      // низ сходинки
  const gx = plot.gate.x, gz = plot.d / 2;
  const w = 1.4, y = 0.02;
  box(w, 0.04, gz - 11, mat.brick, gx, y, (gz + 11) / 2);            // від воріт на північ
  box(Math.abs(px - gx) + w, 0.04, w, mat.brick, (px + gx) / 2, y, 11); // поперек до ґанку
  box(w, 0.04, 11 + w / 2 - pz, mat.brick, px, y, (pz + 11 + w / 2) / 2);   // до сходинки
})();

function addCollider(minX, maxX, minZ, maxZ) {
  colliders.push({
    minX: minX + house.position[0], maxX: maxX + house.position[0],
    minZ: minZ + house.position[1], maxZ: maxZ + house.position[1],
  });
}

// ---------- керування ----------
const walk = new PointerLockControls(camera, renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
let mode = 'walk';

const EYE = 1.7, RADIUS = 0.3;
camera.position.set(0, EYE, plot.d / 2 - 2);
camera.lookAt(0, EYE, 0);

const isTouch = matchMedia('(pointer: coarse)').matches;
camera.rotation.order = 'YXZ';
const startEl = document.getElementById('start');
const showStart = () => { if (!isTouch) startEl.style.display = 'flex'; };
startEl.addEventListener('click', () => { if (mode === 'walk') walk.lock(); });
walk.addEventListener('lock', () => startEl.style.display = 'none');
walk.addEventListener('unlock', () => { if (mode === 'walk') showStart(); });
if (isTouch) startEl.style.display = 'none';

const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') roof.visible = !roof.visible;
  if (e.code === 'KeyV') toggleMode();
});
addEventListener('keyup', e => keys[e.code] = false);

function toggleMode() {
  if (mode === 'walk') {
    mode = 'orbit';
    walk.unlock();
    startEl.style.display = 'none';
    camera.position.set(0, 35, 40);
    orbit.target.set(house.position[0] + house.w / 2, 0, house.position[1] + house.d / 2);
    orbit.enabled = true;
    orbit.update();
  } else {
    mode = 'walk';
    orbit.enabled = false;
    camera.position.set(house.position[0] + house.w / 2, EYE, plot.d / 2 - 2);
    camera.lookAt(0, EYE, 0);
    showStart();
  }
}

function collides(x, z) {
  for (const c of colliders) {
    if (x > c.minX - RADIUS && x < c.maxX + RADIUS && z > c.minZ - RADIUS && z < c.maxZ + RADIUS) return true;
  }
  return false;
}

// ---------- дотик: джойстик ліворуч, свайп праворуч — огляд ----------
const stick = { x: 0, y: 0 }; // -1..1, y<0 — вперед
if (isTouch) {
  document.getElementById('hud').style.display = 'none';
  const css = (el, s) => { Object.assign(el.style, s); return el; };
  const base = css(document.createElement('div'), { position: 'fixed', width: '120px', height: '120px', borderRadius: '50%', background: 'rgba(255,255,255,.18)', border: '2px solid rgba(255,255,255,.5)', display: 'none', pointerEvents: 'none' });
  const knob = css(document.createElement('div'), { position: 'absolute', left: '35px', top: '35px', width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(255,255,255,.6)' });
  base.appendChild(knob);
  document.body.appendChild(base);
  const btn = (text, top, fn) => {
    const b = css(document.createElement('button'), { position: 'fixed', right: '12px', top: top + 'px', padding: '10px 14px', font: '15px system-ui', border: 'none', borderRadius: '8px', background: 'rgba(0,0,0,.55)', color: '#fff' });
    b.textContent = text;
    b.addEventListener('click', fn);
    document.body.appendChild(b);
  };
  btn('Дах', 12, () => roof.visible = !roof.visible);
  btn('Вид', 60, toggleMode);

  renderer.domElement.style.touchAction = 'none';
  const R = 50;
  let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
  const el = renderer.domElement;
  el.addEventListener('touchstart', e => {
    if (mode !== 'walk') return;
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && stickId === null) {
        stickId = t.identifier; sx = t.clientX; sy = t.clientY;
        css(base, { display: 'block', left: (sx - 60) + 'px', top: (sy - 60) + 'px' });
        knob.style.left = knob.style.top = '35px';
      } else if (lookId === null) {
        lookId = t.identifier; lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (mode !== 'walk') return;
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        const dx = t.clientX - sx, dy = t.clientY - sy, d = Math.hypot(dx, dy) || 1, k = Math.min(d, R) / d;
        stick.x = dx * k / R; stick.y = dy * k / R;
        knob.style.left = (35 + dx * k) + 'px'; knob.style.top = (35 + dy * k) + 'px';
      } else if (t.identifier === lookId) {
        camera.rotation.y -= (t.clientX - lx) * 0.005;
        camera.rotation.x = Math.max(-1.4, Math.min(1.4, camera.rotation.x - (t.clientY - ly) * 0.005));
        lx = t.clientX; ly = t.clientY;
      }
    }
  }, { passive: true });
  const end = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; stick.x = stick.y = 0; base.style.display = 'none'; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}

const clock = new THREE.Clock();
const dir = new THREE.Vector3();

function update(dt) {
  if (mode !== 'walk' || !(walk.isLocked || isTouch)) return;
  const speed = (keys.ShiftLeft ? 5 : 2.2) * dt;
  const f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - stick.y;
  const r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + stick.x;
  if (!f && !r) return;

  camera.getWorldDirection(dir);
  dir.y = 0; dir.normalize();
  const dx = (dir.x * f - dir.z * r) * speed;
  const dz = (dir.z * f + dir.x * r) * speed;

  const p = camera.position;
  const lim = (v, half) => Math.max(-half + 0.3, Math.min(half - 0.3, v));
  // окремо по осях — щоб ковзати вздовж стін
  const nx = p.x + dx;
  if (!collides(nx, p.z)) p.x = nx;
  const nz = p.z + dz;
  if (!collides(p.x, nz)) p.z = nz;
  // не виходимо за межі ділянки (крім воріт)
  const inGate = Math.abs(p.x - plot.gate.x) < plot.gate.width / 2 - 0.3;
  p.x = lim(p.x, plot.w);
  p.z = inGate ? Math.min(p.z, plot.d / 2 + 30) : lim(p.z, plot.d);
  p.y = EYE;
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

renderer.setAnimationLoop(() => {
  update(Math.min(clock.getDelta(), 0.1));
  renderer.render(scene, camera);
});

// біла натяжна стеля по всій хаті; ховається разом з дахом (R)
(function buildCeiling() {
  const x0 = 0.2, x1 = 10.8, z0 = 0.2, z1 = 8.8;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0),
    new THREE.MeshStandardMaterial({ color: 0xf6f5f0, emissive: 0xf2f0e8, emissiveIntensity: 0.75, roughness: 0.4 }));
  m.rotation.x = Math.PI / 2; // нормаль вниз — видно лише зсередини
  m.position.set((x0 + x1) / 2, -ceilingDrop, (z0 + z1) / 2);
  roof.add(m);
})();

// внутрішнє освітлення: по лампі під стелею в кожному приміщенні (тіней немає)
[[2.5, 2.3], [7.9, 2.3], [3.5, 6.7], [7.0, 6.7], [10.0, 5.4], [10.0, 6.9], [10.0, 8.2]].forEach(([x, z]) => {
  const l = new THREE.PointLight(0xfff1dc, 9, 8, 1.6);
  l.position.set(x, 2.65, z);
  houseGroup.add(l);
});
