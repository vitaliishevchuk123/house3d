import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { feature } from 'topojson-client';
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
sun.position.set(house.position[0] + 25, 40, house.position[1] + 20);
sun.target.position.set(house.position[0], 0, house.position[1]);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
scene.add(sun, sun.target);

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

// світла «стара» цегла для цоколя й ґанку: розсипчастий кладка в півцеглини, кольори від рожевого до кремового, світлий розчин
const BRICK_SCALE = 1.2;   // метрів на один квадрат текстури (5 цеглин по ширині, 16 рядів)
function brickTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#bdb6ab';
  g.fillRect(0, 0, 512, 512);
  const palette = ['#c9a38f', '#b98b78', '#d8bfa8', '#a8826f', '#cdb7a5', '#c2998a', '#dccbb6'];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bw = 512 / 5, bh = 512 / 16, j = 3;
  for (let r = 0; r < 16; r++) {
    for (let i = -1; i < 6; i++) {
      const x = i * bw + (r % 2 ? bw / 2 : 0);
      g.fillStyle = palette[Math.floor(rnd() * palette.length)];
      g.fillRect(x + j / 2, r * bh + j / 2, bw - j, bh - j);
      for (let k = 0; k < 14; k++) {                                   // крапинки для живої фактури
        g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(90,60,50,0.14)';
        g.fillRect(x + rnd() * bw, r * bh + rnd() * bh, 2 + rnd() * 4, 1 + rnd() * 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
mat.foundation = new THREE.MeshStandardMaterial({ map: brickTexture(), roughness: 0.95 });

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

// вулиця вздовж південного паркану: смуга газону, асфальт (7 м), смуга газону з протилежного боку
const STREET = { z0: plot.d / 2 + 3, w: 7 };            // 3 м газону від паркану, далі асфальт
(function buildStreet() {
  const strip = (zc, h) => {
    const t = gt.clone(); t.needsUpdate = true; t.repeat.set(300, h / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(600, h), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set(0, 0.005, zc); m.receiveShadow = true; scene.add(m);
  };
  strip(plot.d / 2 + 1.5, 3);
  strip(STREET.z0 + STREET.w + 1.5, 3);
  // асфальт: темно-сіре покриття з дрібною зернистістю
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3d3f43';
  g.fillRect(0, 0, 256, 256);
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const v = 50 + Math.floor(rnd() * 40);
    g.fillStyle = `rgba(${v},${v},${v + 2},0.55)`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(150, STREET.w / 4);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(600, STREET.w), new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 }));
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.01, STREET.z0 + STREET.w / 2);
  road.receiveShadow = true;
  scene.add(road);
})();

function box(w, h, d, material, x, y, z, parent = scene) {
  const geo = new THREE.BoxGeometry(w, h, d);
  if (material === mat.foundation) {                               // цегла: UV у метрах, щоб кладка не розтягувалась на різних боксах
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const f = Math.floor(i / 4), px = p.getX(i) + x, py = p.getY(i) + y, pz = p.getZ(i) + z;
      uv.setXY(i, (f < 2 ? pz : px) / BRICK_SCALE, (f === 2 || f === 3 ? pz : py) / BRICK_SCALE);
    }
  }
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}

// паркан
(function buildFence() {
  const hw = plot.w / 2, hd = plot.d / 2, fh = plot.fenceHeight, step = 2.5;
  const gx0 = plot.gate.x - plot.gate.width / 2, gx1 = plot.gate.x + plot.gate.width / 2;
  const wx0 = plot.wicket.x - plot.wicket.width / 2, wx1 = plot.wicket.x + plot.wicket.width / 2;

  // сітка-рабиця: оцинковані круглі стовпи, натяжний дріт знизу, ромбічна сітка на прозорій текстурі
  const galv = new THREE.MeshStandardMaterial({ color: 0xaab0b4, roughness: 0.5, metalness: 0.2 });
  const meshTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = '#c9cdcf';
    g.lineWidth = 2.2;
    for (let k = -2; k <= 2; k++) {
      g.beginPath(); g.moveTo(-8, 32 * k - 8); g.lineTo(72, 32 * k + 72); g.stroke();
      g.beginPath(); g.moveTo(-8, 32 * k + 72); g.lineTo(72, 32 * k - 8); g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  })();
  const CELL = 0.16;   // метрів на одну плитку текстури (2 × 2 ромби по ~8 см)
  function wireMesh(l, h, x, y, z, vertical) {
    const t = meshTex.clone(); t.needsUpdate = true; t.repeat.set(l / CELL, h / CELL);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(l, h), new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.6 }));
    m.position.set(x, y, z);
    if (vertical) m.rotation.y = Math.PI / 2;
    scene.add(m);
  }
  const pipe = (r, l, x, y, z, axis) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 8), galv);
    m.position.set(x, y, z);
    if (axis === 'x') m.rotation.z = Math.PI / 2; else if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.castShadow = true;
    scene.add(m);
  };

  function run(x1, z1, x2, z2, openings = []) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const n = Math.round(len / step);
    const dx = (x2 - x1) / len, dz = (z2 - z1) / len;
    const rot = Math.atan2(-dz, dx);
    for (let i = 0; i <= n; i++) {
      const x = x1 + dx * (len * i / n), z = z1 + dz * (len * i / n);
      if (openings.some(([a, b]) => x > a + 0.01 && x < b - 0.01)) continue;
      pipe(0.035, fh + 0.1, x, (fh + 0.1) / 2, z);
    }
    // дошки між стовпами
    const segs = [];
    let cur = x1;
    for (const [a, b] of openings) { segs.push([cur, a]); cur = b; }
    segs.push([cur, x2]);
    for (const [a, b] of segs) {
      const horizontal = z1 === z2;
      const l = horizontal ? Math.abs(b - a) : len;
      if (l <= 0) continue;
      const cx = horizontal ? (a + b) / 2 : x1;
      const cz = horizontal ? z1 : (z1 + z2) / 2;
      wireMesh(l, fh - 0.1, cx, 0.1 + (fh - 0.1) / 2, cz, !horizontal);
      pipe(0.007, l, cx, 0.1, cz, horizontal ? 'x' : 'z');           // натяжний дріт знизу
    }
  }
  run(-hw, -hd, hw, -hd);
  run(-hw, hd, hw, hd, [[wx0, wx1], [gx0, gx1]]);

  // брама і хвіртка: мінімалістичні, зашиті графітовим профнастилом на сталевих стовпах, хвіртка впритул до брами
  const profTex = () => {
    // трапецієвидний профнастил графітового кольору: 12 хвиль на текстуру — широка полиця, скоси й вузька грань
    const c = document.createElement('canvas');
    c.width = 384; c.height = 16;
    const g = c.getContext('2d');
    const per = 384 / 12;
    const shades = [[0, 11, '#4a505a'], [11, 14, '#3a3f47'], [14, 17, '#626975'], [17, 20, '#33383f'], [20, 32, '#4a505a']];
    for (let i = 0; i < 12; i++) for (const [x0, x1, col] of shades) { g.fillStyle = col; g.fillRect(i * per + x0, 0, x1 - x0, 16); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const sheetTex = profTex();
  const sheet = w => { const t = sheetTex.clone(); t.needsUpdate = true; t.repeat.set(w / 1.2, 1); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0 }); };
  const steel = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.6, metalness: 0 });
  const GH = 1.9;                                                         // висота полотна
  const post = x => { box(0.14, 2.1, 0.14, steel, x, 1.05, hd); box(0.18, 0.04, 0.18, steel, x, 2.12, hd); };
  for (const x of [gx0, gx1, wx0, wx1]) post(x);
  // брама: дві стулки, зачинена
  const leafW = (gx1 - gx0) / 2 - 0.1;
  for (const s of [-1, 1]) {
    const cx = plot.gate.x + s * (leafW / 2 + 0.03);
    box(leafW, GH, 0.04, sheet(leafW), cx, 0.1 + GH / 2, hd);
    box(leafW, 0.06, 0.06, steel, cx, 0.1 + GH - 0.03, hd);                // верхня обв'язка
    box(leafW, 0.06, 0.06, steel, cx, 0.13, hd);                            // нижня
  }
  box(0.04, 0.5, 0.06, steel, plot.gate.x - 0.1, 1.0, hd + 0.04);           // ручки по центру
  box(0.04, 0.5, 0.06, steel, plot.gate.x + 0.1, 1.0, hd + 0.04);
  // хвіртка: прочинена всередину ділянки
  const wl = plot.wicket.width - 0.1;
  const wp = new THREE.Group();
  wp.position.set(wx0 + 0.07, 0, hd);
  wp.rotation.y = 1.4;
  scene.add(wp);
  box(wl, GH, 0.04, sheet(wl), wl / 2 + 0.02, 0.1 + GH / 2, 0, wp);
  box(wl, 0.06, 0.06, steel, wl / 2 + 0.02, 0.1 + GH - 0.03, 0, wp);
  box(wl, 0.06, 0.06, steel, wl / 2 + 0.02, 0.13, 0, wp);
  box(0.04, 0.4, 0.06, steel, wl - 0.1, 1.0, 0.04, wp);
  run(-hw, -hd, -hw, hd);
  run(hw, -hd, hw, hd);
})();

// дерева
[[-12, -32], [11, -28], [-11, -12], [12, -3], [-11, 6], [10, 10], [12, 16], [-9, -20]].forEach(([x, z]) => {
  box(0.35, 3, 0.35, mat.trunk, x, 1.5, z);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(2.2, 12, 10), mat.leaf);
  crown.position.set(x, 4.6, z);
  crown.castShadow = true;
  scene.add(crown);
});

// ---------- хата ----------
const houseGroup = new THREE.Group();
houseGroup.position.set(house.position[0], 0, house.position[1]);
houseGroup.rotation.y = Math.PI;                                  // тераса ззаду (на північ), глуха стіна до вулиці
scene.add(houseGroup);
// локальний AABB хати → світовий (поворот на 180°)
const worldBox = (a, b, c, d) => ({ minX: house.position[0] - b, maxX: house.position[0] - a, minZ: house.position[1] - d, maxZ: house.position[1] - c });

box(house.w + 0.4, 0.2, house.d + 0.4, mat.floor, house.w / 2, 0.1 - 0.0, house.d / 2, houseGroup).receiveShadow = true;
const FLOOR_Y = 0.2;

function addPiece(minX, maxX, minY, maxY, minZ, maxZ, material = mat.wallOut) {
  if (maxX - minX < 1e-4 || maxZ - minZ < 1e-4 || maxY - minY < 1e-4) return;
  box(maxX - minX, maxY - minY, maxZ - minZ, material,
    (minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2, houseGroup);
  if (minY < 1.0) {
    colliders.push(worldBox(minX, maxX, minZ, maxZ));
  }
}

// ---------- двері: полотна на петлях, відчиняються/зачиняються (кнопка «Двері» / O / клік по дверях) ----------
const doors = [];
const doorMats = {
  white: new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.45 }),
  panel: new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.5 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 }),
  darkPanel: new THREE.MeshStandardMaterial({ color: 0x3b4141, roughness: 0.5 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.25 }),
  pvc: new THREE.MeshStandardMaterial({ color: 0xf8f7f3, roughness: 0.3 }),                    // білий пластик (ПВХ)
  pvcPanel: new THREE.MeshStandardMaterial({ color: 0xececE6, roughness: 0.35 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xcfe6f2, transparent: true, opacity: 0.38, roughness: 0.05, depthWrite: false }),
};
function makeDoor(o, alongX, cx, cz, thick) {
  const w = o.w - 0.02, h = o.h - 0.01;
  const root = new THREE.Group();
  root.position.set(cx, FLOOR_Y, cz);
  root.rotation.y = alongX ? 0 : -Math.PI / 2;                       // локальний +x — уздовж стіни
  houseGroup.add(root);
  const u = o.hinge === 1 ? -1 : 1;                                   // від петель полотно йде в бік u (локально по x)
  const pivot = new THREE.Group();
  pivot.position.x = -u * (o.w / 2 - 0.005);
  root.add(pivot);
  const dirLocal = alongX ? o.dir : -o.dir;                           // у локальній системі (z) куди відчиняється
  const openAngle = -dirLocal * u * Math.PI / 2;
  const [mWhite, mPanel] = o.dark ? [doorMats.dark, doorMats.darkPanel] : [doorMats.white, doorMats.panel];
  const parts = [];
  const add = (geo, m, px, py, pz) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(px, py, pz); mesh.castShadow = true; pivot.add(mesh); parts.push(mesh); return mesh; };
  if (o.glass) {
    // пластикове (ПВХ) полотно зі склом у верхній частині: нижня глуха панель, середня й верхня перемички, стійки, склопакет
    const cx2 = u * w / 2, rail = 0.09, y1 = 1.05, y2 = h - rail;
    add(new THREE.BoxGeometry(w, y1, 0.05), doorMats.pvc, cx2, y1 / 2, 0);                                 // нижня глуха частина
    for (const sz of [-1, 1]) add(new THREE.BoxGeometry(w * 0.72, y1 * 0.62, 0.008), doorMats.pvcPanel, cx2, y1 / 2, sz * 0.027);   // тиснена панель
    add(new THREE.BoxGeometry(w, rail, 0.05), doorMats.pvc, cx2, y1 + rail / 2, 0);                          // середня перемичка
    add(new THREE.BoxGeometry(w, rail, 0.05), doorMats.pvc, cx2, y2 + rail / 2, 0);                          // верхня перемичка
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(rail, y2 - y1 - rail, 0.05), doorMats.pvc, cx2 + sx * (w / 2 - rail / 2), (y1 + rail + y2) / 2, 0);   // стійки
    add(new THREE.BoxGeometry(w - 2 * rail, y2 - y1 - rail, 0.012), doorMats.glass, cx2, (y1 + rail + y2) / 2, 0);     // скло
  } else {
  add(new THREE.BoxGeometry(w, h, 0.04), mWhite, u * w / 2, h / 2, 0);                                     // полотно
  for (const sz of [-1, 1]) {                                                                              // філенки з обох боків
    add(new THREE.BoxGeometry(w * 0.68, h * 0.34, 0.006), mPanel, u * w / 2, h * 0.72, sz * 0.021);
    add(new THREE.BoxGeometry(w * 0.68, h * 0.34, 0.006), mPanel, u * w / 2, h * 0.3, sz * 0.021);
  }
  }
  for (const sz of [-1, 1]) {
    add(new THREE.BoxGeometry(0.12, 0.02, 0.05), doorMats.chrome, u * (w - 0.08), o.glass ? 0.95 : 1.0, sz * (o.glass ? 0.04 : 0.035));          // ручка-важіль
    add(new THREE.BoxGeometry(0.02, 0.02, 0.025), doorMats.chrome, u * (w - 0.03), o.glass ? 0.95 : 1.0, sz * 0.015);
  }
  const d = { pivot, parts, openAngle, angle: openAngle, target: 1, dark: !!o.dark, off: true };            // старт: відчинені
  // поріг: смужка підлоги під дверима (матеріал — як у кімнати, куди ведуть двері; stone — каменний на вулицю)
  const thr = Math.max(thick, 0.15);
  d.thr = { kind: o.floor || 'oak', x0: alongX ? cx - o.w / 2 : cx - thr / 2, x1: alongX ? cx + o.w / 2 : cx + thr / 2, z0: alongX ? cz - thr / 2 : cz - o.w / 2, z1: alongX ? cz + thr / 2 : cz + o.w / 2 };
  // колізія закритих дверей: прохід у стіні
  const half = Math.max(thick, 0.15) / 2;
  const [wx, wz] = [house.position[0] - cx, house.position[1] - cz];
  d.collider = alongX
    ? { minX: wx - o.w / 2, maxX: wx + o.w / 2, minZ: wz - half, maxZ: wz + half, off: true }
    : { minX: wx - half, maxX: wx + half, minZ: wz - o.w / 2, maxZ: wz + o.w / 2, off: true };
  colliders.push(d.collider);
  for (const m of parts) m.userData.door = d;
  pivot.rotation.y = openAngle;
  doors.push(d);
}
function setDoor(d, open) { d.target = open ? 1 : 0; }
function toggleDoor(d) { setDoor(d, d.target < 0.5); }
function toggleAllDoors() { const anyOpen = doors.some(d => d.target > 0.5); doors.forEach(d => setDoor(d, !anyOpen)); }
function updateDoors(dt) {
  for (const d of doors) {
    const want = d.target * d.openAngle;
    const k = Math.min(1, dt * 7);
    d.angle += (want - d.angle) * k;
    if (Math.abs(want - d.angle) < 0.002) d.angle = want;
    d.pivot.rotation.y = d.angle;
    d.collider.off = Math.abs(d.angle) > 0.35;                       // колізія є, тільки поки двері майже зачинені
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
    if (w.t >= 0.3 || o.type === 'window' || o.type === 'door') {
      trim(l - T, l, o.sill, o.sill + o.h + T);          // ліва
      trim(r, r + T, o.sill, o.sill + o.h + T);          // права
      trim(l - T, r + T, o.sill + o.h, o.sill + o.h + T); // верх
      if (o.type === 'window') trim(l - T, r + T, o.sill - T, o.sill);  // підвіконня
    }
    if (o.type === 'door') makeDoor(o, alongX, alongX ? ax + o.at : ax, alongX ? az : az + o.at, w.t);
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
// шахова плитка 30 x 30 см, чорна й тепло-біла; текстура 2 x 2 клітинки = 0.6 м
const checker = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? '#1c1e1f' : '#f2f0e8';
    g.fillRect(i * 128, j * 128, 128, 128);
  }
  g.strokeStyle = 'rgba(120,120,115,.7)'; g.lineWidth = 3;                      // шви
  g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128); g.strokeRect(128, 128, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
})();
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
const paintMats = {};
const paintMat = (c) => paintMats[c] || (paintMats[c] = new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
let curPaint = null;
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
    const m = new THREE.Mesh(g, curPaint ? paintMat(curPaint) : tileWallMat);
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
  const col = (k) => (f.paintSide && f.paintSide[k]) || f.paint || null;
  curPaint = col('z0'); edge('x', f.z0, f.x0, f.x1, 1);
  curPaint = col('z1'); edge('x', f.z1, f.x0, f.x1, -1);
  curPaint = col('x0'); edge('z', f.x0, f.z0, f.z1, 1);
  curPaint = col('x1'); edge('z', f.x1, f.z0, f.z1, -1);
  curPaint = null;
}

