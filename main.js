import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  blk(cx - 0.03, cx + 0.03, 1.37, 1.43, NZ + 0.012, NZ + 0.075, dark);        // кронштейн
  blk(cx - 0.725, cx + 0.725, 0.98, 1.82, NZ + 0.075, NZ + 0.115, dark);      // корпус
  blk(cx - 0.71, cx + 0.71, 0.995, 1.805, NZ + 0.115, NZ + 0.118, screen);   // екран

  // диван 2.4 x 0.93, спинкою до південної стіни, обличчям до ТБ
  const fabric = new THREE.MeshStandardMaterial({ color: 0xb9b0a2, roughness: 0.95 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0xc6bdae, roughness: 0.95 });
  const sx0 = cx - 1.2, sx1 = cx + 1.2, sz0 = 7.87, sz1 = 8.78, back = 0.22, arm = 0.2;
  blk(sx0, sx1, 0.08, 0.38, sz0, sz1, fabric);                                // основа
  blk(sx0 + arm, sx1 - arm, 0.38, 0.5, sz0, sz1 - back, cushion);            // подушки сидіння
  blk(sx0 + arm, sx1 - arm, 0.38, 0.85, sz1 - back, sz1, fabric);            // спинка
  blk(sx0, sx0 + arm, 0.38, 0.62, sz0, sz1, fabric);                          // підлокітники
  blk(sx1 - arm, sx1, 0.38, 0.62, sz0, sz1, fabric);
  for (const x of [sx0 + 0.1, sx1 - 0.1]) for (const z of [sz0 + 0.1, sz1 - 0.1]) blk(x - 0.03, x + 0.03, 0, 0.08, z - 0.03, z + 0.03, dark); // ніжки
  addCollider(sx0, sx1, sz0, sz1);
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

  const cx = 5.1, L = 1.6, W = 0.9, cz = 8.15 - W / 2;
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
