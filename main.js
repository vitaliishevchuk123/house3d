import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { plot, house, walls } from './plan.js';

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

scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7a4a, 0.8));
const sun = new THREE.DirectionalLight(0xfff2d6, 1.8);
sun.position.set(25, 40, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 120 });
scene.add(sun);

// ---------- матеріали ----------
const mat = {
  wallOut: new THREE.MeshStandardMaterial({ color: 0x65777a, roughness: 0.95 }), // фасад
  wallIn: new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.95 }),
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
box(0.9, 0.2, 1.3, mat.foundation, house.w + 0.2 + 0.45, 0.1, 5.35, houseGroup);

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