for (const f of floors) {
  const w = f.x1 - f.x0, d = f.z1 - f.z0;
  const t = (f.checker ? checker : f.tile ? oakTile : oak).clone();
  t.needsUpdate = true;
  const sc = f.checker ? 0.6 : 2.4;
  t.repeat.set(w / sc, d / sc);
  t.offset.set(f.x0 / sc, -f.z1 / sc);                                 // світове вирівнювання: шви й дошки продовжуються між ділянками
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: t, roughness: f.checker ? 0.25 : f.tile ? 0.35 : 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((f.x0 + f.x1) / 2, FLOOR_Y + 0.002, (f.z0 + f.z1) / 2);
  m.receiveShadow = true;
  houseGroup.add(m);
  if (f.tile) { clad(f); continue; }
  if (f.paint) clad(f);                                                // інший колір стін зсередини
  const j = f.join || [];
  if (!j.includes('z0')) skirting('x', f.z0, f.x0, f.x1, 1);
  if (!j.includes('z1')) skirting('x', f.z1, f.x0, f.x1, -1);
  if (!j.includes('x0')) skirting('z', f.x0, f.z0, f.z1, 1);
  if (!j.includes('x1')) skirting('z', f.x1, f.z0, f.z1, -1);
}

// пороги під дверима: прибирають видиму смугу чорнової підлоги між кімнатами; текстури вирівняні у світових координатах з підлогою кімнат
for (const d of doors) {
  const t = d.thr;
  if (t.kind === 'stone' && t.x1 > 11.3 && t.x1 < 11.5) t.x1 = 12.1;   // двері котельні: поріг іде до краю бетонної сходинки без шва
  const w = t.x1 - t.x0, h = t.z1 - t.z0;
  let m;
  if (t.kind === 'stone') m = new THREE.MeshStandardMaterial({ color: 0x8a8d8c, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  else {
    const sc = 2.4, tex = (t.kind === 'tile' ? oakTile : oak).clone();
    tex.needsUpdate = true;
    tex.repeat.set(w / sc, h / sc);
    tex.offset.set(t.x0 / sc, -t.z1 / sc);
    m = new THREE.MeshStandardMaterial({ map: tex, roughness: t.kind === 'tile' ? 0.35 : 0.55, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set((t.x0 + t.x1) / 2, FLOOR_Y + 0.004, (t.z0 + t.z1) / 2);
  mesh.receiveShadow = true;
  houseGroup.add(mesh);
}
// котельня: бетонна підлога (раніше була видима чорнова підлога)
{
  const m = new THREE.Mesh(new THREE.PlaneGeometry(11.05 - 9.075, 5.8 - 4.575), new THREE.MeshStandardMaterial({ color: 0x8a8d8c, roughness: 1 }));
  m.rotation.x = -Math.PI / 2;
  m.position.set((9.075 + 11.05) / 2, FLOOR_Y + 0.003, (4.575 + 5.8) / 2);
  m.receiveShadow = true;
  houseGroup.add(m);
}

// біла вагонка для підшивки стель під звисами даху, під дашком тераси й у літній кухні
const vagTex = (vertical) => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f2ea';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 8; i++) {                                    // 8 дощок на текстуру, по 16 пікселів
    g.fillStyle = '#c9c5b9';
    vertical ? g.fillRect(i * 16, 0, 2, 128) : g.fillRect(0, i * 16, 128, 2);
    g.fillStyle = '#fffdf6';
    vertical ? g.fillRect(i * 16 + 2, 0, 1, 128) : g.fillRect(0, i * 16 + 2, 128, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const vagTexV = vagTex(true), vagTexH = vagTex(false);
// дошки вагонки завтовшки 2 см; runsAlong — вздовж якої осі мають йти дошки (x або z)
function vagBox(w, d, x, y, z, parent, runsAlong, rotX = 0, h = 0.02) {
  const t = (runsAlong === 'x' ? vagTexH : vagTexV).clone();
  t.needsUpdate = true;
  t.repeat.set(w / 0.8, d / 0.8);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 }));
  m.position.set(x, y, z);
  m.rotation.x = rotX;
  parent.add(m);
  return m;
}
// підшивка вздовж скату: центр плити (cx, cy, cz) і кут θ (rotation.x), зсув на 7.5 см униз по нормалі
const slopedSoffit = (w, d, cx, cy, cz, theta, parent) =>
  vagBox(w, d, cx, cy - 0.075 * Math.cos(theta), cz - 0.075 * Math.sin(theta), parent, 'z', theta);

// ринва (півкругла) вздовж карниза і водостічні труби: від ринви вниз, коліном до стіни, далі вертикально до землі
// parent — група даху; xa..xb — довжина ринви; zc — вісь ринви; wallZ — вісь труби біля стіни; xs — позиції труб; bottomY — низ труби
function addGutter(parent, xa, xb, zc, wallZ, xs, bottomY) {
  const gm = new THREE.MeshStandardMaterial({ color: 0xe6e4dc, roughness: 0.5, side: THREE.DoubleSide });
  const R = 0.055, len = xb - xa, gy = -0.12;
  const tr = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 14, 1, true, Math.PI, Math.PI), gm);   // нижня половина — жолоб
  tr.rotation.z = Math.PI / 2;
  tr.position.set((xa + xb) / 2, gy, zc);
  tr.castShadow = true;
  parent.add(tr);
  const tube = (a, b, r = 0.035) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), v = B.clone().sub(A);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 10), gm);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    m.castShadow = true;
    parent.add(m);
  };
  const ball = (x, y, z) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.042, 10, 8), gm); b.position.set(x, y, z); parent.add(b); };
  const yOut = gy - R - 0.12, yBend = gy - R - 0.12;
  for (const x of xs) {
    tube([x, gy - R, zc], [x, yOut, zc]);                           // виток із ринви
    ball(x, yOut, zc);
    tube([x, yOut, zc], [x, yBend, wallZ]);                         // коліно під звисом до стіни
    ball(x, yBend, wallZ);
    tube([x, yBend, wallZ], [x, bottomY, wallZ]);                   // вертикально до землі
    for (const y of [-0.9, -1.8, bottomY + 0.3]) {                    // хомути до стіни
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, 0.05), gm);
      c.position.set(x, y, wallZ);
      parent.add(c);
    }
  }
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
    addGutter(roof, -o, house.w + o, house.d / 2 + s * (halfD + 0.08), house.d / 2 + s * (house.d / 2 + 0.34), [0.25, house.w - 0.25], -(FLOOR_Y + house.wallHeight) + 0.05);
    for (const x of [-o, house.w + o]) {
      const rake = box(0.06, 0.2, slope, mat.white, x, rise / 2 + 0.08, house.d / 2 + s * halfD / 2, roof);
      rake.rotation.x = s * ang;
      slopedSoffit(o, slope, x > 0 ? house.w + o / 2 : -o / 2, rise / 2, house.d / 2 + s * halfD / 2, s * ang, roof);   // під звисом фронтону
    }
    vagBox(len, o - 0.2, house.w / 2, -0.1, house.d / 2 + s * (house.d / 2 + (0.2 + o) / 2), roof, 'x');   // під карнизом
  }
  // фронтони
  const shape = new THREE.Shape([new THREE.Vector2(-house.d / 2, 0), new THREE.Vector2(house.d / 2, 0), new THREE.Vector2(0, rise)]);
  for (const x of [0, house.w]) {
    const g = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat.wallOut);
    g.rotation.y = x === 0 ? -Math.PI / 2 : Math.PI / 2;               // нормаль назовні з обох боків (західний фронтон раніше був зрізаний)
    g.position.set(x, 0, house.d / 2);
    g.castShadow = true;
    roof.add(g);
  }
  // маленькі пластикові двері зі склом у західному фронтоні: лаз на горище
  {
    const dw = 0.7, dh = 1.3, gx = -0.03, gz = house.d / 2;
    const part = (w, h, d, m, y, z = 0) => box(d, h, w, m, gx - d / 2, y, gz + z, roof);   // d — по x (від стіни), w — уздовж z
    part(dw + 0.14, dh + 0.07, 0.03, doorMats.white, dh / 2 + 0.035);                    // білий лиштв навколо
    // полотно з маленьким віконцем угорі: нижня глуха частина, верхня смуга, дві стійки, скло в отворі
    const wy0 = 0.85, wy1 = 1.15, ww = 0.36, sw = (dw - ww) / 2;
    part(dw, wy0 - 0.01, 0.05, doorMats.pvc, (wy0 + 0.01) / 2);
    part(dw, dh - wy1 + 0.01, 0.05, doorMats.pvc, (wy1 + dh + 0.01) / 2);
    for (const sg of [-1, 1]) part(sw, wy1 - wy0, 0.05, doorMats.pvc, (wy0 + wy1) / 2, sg * (ww / 2 + sw / 2));
    part(ww, wy1 - wy0, 0.01, new THREE.MeshStandardMaterial({ color: 0x8fb4c8, transparent: true, opacity: 0.55, roughness: 0.05 }), (wy0 + wy1) / 2);   // склопакет
    part(dw * 0.7, 0.4, 0.012, doorMats.pvcPanel, 0.4, 0).position.x -= 0.05;               // тиснена панель знизу
    // виступаючий поріг-полиця під дверима: щоб ставити драбину на неї, а не на фасад
    box(0.3, 0.05, 1.1, mat.white, gx - 0.15 + 0.03, 0.0, gz, roof);
    part(0.03, 0.1, 0.06, doorMats.chrome, 0.65, dw / 2 - 0.08);                           // ручка
  }
})();

// фундамент (сірий цоколь)
(function buildFoundation() {
  const o = 0.2 + 0.05, h = 0.6, w = house.w, d = house.d;
  box(w + 2 * o, h, 0.1, mat.foundation, w / 2, h / 2 - 0.1, -o, houseGroup);
  // південний цоколь з проломом перед вхідними дверима (x 7.8..8.7), щоб відчинені двері не впиралися в нього
  const fx0 = 8.25 - 0.45, fx1 = 8.25 + 0.45;
  box(fx0 + o, h, 0.1, mat.foundation, (-o + fx0) / 2, h / 2 - 0.1, d + o, houseGroup);
  box(w + o - fx1, h, 0.1, mat.foundation, (fx1 + w + o) / 2, h / 2 - 0.1, d + o, houseGroup);
  box(0.1, h, d + 2 * o, mat.foundation, -o, h / 2 - 0.1, d / 2, houseGroup);
  // східний цоколь з проломом перед дверима котельні (двері z 4.74..5.64), щоб двері не впиралися в фундамент
  const dz0 = 5.19 - 0.45, dz1 = 5.19 + 0.45;
  box(0.1, h, dz0 + o, mat.foundation, w + o, h / 2 - 0.1, (-o + dz0) / 2, houseGroup);
  box(0.1, h, d + o - dz1, mat.foundation, w + o, h / 2 - 0.1, (dz1 + d + o) / 2, houseGroup);
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
// плита на східній ділянці біля стіни з котельнею (x=9): витяжка йде горизонтально в стіну, далі через котельню надвір;
// мийка на північній ділянці
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
  // північна ділянка, з заходу на схід: холодильник | шафа | мийка | кутова шафа з кавомашиною
  blk(6.2, 6.8, 0, 1.85, NZ, NZ + 0.65, steel);                      // холодильник
  addCollider(6.2, 6.8, NZ, NZ + 0.65);
  baseRun(6.8, 7.45, NZ, NZ + D);
  baseRun(7.45, 8.05, NZ, NZ + D);                                   // під мийкою
  baseRun(8.05, WX, NZ, NZ + D);
  // східна ділянка: під плитою (вздовж стіни x=9)
  baseRun(WX - D, WX, NZ + D, 6.15);
  // розділяючі лінії між фасадами на північній ділянці
  for (const x of [7.45, 8.05]) blk(x - 0.004, x + 0.004, 0.1, BH, NZ + D, NZ + D + 0.004, top);
  // ручки
  for (const x of [7.125, 7.75, 8.49]) blk(x - 0.12, x + 0.12, 0.72, 0.745, NZ + D, NZ + D + 0.02, steel);
  blk(WX - D, WX - D + 0.02, 0.72, 0.745, NZ + D + 0.2, 6.15 - 0.2, steel);

  // варильна поверхня на східній ділянці (центр z = 5.66)
  const hz = (NZ + D + 6.15) / 2;
  blk(WX - 0.56, WX - 0.04, BH + TH, BH + TH + 0.01, hz - 0.26, hz + 0.26, glass);
  for (const [bx, bz] of [[0.42, -0.13], [0.16, -0.13], [0.42, 0.13], [0.16, 0.13]]) {
    const bn = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.004, 20), new THREE.MeshStandardMaterial({ color: 0x555a5c }));
    bn.position.set(WX - bx, base + BH + TH + 0.012, hz + bz);
    g.add(bn);
  }
  // мийка + змішувач на північній ділянці (під ними шафа x 7.45..8.05)
  const sx = (7.45 + 8.05) / 2;
  blk(sx - 0.25, sx + 0.25, BH + TH, BH + TH + 0.012, NZ + 0.07, NZ + 0.5, steel);
  blk(sx - 0.02, sx + 0.02, BH + TH, BH + TH + 0.2, NZ + 0.03, NZ + 0.07, steel);
  blk(sx - 0.02, sx + 0.02, BH + TH + 0.17, BH + TH + 0.21, NZ + 0.03, NZ + 0.2, steel);

  // верхні шафи; над мийкою шафа, над плитою — витяжка-козирок на східній стіні
  const up = (x0, x1, z0, z1) => blk(x0 + 0.005, x1 - 0.005, 1.5, 2.2, z0, z1, front);
  up(6.8, 7.45, NZ, NZ + 0.35);
  up(7.45, 8.05, NZ, NZ + 0.35);
  up(8.05, WX, NZ, NZ + 0.35);
  blk(WX - 0.5, WX, 1.5, 1.6, hz - 0.3, hz + 0.3, steel);                            // козирок витяжки над плитою
  // повітропровід: короткий коліно-короб від витяжки догори до 2.4 м, далі ГОРИЗОНТАЛЬНО в стіну (x=9) → котельня → надвір (східна стіна)
  const dz = 5.5;                                                                     // z повітропроводу, у межах котельні (4.575..5.8)
  blk(WX - 0.17, WX - 0.03, 1.6, 2.47, dz - 0.07, dz + 0.07, steel);                 // вертикальне коліно біля стіни
  const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 11.25 - (WX - 0.1), 18), steel);
  duct.rotation.z = Math.PI / 2;
  duct.position.set((WX - 0.1 + 11.25) / 2, base + 2.4, dz);
  duct.castShadow = true;
  g.add(duct);                                                                        // через стіну x=9, котельню й зовнішню стіну
  blk(11.2, 11.27, 2.28, 2.52, dz - 0.12, dz + 0.12, steel);                        // зовнішня решітка-ковпак
  for (let i = 0; i < 4; i++) blk(11.27, 11.285, 2.3 + i * 0.055, 2.325 + i * 0.055, dz - 0.1, dz + 0.1, top);  // жалюзі
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
  // Xiaomi: майже безрамковий екран, тонка верхня й боки рамка, підборіддя знизу з логотипом «mi»
  box(1.434, 0.795, 0.003, screen, 0, 0.0145, 0.0215, tv);                       // екран
  const lc = document.createElement('canvas');
  lc.width = lc.height = 128;
  const lg = lc.getContext('2d');
  lg.fillStyle = '#ff6900'; lg.beginPath(); lg.roundRect(8, 8, 112, 112, 26); lg.fill();   // помаранчевий квадрат Xiaomi
  lg.fillStyle = '#ffffff'; lg.font = 'bold 74px Arial, sans-serif'; lg.textAlign = 'center'; lg.textBaseline = 'middle';
  lg.fillText('mi', 64, 70);
  const ltex = new THREE.CanvasTexture(lc);
  ltex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.024, 0.024), new THREE.MeshBasicMaterial({ map: ltex, transparent: true }));
  logo.position.set(0, -0.402, 0.0235);
  tv.add(logo);

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
  const x0 = 2.9, x1 = 9.3, z0 = 9.2, z1 = 11.4, deckTop = 0.3;
  const g = houseGroup;
  box(x1 - x0, deckTop, z1 - z0, mat.foundation, (x0 + x1) / 2, deckTop / 2, (z0 + z1) / 2, g);
  box(1.6, 0.15, 0.5, mat.foundation, 8.25, 0.075, z1 + 0.25, g); // сходинка до входу (цегла, як тераса)

  const colX = [3.2, 5.2, 7.2, 9.1], colH = 2.4, zc = z1 - 0.2;
  for (const x of colX) {
    box(0.16, colH, 0.16, mat.white, x, deckTop + colH / 2, zc, g);
    addCollider(x - 0.1, x + 0.1, zc - 0.1, zc + 0.1);
  }
  // перила: між колонами, крім проходу до сходинки (7.2..9.1, двері скраю східного кінця), і з боків
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
  rail(3.2, zc, 5.2, zc);
  rail(5.2, zc, 7.2, zc);
  rail(3.2, z0, 3.2, 9.8);                 // східний бік з проходом (z 9.8..10.6) від доріжки вздовж стіни
  rail(3.2, 10.6, 3.2, zc);
  rail(9.1, z0, 9.1, zc);

  // дашок ґанку: схил від стіни вниз до колон, тим самим темно-коричневим
  const rz0 = z0 - 0.2, rz1 = z1 + 0.1, hi = 2.95, lo = 2.62;
  const roofLen = Math.hypot(rz1 - rz0, hi - lo);
  const pr = box(x1 - x0 + 0.5, 0.1, roofLen, mat.roof, (x0 + x1) / 2, (hi + lo) / 2 + 0.05, (rz0 + rz1) / 2, g);
  pr.rotation.x = Math.atan2(hi - lo, rz1 - rz0);
  slopedSoffit(x1 - x0 + 0.5, roofLen, (x0 + x1) / 2, (hi + lo) / 2 + 0.05, (rz0 + rz1) / 2, pr.rotation.x, g);   // вагонка під дашком тераси
  box(x1 - x0 + 0.5, 0.18, 0.05, mat.white, (x0 + x1) / 2, lo - 0.05, rz1 + 0.02, g);
})();

// ґанок: два крісла-гойдалки й круглий столик у західній частині (подалі від дверей, обличчям у двір)
(function buildPorchFurniture() {
  const g = houseGroup, deckTop = 0.3;
  const frame = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.6 });
  const seatM = new THREE.MeshStandardMaterial({ color: 0xb08a5e, roughness: 0.7 });
  const cushion = new THREE.MeshStandardMaterial({ color: 0x65777a, roughness: 0.95 });   // подушка в колір фасаду
  const mk = (geo, m, x, y, z, parent) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };

  const rocker = (x, z, rotY) => {
    const c = new THREE.Group();
    c.position.set(x, deckTop, z);
    c.rotation.y = rotY;                                            // локальний +z — куди дивиться крісло
    g.add(c);
    const R = 1.0, arc = 0.95;
    for (const sx of [-1, 1]) {                                      // дві дуги-полози, нижня точка торкається настилу
      const hold = new THREE.Group();
      hold.rotation.y = Math.PI / 2;                                 // дуга лежить у площині y-z
      hold.position.set(sx * 0.3, R, 0);
      const t = mk(new THREE.TorusGeometry(R, 0.018, 6, 28, arc), frame, 0, 0, 0, hold);
      t.rotation.z = -Math.PI / 2 - arc / 2;
      c.add(hold);
      for (const sz of [-0.22, 0.24]) mk(new THREE.BoxGeometry(0.035, 0.42, 0.035), frame, sx * 0.3, 0.23, sz, c);   // ніжки до полоза
      mk(new THREE.BoxGeometry(0.04, 0.04, 0.55), frame, sx * 0.3, 0.64, 0.0, c);                                      // підлокітник
      mk(new THREE.BoxGeometry(0.035, 0.24, 0.035), frame, sx * 0.3, 0.52, 0.24, c);                                   // передня стійка підлокітника
    }
    mk(new THREE.BoxGeometry(0.6, 0.04, 0.5), seatM, 0, 0.44, 0.0, c);                                                  // сидіння
    mk(new THREE.BoxGeometry(0.5, 0.05, 0.42), cushion, 0, 0.485, 0.02, c);                                             // подушка
    const back = new THREE.Group();
    back.position.set(0, 0.46, -0.25);
    back.rotation.x = -0.22;                                                                                            // нахил спинки назад
    c.add(back);
    for (let i = 0; i < 7; i++) mk(new THREE.BoxGeometry(0.045, 0.62, 0.025), frame, -0.24 + i * 0.08, 0.31, 0, back);  // планки спинки
    mk(new THREE.BoxGeometry(0.6, 0.06, 0.04), frame, 0, 0.64, 0, back);                                                // верхня планка
    mk(new THREE.BoxGeometry(0.6, 0.04, 0.04), frame, 0, 0.1, 0, back);
    addCollider(x - 0.33, x + 0.33, z - 0.33, z + 0.33);
  };
  rocker(4.8, 9.75, 0.25);               // упритул до стіни (z0 = 9.2), щоб терасою можна було пройти
  rocker(6.3, 9.75, -0.25);

  // круглий столик між кріслами
  const tx = 5.55, tz = 9.75;
  mk(new THREE.CylinderGeometry(0.27, 0.27, 0.035, 32), seatM, tx, deckTop + 0.55, tz, g);
  mk(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 12), frame, tx, deckTop + 0.285, tz, g);
  mk(new THREE.CylinderGeometry(0.17, 0.2, 0.03, 24), frame, tx, deckTop + 0.015, tz, g);
  mk(new THREE.CylinderGeometry(0.04, 0.032, 0.09, 16), new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.4 }), tx - 0.05, deckTop + 0.62, tz + 0.03, g);   // чашка
  addCollider(tx - 0.27, tx + 0.27, tz - 0.27, tz + 0.27);
})();

// літня кухня (господарська будівля) праворуч від хати за смугою проїзду: у тому ж стилі, видовжена вздовж ділянки (гребінь даху уздовж z),
// 2 кімнати зі своїми дверима до смуги проїзду (ПД: інструменти, ПН: одяг у коробках і шафи).
// Будівля збирається в локальних координатах x 0..W (довга вісь), z 0..D (поперек, z=0 — стіна з дверима до смуги), а група повернута на 90°:
// локальна (x, z) → світова (KX + z, KZ - x)
const KITCHEN = { x: 7.5, z: 33.0, w: 7.4, d: 4.0 };
let kRoof;
(function buildSummerKitchen() {
  const KX = KITCHEN.x, KZ = KITCHEN.z, W = KITCHEN.w, D = KITCHEN.d;
  const H = 2.5, T = 0.3, F = FLOOR_Y, o = 0.4, rise = 1.3, PX = 3.7;           // PX — перегородка між кімнатами
  const kb = new THREE.Group();
  kb.position.set(KX, 0, KZ);
  kb.rotation.y = Math.PI / 2;
  scene.add(kb);
  const M = (c, r = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...extra });
  const lime = M(0xe8e4da, 0.95), concrete = M(0x8a8d8c, 1);
  const wood = M(0x9a7248), darkWood = M(0x6b4a2f), pegboard = M(0xb89968, 0.9), metal = M(0x7c8184, 0.4, { metalness: 0.6 });
  const dark = M(0x303535, 0.5), red = M(0xc03a2b, 0.5), carton = M(0xb88f5c, 0.9), tape = M(0xd8c9a5, 0.8);
  const bx = (x0, x1, y0, y1, z0, z1, m) => box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, kb);
  const col = (x0, x1, z0, z1) => colliders.push({ minX: KX + z0, maxX: KX + z1, minZ: KZ - x1, maxZ: KZ - x0 });
  const fb = (x0, x1, y0, y1, z0, z1, m, c) => { bx(x0, x1, F + y0, F + y1, z0, z1, m); if (c) col(x0, x1, z0, z1); };   // y — від підлоги
  const cyl = (r, h, m, x, y, z, rt = r) => { const o2 = new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, 14), m); o2.position.set(x, F + y + h / 2, z); o2.castShadow = true; kb.add(o2); return o2; };

  // плита, цегляний цоколь по периметру (з розривами під дверима) і східчаки
  bx(0, W, 0, F, 0, D, concrete);
  const dc = [1.85, 5.55];
  bx(-0.08, 0, 0, 0.5, -0.08, D + 0.08, mat.foundation);
  bx(W, W + 0.08, 0, 0.5, -0.08, D + 0.08, mat.foundation);
  bx(0, W, 0, 0.5, D, D + 0.08, mat.foundation);
  for (const [a, b] of [[0, dc[0] - 0.55], [dc[0] + 0.55, dc[1] - 0.55], [dc[1] + 0.55, W]]) bx(a, b, 0, 0.5, -0.08, 0, mat.foundation);
  for (const c of dc) bx(c - 0.55, c + 0.55, 0, 0.12, -0.5, 0, mat.foundation);

  // стіни: зовнішня половина — фасад, внутрішня — побілка
  const wall = (axis, o0, o1, a0, a1, ops, outer) => {
    const mid = (o0 + o1) / 2;
    const halves = outer === 'lo' ? [[o0, mid, mat.wallOut], [mid, o1, lime]] : outer === 'hi' ? [[o0, mid, lime], [mid, o1, mat.wallOut]] : [[o0, o1, lime]];
    const piece = (s0, s1, y0, y1) => {
      if (s1 - s0 < 1e-4 || y1 - y0 < 1e-4) return;
      for (const [p0, p1, m] of halves) axis === 'x' ? bx(s0, s1, F + y0, F + y1, p0, p1, m) : bx(p0, p1, F + y0, F + y1, s0, s1, m);
      if (y0 < 1.0) axis === 'x' ? col(s0, s1, o0, o1) : col(o0, o1, s0, s1);
    };
    let cur = a0;
    for (const op of ops) {
      piece(cur, op.c - op.w / 2, 0, H);
      piece(op.c - op.w / 2, op.c + op.w / 2, 0, op.sill);
      piece(op.c - op.w / 2, op.c + op.w / 2, op.sill + op.h, H);
      cur = op.c + op.w / 2;
    }
    piece(cur, a1, 0, H);
  };
  const win = { c: D / 2, w: 1.0, sill: 1.0, h: 1.0 };
  const doors = dc.map(c => ({ c, w: 0.9, sill: 0, h: 2.05 }));
  wall('x', 0, T, 0, W, doors, 'lo');                    // довга стіна до смуги проїзду з двома дверима
  wall('x', D - T, D, 0, W, [], 'hi');                   // довга стіна з протилежного боку
  wall('z', 0, T, T, D - T, [win], 'lo');                // торцева (ПД) з вікном
  wall('z', W - T, W, T, D - T, [win], 'hi');            // торцева (ПН) з вікном
  wall('z', PX - 0.06, PX + 0.06, T, D - T, [], null);   // перегородка

  // вікна в торцях: скло й білі лиштви
  for (const [x0, x1, xo] of [[0, T, -0.03], [W - T, W, W]]) {
    const xm = (x0 + x1) / 2;
    bx(xm - 0.01, xm + 0.01, F + 1.0, F + 2.0, win.c - 0.5, win.c + 0.5, mat.glass);
    const xA = xo, xB = xo + 0.03;
    bx(xA, xB, F + 2.0, F + 2.08, win.c - 0.58, win.c + 0.58, mat.white);
    bx(xA, xB, F + 0.94, F + 1.0, win.c - 0.62, win.c + 0.62, mat.white);
    for (const s of [-1, 1]) bx(xA, xB, F + 1.0, F + 2.0, win.c + s * 0.5 - (s > 0 ? 0 : 0.08), win.c + s * 0.5 + (s > 0 ? 0.08 : 0), mat.white);
    bx(xm - 0.02, xm + 0.02, F + 1.0, F + 2.0, win.c - 0.01, win.c + 0.01, mat.white);   // середній імпост
  }
  // двері: білі, відчинені назовні, лиштви навколо
  for (const c of dc) {
    bx(c - 0.53, c + 0.53, F + 2.05, F + 2.13, -0.03, 0, mat.white);
    for (const s of [-1, 1]) bx(c + s * 0.45 - (s > 0 ? 0 : 0.08), c + s * 0.45 + (s > 0 ? 0.08 : 0), F, F + 2.05, -0.03, 0, mat.white);
    const pivot = new THREE.Group();
    pivot.position.set(c + 0.44, F, -0.02);
    pivot.rotation.y = -1.4;
    kb.add(pivot);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.88, 2.0, 0.04), doorMats.white); leaf.position.set(-0.44, 1.0, 0); leaf.castShadow = true; pivot.add(leaf);
    for (const yy of [0.5, 1.5]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.052), doorMats.panel); p.position.set(-0.44, yy, 0); pivot.add(p); }
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, 0.1), doorMats.chrome); h.position.set(-0.8, 1.0, 0); pivot.add(h);
  }

  // дах: двосхилий, гребінь уздовж довгої осі (z у світі), у стилі хати; стеля теж у групі, щоб ховалась разом з дахом
  kRoof = new THREE.Group();
  kRoof.position.set(0, F + H, 0);
  kb.add(kRoof);
  const halfD = D / 2 + o, slope = Math.hypot(halfD, rise), ang = Math.atan2(rise, halfD), len = W + 2 * o;
  for (const s of [-1, 1]) {
    box(len, 0.12, slope, mat.roof, W / 2, rise / 2, D / 2 + s * halfD / 2, kRoof).rotation.x = s * ang;
    box(len, 0.2, 0.05, mat.white, W / 2, -0.06, D / 2 + s * (halfD + 0.02), kRoof);
    addGutter(kRoof, -o, W + o, D / 2 + s * (halfD + 0.08), D / 2 + s * (D / 2 + 0.17), [0.25, W - 0.25], -(F + H) + 0.05);
    for (const x of [-o, W + o]) {
      box(0.06, 0.2, slope, mat.white, x, rise / 2 + 0.08, D / 2 + s * halfD / 2, kRoof).rotation.x = s * ang;
      slopedSoffit(o, slope, x > 0 ? W + o / 2 : -o / 2, rise / 2, D / 2 + s * halfD / 2, s * ang, kRoof);
    }
    vagBox(len, o, W / 2, -0.1, D / 2 + s * (D / 2 + o / 2), kRoof, 'x');
  }
  const gshape = new THREE.Shape([new THREE.Vector2(-D / 2, 0), new THREE.Vector2(D / 2, 0), new THREE.Vector2(0, rise)]);
  for (const x of [0.02, W - 0.02]) {
    const g2 = new THREE.Mesh(new THREE.ShapeGeometry(gshape), mat.wallOut);
    g2.rotation.y = x < 1 ? -Math.PI / 2 : Math.PI / 2;
    g2.position.set(x, 0, D / 2);
    kRoof.add(g2);
  }
  vagBox(W - 2 * T, D - 2 * T, W / 2, -0.02, D / 2, kRoof, 'x', 0, 0.04);          // стеля, підшита білою вагонкою

  // лампочки: по одній у кожній кімнаті
  for (const xc of [1.97, 5.43]) {
    const l = new THREE.PointLight(0xfff1dc, 6, 7, 1.6); l.position.set(xc, F + 2.2, D / 2); kb.add(l);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff6dd, emissive: 0xfff1dc, emissiveIntensity: 1.2 })); bulb.position.copy(l.position); kb.add(bulb);
    cyl(0.005, 0.28, dark, xc, 2.22, D / 2);   // шнур
  }

  // вміст кімнат віддзеркалений уздовж довгої осі (x → W - x): інструменти в північній кімнаті, одяг і шафи в південній
  const fbO = fb, colO = col, cylO = cyl;
  {
  const fb = (x0, x1, ...rest) => fbO(W - x1, W - x0, ...rest);
  const col = (x0, x1, z0, z1) => colO(W - x1, W - x0, z0, z1);
  const cyl = (r, h, m, x, y, z, rt) => cylO(r, h, m, W - x, y, z, rt);
  // ---------- кімната з інструментами (x 0.3..3.64 до віддзеркалення, z 0.3..3.7) ----------
  // верстак під вікном уздовж торцевої стіни
  fb(0.3, 0.95, 0.88, 0.94, 1.3, 3.5, wood, true);
  for (const x of [0.3, 0.89]) for (const z of [1.3, 3.44]) fb(x, x + 0.06, 0, 0.88, z, z + 0.06, wood);
  fb(0.36, 0.89, 0.2, 0.24, 1.36, 3.44, wood);
  fb(0.4, 0.6, 0.94, 1.08, 3.0, 3.2, metal); fb(0.6, 0.68, 1.06, 1.1, 3.0, 3.2, dark);          // лещата
  fb(0.45, 0.9, 0.94, 1.08, 1.5, 2.0, red); fb(0.6, 0.75, 1.08, 1.1, 1.65, 1.85, dark);         // червоний ящик для інструментів
  fb(0.55, 0.6, 0.94, 0.97, 2.2, 2.7, darkWood); fb(0.5, 0.65, 0.94, 1.0, 2.65, 2.75, dark);     // молоток
  for (const [z, c] of [[2.85, 0xd9a21b], [2.95, 0x4a7fb0]]) cyl(0.05, 0.1, M(c), 0.75, 0.94, z);  // банки з саморізами
  // під верстаком: каністри, відро
  fb(0.4, 0.75, 0.24, 0.62, 1.45, 1.8, red); fb(0.4, 0.75, 0.24, 0.62, 1.9, 2.25, M(0x2f6a3a));
  cyl(0.14, 0.3, M(0x9aa0a3, 0.4, { metalness: 0.5 }), 0.6, 0.24, 2.9, 0.17);
  cyl(0.16, 0.34, M(0x3b6ea5), 0.8, 0, 0.75, 0.2);                           // відро біля дверей
  fb(3.2, 3.5, 0, 0.42, 3.2, 3.5, red, true);                                  // каністра
  // перфоборд на перегородці: інструменти
  fb(3.56, 3.64, 1.05, 1.95, 1.2, 3.5, pegboard);
  const hang = (z, y0, y1, w, m) => fb(3.5, 3.56, y0, y1, z - w / 2, z + w / 2, m);
  hang(1.5, 1.35, 1.75, 0.03, darkWood); hang(1.5, 1.7, 1.82, 0.1, dark);      // молоток
  hang(1.85, 1.15, 1.55, 0.18, metal); hang(1.85, 1.55, 1.7, 0.04, darkWood);  // ножівка
  hang(2.2, 1.4, 1.75, 0.05, red); hang(2.3, 1.4, 1.75, 0.05, red);            // обценьки
  hang(2.6, 1.3, 1.85, 0.025, metal); hang(2.6, 1.8, 1.9, 0.07, metal);        // гайковий ключ
  for (const z of [2.95, 3.02, 3.09]) hang(z, 1.45, 1.8, 0.02, z === 3.02 ? M(0xd9a21b) : M(0x4a7fb0));   // викрутки
  col(3.5, 3.64, 1.2, 3.5);
  // довгий інструмент уздовж стіни з дверима: лопати, граблі, мотики
  for (const [i, x] of [2.45, 2.7, 2.95, 3.2, 3.4].entries()) {
    const pole = cyl(0.016, 1.55, darkWood, x, 0.05, 0.4); pole.rotation.x = 0.08;
    if (i % 2 === 0) fb(x - 0.1, x + 0.1, 0.0, 0.3, 0.33, 0.36, metal);           // лопата
    else if (i === 1) { fb(x - 0.18, x + 0.18, 0.0, 0.04, 0.31, 0.37, metal); for (let k = 0; k < 6; k++) fb(x - 0.17 + k * 0.068, x - 0.15 + k * 0.068, 0, 0.1, 0.33, 0.36, metal); }   // граблі
    else fb(x - 0.1, x + 0.1, 0.0, 0.1, 0.32, 0.36, metal);                       // мотика
  }
  col(2.3, 3.5, 0.3, 0.55);
  // стелаж біля довгої стіни: банки, фарба, коробки
  for (const x of [1.3, 3.1]) for (const z of [3.3, 3.66]) fb(x, x + 0.04, 0, 2.0, z, z + 0.04, metal);
  for (const y of [0.1, 0.6, 1.05, 1.5, 1.95]) fb(1.3, 3.14, y, y + 0.04, 3.28, 3.68, wood);
  col(1.3, 3.14, 3.28, 3.68);
  for (let i = 0; i < 6; i++) cyl(0.07, 0.17, M([0xc9c4b8, 0xb8352b, 0x2e6a9e, 0xe6d9a8][i % 4], 0.5), 1.5 + i * 0.28, 0.14, 3.5);      // банки фарби
  for (let i = 0; i < 5; i++) cyl(0.045, 0.14, M(0xcfe0d6, 0.2, { transparent: true, opacity: 0.8 }), 1.5 + i * 0.3, 0.64, 3.5);          // скляні банки
  fb(1.4, 2.0, 1.09, 1.4, 3.35, 3.6, carton); fb(2.2, 2.8, 1.09, 1.3, 3.35, 3.6, carton);
  fb(1.4, 1.8, 1.54, 1.8, 3.35, 3.6, M(0x3b6ea5)); fb(2.0, 3.0, 1.54, 1.6, 3.35, 3.6, darkWood);

  // ---------- кімната з одягом і шафами (x 3.76..7.1 до віддзеркалення, z 0.3..3.7) ----------
  // три шафи вздовж південної довгої стіни: дві темні, одна біла
  for (const [x0, x1, m] of [[4.0, 4.9, darkWood], [4.95, 5.85, darkWood], [5.9, 6.8, M(0xf2f0e8, 0.5)]]) {
    fb(x0, x1, 0, 2.0, 3.15, 3.7, m, true);
    fb((x0 + x1) / 2 - 0.005, (x0 + x1) / 2 + 0.005, 0.05, 1.95, 3.12, 3.15, dark);          // шов між дверцятами
    for (const s of [-1, 1]) fb((x0 + x1) / 2 + s * 0.05 - 0.01, (x0 + x1) / 2 + s * 0.05 + 0.01, 0.9, 1.15, 3.1, 3.15, doorMats.chrome);
  }
  // картонні коробки: стопки зі скотчем
  const cart = (x, z, w, d, h, y, r) => {
    const b = box(w, h, d, carton, W - x, F + y + h / 2, z, kb); b.rotation.y = r;
    const t = box(w * 0.18, 0.004, d + 0.004, tape, W - x, F + y + h + 0.001, z, kb); t.rotation.y = r;
  };
  for (const [x, z, w, d, h, y, r] of [
    [4.15, 0.65, 0.6, 0.5, 0.4, 0, 0.05], [4.15, 0.65, 0.55, 0.45, 0.35, 0.4, -0.1], [4.15, 0.65, 0.5, 0.4, 0.3, 0.75, 0.08],
    [4.15, 1.5, 0.55, 0.45, 0.5, 0, 0], [4.15, 1.5, 0.5, 0.4, 0.4, 0.5, 0.12],
    [4.2, 2.4, 0.6, 0.5, 0.4, 0, 0.1], [4.2, 2.4, 0.5, 0.45, 0.4, 0.4, -0.08],
    [6.7, 0.65, 0.7, 0.5, 0.5, 0, 0], [6.7, 0.65, 0.6, 0.45, 0.4, 0.5, -0.06],
    [5.0, 2.6, 0.7, 0.5, 0.45, 0, 0.03], [5.0, 2.6, 0.55, 0.45, 0.4, 0.45, 0.1], [5.9, 2.6, 0.6, 0.5, 0.45, 0, 0],
  ]) cart(x, z, w, d, h, y, r);
  col(3.85, 4.5, 0.35, 2.7); col(6.35, 7.05, 0.35, 0.95); col(4.6, 6.2, 2.3, 2.9);
  // пластикові контейнери з кришками
  for (const [x, z, h] of [[6.0, 1.2, 0.3], [6.0, 1.75, 0.3]]) { fb(x - 0.17, x + 0.17, 0, h, z - 0.22, z + 0.22, M(0x5b86b0, 0.4)); fb(x - 0.19, x + 0.19, h, h + 0.04, z - 0.24, z + 0.24, M(0x35587f, 0.4)); }
  // рейка з одягом біля вікна в торці
  cyl(0.015, 1.55, metal, 6.6, 0, 1.0); cyl(0.015, 1.55, metal, 6.6, 0, 2.9);
  for (const z of [1.0, 2.9]) fb(6.4, 6.8, 0, 0.03, z - 0.04, z + 0.04, metal);
  cyl(0.012, 1.9, metal, 6.6, 0.6, 1.95).rotation.x = Math.PI / 2;
  const clothes = [0x65777a, 0x9fc4df, 0xb8352b, 0xe6d9a8, 0x3b3f44, 0x6a8f5a, 0xd9cbb8, 0x8a7f75, 0x3b6ea5, 0xc9a227, 0x9c5a45];
  clothes.forEach((c, i) => fb(6.4, 6.8, 0.62 + (i % 3) * 0.05, 1.52, 1.1 + i * 0.16, 1.1 + i * 0.16 + 0.1, M(c, 0.95)));
  col(6.35, 6.85, 0.95, 2.95);
  // валіза
  fb(4.6, 5.0, 0, 0.2, 1.9, 2.3, M(0x7a4a2a, 0.7)); fb(4.7, 4.9, 0.2, 0.23, 2.0, 2.2, dark);
  }
})();

// доріжка від воріт до ґанку (цегляна)
(function buildPath() {
  // цементні доріжки: пряма 70 см від хвіртки вздовж східної стіни хати до тераси + дві колії 60 см від брами під колеса авто
  const concrete = new THREE.MeshStandardMaterial({ color: 0xb9b7b0, roughness: 1 });
  const w = 0.7, y = 0.02, gz = plot.d / 2;
  const wallX = house.position[0] + 0.25 + w / 2;                        // 0.25 — виступ цоколя від осі стіни; доріжка впритул до нього
  const entryZ = house.position[1] - 10.2;                               // вхід на терасу на рівні крісел
  const deckX = house.position[0] - 2.9;                                 // східний край тераси (світова x)
  box(w, 0.04, gz - entryZ + w / 2, concrete, plot.wicket.x, y, (gz + entryZ - w / 2) / 2);            // від хвіртки вздовж стіни
  box(wallX - deckX - 0.4, 0.04, w, concrete, (wallX + deckX + 0.4) / 2, y, entryZ);                   // до тераси
  box(0.4, 0.15, 0.9, mat.foundation, deckX + 0.2, 0.075, entryZ, scene);                              // сходинка на терасу
  // суцільний цементний під'їзд від воріт і хвіртки до асфальту
  const ax0 = plot.wicket.x - plot.wicket.width / 2, ax1 = plot.gate.x + plot.gate.width / 2, az1 = STREET.z0;
  box(ax1 - ax0, 0.04, az1 - gz, concrete, (ax0 + ax1) / 2, y, (gz + az1) / 2);
  // відмостка: цементна заливка по периметру хати 60 см, щоб вода не підтікала під фундамент
  const hx = house.position[0], hz = house.position[1];
  const px0 = hx - house.w - 0.3, px1 = hx + 0.3, pz0 = hz - house.d - 0.3, pz1 = hz + 0.3;   // межі цоколя у світових координатах
  const bw = 0.6;
  const slab = (xa, xb, za, zb) => box(xb - xa, 0.04, zb - za, concrete, (xa + xb) / 2, y, (za + zb) / 2);
  slab(px0 - bw, wallX - w / 2, pz1, pz1 + bw);                  // з боку вулиці (глуха стіна)
  slab(px0 - bw, px0, pz0 - bw, pz1);                            // західний бік
  slab(px0 - bw, hx - 9.3, pz0 - bw, pz0);                       // північ, західніше тераси (настил тераси закінчується на x = hx - 9.3)
  slab(deckX, wallX + w / 2, entryZ - w / 2, pz0);               // північ, східніше тераси: заливка до доріжки
  // рівчачки у відмостці від водостічних труб до газону
  const groove = new THREE.MeshStandardMaterial({ color: 0x8d8b84, roughness: 1 });
  const gro = (x, za, zb) => box(0.1, 0.004, Math.abs(zb - za), groove, x, y + 0.022, (za + zb) / 2);   // в рівень із заливкою
  for (const gx of [hx - 0.25, hx - (house.w - 0.25)]) {
    gro(gx, pz0 + 0.04, gx > hx - 5 ? entryZ - w / 2 : pz0 - bw);   // північний бік: від труби в бік газону (біля доріжки — крізь усю заливку)
    gro(gx, pz1 - 0.04, pz1 + bw);                         // з боку вулиці
  }
  const tz1 = 20;                                                                                      // колії вздовж смуги проїзду
  for (const s of [-1, 1]) box(0.6, 0.04, gz - tz1, concrete, plot.gate.x + s * 0.8, y, (gz + tz1) / 2);
})();





// Renault Scenic II (чорний компактвен, ~2007): стоїть на колійних доріжках біля воріт носом до хати.
// Збирається в локальних координатах: вперед = +x, ширина = z, вгору = y; довжина 4.25 м, ширина 1.81 м, висота 1.62 м
(function buildCar() {
  const car = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x23282f, roughness: 0.4, metalness: 0.1, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x151d24, roughness: 0.1, metalness: 0.2 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.6 });
  const tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.95 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xc9ced2, roughness: 0.35, metalness: 0.2 });
  const headM = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.2, emissive: 0x6a7075, emissiveIntensity: 0.4 });
  const tailM = new THREE.MeshStandardMaterial({ color: 0xb01818, roughness: 0.3, emissive: 0x500808, emissiveIntensity: 0.6 });
  const plateM = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.5 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; car.add(o); return o; };

  // кузов: профіль збоку з арками під колеса, видавлений на ширину з фасками
  const xf = 1.29, xr = -1.40, ar = 0.38;
  const pts = [[-2.10, 0.30], [xr - ar, 0.30]];
  for (let i = 0; i <= 12; i++) { const t = Math.PI - Math.PI * i / 12; pts.push([xr + ar * Math.cos(t), 0.31 + ar * Math.sin(t)]); }
  pts.push([xr + ar, 0.30], [xf - ar, 0.30]);
  for (let i = 0; i <= 12; i++) { const t = Math.PI - Math.PI * i / 12; pts.push([xf + ar * Math.cos(t), 0.31 + ar * Math.sin(t)]); }
  pts.push([xf + ar, 0.30], [2.10, 0.30], [2.12, 0.52], [2.08, 0.78], [1.55, 0.92], [1.05, 0.98], [-1.95, 1.02], [-2.08, 0.95], [-2.12, 0.60]);
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1]))), { depth: 1.66, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 2, steps: 1 }),
    paint);
  body.geometry.translate(0, 0, -0.83);
  body.castShadow = true;
  car.add(body);
  // салон: затоновані скло, вужче за кузов
  const cabin = new THREE.Mesh(
    new THREE.ExtrudeGeometry(new THREE.Shape([[1.05, 0.98], [0.40, 1.58], [-1.75, 1.60], [-2.03, 1.03]].map(p => new THREE.Vector2(p[0], p[1]))), { depth: 1.4, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 1 }),
    glassM);
  cabin.geometry.translate(0, 0, -0.7);
  cabin.castShadow = true;
  car.add(cabin);
  add(new THREE.BoxGeometry(2.2, 0.05, 1.46), paint, -0.68, 1.61, 0).rotation.z = -0.005;         // дах
  const seg = (x0, y0, x1, y1, z, t) => {                                                          // стійка між двома точками профілю
    const len = Math.hypot(x1 - x0, y1 - y0);
    const o = add(new THREE.BoxGeometry(len, t, 0.06), paint, (x0 + x1) / 2, (y0 + y1) / 2, z);
    o.rotation.z = Math.atan2(y1 - y0, x1 - x0);
  };
  for (const z of [-0.74, 0.74]) {
    seg(1.05, 0.98, 0.40, 1.58, z, 0.07);                                                          // A
    add(new THREE.BoxGeometry(0.08, 0.62, 0.06), paint, -0.38, 1.29, z);                          // B
    seg(-1.75, 1.60, -2.03, 1.03, z, 0.09);                                                        // C
    add(new THREE.BoxGeometry(0.1, 0.1, 0.18), black, 0.98, 1.05, z * 1.3);                       // дзеркала
    add(new THREE.BoxGeometry(3.3, 0.025, 0.012), alloy, -0.1, 0.62, z * 1.19);                   // хромована смужка по борту
  }
  // світло, решітка, номери, бампери
  for (const z of [-0.6, 0.6]) {
    add(new THREE.BoxGeometry(0.06, 0.14, 0.34), headM, 2.10, 0.74, z);
    add(new THREE.BoxGeometry(0.05, 0.36, 0.14), tailM, -2.12, 0.92, z * 1.17);
  }
  add(new THREE.BoxGeometry(0.05, 0.16, 0.7), black, 2.13, 0.56, 0);
  add(new THREE.BoxGeometry(0.05, 0.1, 1.2), black, 2.13, 0.38, 0);
  add(new THREE.BoxGeometry(0.02, 0.11, 0.52), plateM, 2.16, 0.43, 0);
  add(new THREE.BoxGeometry(0.02, 0.11, 0.52), plateM, -2.16, 0.56, 0);
  // колеса: шина, диск, п'ять спиць
  for (const x of [xf, xr]) for (const z of [-0.76, 0.76]) {
    const w = new THREE.Group();
    w.position.set(x, 0.31, z);
    car.add(w);
    const part = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; w.add(o); return o; };
    part(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 24), tyre, 0, 0, 0).rotation.x = Math.PI / 2;
    const face = Math.sign(z) * 0.101;
    part(new THREE.CylinderGeometry(0.21, 0.21, 0.01, 24), alloy, 0, 0, face).rotation.x = Math.PI / 2;
    part(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 16), black, 0, 0, face * 1.1).rotation.x = Math.PI / 2;
    for (let k = 0; k < 5; k++) part(new THREE.BoxGeometry(0.38, 0.03, 0.012), black, 0, 0, face * 1.08).rotation.z = k * Math.PI / 5;
  }
  car.position.set(plot.gate.x, 0.04, 36);
  car.rotation.y = Math.PI / 2;                                                                    // носом на північ, до хати
  scene.add(car);
  colliders.push({ minX: plot.gate.x - 0.95, maxX: plot.gate.x + 0.95, minZ: 36 - 2.2, maxZ: 36 + 2.2 });
})();

function addCollider(minX, maxX, minZ, maxZ) {
  colliders.push(worldBox(minX, maxX, minZ, maxZ));
}

const toggleRoof = () => { roof.visible = !roof.visible; kRoof.visible = roof.visible; };

// ---------- керування ----------
const walk = new PointerLockControls(camera, renderer.domElement);
const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enabled = false;
let mode = 'walk';

const EYE = 1.7, RADIUS = 0.3;
camera.position.set(plot.wicket.x, EYE, plot.d / 2 - 2);
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
  if (e.code === 'KeyR') toggleRoof();
  if (e.code === 'KeyV') toggleMode();
  if (e.code === 'KeyO') toggleAllDoors();
});
addEventListener('keyup', e => keys[e.code] = false);

function toggleMode() {
  if (mode === 'walk') {
    mode = 'orbit';
    walk.unlock();
    startEl.style.display = 'none';
    camera.position.set(0, 55, plot.d / 2 + 25);
    orbit.target.set(house.position[0] - house.w / 2, 0, house.position[1] - house.d / 2);
    orbit.enabled = true;
    orbit.update();
  } else {
    mode = 'walk';
    orbit.enabled = false;
    camera.position.set(house.position[0] - house.w / 2, EYE, plot.d / 2 - 2);
    camera.lookAt(0, EYE, 0);
    showStart();
  }
}

function collides(x, z) {
  for (const c of colliders) {
    if (c.off) continue;
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
  btn('Дах', 12, () => toggleRoof());
  btn('Вид', 60, toggleMode);
  btn('Двері', 108, toggleAllDoors);

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
  const inGate = Math.abs(p.x - plot.wicket.x) < plot.wicket.width / 2 - 0.25;
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
  const dt = Math.min(clock.getDelta(), 0.1);
  update(dt);
  updateDoors(dt);
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

// люстра по центру кухні-вітальні: підвісна біла півсфера на темному шнурі; ховається разом з дахом/стелею (R)
(function buildPendant() {
  const x = (0.2 + 8.925) / 2, z = (4.575 + 8.8) / 2;
  const grp = new THREE.Group();
  grp.position.set(x, 0, z);
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  const mesh = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; grp.add(o); return o; };
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.015, 24), dark, -ceilingDrop - 0.008);                 // накладка на стелі
  mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.22, 8), dark, -ceilingDrop - 0.12);                  // шнур
  const shade = mesh(new THREE.SphereGeometry(0.27, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.5, side: THREE.DoubleSide, emissive: 0xfff1dc, emissiveIntensity: 0.25 }), -0.53);
  shade.castShadow = false;
  mesh(new THREE.TorusGeometry(0.27, 0.007, 8, 48), new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.3 }), -0.53).rotation.x = Math.PI / 2; // золотий кант
  mesh(new THREE.SphereGeometry(0.05, 16, 12), new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe9bd, emissiveIntensity: 1 }), -0.5); // лампа
  const light = new THREE.PointLight(0xfff1dc, 10, 9, 1.6);
  light.position.y = -0.6;
  grp.add(light);
  roof.add(grp);                                                                                        // роф-група: y=0 — верх стін
})();

// кавомашина Philips (чорна, автоматична) на стільниці в кутку кухні біля мийки
(function buildCoffeeMachine() {
  const g = new THREE.Group();
  g.position.set(8.45, FLOOR_Y + 0.89, 4.575 + 0.215);          // верх стільниці = 0.89 м, притулена до північної стіни
  houseGroup.add(g);
  const black = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.22, metalness: 0.1 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.6 });
  const rb = (w, h, d, r, m, x, y, z) => {
    const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), m);
    o.position.set(x, y, z);
    o.castShadow = true;
    g.add(o);
    return o;
  };
  rb(0.246, 0.34, 0.40, 0.02, black, 0, 0.2, 0);                  // корпус
  rb(0.2, 0.03, 0.2, 0.012, matte, 0, 0.385, -0.08);              // кришка бункера для зерна
  rb(0.21, 0.03, 0.15, 0.008, matte, 0, 0.015, 0.05);             // піддон
  rb(0.14, 0.11, 0.06, 0.01, matte, 0, 0.17, 0.2);                // ніша виходу кави
  rb(0.04, 0.05, 0.035, 0.008, black, 0, 0.19, 0.21);             // носик
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.028, 0.065, 20), new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.3 }));
  cup.position.set(0, 0.062, 0.2);                                // біла чашка на піддоні
  g.add(cup);
  const disp = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.032), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x7fc4ff, emissiveIntensity: 0.9 }));
  disp.position.set(0, 0.327, 0.2 + 0.001);                        // дисплей
  g.add(disp);
  for (const x of [-0.07, 0.07]) {                                // кнопки
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.012, 16), new THREE.MeshStandardMaterial({ color: 0x555a60, emissive: 0x1a1d20 }));
    b.position.set(x, 0.327, 0.2 + 0.001);
    g.add(b);
  }
  // контейнер для молока (як LatteGo): прозорий резервуар з молоком, чорна кришка й важіль, кріпиться спереду над виходом кави
  const clear = new THREE.MeshStandardMaterial({ color: 0xdfeaee, transparent: true, opacity: 0.32, roughness: 0.08, depthWrite: false });
  const milk = new THREE.MeshStandardMaterial({ color: 0xfbfaf4, roughness: 0.35 });
  rb(0.115, 0.17, 0.07, 0.012, clear, 0, 0.195, 0.2 + 0.038);   // резервуар
  rb(0.1, 0.085, 0.056, 0.01, milk, 0, 0.152, 0.2 + 0.038);     // молоко всередині
  rb(0.12, 0.022, 0.075, 0.008, matte, 0, 0.289, 0.2 + 0.038);  // кришка
  rb(0.03, 0.014, 0.03, 0.006, matte, 0.035, 0.304, 0.2 + 0.04); // важіль на кришці
  const c = document.createElement('canvas');                     // напис PHILIPS
  c.width = 256; c.height = 48;
  const t = c.getContext('2d');
  t.fillStyle = '#e8e8e8'; t.font = 'bold 34px Arial, sans-serif'; t.textAlign = 'center'; t.textBaseline = 'middle';
  t.fillText('PHILIPS', 128, 26);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.019), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
  logo.position.set(0, 0.357, 0.2 + 0.001);
  g.add(logo);
})();

// стельові плінтуси (карнизи): білі, 4 x 2.5 см, по периметру кожної кімнати зі стелею; ховаються разом зі стелею (R)
(function buildCornice() {
  const H = 0.04, T = 0.025, y = -ceilingDrop - H / 2;
  const add = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), mat.white);
    m.position.set(x, y, z);
    roof.add(m);
  };
  for (const f of floors) {
    const w = f.x1 - f.x0, d = f.z1 - f.z0;
    const j = f.join || [];
    if (!j.includes('z0')) add(w, T, (f.x0 + f.x1) / 2, f.z0 + T / 2);
    if (!j.includes('z1')) add(w, T, (f.x0 + f.x1) / 2, f.z1 - T / 2);
    if (!j.includes('x0')) add(T, d - 2 * T, f.x0 + T / 2, (f.z0 + f.z1) / 2);
    if (!j.includes('x1')) add(T, d - 2 * T, f.x1 - T / 2, (f.z0 + f.z1) / 2);
  }
})();

// мала спальня (Кімната 1): двоспальне ліжко 160 x 200 узголів'ям до західної стіни (ліворуч від дверей) + дві тумбочки
(function buildBedroom1() {
  const g = houseGroup, base = FLOOR_Y;
  const oat = new THREE.MeshStandardMaterial({ color: 0xb9b0a2, roughness: 0.97 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.95 });
  const duvetM = new THREE.MeshStandardMaterial({ color: 0xe8e4d8, roughness: 0.97 });
  const throwM = new THREE.MeshStandardMaterial({ color: 0x65777a, roughness: 0.98 });   // плед у колір фасаду
  const tex = oakTexture(false, true);
  tex.repeat.set(0.8, 0.5);
  const wood = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const rbx = (m, x0, x1, y0, y1, z0, z1, r, rotZ = 0) => {
    const o = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 5, r), m);
    o.position.set((x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2);
    o.rotation.z = rotZ;
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const blk = (m, x0, x1, y0, y1, z0, z1) =>
    box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2, g);

  const zc = 2.31, W = 1.6, z0 = zc - W / 2, z1 = zc + W / 2;       // по центру кімнати вздовж стіни
  const xw = 0.2;                                                  // західна стіна (чиста поверхня)
  rbx(oat, xw, xw + 0.12, 0.12, 1.1, z0 - 0.12, z1 + 0.12, 0.04);   // м'яке узголів'я
  blk(wood, xw + 0.1, xw + 2.02, 0.1, 0.32, z0 - 0.01, z1 + 0.01);  // рама
  for (const x of [xw + 0.15, xw + 1.97]) for (const z of [z0 + 0.04, z1 - 0.04]) blk(wood, x - 0.03, x + 0.03, 0, 0.1, z - 0.03, z + 0.03); // ніжки
  rbx(linen, xw + 0.12, xw + 2.02, 0.32, 0.55, z0, z1, 0.06);       // матрац із простирадлом
  rbx(duvetM, xw + 0.6, xw + 2.04, 0.54, 0.62, z0 - 0.04, z1 + 0.04, 0.05);  // ковдра, звисає з боків
  rbx(duvetM, xw + 0.6, xw + 2.04, 0.36, 0.56, z0 - 0.045, z0 - 0.02, 0.01);
  rbx(duvetM, xw + 0.6, xw + 2.04, 0.36, 0.56, z1 + 0.02, z1 + 0.045, 0.01);
  rbx(throwM, xw + 1.5, xw + 1.8, 0.62, 0.65, z0 - 0.05, z1 + 0.05, 0.015);  // плед упоперек ніг
  for (const z of [zc - 0.4, zc + 0.4]) rbx(linen, xw + 0.2, xw + 0.7, 0.55, 0.72, z - 0.26, z + 0.26, 0.08); // подушки
  addCollider(xw, xw + 2.04, z0 - 0.05, z1 + 0.05);

  // тумбочки 0.4 x 0.4 x 0.5 по боках узголів'я
  const stand = (zz) => {
    const sx0 = xw + 0.01, sx1 = sx0 + 0.4, sz0 = zz - 0.2, sz1 = zz + 0.2;
    blk(wood, sx0, sx1, 0.12, 0.5, sz0, sz1);
    blk(linen, sx0 + 0.02, sx1 - 0.005, 0.18, 0.28, sz1, sz1 + 0.006);                 // шухляда
    blk(linen, sx0 + 0.02, sx1 - 0.005, 0.31, 0.43, sz1, sz1 + 0.006);
    for (const x of [sx0 + 0.04, sx1 - 0.04]) for (const z of [sz0 + 0.04, sz1 - 0.04]) blk(wood, x - 0.02, x + 0.02, 0, 0.12, z - 0.02, z + 0.02);
    addCollider(sx0, sx1, sz0, sz1);
  };
  stand(z0 - 0.12 - 0.22);
  stand(z1 + 0.12 + 0.22);
})();

// мала спальня: два шафи-пенали в кутах біля західної стіни (окремо для нього й для неї) + настільні лампи на тумбочках
(function buildBedroom1Extras() {
  const g = houseGroup, base = FLOOR_Y;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  const tex = oakTexture(false, true);
  tex.repeat.set(0.8, 0.5);
  const wood = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const blk = (m, x0, x1, y0, y1, z0, z1) =>
    box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2, g);

  // пенал 0.6 x 0.55 x 2.5: однодверний, білий фасад, світлий цоколь, довга вертикальна ручка, верхня антресоль
  const xw = 0.2, D = 0.55, W = 0.6, H = 2.5;
  const pencil = (za, zb, handleSide) => {
    const z0 = Math.min(za, zb), z1 = Math.max(za, zb);
    blk(wood, xw, xw + D - 0.02, 0, 0.1, z0 + 0.02, z1 - 0.02);                // цоколь
    blk(white, xw, xw + D, 0.1, H, z0, z1);                                    // корпус
    const fx = xw + D;
    blk(dark, fx, fx + 0.004, 1.9, 1.904, z0, z1);                             // шов антресолі
    const hz = handleSide > 0 ? z1 - 0.045 : z0 + 0.035;                         // одна вертикальна ручка з боку ліжка
    blk(dark, fx, fx + 0.02, 1.0, 1.4, hz, hz + 0.01);
    addCollider(xw, xw + D, z0, z1);
  };
  pencil(0.2, 0.2 + W, +1);          // північний (біля вікна), ручка з боку ліжка
  pencil(4.425 - W, 4.425, -1);      // південний (біля перегородки з вітальнею), ручка з боку ліжка

  // настільні лампи на тумбочках (центри z = 1.17 і 3.45, верх тумбочки 0.5 м)
  const lampBase = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.3 });
  const shadeM = new THREE.MeshStandardMaterial({ color: 0xf6efe0, emissive: 0xffe2b0, emissiveIntensity: 0.55, roughness: 0.9, side: THREE.DoubleSide });
  for (const z of [1.17, 3.45]) {
    const x = xw + 0.01 + 0.2;
    const lamp = new THREE.Group();
    lamp.position.set(x, base + 0.5, z);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), lampBase);          // керамічна куля
    b.scale.y = 1.25; b.position.y = 0.09; lamp.add(b);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 10), dark);
    neck.position.y = 0.22; lamp.add(neck);
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.2, 28, 1, true), shadeM); // абажур-конус
    s.position.y = 0.3; lamp.add(s);
    const light = new THREE.PointLight(0xffd9a0, 1.6, 3.2, 1.8);
    light.position.y = 0.3;
    lamp.add(light);
    g.add(lamp);
  }
})();

// мала спальня: робоче місце в північно-східному куті — стіл 1.6 x 0.7, ультраширокий вигнутий монітор 34",
// ноутбук, клавіатура з мишею, дві колонки і чорне геймерське крісло
(function buildDesk() {
  const g = houseGroup, base = FLOOR_Y;
  const black = new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.45 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.7 });
  const grey = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.6 });
  const silver = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.6, roughness: 0.35 });
  const tex = oakTexture(false, true);
  tex.repeat.set(0.8, 0.5);
  const wood = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const rb = (m, w, h, d, r, x, y, z, parent = g) => {
    const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const bx = (m, w, h, d, x, y, z, parent = g) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const Y0 = base;

  // --- стіл: світла стільниця, чорні металеві ніжки, біля північної стіни, правий край біля перегородки ---
  const dx0 = 3.1, dx1 = 4.7, dz0 = 0.2, dz1 = 0.9, TY = 0.75;
  bx(wood, dx1 - dx0, 0.03, dz1 - dz0, (dx0 + dx1) / 2, Y0 + TY - 0.015, (dz0 + dz1) / 2);
  for (const x of [dx0 + 0.06, dx1 - 0.06]) {
    bx(black, 0.04, TY - 0.03, 0.04, x, Y0 + (TY - 0.03) / 2, dz0 + 0.06);
    bx(black, 0.04, TY - 0.03, 0.04, x, Y0 + (TY - 0.03) / 2, dz1 - 0.06);
    bx(black, 0.03, 0.03, dz1 - dz0 - 0.1, x, Y0 + 0.12, (dz0 + dz1) / 2);
  }
  bx(black, dx1 - dx0 - 0.12, 0.03, 0.03, (dx0 + dx1) / 2, Y0 + TY - 0.06, dz1 - 0.07);
  addCollider(dx0, dx1, dz0, dz1);

  // --- монітор 34" 21:9 вигнутий, центр x = 4.1 ---
  const mx = 4.1, mzc = 0.37, my = Y0 + TY + 0.24, R = 1.5, mw = 0.8, mh = 0.34;
  const arc = mw / R;
  const sc = document.createElement('canvas');
  sc.width = 1024; sc.height = 436;
  const sg = sc.getContext('2d');
  const grad = sg.createLinearGradient(0, 0, 1024, 436);
  grad.addColorStop(0, '#0e2a4a'); grad.addColorStop(0.5, '#2b4f8f'); grad.addColorStop(1, '#13203f');
  sg.fillStyle = grad; sg.fillRect(0, 0, 1024, 436);
  sg.fillStyle = 'rgba(255,255,255,.1)'; sg.fillRect(80, 60, 360, 240); sg.fillRect(480, 90, 440, 260);
  sg.fillStyle = 'rgba(10,15,30,.85)'; sg.fillRect(0, 404, 1024, 32);
  const stex = new THREE.CanvasTexture(sc);
  stex.colorSpace = THREE.SRGBColorSpace;
  stex.wrapS = THREE.RepeatWrapping; stex.repeat.x = -1; stex.offset.x = 1;      // напрям кута циліндра дзеркалить U
  const screenM = new THREE.MeshStandardMaterial({ map: stex, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 0.75, roughness: 0.3, side: THREE.DoubleSide });
  const screen = new THREE.Mesh(new THREE.CylinderGeometry(R, R, mh, 40, 1, true, Math.PI - arc / 2, arc), screenM);
  screen.position.set(mx, my, mzc + R);
  g.add(screen);
  const bezel = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.006, R + 0.006, mh + 0.016, 40, 1, true, Math.PI - (arc + 0.016 / R) / 2, arc + 0.016 / R),
    new THREE.MeshStandardMaterial({ color: 0x0f1012, roughness: 0.45, side: THREE.DoubleSide }));
  bezel.position.set(mx, my, mzc + R);
  g.add(bezel);
  rb(black, 0.5, 0.2, 0.05, 0.02, mx, my, mzc - 0.04);
  bx(grey, 0.05, 0.22, 0.03, mx, my - 0.22, mzc - 0.04);
  rb(grey, 0.3, 0.012, 0.19, 0.005, mx, Y0 + TY + 0.006, mzc + 0.02);

  // --- біла клавіатура з RGB-підсвіткою + чорна миша на килимку ---
  const kc = document.createElement('canvas'), ke = document.createElement('canvas');   // колір клавіш і карта світіння
  kc.width = ke.width = 512; kc.height = ke.height = 160;
  const kg = kc.getContext('2d'), kge = ke.getContext('2d');
  kg.fillStyle = '#dedcd4'; kg.fillRect(0, 0, 512, 160);
  kge.fillStyle = '#000'; kge.fillRect(0, 0, 512, 160);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 16; c++) {
    const x = 10 + c * 31, y = 12 + r * 28, hue = (c * 22 + r * 12) % 360;                  // хвиля кольору по клавішах
    kg.fillStyle = '#fbfaf6'; kg.fillRect(x, y, 26, 22);
    kg.fillStyle = 'hsl(' + hue + ',90%,62%)'; kg.fillRect(x + 8, y + 8, 10, 5);             // кольорова літера
    kge.fillStyle = 'hsl(' + hue + ',100%,55%)';
    kge.fillRect(x - 3, y - 3, 32, 3); kge.fillRect(x - 3, y + 22, 32, 3);                    // світіння між клавішами
    kge.fillRect(x - 3, y, 3, 22); kge.fillRect(x + 26, y, 3, 22);
    kge.fillRect(x + 8, y + 8, 10, 5);
  }
  const ktex = new THREE.CanvasTexture(kc), ketex = new THREE.CanvasTexture(ke);
  ktex.colorSpace = ketex.colorSpace = THREE.SRGBColorSpace;
  rb(new THREE.MeshStandardMaterial({ color: 0xeeece4, roughness: 0.5 }), 0.44, 0.022, 0.14, 0.008, mx, Y0 + TY + 0.011, 0.72);   // білий корпус клавіатури
  const ktop = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), new THREE.MeshStandardMaterial({ map: ktex, emissive: 0xffffff, emissiveMap: ketex, emissiveIntensity: 1.1, roughness: 0.6 }));
  ktop.rotation.x = -Math.PI / 2; ktop.position.set(mx, Y0 + TY + 0.0225, 0.72); g.add(ktop);
  rb(matte, 0.3, 0.003, 0.24, 0.001, mx + 0.34, Y0 + TY + 0.0015, 0.72);
  rb(black, 0.065, 0.03, 0.11, 0.02, mx + 0.34, Y0 + TY + 0.017, 0.72);

  // --- ноутбук зліва: сріблястий, відкритий, під кутом ---
  // стоїть на алюмінієвій підставці з нахилом і трохи розвернутий до людини в кріслі (в бік клавіатури)
  const holder = new THREE.Group();
  holder.position.set(3.3, Y0 + TY, 0.6);
  holder.rotation.y = 0.5;
  g.add(holder);
  for (const sx of [-1, 1]) {
    bx(silver, 0.012, 0.1, 0.22, sx * 0.13, 0.05, 0, holder);                                    // бічні опори
    bx(silver, 0.012, 0.012, 0.28, sx * 0.13, 0.006, 0, holder);                                 // лижі на столі
  }
  bx(silver, 0.3, 0.012, 0.22, 0, 0.088, 0, holder).rotation.x = 0.2;                            // похила площадка
  bx(silver, 0.3, 0.02, 0.012, 0, 0.1, 0.115, holder);                                           // упор спереду
  const lap = new THREE.Group();
  lap.position.set(0, 0.098, 0);
  lap.rotation.x = 0.2;
  holder.add(lap);
  rb(silver, 0.32, 0.014, 0.22, 0.005, 0, 0.007, 0, lap);
  const lkc = document.createElement('canvas'), lke = document.createElement('canvas');
  lkc.width = lke.width = 290; lkc.height = lke.height = 100;
  const lkg = lkc.getContext('2d'), lkge = lke.getContext('2d');
  lkg.fillStyle = '#101113'; lkg.fillRect(0, 0, 290, 100);
  lkge.fillStyle = '#000'; lkge.fillRect(0, 0, 290, 100);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 15; c++) {
    const x = 6 + c * 18.6, y = 6 + r * 18;
    lkg.fillStyle = '#1d1f22'; lkg.fillRect(x, y, 16, 14);
    lkge.fillStyle = '#ffffff';
    lkge.fillRect(x - 1.2, y - 1.2, 18.4, 1.2); lkge.fillRect(x - 1.2, y + 14, 18.4, 1.2);   // біла підсвітка навколо клавіш
    lkge.fillRect(x + 5, y + 5, 6, 3);                                                          // літера
  }
  const lktex = new THREE.CanvasTexture(lkc), lketex = new THREE.CanvasTexture(lke);
  lktex.colorSpace = lketex.colorSpace = THREE.SRGBColorSpace;
  rb(matte, 0.29, 0.002, 0.1, 0.001, 0, 0.0145, 0.03, lap);
  const lkb = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.097), new THREE.MeshStandardMaterial({ map: lktex, emissive: 0xffffff, emissiveMap: lketex, emissiveIntensity: 0.9, roughness: 0.6 }));
  lkb.rotation.x = -Math.PI / 2; lkb.position.set(0, 0.0166, 0.03); lap.add(lkb);
  const lid = new THREE.Group();
  lid.position.set(0, 0.014, -0.11);
  lid.rotation.x = -0.28;
  lap.add(lid);
  rb(silver, 0.32, 0.21, 0.008, 0.004, 0, 0.105, 0, lid);
  const lscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.19), new THREE.MeshStandardMaterial({ map: stex, emissive: 0xffffff, emissiveMap: stex, emissiveIntensity: 0.5 }));
  lscreen.position.set(0, 0.105, 0.0045);
  lid.add(lscreen);

  // --- колонки: дві білі кулі-«м'ячики» по краях монітора, на низьких білих підставках ---
  const ball = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.35 });
  const grill = new THREE.MeshStandardMaterial({ color: 0xc9c6bc, roughness: 0.8 });
  const whiteBase = new THREE.MeshStandardMaterial({ color: 0xe6e3da, roughness: 0.5 });
  for (const x of [3.6, 4.6]) {
    const baseM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.012, 20), whiteBase);
    baseM.position.set(x, Y0 + TY + 0.006, 0.34); g.add(baseM);
    const sp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 28, 20), ball);
    sp.position.set(x, Y0 + TY + 0.012 + 0.075, 0.34); sp.castShadow = true; g.add(sp);
    const drv = new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), grill);                       // динамік спереду
    drv.position.set(x, Y0 + TY + 0.092, 0.34 + 0.0745); g.add(drv);
    const tw = new THREE.Mesh(new THREE.CircleGeometry(0.015, 16), grill);
    tw.position.set(x, Y0 + TY + 0.145, 0.34 + 0.07); tw.rotation.x = -0.4; g.add(tw);
  }

  // --- геймерське крісло: чорне, спинка-«ківш», підголівник, підлокітники, 5-променева основа з колісцями ---
  const chair = new THREE.Group();
  chair.position.set(4.05, Y0, 1.45);
  chair.rotation.y = 0.12;
  g.add(chair);
  const cyl = (r1, r2, h, y, m) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, 14), m); o.position.y = y; o.castShadow = true; chair.add(o); return o; };
  cyl(0.028, 0.034, 0.3, 0.2, grey);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5;
    const arm = bx(black, 0.3, 0.03, 0.045, Math.cos(a) * 0.15, 0.065, Math.sin(a) * 0.15, chair);
    arm.rotation.y = -a;
    const wh = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8), matte);
    wh.position.set(Math.cos(a) * 0.29, 0.032, Math.sin(a) * 0.29);
    chair.add(wh);
  }
  rb(black, 0.32, 0.05, 0.26, 0.02, 0, 0.36, 0, chair);
  rb(black, 0.5, 0.09, 0.5, 0.04, 0, 0.45, 0, chair);
  for (const s of [-1, 1]) rb(grey, 0.07, 0.11, 0.46, 0.03, s * 0.215, 0.475, 0, chair);
  const back = new THREE.Group();
  back.position.set(0, 0.5, 0.22);
  back.rotation.x = 0.12;
  chair.add(back);
  rb(black, 0.46, 0.78, 0.09, 0.045, 0, 0.45, 0, back);
  for (const s of [-1, 1]) rb(grey, 0.07, 0.62, 0.12, 0.035, s * 0.235, 0.38, -0.02, back);
  rb(black, 0.26, 0.13, 0.07, 0.04, 0, 0.95, -0.065, back);
  rb(black, 0.3, 0.14, 0.07, 0.04, 0, 0.3, -0.07, back);
  // з'єднувачі: дві металеві стійки підголівника в спинку і дві Г-подібні скоби від механізму сидіння до низу спинки
  for (const sx of [-0.055, 0.055]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.14, 10), grey);
    post.position.set(sx, 0.86, -0.05);
    back.add(post);
  }
  for (const sx of [-0.1, 0.1]) {
    bx(grey, 0.035, 0.035, 0.24, sx, 0.4, 0.14, chair);          // горизонтальна частина під сидінням
    bx(grey, 0.035, 0.24, 0.035, sx, 0.5, 0.26, chair);          // вертикальна частина за краєм сидіння, входить у спинку
  }
  for (const s of [-1, 1]) {
    bx(matte, 0.04, 0.24, 0.05, s * 0.29, 0.62, 0.08, chair);
    rb(matte, 0.075, 0.035, 0.25, 0.012, s * 0.29, 0.75, -0.03, chair);
  }
  addCollider(4.05 - 0.33, 4.05 + 0.33, 1.45 - 0.33, 1.45 + 0.4);
})();

// мала спальня: просте біле дитяче ліжечко-колиска 124 x 66,
// біля південної стіни, західніше дверей (біля ніг ліжка)
(function buildCrib() {
  const g = houseGroup, base = FLOOR_Y;
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f6f2, roughness: 0.45 });
  const shade = new THREE.MeshStandardMaterial({ color: 0xe6e4de, roughness: 0.6 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xd8dadc, metalness: 0.7, roughness: 0.35 });
  const mattressM = new THREE.MeshStandardMaterial({ color: 0xd6c4a6, roughness: 0.97 });   // матрац застелений бежевим простирадлом
  const stripeM = new THREE.MeshStandardMaterial({ color: 0xc9b690, roughness: 0.97 });
  const pillowM = new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.97 });
  const crib = new THREE.Group();
  crib.position.set(2.95, base, 4.075);              // довга вісь уздовж x, борт «ззаду» біля стіни
  g.add(crib);
  const bx = (m, w, h, d, x, y, z, parent = crib) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };
  const L = 1.24, W = 0.66, X = L / 2, Z = W / 2, P = 0.04;                        // габарити й товщина стійок
  const yBody = 0.3, yTop = 0.86, yEnd = 1.0;                                       // низ кузова, верх бортів, верх узголів'їв

  // --- проста біла колиска: ніжки-стійки з нижніми поперечками для жорсткості ---
  for (const sx of [-1, 1]) bx(white, 0.035, 0.035, W - 2 * P, sx * (X - 0.02), 0.08, 0);       // нижні поперечки торців
  for (const sz of [-1, 1]) bx(white, L - 2 * P, 0.03, 0.03, 0, 0.08, sz * (Z - 0.02));          // нижні рейки довгих боків

  // --- кузов: стійки, дно-решітка, матрац ---
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const top = sx < 0 ? yEnd : yEnd - 0.1;                                                       // одне узголів'я вище, друге нижче
    bx(white, P, top, P, sx * (X - P / 2), top / 2, sz * (Z - P / 2));                // стійка від підлоги до верху
  }
  bx(white, L - 2 * P, 0.02, W - 2 * P, 0, yBody + 0.1, 0);                                       // основа
  for (let i = 0; i < 16; i++) bx(shade, 0.045, 0.012, W - 2 * P, -X + 0.1 + i * (L - 0.2) / 15, yBody + 0.115, 0);   // рейки-ламелі
  bx(mattressM, L - 0.13, 0.1, W - 0.13, 0, yBody + 0.175, 0);                                    // матрац
  for (let i = 1; i < 9; i++) bx(stripeM, 0.006, 0.101, W - 0.131, -X + 0.065 + i * (L - 0.13) / 9, yBody + 0.175, 0); // стьобані смуги

  const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), pillowM);                 // подушечка в узголів'ї
  cushion.scale.set(1.1, 0.3, 1.5); cushion.position.set(-X + 0.2, yBody + 0.245, 0); crib.add(cushion);
  bx(pillowM, 0.5, 0.012, W - 0.15, 0.25, yBody + 0.232, 0);                                        // загорнутий край простирадла внизу

  // --- борти: довгі з вертикальних щаблів, ближній до кімнати (−z) з опускною секцією, торці з щаблями ---
  const slat = (x, y0, y1, z) => bx(white, 0.016, y1 - y0, 0.016, x, (y0 + y1) / 2, z);
  const nSide = 20;
  for (const sz of [-1, 1]) {
    for (let i = 0; i <= nSide; i++) slat(-X + P + 0.025 + i * (L - 2 * P - 0.05) / nSide, yBody + 0.18, sz < 0 ? yTop - 0.08 : yTop, sz * (Z - 0.02));
    bx(white, L - 2 * P, 0.03, 0.03, 0, yBody + 0.17, sz * (Z - 0.02));                         // нижня рейка борту
    bx(white, L - 2 * P, 0.035, 0.035, 0, sz < 0 ? yTop - 0.08 : yTop, sz * (Z - 0.02));          // верхня рейка (ближній борт нижчий)
  }
  const nEnd = 9;
  for (const sx of [-1, 1]) {
    const top = sx < 0 ? yEnd : yEnd - 0.1;
    for (let i = 0; i <= nEnd; i++) bx(white, 0.016, top - yBody - 0.28, 0.016, sx * (X - 0.02), yBody + 0.18 + (top - yBody - 0.28) / 2, -Z + P + 0.025 + i * (W - 2 * P - 0.05) / nEnd);
    bx(white, 0.035, 0.035, W - 2 * P, sx * (X - 0.02), yBody + 0.17, 0);                       // нижня рейка торця
    bx(white, 0.04, 0.05, W + 0.02, sx * (X - 0.02), top - 0.01, 0);                            // верхня рейка торця (виступає, як у зразку)
  }
  addCollider(2.95 - L / 2 - 0.02, 2.95 + L / 2 + 0.02, 4.075 - W / 2 - 0.02, 4.075 + W / 2);
})();

// стельові світильники в обох спальнях: біла півсфера-плафон на коротких тросах, у стилі люстри у вітальні (R ховає разом зі стелею)
(function buildBedroomPendants() {
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  const shadeM = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.5, side: THREE.DoubleSide, emissive: 0xfff1dc, emissiveIntensity: 0.25 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a227, metalness: 0.7, roughness: 0.3 });
  const bulb = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xffe9bd, emissiveIntensity: 1 });
  for (const [x, z] of [[(0.2 + 4.725) / 2, (0.2 + 4.425) / 2], [(4.875 + 10.8) / 2, (0.2 + 4.425) / 2]]) {
    const grp = new THREE.Group();
    grp.position.set(x, 0, z);
    const mesh = (geo, m, y) => { const o = new THREE.Mesh(geo, m); o.position.y = y; grp.add(o); return o; };
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24), dark, -ceilingDrop - 0.008);          // накладка на стелі
    mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.16, 8), dark, -ceilingDrop - 0.09);           // шнур
    mesh(new THREE.SphereGeometry(0.22, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2), shadeM, -0.39);  // плафон
    const ring = mesh(new THREE.TorusGeometry(0.22, 0.006, 8, 40), gold, -0.39);                  // золотий кант
    ring.rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.04, 14, 10), bulb, -0.36);                                    // лампа
    roof.add(grp);
  }
})();

// дитяча спальня (Кімната 2, 5.9 x 4.2): два односпальні ліжка узголів'ям до південної стіни, дві окремі шафи-пенали
// по кутах північної стіни, спільний робочий стіл 1.8 x 0.7 під вікном і два офісні крісла зі спинкою
(function buildKidsRoom() {
  const g = houseGroup, base = FLOOR_Y;
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  const tex = oakTexture(false, true);
  tex.repeat.set(0.8, 0.5);
  const wood = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
  const linen = new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.95 });
  const blk = (m, x0, x1, y0, y1, z0, z1) =>
    box(x1 - x0, y1 - y0, z1 - z0, m, (x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2, g);
  const rbx = (m, x0, x1, y0, y1, z0, z1, r) => {
    const o = new THREE.Mesh(new RoundedBoxGeometry(x1 - x0, y1 - y0, z1 - z0, 4, r), m);
    o.position.set((x0 + x1) / 2, base + (y0 + y1) / 2, (z0 + z1) / 2);
    o.castShadow = o.receiveShadow = true;
    g.add(o);
    return o;
  };
  const N = 0.2, S = 4.425, W0 = 4.875, E0 = 10.8;                 // чисті поверхні стін кімнати

  // --- шафи-пенали 0.6 x 0.55 x 2.5 в північних кутах (одна для кожного) ---
  const pencil = (xa, xb, handleSide) => {
    const x0 = Math.min(xa, xb), x1 = Math.max(xa, xb), z0 = N, D = 0.55;
    blk(wood, x0 + 0.02, x1 - 0.02, 0, 0.1, z0, z0 + D - 0.02);
    blk(white, x0, x1, 0.1, 2.5, z0, z0 + D);
    const fz = z0 + D;
    blk(dark, x0, x1, 1.9, 1.904, fz, fz + 0.004);                  // шов антресолі
    const hx = handleSide > 0 ? x1 - 0.045 : x0 + 0.035;
    blk(dark, hx, hx + 0.01, 1.0, 1.4, fz, fz + 0.02);                // вертикальна ручка
    addCollider(x0, x1, z0, z0 + D);
  };
  pencil(W0, W0 + 0.6, +1);
  pencil(E0 - 0.6, E0, -1);

  // --- два односпальні ліжка 0.9 x 2.0, узголів'я до південної стіни ---
  const bed = (cx, blanketColor) => {
    const x0 = cx - 0.45, x1 = cx + 0.45, zs = S, ze = S - 2.0;
    const blanket = new THREE.MeshStandardMaterial({ color: blanketColor, roughness: 0.97 });
    rbx(wood, x0, x1, 0.1, 1.0, zs - 0.06, zs, 0.02);                      // узголів'я — суцільна панель від рами до верху, з'єднана з основою
    blk(wood, x0 + 0.02, x1 - 0.02, 0.1, 0.3, ze, zs - 0.06);             // рама
    for (const x of [x0 + 0.05, x1 - 0.05]) for (const z of [ze + 0.05, zs - 0.1]) blk(wood, x - 0.03, x + 0.03, 0, 0.1, z - 0.03, z + 0.03);   // ніжки
    rbx(linen, x0 + 0.02, x1 - 0.02, 0.3, 0.5, ze + 0.02, zs - 0.06, 0.05);       // матрац
    rbx(blanket, x0 + 0.01, x1 - 0.01, 0.48, 0.56, ze + 0.02, zs - 0.65, 0.04);   // ковдра
    rbx(linen, x0 + 0.1, x1 - 0.1, 0.5, 0.62, zs - 0.5, zs - 0.12, 0.06);          // подушка
    addCollider(x0, x1, ze, zs);
  };
  bed(7.6, 0x3f6f9a);
  bed(9.7, 0x6b8fb0);
  blk(wood, 8.8, 9.2, 0.12, 0.5, S - 0.38, S);                             // тумбочка правого ліжка (з його західного боку, впритул)
  blk(white, 8.81, 9.19, 0.15, 0.48, S - 0.392, S - 0.38);                  // дверка
  blk(dark, 8.98, 9.02, 0.38, 0.46, S - 0.399, S - 0.392);                  // ручка
  for (const x of [8.85, 9.15]) for (const z of [S - 0.34, S - 0.04]) blk(wood, x - 0.02, x + 0.02, 0, 0.12, z - 0.02, z + 0.02);
  addCollider(8.8, 9.2, S - 0.38, S);
  // тумбочка лівого ліжка з його західного боку (впритул)
  blk(wood, 6.68, 7.08, 0.12, 0.5, S - 0.38, S);
  blk(white, 6.69, 7.07, 0.15, 0.48, S - 0.392, S - 0.38);                  // дверка
  blk(dark, 6.86, 6.9, 0.38, 0.46, S - 0.399, S - 0.392);                   // ручка
  for (const x of [6.73, 7.03]) for (const z of [S - 0.34, S - 0.04]) blk(wood, x - 0.02, x + 0.02, 0, 0.12, z - 0.02, z + 0.02);
  addCollider(6.68, 7.08, S - 0.38, S);

  // --- спільний письмовий стіл 1.8 x 0.7 під вікном: світла стільниця, білі тумби-ніжки, полиця на столі ---
  const dx0 = 7.0, dx1 = 8.8, dz0 = N, dz1 = N + 0.7, TY = 0.75;
  blk(wood, dx0, dx1, TY - 0.03, TY, dz0, dz1);
  for (const x of [dx0 + 0.03, dx1 - 0.03]) blk(white, x - 0.03, x + 0.03, 0, TY - 0.03, dz0 + 0.03, dz1 - 0.03);      // бокові панелі
  blk(white, dx0 + 0.06, dx1 - 0.06, 0.64, 0.72, dz0 + 0.03, dz0 + 0.06);                                           // тонка рейка біля стіни для жорсткості (високо — ноги не заважає)
  addCollider(dx0, dx1, dz0, dz1);
  // два зошити, пенал, настільна лампа ліворуч
  const note = (x, z, rot, c) => { const o = box(0.21, 0.012, 0.3, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }), x, base + TY + 0.006, z, g); o.rotation.y = rot; };
  note(7.65, 0.65, 0.12, 0x3f6f9a); note(8.45, 0.65, -0.1, 0x6b8fb0);
  const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.1, 16), dark);
  holder.position.set(8.05, base + TY + 0.05, 0.4); g.add(holder);
  const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.14, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0xf6efe0, emissive: 0xffe2b0, emissiveIntensity: 0.4, side: THREE.DoubleSide }));
  lamp.position.set(7.15, base + TY + 0.32, 0.4); g.add(lamp);
  box(0.012, 0.28, 0.012, dark, 7.15, base + TY + 0.15, 0.4, g);
  box(0.1, 0.012, 0.1, dark, 7.15, base + TY + 0.006, 0.4, g);

  // --- два зручні офісні крісла: сірий текстиль, середня спинка з профільним сидінням, підлокітники, п'ятипроменева основа ---
  const fabric = new THREE.MeshStandardMaterial({ color: 0x57626b, roughness: 0.95 });
  const black = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, roughness: 0.6 });
  const officeChair = (x, z, yaw) => {
    const c = new THREE.Group();
    c.position.set(x, base, z);
    c.rotation.y = yaw;                                                      // за замовчуванням обличчям на північ (до столу), спинка на +z
    g.add(c);
    const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; c.add(o); return o; };
    const rb = (m, w, h, d, r, px, py, pz) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m); o.position.set(px, py, pz); o.castShadow = true; c.add(o); return o; };
    add(new THREE.CylinderGeometry(0.025, 0.03, 0.28, 12), black, 0, 0.19, 0);                 // газліфт
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      const arm = add(new THREE.BoxGeometry(0.28, 0.028, 0.04), black, Math.cos(a) * 0.14, 0.06, Math.sin(a) * 0.14);
      arm.rotation.y = -a;
      add(new THREE.SphereGeometry(0.028, 10, 8), black, Math.cos(a) * 0.27, 0.03, Math.sin(a) * 0.27);
    }
    rb(black, 0.3, 0.04, 0.24, 0.015, 0, 0.34, 0);                                            // механізм
    rb(fabric, 0.48, 0.08, 0.46, 0.035, 0, 0.42, 0);                                           // сидіння
    const back = new THREE.Group();
    back.position.set(0, 0.46, 0.2);
    back.rotation.x = 0.1;
    c.add(back);
    const bk = new THREE.Mesh(new RoundedBoxGeometry(0.44, 0.52, 0.06, 3, 0.03), fabric);       // спинка середньої висоти
    bk.position.set(0, 0.3, 0); bk.castShadow = true; back.add(bk);
    const lum = new THREE.Mesh(new RoundedBoxGeometry(0.3, 0.1, 0.05, 3, 0.025), black);        // поперековий валик
    lum.position.set(0, 0.16, -0.045); back.add(lum);
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.2, 0.025), black);                // з'єднувач спинки з сидінням
    spine.position.set(0, 0.0, 0.02); back.add(spine);
    for (const s of [-1, 1]) {                                                                   // підлокітники
      add(new THREE.BoxGeometry(0.03, 0.2, 0.04), black, s * 0.25, 0.54, 0.07);
      add(new THREE.BoxGeometry(0.06, 0.03, 0.24), black, s * 0.25, 0.65, -0.02);
    }
    addCollider(x - 0.32, x + 0.32, z - 0.32, z + 0.34);
  };
  officeChair(7.45, 1.4, 0.08);
  officeChair(8.4, 1.45, -0.12);
})();


// політична карта світу на західній стіні дитячої (3.5 x 1.7 м): країни кольорові, межі білі, проєкція Міллера.
// Дані — Natural Earth (npm world-atlas), підтягуються при відкритті сторінки; до завантаження видно лише океан.
(function buildWorldMap() {
  const MW = 3.5, MH = 1.7, cz = 2.62, cy = 1.5, xWall = 4.875;
  const W = 2560, H = Math.round(W * MH / MW);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const ocean = c.createLinearGradient(0, 0, 0, H);
  ocean.addColorStop(0, '#74b9e6'); ocean.addColorStop(1, '#4a9fd8');   // насичений блакитний океан
  c.fillStyle = ocean; c.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mat2 = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.5 });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(MW, MH), mat2);
  plane.rotation.y = Math.PI / 2;                                                   // дивиться на схід, у кімнату
  plane.position.set(xWall + 0.012, FLOOR_Y + cy, cz);
  houseGroup.add(plane);
  // тонка рамка по периметру зі світлого дерева, як у ліжок (та сама текстура)
  const ftex = oakTexture(false, true);
  ftex.repeat.set(0.8, 0.5);
  const frameM = new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.5 });
  const FT = 0.015;
  const bar = (w, hh, z, y) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.02, hh, w), frameM); b.position.set(xWall + 0.01, FLOOR_Y + y, z); houseGroup.add(b); };
  bar(MW + 2 * FT, FT, cz, cy + MH / 2 + FT / 2); bar(MW + 2 * FT, FT, cz, cy - MH / 2 - FT / 2);
  bar(FT, MH, cz - MW / 2 - FT / 2, cy); bar(FT, MH, cz + MW / 2 + FT / 2, cy);

  const LAT0 = -58, LAT1 = 82;
  const my = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * Math.PI / 180));
  const y0 = my(LAT1), y1 = my(LAT0);
  const px = (lon) => (lon + 180) / 360 * W;
  const py = (lat) => (y0 - my(Math.max(LAT0 - 5, Math.min(LAT1 + 5, lat)))) / (y0 - y1) * H;
  const palette = ['#f3c98b', '#a9d18e', '#f4a7a0', '#c3b1e1', '#f7e08a', '#8fd0c4', '#f0b6d4', '#b8cdf0'];

  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json')
    .then(r => r.json())
    .then(topo => {
      const feats = feature(topo, topo.objects.countries).features;
      c.lineJoin = 'round';
      feats.forEach((f, i) => {
        if (f.id === '010') return;                                          // Антарктида поза кадром (карта до 58° пн. ш.)
        const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
        c.fillStyle = palette[(i * 5 + (+f.id || i)) % palette.length];
        for (const poly of polys) {
          for (const dx of [0, -W, W]) {                                     // контури через антимеридіан: розгортаємо довготу й малюємо зі зсувом
            c.beginPath();
            for (const ring of poly) {
              let prev = null, off = 0;
              ring.forEach(([lo, la], k) => {
                if (prev !== null) { if (lo - prev > 180) off -= 360; else if (lo - prev < -180) off += 360; }
                prev = lo;
                const x = px(lo + off) + dx, y = py(la);
                k ? c.lineTo(x, y) : c.moveTo(x, y);
              });
            }
            c.fill('evenodd');
            c.strokeStyle = '#ffffff'; c.lineWidth = 2.2; c.stroke();
          }
        }
      });
      // градусна сітка: меридіани й паралелі
      c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 1;
      for (let lo = -180; lo <= 180; lo += 30) { c.beginPath(); c.moveTo(px(lo), 0); c.lineTo(px(lo), H); c.stroke(); }
      for (const la of [-30, 0, 30, 60]) { c.beginPath(); c.moveTo(0, py(la)); c.lineTo(W, py(la)); c.stroke(); }
      c.fillStyle = 'rgba(235,247,255,.92)'; c.font = 'bold 34px Arial, sans-serif'; c.textAlign = 'center';   // підписи океанів світлі на синьому
      for (const [t, lo, la] of [['ТИХИЙ ОКЕАН', -150, 5], ['АТЛАНТИЧНИЙ ОКЕАН', -38, 8], ['ІНДІЙСЬКИЙ ОКЕАН', 78, -20], ['ТИХИЙ ОКЕАН', 166, -28], ['ПІВНІЧНИЙ ЛЬОДОВИТИЙ ОКЕАН', 105, 81]]) c.fillText(t, px(lo), py(la));
      c.font = 'bold 40px Arial, sans-serif'; c.fillStyle = 'rgba(70,45,30,.85)';
      for (const [t, lo, la] of [['УКРАЇНА', 31, 49]]) c.fillText(t, px(lo), py(la) - 30);
      tex.needsUpdate = true;
    })
    .catch(() => {});
})();

// вимикачі світла в усіх приміщеннях (у санвузлі — один подвійний ззовні): білий квадратний подрозетник з клавішею, на висоті 1.1 м, біля дверей з боку ручки
(function buildSwitches() {
  const g = houseGroup, base = FLOOR_Y;
  const white = new THREE.MeshStandardMaterial({ color: 0xf7f6f1, roughness: 0.35 });
  const key = new THREE.MeshStandardMaterial({ color: 0xeeece4, roughness: 0.3 });
  const mark = new THREE.MeshStandardMaterial({ color: 0xb8b6ae, roughness: 0.5 });
  // facing: куди дивиться табличка — 'n' (-z), 's' (+z), 'e' (+x), 'w' (-x); (x, z) — точка на поверхні стіни
  const sw = (x, z, facing, y = 1.1, gangs = 1) => {
    const grp = new THREE.Group();
    grp.position.set(x, base + y, z);
    grp.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing];   // за замовчуванням нормаль +z
    const w = 0.086 + (gangs - 1) * 0.07;                                            // подвійний вимикач — ширша планка на дві клавіші
    const plate = new THREE.Mesh(new RoundedBoxGeometry(w, 0.086, 0.012, 2, 0.004), white);
    plate.position.z = 0.006; plate.castShadow = true; grp.add(plate);
    for (let i = 0; i < gangs; i++) {
      const gx = (i - (gangs - 1) / 2) * 0.07;
      const k = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.056, 0.008, 2, 0.003), key);
      k.position.set(gx, 0, 0.013); k.rotation.x = -0.12; grp.add(k);                // клавіша трохи нахилена
      const dot = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.001), mark);
      dot.position.set(gx, 0.018, 0.0178); dot.rotation.x = -0.12; grp.add(dot);
    }
    g.add(grp);
  };
  sw(7.5, 8.8, 'n');             // кухня-вітальня: біля вхідних дверей з боку обіднього столу (західніше), на південній стіні
  sw(3.5, 4.425, 'n');           // мала спальня: на південній стіні, західніше дверей
  sw(6.15, 4.425, 'n');          // дитяча: на південній стіні, східніше дверей з вітальні
  sw(8.925, 7.54, 'w', 1.1, 2);  // ванна + туалет: один подвійний вимикач ззовні, у вітальні, між двома дверима (ліва клавіша — ванна, права — туалет)
  sw(10.5, 5.8, 'n');            // котельня: на південній стіні (дверей з двору — східна)
})();

// опалення: газовий котел у котельні + панельні радіатори (парове/водяне опалення) під вікнами у вітальні й обох спальнях
// (у ванній і туалеті радіаторів немає)
(function buildHeating() {
  const g = houseGroup, base = FLOOR_Y;
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.4 });
  const grille = new THREE.MeshStandardMaterial({ color: 0xdcdad2, roughness: 0.5 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xcfd3d6, metalness: 0.9, roughness: 0.25 });
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b820, roughness: 0.45 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc03a2b, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3a6fc0, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb9bcbe, metalness: 0.4, roughness: 0.4 });

  // --- радіатор: сталева панель 0.5 м заввишки, глибина 7 см, під вікном; (x, z) — центр на поверхні стіни ---
  const radiator = (x, z, len, facing) => {
    const grp = new THREE.Group();
    grp.position.set(x, base, z);
    grp.rotation.y = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[facing];   // локальний +z — у кімнату
    const add = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; grp.add(o); return o; };
    add(new THREE.BoxGeometry(len, 0.46, 0.02), white, 0, 0.38, 0.03);                         // задня панель
    add(new THREE.BoxGeometry(len, 0.46, 0.012), white, 0, 0.38, 0.075);                       // передня панель з ребрами (нижче)
    for (let i = 0; i < Math.round(len / 0.06); i++)                                           // ребра-конвектор
      add(new THREE.BoxGeometry(0.006, 0.44, 0.045), grille, -len / 2 + 0.035 + i * 0.06, 0.38, 0.05);
    add(new THREE.BoxGeometry(len + 0.01, 0.025, 0.09), grille, 0, 0.62, 0.05);              // верхня решітка
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.012, 0.46, 0.09), white, s * (len / 2 + 0.003), 0.38, 0.05);   // бічні заглушки
    for (const s of [-1, 1]) {                                                                  // кронштейни до стіни
      add(new THREE.BoxGeometry(0.03, 0.04, 0.04), grey, s * (len / 2 - 0.12), 0.2, 0.02);
    }
    // підвід: дві труби знизу з крана-термоголовкою з одного боку
    for (const s of [-1, 1]) {
      const p = add(new THREE.CylinderGeometry(0.009, 0.009, 0.16, 8), chrome, s * (len / 2 - 0.045), 0.08, 0.04);
    }
    add(new THREE.BoxGeometry(0.03, 0.03, 0.03), chrome, len / 2 - 0.045, 0.14, 0.04);                    // кран
    const head = add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 12), white, len / 2 - 0.045, 0.135, 0.075);   // термоголовка
    head.rotation.x = Math.PI / 2;
    g.add(grp);
  };
  radiator(0.2, 6.45, 1.0, 'e');          // вітальня: західне вікно (зсунутий до півночі, щоб не впиратися в шезлонг)
  radiator(2.4, 0.2, 1.2, 's');           // мала спальня: під північним вікном
  radiator(7.9, 0.2, 1.2, 's');           // дитяча: під північним вікном, під столом між бічними панелями

  // --- газовий котел: настінний, білий, дисплей з регулятором; труби подачі/зворотки, газова труба, розширювальний бак ---
  const bx = 9.9, bz = 4.575;                                                                   // на північній стіні котельні
  const boiler = new THREE.Group();
  boiler.position.set(bx, base, bz);
  g.add(boiler);
  const put = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = true; boiler.add(o); return o; };
  put(new RoundedBoxGeometry(0.4, 0.7, 0.3, 3, 0.02), white, 0, 1.45, 0.15);                  // корпус
  put(new THREE.BoxGeometry(0.34, 0.06, 0.005), dark, 0, 1.69, 0.302);                       // панель управління
  put(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 16), grey, 0.1, 1.63, 0.31).rotation.x = Math.PI / 2;  // регулятор
  const disp = put(new THREE.PlaneGeometry(0.1, 0.035), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, emissive: 0x7fe0a0, emissiveIntensity: 0.9 }), -0.07, 1.66, 0.3055);   // дисплей
  put(new THREE.BoxGeometry(0.34, 0.03, 0.02), dark, 0, 1.14, 0.305);                        // фасадна смуга з логотипом
  // патрубки знизу: газ (жовтий), подача (червона), зворотка (синя), холодна вода
  for (const [dx, m] of [[-0.14, yellow], [-0.05, red], [0.05, blue], [0.14, grey]]) {
    put(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 10), m, dx, 1.0, 0.15 + 0.04 * (dx > 0 ? 1 : 0));
    put(new THREE.CylinderGeometry(0.014, 0.014, 0.025, 10), chrome, dx, 1.11, 0.15 + 0.04 * (dx > 0 ? 1 : 0));
  }
  // газова труба від підлоги з краном, потім до котла
  put(new THREE.CylinderGeometry(0.014, 0.014, 0.9, 10), yellow, -0.14, 0.45, 0.15);
  put(new THREE.BoxGeometry(0.05, 0.03, 0.03), red, -0.14, 0.55, 0.15);                      // газовий кран
  // подача й зворотка йдуть вниз і в сторону стіни x=9 (у кухні за нею їх не видно: кріплення в стіні)
  put(new THREE.CylinderGeometry(0.011, 0.011, 0.9, 8), red, -0.05, 0.6, 0.15).visible = false;
  for (const [dz, m] of [[0.15, red], [0.19, blue]]) {
    const run = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.9, 8), m);
    run.rotation.z = Math.PI / 2;
    run.position.set(-0.5, 0.2 + (dz - 0.15) * 3, dz);                                      // горизонтальні лінії опалення до стіни x=9
    boiler.add(run);
  }
  // розширювальний бак (червоний) збоку на стіні
  put(new THREE.CylinderGeometry(0.1, 0.1, 0.28, 18), red, 0.32, 1.3, 0.12);
  put(new THREE.SphereGeometry(0.1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), red, 0.32, 1.44, 0.12);
  // коаксіальний димохід: від верху котла вгору й горизонтально на двір через східну стіну
  put(new THREE.CylinderGeometry(0.045, 0.045, 0.35, 14), grey, 0, 1.97, 0.15);
  const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 11.25 - bx, 14), grey);
  flue.rotation.z = Math.PI / 2;
  flue.position.set((11.25 - bx) / 2, 2.15, 0.15);
  boiler.add(flue);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 14), dark);       // ковпак на фасаді
  cap.rotation.z = Math.PI / 2;
  cap.position.set(11.27 - bx, 2.15, 0.15);
  boiler.add(cap);
})();

// газопостачання: від вулиці газ іде під землею, біля котельні труба виходить на поверхню (кран, лічильник),
// далі через стіну в котельню до котла й відгалуження крізь перегородку до плити
(function buildGasSupply() {
  const g = houseGroup, base = FLOOR_Y;
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe8b820, roughness: 0.45 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc03a2b, roughness: 0.5 });
  const meterMat = new THREE.MeshStandardMaterial({ color: 0xb9bcbe, metalness: 0.4, roughness: 0.4 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  const R = 0.017;
  const pipe = (a, b, r = R) => {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), v = B.clone().sub(A);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, v.length(), 10), yellow);
    m.position.copy(A).add(B).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize());
    m.castShadow = true;
    g.add(m);
  };
  const elbow = (x, y, z) => { const s = new THREE.Mesh(new THREE.SphereGeometry(R * 1.2, 10, 8), yellow); s.position.set(x, y, z); g.add(s); };
  const valve = (x, y, z) => {                                       // кульовий кран: жовтий корпус, червона ручка
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.05), yellow); b.position.set(x, y, z); g.add(b);
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.015, 0.02), red); h.position.set(x, y + 0.04, z); g.add(h);
  };

  const wz = 4.6, wx = 11.34;              // вихід труби з землі біля стіни, північніше дверей котельні
  const iy = base + 0.75;                  // висота труби в котельні
  // від вулиці газ іде під землею; біля хати труба виходить на поверхню: кран, лічильник, у стіну
  box(0.3, 0.1, 0.3, mat.foundation, wx, 0.05, wz, g);               // бетонна плитка навколо виходу
  pipe([wx, 0, wz], [wx, 0.55, wz]);
  valve(wx, 0.3, wz);                                                // відключний кран
  box(0.14, 0.3, 0.22, meterMat, wx, 0.7, wz, g);                    // лічильник газу
  const dial = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.05), dark); dial.position.set(wx + 0.071, 0.75, wz); dial.rotation.y = Math.PI / 2; g.add(dial);
  pipe([wx, 0.85, wz], [wx, iy, wz]);
  elbow(wx, iy, wz);
  // крізь зовнішню стіну в котельню, по північній стіні до стояка котла й далі до перегородки
  const px = 9.15;
  pipe([wx, iy, wz], [px, iy, wz]);
  pipe([9.76, iy, wz], [9.76, iy, 4.725]);                           // до стояка котла
  elbow(9.76, iy, wz);
  // відгалуження до плити: уздовж перегородки до z=5.66, вниз, крізь стіну в шафу під плитою
  const hz = 5.66;
  elbow(px, iy, wz);
  pipe([px, iy, wz], [px, iy, hz]);
  elbow(px, iy, hz);
  pipe([px, iy, hz], [px, base + 0.4, hz]);
  valve(px, base + 0.65, hz);
  elbow(px, base + 0.4, hz);
  pipe([px, base + 0.4, hz], [8.6, base + 0.4, hz]);
})();

// бойлер непрямого нагріву (накопичувальний водонагрівач 100 л) у котельні поруч з газовим котлом: стоїть на підлозі біля стіни
(function buildWaterHeater() {
  const g = houseGroup, base = FLOOR_Y;
  const white = new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 0.35 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb9bcbe, metalness: 0.4, roughness: 0.4 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc03a2b, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x3a6fc0, roughness: 0.5 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x303535, roughness: 0.5 });
  const x = 10.58, z = 4.575 + 0.27, R = 0.22, H = 1.25;
  const grp = new THREE.Group();
  grp.position.set(x, base, z);
  g.add(grp);
  const put = (geo, m, px, py, pz) => { const o = new THREE.Mesh(geo, m); o.position.set(px, py, pz); o.castShadow = o.receiveShadow = true; grp.add(o); return o; };
  put(new THREE.CylinderGeometry(R, R, H, 32), white, 0, 0.08 + H / 2, 0);                  // корпус
  put(new THREE.SphereGeometry(R, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), white, 0, 0.08 + H, 0).scale.y = 0.35;   // верхня куполоподібна кришка
  put(new THREE.CylinderGeometry(R + 0.01, R + 0.01, 0.06, 32), grey, 0, 0.03, 0);        // піддон
  for (const a of [0, 2.1, 4.2]) put(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 8), dark, Math.cos(a) * (R - 0.04), 0.0, Math.sin(a) * (R - 0.04));  // ніжки
  put(new THREE.CylinderGeometry(0.045, 0.045, 0.012, 20), dark, 0, 1.0, R + 0.003).rotation.x = Math.PI / 2;   // термометр
  put(new THREE.BoxGeometry(0.1, 0.04, 0.01), dark, 0, 0.8, R - 0.005);                    // панель
  // патрубки зверху: холодна вода (синя) і гаряча (червона), труби вгору й до стіни
  for (const [dx, m] of [[-0.09, blue], [0.09, red]]) {
    put(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 10), m, dx, 1.55, -0.04);
    put(new THREE.CylinderGeometry(0.016, 0.016, 0.03, 10), grey, dx, 1.43, -0.04);
  }
  for (const [dx, m] of [[-0.09, blue], [0.09, red]]) {
    const run = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, R + 0.18, 10), m);
    run.rotation.x = Math.PI / 2;
    run.position.set(dx, 1.69, -(R + 0.18) / 2 + 0.07 - 0.04 + 0.04);
    grp.add(run);
  }
  // зв'язок з котлом: подача й зворотка змійовика (лінії по x до котла)
  for (const [dy, m] of [[0.9, red], [0.82, blue]]) {
    const run = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, x - 10.12, 8), m);
    run.rotation.z = Math.PI / 2;
    run.position.set(-(x - 10.12) / 2 - R + 0.02, dy, -0.08);
    grp.add(run);
  }
  // запобіжний клапан і манометр збоку
  put(new THREE.CylinderGeometry(0.02, 0.02, 0.06, 10), red, R + 0.03, 0.55, 0).rotation.z = Math.PI / 2;
})();


// клік по дверях (приціл у центрі екрана, коли курсор захоплено) або дотик по дверях на телефоні: відчинити/зачинити ці двері
(function doorPicking() {
  const ray = new THREE.Raycaster();
  ray.far = 2.6;
  const meshes = () => doors.flatMap(d => d.parts);
  const pick = (ndcX, ndcY) => {
    ray.setFromCamera({ x: ndcX, y: ndcY }, camera);
    const hit = ray.intersectObjects(meshes(), false)[0];
    if (hit) toggleDoor(hit.object.userData.door);
  };
  renderer.domElement.addEventListener('click', e => { if (mode === 'walk' && walk.isLocked) pick(0, 0); });
  // приціл-крапка для комп'ютера
  const dot = document.createElement('div');
  Object.assign(dot.style, { position: 'fixed', left: '50%', top: '50%', width: '6px', height: '6px', margin: '-3px 0 0 -3px', borderRadius: '50%', background: 'rgba(255,255,255,.8)', boxShadow: '0 0 2px #000', pointerEvents: 'none', display: 'none' });
  document.body.appendChild(dot);
  walk.addEventListener('lock', () => dot.style.display = 'block');
  walk.addEventListener('unlock', () => dot.style.display = 'none');
  // тап на телефоні: короткий дотик без руху
  let t0 = null;
  renderer.domElement.addEventListener('touchstart', e => { if (e.touches.length === 1) t0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }; else t0 = null; }, { passive: true });
  renderer.domElement.addEventListener('touchend', e => {
    if (!t0 || mode !== 'walk') return;
    const t = e.changedTouches[0];
    if (Math.hypot(t.clientX - t0.x, t.clientY - t0.y) < 10 && performance.now() - t0.t < 350)
      pick((t.clientX / innerWidth) * 2 - 1, -(t.clientY / innerHeight) * 2 + 1);
    t0 = null;
  });
})();
