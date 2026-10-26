import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Сусідні двори українського села вздовж вулиці: по 3 двори з боків від нашої ділянки на північному боці й 7 дворів навпроти.
// Кожен двір 30 × 80 м: хата (шифер чи металочерепиця, побілені або цегляні стіни, віконниці), літня кухня, хлів із загоном, курник,
// городи на більшу частину ділянки, плодові дерева, колодязь зі зрубом, ворітним колесом і відром, дрова, копиця, мальви, собака в будці, кіт, кури, корови, свині, кози.
// Уся статична геометрія зливається в 5 мешів (за типом текстури), тварини — окремі меші, щоб трохи рухатись.
//
// Система координат двору: u — уздовж вулиці, v — від паркану вглиб двору (0 — лінія паркану, 80 — задній паркан).

export function buildVillage({ scene, plot, street, colliders, grassTex }) {
  const rng0 = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
  const L = { plain: [], stripe: [], plank: [], glass: [], wire: [] };
  const TILE = { stripe: 0.18, plank: 0.16, wire: 0.16 };      // метрів на один період текстури
  let T = new THREE.Matrix4(), G = new THREE.Matrix4(), sink = null;

  // ---------- текстури й матеріали ----------
  const canvasTex = (w, h, draw) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'));
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
  };
  const stripeTex = canvasTex(64, 8, g => {                    // хвиля шиферу / профнастилу, у відтінках сірого (колір дає вершина)
    for (let x = 0; x < 64; x++) { const v = Math.round(190 + 65 * Math.cos(2 * Math.PI * x / 64)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 8); }
  });
  const plankTex = canvasTex(64, 64, g => {                    // вертикальні дошки зі щілиною й річками
    g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, 64, 64);
    let s = 5; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) { const v = 170 + Math.floor(r() * 60); g.fillStyle = `rgba(${v},${v},${v},0.7)`; g.fillRect(r() * 64, r() * 64, 1, 4 + r() * 14); }
    g.fillStyle = '#555'; g.fillRect(0, 0, 2, 64);
  });
  const wireTex = canvasTex(64, 64, g => {
    g.strokeStyle = '#d6d9da'; g.lineWidth = 2.2;
    for (let k = -2; k <= 2; k++) {
      g.beginPath(); g.moveTo(-8, 32 * k - 8); g.lineTo(72, 32 * k + 72); g.stroke();
      g.beginPath(); g.moveTo(-8, 32 * k + 72); g.lineTo(72, 32 * k - 8); g.stroke();
    }
  });
  const mk = extra => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, ...extra });
  const mats = {
    plain: mk(), stripe: mk({ map: stripeTex, roughness: 0.6 }), plank: mk({ map: plankTex }),
    glass: mk({ roughness: 0.15, metalness: 0.1 }),
    wire: mk({ map: wireTex, transparent: true, alphaTest: 0.1, side: THREE.DoubleSide, roughness: 0.6 }),
  };

  // ---------- будівельні примітиви (у поточній системі T, потім двір → світ G) ----------
  function put(kind, g, color) {
    const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.applyMatrix4(G.clone().multiply(T));
    (sink || L[kind]).push(g);
  }
  function B(w, h, d, x, y, z, color, o = {}) {
    const g = new THREE.BoxGeometry(w, h, d), k = o.kind || 'plain';
    if (TILE[k]) {
      const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
      for (let i = 0; i < 24; i++) { const [a, b] = dims[i >> 2]; uv.setXY(i, uv.getX(i) * a / TILE[k], uv.getY(i) * b / TILE[k]); }
    }
    if (o.rx) g.rotateX(o.rx);
    if (o.rz) g.rotateZ(o.rz);
    if (o.ry) g.rotateY(o.ry);
    g.translate(x, y, z);
    put(k, g, color);
  }
  function Cy(rt, rb, h, x, y, z, color, o = {}) {
    const g = new THREE.CylinderGeometry(rt, rb, h, o.seg || 8);
    if (o.rx) g.rotateX(o.rx);
    if (o.rz) g.rotateZ(o.rz);
    g.translate(x, y, z);
    put('plain', g, color);
  }
  function Sp(r, x, y, z, color, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.SphereGeometry(r, 8, 6);
    g.scale(sx, sy, sz); g.translate(x, y, z);
    put('plain', g, color);
  }
  const A3 = (a, b) => new THREE.Vector3(...a).sub(new THREE.Vector3(...b));
  function tri(a, b, c, color) {                               // двосторонній трикутник (для щипців)
    const n = A3(b, a).cross(A3(c, a)).normalize(), g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...b], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
    g.setIndex([0, 1, 2, 3, 4, 5]);
    put('plain', g, color);
  }
  function plane(w, h, x, y, z, ry, color, kind = 'wire') {   // вертикальна площина (сітка-рабиця)
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / TILE[kind], uv.getY(i) * h / TILE[kind]);
    g.rotateY(ry); g.translate(x, y, z);
    put(kind, g, color);
  }
  function at(x, z, ry, fn, y = 0) {                           // тимчасова локальна система: зсув і поворот навколо Y
    const p = T;
    T = p.clone().multiply(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z));
    fn();
    T = p;
  }
  function col(w, d) {                                         // AABB колайдера для прямокутника w × d у поточній системі
    const M = G.clone().multiply(T), v = new THREE.Vector3();
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      v.set(sx * w / 2, 0, sz * d / 2).applyMatrix4(M);
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    colliders.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1 });
  }
  function makeGeo(fn) {                                       // окрема геометрія (тварини) у власній системі координат
    const sT = T, sG = G, sS = sink;
    T = new THREE.Matrix4(); G = new THREE.Matrix4(); sink = [];
    fn();
    const g = mergeGeometries(sink);
    T = sT; G = sG; sink = sS;
    return g;
  }

  // ---------- палітри ----------
  const C = {
    white: 0xf3f0e6, cream: 0xeadcb0, paleBlue: 0xb4cfe0, peach: 0xeccbb0, brick: 0xa65a43, grey: 0xbdb9ad, mint: 0xa7c79d, yellow: 0xe8d27a,
    slate: 0x8e9190, green: 0x3f7a4a, red: 0xa6382d, brown: 0x6a4634, blue: 0x2d5f8f, rust: 0x7d5a45,
    fBlue: 0x2c62a8, fGreen: 0x2f7a42, fBrown: 0x6a4528, fWhite: 0xeeeeea, fNat: 0xb08d62, fRed: 0xa23a2c,
    concrete: 0xb4b2ab, soil: 0x4b3626, dirt: 0x9b8466, wood: 0x8a6a45, steel: 0x4a4f55, brickRed: 0x9c5a45,
  };
  const greens = [0x4c7f35, 0x5a8f3c, 0x3f7230, 0x6a9a44, 0x528a3a];

  // ---------- двосхилий дах: хребет уздовж x, w × d — стіни в плані, y — верх стін ----------
  function gable(w, d, y, rise, over, roofC, wallC, kind = 'stripe') {
    const half = d / 2 + over, len = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) B(w + 2 * over, 0.06, len + 0.02, 0, y + rise / 2 + 0.03, s * half / 2, roofC, { kind, rx: s * ang });
    B(w + 2 * over + 0.04, 0.08, 0.2, 0, y + rise + 0.04, 0, roofC === C.slate ? 0x6d706f : roofC);
    const e = rise * (1 - d / 2 / half);
    for (const sx of [-1, 1]) {
      const x = sx * w / 2, P = (z, yy) => [x, yy, z];
      tri(P(-d / 2, y), P(d / 2, y), P(d / 2, y + e), wallC);
      tri(P(-d / 2, y), P(d / 2, y + e), P(-d / 2, y + e), wallC);
      tri(P(-d / 2, y + e), P(d / 2, y + e), P(0, y + rise), wallC);
    }
  }

  // ---------- вікно, двері ----------
  function windowAt(x, z, ry, y, w, h, o) {                    // стіна дивиться вздовж +z обернутої системи
    at(x, z, ry, () => {
      const sky = [0x4b5f73, 0x5d7a93, 0x3d4d5e][Math.floor(o.r() * 3)];
      B(w, h, 0.05, 0, y + h / 2, 0.01, sky, { kind: 'glass' });
      B(w + 0.12, 0.06, 0.09, 0, y + h, 0.03, o.frame); B(w + 0.12, 0.06, 0.09, 0, y, 0.03, o.frame);
      for (const s of [-1, 1]) B(0.06, h, 0.09, s * w / 2, y + h / 2, 0.03, o.frame);
      B(0.04, h, 0.07, 0, y + h / 2, 0.04, o.frame); B(w, 0.04, 0.07, 0, y + h * 0.58, 0.04, o.frame);
      B(w + 0.2, 0.04, 0.16, 0, y - 0.03, 0.07, o.frame);
      if (o.shutter) for (const s of [-1, 1]) B(w * 0.5, h + 0.12, 0.04, s * (w * 0.75 + 0.08), y + h / 2, 0.04, o.shutter, { kind: 'plank' });
    });
  }
  function doorAt(x, z, ry, w, h, color, frame) {
    at(x, z, ry, () => {
      B(w, h, 0.07, 0, h / 2, 0.02, color, { kind: 'plank' });
      B(w + 0.14, 0.07, 0.1, 0, h, 0.03, frame);
      for (const s of [-1, 1]) B(0.07, h, 0.1, s * w / 2, h / 2, 0.03, frame);
      B(0.04, 0.04, 0.08, w * 0.35, h * 0.5, 0.09, 0xd8d3c4);
    });
  }

  // ---------- хата або літня кухня ----------
  // o: w, d, H, wall, plinth, roof, shutter, frame, rise, chimney, porch, wins (кількість вікон у фасаді), r (rng)
  function house(o) {
    const { w, d, H } = o, rise = o.rise || 2, fr = o.frame || 0xf4f2ea;
    B(w, H, d, 0, H / 2, 0, o.wall);
    B(w + 0.08, 0.55, d + 0.08, 0, 0.275, 0, o.plinth);
    gable(w, d, H, rise, 0.4, o.roof, o.wall);
    const slots = Math.max(2, Math.round(w / 2.8)), ds = Math.min(slots - 1, o.doorSlot ?? slots - 1);
    const slotX = i => -w / 2 + (i + 0.5) * w / slots;
    for (let i = 0; i < slots; i++) {
      if (i === ds) doorAt(slotX(i), -d / 2, Math.PI, 0.95, 2.05, o.doorC || 0x6b3f22, fr);
      else windowAt(slotX(i), -d / 2, Math.PI, 1.0, 1.1, 1.3, { frame: fr, shutter: o.shutter, r: o.r });
      if (!o.small) windowAt(slotX(i), d / 2, 0, 1.0, 1.1, 1.3, { frame: fr, shutter: o.shutter, r: o.r });
    }
    for (const sx of [-1, 1]) for (const zz of d > 5 ? [-d / 4, d / 4] : [0]) {
      if (o.small && sx < 0) continue;
      windowAt(sx * w / 2, zz, sx * Math.PI / 2, 1.0, 1.1, 1.3, { frame: fr, shutter: o.shutter, r: o.r });
    }
    const cx = (o.chimney ?? 0.28) * w, top = H + rise + 0.9;
    B(0.55, top - H, 0.55, cx, (H + top) / 2, 0.45, C.brickRed); B(0.7, 0.1, 0.7, cx, top + 0.05, 0.45, 0x7a4a3a);
    col(w + 0.3, d + 0.3);
    if (o.porch) {                                             // ґанок із навісом
      const px = slotX(ds), pw = 2.2, pd = 1.5, z0 = -d / 2;
      B(pw, 0.2, pd, px, 0.1, z0 - pd / 2, C.concrete);
      B(pw - 0.4, 0.1, 0.4, px, 0.05, z0 - pd - 0.2, C.concrete);
      for (const s of [-1, 1]) B(0.1, 2.3, 0.1, px + s * (pw / 2 - 0.1), 1.35, z0 - pd + 0.1, o.porchC || C.wood);
      B(pw + 0.5, 0.05, pd + 0.5, px, 2.62, z0 - pd / 2 - 0.1, o.roof, { kind: 'stripe', rx: -0.17 });
    }
    return { slotX, ds };
  }

  // ---------- хлів / сарай: односхилий дах, дошки або побілені блоки ----------
  function barn(o) {
    const { w, d, H } = o, rise = 0.8, ang = Math.atan2(rise, d);
    if (o.block) B(w, H, d, 0, H / 2, 0, o.wall); else B(w, H, d, 0, H / 2, 0, o.wall, { kind: 'plank' });
    B(w + 0.05, 0.4, d + 0.05, 0, 0.2, 0, 0x8a8d8c);
    B(w + 0.5, 0.05, d + 0.7, 0, H + rise / 2 + 0.06, 0, o.roof, { kind: 'stripe', rx: -ang });
    for (const sx of [-1, 1]) {
      const x = sx * w / 2;
      tri([x, H, -d / 2], [x, H, d / 2], [x, H + rise, d / 2], o.wall);
    }
    B(w, rise, 0.05, 0, H + rise / 2, d / 2, o.wall, o.block ? {} : { kind: 'plank' });
    for (const s of [-1, 1]) B(1.0, 1.9, 0.06, s * (w / 4 + 0.05), 0.95, -d / 2, 0x5a4330, { kind: 'plank' });   // подвійні двері
    B(w / 2 + 0.2, 0.08, 0.1, w / 4, 1.95, -d / 2, 0x3a2c20);
    windowAt(-w / 4 - 0.4, -d / 2, Math.PI, 1.3, 0.6, 0.5, { frame: 0x3a2c20, r: o.r });
    col(w + 0.3, d + 0.3);
  }

  // ---------- загін із жердин ----------
  function pen(u0, u1, v0, v1, color = 0x8a6a45, h = 1.2) {
    const post = (u, v) => B(0.12, h + 0.2, 0.12, u, (h + 0.2) / 2, v, color);
    const side = (ua, va, ub, vb) => {
      const len = Math.hypot(ub - ua, vb - va), n = Math.max(1, Math.round(len / 1.6)), ang = Math.atan2(vb - va, ub - ua);
      for (let i = 0; i <= n; i++) post(ua + (ub - ua) * i / n, va + (vb - va) * i / n);
      for (const y of [0.35, 0.7, h]) B(len, 0.07, 0.04, (ua + ub) / 2, y, (va + vb) / 2, color, { ry: -ang });
    };
    side(u0, v0, u1, v0); side(u1, v0, u1, v1); side(u1, v1, u0, v1); side(u0, v1, u0, v0);
  }

  // ---------- дерева ----------
  function tree(u, v, k = 1, kind = 'fruit', r = Math.random) {
    const gc = () => greens[Math.floor(r() * greens.length)];
    if (kind === 'willow') {
      Cy(0.2 * k, 0.28 * k, 3.5 * k, u, 1.75 * k, v, 0x5b4a38);
      for (const [dx, dy, dz, rr] of [[0, 4.4, 0, 2.4], [1.4, 3.7, 0.6, 1.8], [-1.4, 3.8, -0.5, 1.8], [0.3, 3.2, -1.4, 1.5]]) Sp(rr * k, u + dx * k, dy * k, v + dz * k, 0x6f9a4a, 1, 0.85, 1);
      return;
    }
    const big = kind === 'walnut';
    Cy(0.1 * k * (big ? 2 : 1), 0.15 * k * (big ? 2 : 1), (big ? 3.2 : 1.7) * k, u, (big ? 1.6 : 0.85) * k, v, 0x5b4328);
    const cr = (big ? 2.4 : 1.35) * k, cy = (big ? 4.6 : 2.4) * k;
    Sp(cr, u, cy, v, gc());
    for (let i = 0; i < 4; i++) { const a = i * 1.6 + r(); Sp(cr * 0.7, u + Math.cos(a) * cr * 0.6, cy - cr * 0.15 + r() * 0.5, v + Math.sin(a) * cr * 0.6, gc()); }
    if (kind === 'apple') for (let i = 0; i < 7; i++) { const a = r() * 6.28; Sp(0.07, u + Math.cos(a) * cr * 0.95, cy - 0.3 + r() * 0.8, v + Math.sin(a) * cr * 0.95, 0xc83a2a); }
    if (kind === 'cherry') for (let i = 0; i < 7; i++) { const a = r() * 6.28; Sp(0.05, u + Math.cos(a) * cr * 0.95, cy - 0.3 + r() * 0.8, v + Math.sin(a) * cr * 0.95, 0x7a1424); }
  }

  // ---------- господарські дрібниці ----------
  function woodpile(u, v, ry = 0) {                            // дрова, складені поліно до поліна
    at(u, v, ry, () => {
      for (let row = 0; row < 4; row++) for (let i = 0; i < 12 - row; i++) Cy(0.08, 0.08, 1.0, -1.0 + i * 0.18 + row * 0.09, 0.09 + row * 0.15, 0, row % 2 ? 0x9a7a52 : 0x7d5e3c, { rx: Math.PI / 2, seg: 6 });
      B(0.08, 0.7, 0.08, -1.15, 0.35, 0.4, C.wood); B(0.08, 0.7, 0.08, 1.15, 0.35, 0.4, C.wood);
      B(0.08, 0.7, 0.08, -1.15, 0.35, -0.4, C.wood); B(0.08, 0.7, 0.08, 1.15, 0.35, -0.4, C.wood);
      col(2.5, 1.0);
    });
  }
  function haystack(u, v) {
    Cy(1.5, 1.5, 0.3, u, 0.15, v, 0xb89a48); Cy(0.0, 1.35, 2.4, u, 1.5, v, 0xc9a94e, { seg: 10 }); Cy(0.08, 0.08, 0.5, u, 2.95, v, 0xa88a40);
    colliders.push({ ...ww(u, v, 1.5) });
  }
  function bales(u, v) {
    for (const [dx, dy, dz] of [[0, 0, 0], [0.95, 0, 0], [0.45, 0.45, 0], [0, 0, 0.55], [0.95, 0, 0.55], [0.45, 0.45, 0.55]]) B(0.9, 0.42, 0.5, u + dx, 0.21 + dy, v + dz, 0xd0b455);
  }
  function well(u, v) {                                        // колодязь із кам'яним кільцем, дерев'яним навісом-двосхилком, воротом-колесом, ланцюгом і відром
    const wood = 0x4a3225, stones = [0x9a978f, 0x85827b, 0xa8a59c, 0x77746d, 0x8f8c84], hsh = i => (((i + 1) * 2654435761) >>> 0) / 4294967296;
    at(u, v, 0, () => {
      // кам'яне кільце: три ряди нетесаних каменів, верхні зміщені на пів-каменя, всередині заповнення
      Cy(0.56, 0.56, 0.9, 0, 0.45, 0, 0x6e6b64, { seg: 14 });
      const n = 13;
      for (let row = 0; row < 3; row++) for (let i = 0; i < n; i++) {
        const a = (i + (row % 2 ? 0.5 : 0)) * 2 * Math.PI / n, k = row * n + i;
        B(0.29 + hsh(k) * 0.07, 0.27 + hsh(k + 50) * 0.04, 0.2 + hsh(k + 99) * 0.05, Math.cos(a) * 0.58, 0.15 + row * 0.3, Math.sin(a) * 0.58, stones[(k * 7) % 5], { ry: -(a + Math.PI / 2) });
      }
      Cy(0.74, 0.74, 0.08, 0, 0.94, 0, wood, { seg: 14 });          // дерев'яний вінець
      Cy(0.38, 0.38, 0.02, 0, 0.99, 0, 0x14110e, { seg: 12 });      // темний отвір
      // плоскі камені навколо основи
      for (let i = 0; i < 10; i++) {
        const a = i * 0.63 + hsh(i) * 0.3, r = 1.0 + hsh(i + 20) * 0.45;
        B(0.34 + hsh(i + 5) * 0.2, 0.05, 0.3 + hsh(i + 9) * 0.15, Math.cos(a) * r, 0.02, Math.sin(a) * r, stones[i % 5], { ry: hsh(i + 30) * 3 });
      }
      // дві стійки, поперечна балка з ворітним валом і колесо зі спицями справа
      for (const sx of [-1, 1]) B(0.13, 1.65, 0.13, sx * 0.5, 0.98 + 0.83, 0, wood);
      B(1.2, 0.14, 0.14, 0, 2.05, 0, wood);
      Cy(0.035, 0.035, 1.75, 0.1, 2.05, 0, 0x2a2a2a, { rz: Math.PI / 2 });
      const wg = new THREE.TorusGeometry(0.22, 0.03, 6, 18); wg.rotateY(Math.PI / 2); wg.translate(0.86, 2.05, 0); put('plain', wg, wood);
      B(0.04, 0.44, 0.045, 0.86, 2.05, 0, wood); B(0.04, 0.045, 0.44, 0.86, 2.05, 0, wood);
      Cy(0.06, 0.06, 0.08, 0.86, 2.05, 0, 0x2a2a2a, { rz: Math.PI / 2, seg: 8 });
      // ланцюг (кілька ланок) і відро з металевими обручами
      for (let i = 0; i < 5; i++) B(0.02, 0.07, i % 2 ? 0.02 : 0.035, 0, 1.97 - i * 0.075, 0, 0x333333);
      Cy(0.15, 0.12, 0.3, 0, 1.45, 0, 0x8a6a45, { seg: 10, rz: 0.2 });
      for (const y of [1.55, 1.36]) Cy(0.152, 0.152, 0.025, 0 + (1.45 - y) * 0.2, y, 0, 0x2a2a2a, { seg: 10, rz: 0.2 });
      // навіс: двосхилий дах із темних дощок, хребет уздовж вала; низ даху на стійках
      gable(1.6, 1.2, 2.5, 0.55, 0.35, 0x3d2a1e, 0x4a3225, 'plank');
      col(1.9, 1.9);
    });
  }
  function laundry(u, v, r) {
    for (const s of [-1, 1]) B(0.09, 2.2, 0.09, u + s * 2.2, 1.1, v, C.wood);
    B(4.4, 0.012, 0.012, u, 2.0, v, 0xd8d8d8);
    for (let i = 0; i < 6; i++) B(0.42 + r() * 0.2, 0.55 + r() * 0.25, 0.015, u - 1.8 + i * 0.7, 1.7, v, [0xf2f2f2, 0xd8527a, 0x4a86c8, 0xf0d34a, 0x7ab86a, 0xe8e8e8][i]);
  }
  function barrel(u, v) { Cy(0.3, 0.3, 0.85, u, 0.43, v, 0x2e5fa0, { seg: 10 }); }
  function bench(u, v, ry = 0) {                               // лавочка біля воріт
    at(u, v, ry, () => {
      B(1.5, 0.05, 0.4, 0, 0.45, 0, C.wood); B(1.5, 0.3, 0.04, 0, 0.75, 0.2, C.wood);
      for (const s of [-1, 1]) B(0.06, 0.45, 0.35, s * 0.6, 0.22, 0, 0x555);
    });
  }
  function doghouse(u, v, ry, c) {
    at(u, v, ry, () => {
      B(0.8, 0.7, 0.9, 0, 0.35, 0, c, { kind: 'plank' });
      gable(0.9, 0.8, 0.7, 0.35, 0.12, 0x6a4634, c, 'stripe');
      B(0.4, 0.45, 0.05, 0, 0.27, -0.46, 0x1a1512);
    });
  }
  function dish(u, v, ry) {                                    // супутникова тарілка на стіні
    at(u, v, ry, () => { Sp(0.3, 0, 2.6, 0.2, 0xdedede, 1, 1, 0.25); B(0.04, 0.04, 0.3, 0, 2.6, 0.1, 0x555); });
  }
  function car(u, v, ry, c) {                                  // «жигулі» чи інша стара легковушка
    at(u, v, ry, () => {
      B(4.1, 0.65, 1.6, 0, 0.65, 0, c); B(2.0, 0.55, 1.45, -0.2, 1.2, 0, c);
      B(1.95, 0.4, 1.5, -0.2, 1.22, 0, 0x2a3440, { kind: 'glass' });
      for (const [x, z] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) Cy(0.32, 0.32, 0.22, x, 0.32, z, 0x1a1a1a, { rx: Math.PI / 2, seg: 10 });
      B(0.05, 0.2, 1.4, 2.05, 0.7, 0, 0x888888);
      col(4.4, 2);
    });
  }
  function greenhouse(u, v, r) {                               // теплиця з плівки: скляні стінки й дах
    at(u, v, 0, () => {
      B(2.6, 1.6, 6, 0, 0.8, 0, 0xa8c8b8, { kind: 'glass' });
      gable(2.6, 6, 1.6, 0.7, 0.05, 0xb8d4c4, 0xb8d4c4, 'glass');
      B(2.7, 0.08, 6.1, 0, 0.04, 0, 0xcfd2d0);
      for (const s of [-1, 1]) B(0.06, 1.6, 6.1, s * 1.3, 0.8, 0, 0xe8e8e0);
      col(2.8, 6.2);
    });
  }
  function ww(u, v, r) {                                       // світовий AABB круглого об'єкта на місці (u, v) у системі двору
    const p = new THREE.Vector3(u, 0, v).applyMatrix4(G);
    return { minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r };
  }

  // ---------- рослини городу ----------
  function crops(kind, u0, u1, v0, v1, r) {
    const w = u1 - u0, d = v1 - v0;
    B(w, 0.03, d, (u0 + u1) / 2, 0.015, (v0 + v1) / 2, C.soil);
    if (kind === 'potato') {                                    // рядки картоплі вздовж v
      for (let u = u0 + 0.5; u < u1 - 0.3; u += 0.8) {
        B(0.6, 0.18, d - 0.4, u, 0.1, (v0 + v1) / 2, 0x3c2a1c);
        B(0.55, 0.32, d - 0.5, u, 0.34, (v0 + v1) / 2, greens[Math.floor(r() * 5)]);
      }
    } else if (kind === 'cabbage') {
      for (let u = u0 + 0.5; u < u1 - 0.3; u += 0.65) for (let v = v0 + 0.5; v < v1 - 0.3; v += 0.65) {
        Sp(0.24, u, 0.22, v, 0x86b05a, 1, 0.8, 1); Sp(0.3, u, 0.17, v, 0x5f8f3f, 1, 0.35, 1);
      }
    } else if (kind === 'corn') {
      for (let u = u0 + 0.4; u < u1 - 0.2; u += 0.55) for (let v = v0 + 0.4; v < v1 - 0.2; v += 0.7) {
        const h = 1.9 + r() * 0.5, uu = u + (r() - 0.5) * 0.15, vv = v + (r() - 0.5) * 0.15;
        B(0.05, h, 0.05, uu, h / 2, vv, 0x5a8a34);
        for (const s of [-1, 1]) B(0.5, 0.02, 0.1, uu + s * 0.22, h * (0.55 + r() * 0.2), vv, 0x4c8030, { rz: s * 0.5 });
        B(0.1, 0.1, 0.16, uu, h * 0.62, vv + 0.1, 0xd8c050);
      }
    } else if (kind === 'sunflower') {
      for (let u = u0 + 0.5; u < u1 - 0.3; u += 0.9) for (let v = v0 + 0.5; v < v1 - 0.3; v += 1.0) {
        const h = 1.8 + r() * 0.5, uu = u + (r() - 0.5) * 0.2;
        B(0.06, h, 0.06, uu, h / 2, v, 0x4f7a30);
        Cy(0.24, 0.24, 0.06, uu, h, v - 0.04, 0xe9b81a, { rx: Math.PI / 2 - 0.3, seg: 10 });
        Cy(0.13, 0.13, 0.07, uu, h, v - 0.06, 0x4a3320, { rx: Math.PI / 2 - 0.3, seg: 8 });
        B(0.3, 0.02, 0.15, uu + 0.1, h * 0.55, v, 0x4c8030, { rz: 0.3 });
      }
    } else if (kind === 'bean' || kind === 'tomato') {
      for (let v = v0 + 0.6; v < v1 - 0.3; v += 1.0) {
        for (const u of [u0 + 0.4, u0 + w / 2, u1 - 0.4]) B(0.05, 1.5, 0.05, u, 0.75, v, C.wood);
      }
      for (let u = u0 + 0.4; u < u1 - 0.3; u += 0.9) {
        B(0.5, 1.2, d - 0.6, u, 0.65, (v0 + v1) / 2, kind === 'bean' ? 0x4f8a32 : 0x4f7a30);
        if (kind === 'tomato') for (let v = v0 + 0.6; v < v1 - 0.4; v += 0.7) Sp(0.06, u + (r() - 0.5) * 0.5, 0.4 + r() * 0.7, v, 0xd8321c);
      }
    } else {                                                    // onion/carrot: дрібні світлі рядки
      for (let u = u0 + 0.4; u < u1 - 0.2; u += 0.45) B(0.2, 0.2, d - 0.4, u, 0.12, (v0 + v1) / 2, 0x7fae4a);
    }
  }

  // ---------- паркан по вулиці ----------
  function frontFence(Y, r) {
    const gw = 3.6, ww_ = 0.95, gx = Y.gateU, wx = gx - Y.gs * (gw / 2 + 0.25 + ww_ / 2);
    const ops = [[gx - gw / 2, gx + gw / 2, 1], [wx - ww_ / 2, wx + ww_ / 2, 1]].sort((a, b) => a[0] - b[0]);
    const f = Y.fence, c = Y.fcol, H = f === 'sheet' ? 1.7 : f === 'wire' ? 1.5 : f === 'tyn' ? 1.4 : 1.2;
    const seg = (u0, u1, gate) => {
      const len = u1 - u0, mid = (u0 + u1) / 2;
      if (len < 0.05) return;
      if (f === 'picket') {
        const h = gate ? H + 0.2 : H, n = Math.round(len / 0.14);
        for (let i = 0; i < n; i++) B(0.09, h, 0.025, u0 + (i + 0.5) * len / n, h / 2 + 0.05, 0, c);
        for (const y of [0.3, h - 0.25]) B(len, 0.07, 0.04, mid, y, 0.03, c);
        if (gate) B(len * 1.05, 0.06, 0.04, mid, h / 2, 0.06, c, { rz: Math.atan2(h * 0.6, len) });
      } else if (f === 'sheet') {
        B(len, H, 0.03, mid, H / 2 + 0.05, 0, c, { kind: 'stripe' }); B(len, 0.06, 0.07, mid, H + 0.08, 0, 0x3a3f46);
      } else if (f === 'wire') {
        plane(len, H - 0.1, mid, H / 2 + 0.1, 0, 0, 0xc4c8ca); B(len, 0.04, 0.04, mid, H + 0.05, 0, 0x7d8286); B(len, 0.02, 0.02, mid, 0.1, 0, 0x7d8286);
        if (gate) B(len, 0.05, 0.05, mid, H / 2, 0, 0x7d8286);
      } else {                                                  // тин: плетений із лози, на кілках глечики
        const n = Math.round(len / 0.4);
        for (let i = 0; i <= n; i++) B(0.05, H + 0.1 * (i % 2), 0.05, u0 + i * len / n, H / 2, 0, 0x6b5238);
        for (let y = 0.2; y < H; y += 0.18) B(len, 0.07, 0.07, mid, y, ((y / 0.18) | 0) % 2 ? 0.03 : -0.03, [0x9a7a52, 0x8a6a45, 0xa88a60][(y / 0.18 | 0) % 3]);
        for (let i = 1; i < n; i += 3) Cy(0.1, 0.07, 0.22, u0 + i * len / n, H + 0.2, 0, 0xb5651d, { seg: 8 });
      }
    };
    let cur = -15;
    for (const [a, b] of ops) { seg(cur, a, false); cur = b; }
    seg(cur, 15, false);
    for (const [a, b] of ops) seg(a + 0.05, b - 0.05, true);
    const pillar = Y.pillars ? C.brickRed : f === 'sheet' ? 0x4a4f55 : c;
    for (const u of [gx - gw / 2 - 0.1, gx + gw / 2 + 0.1, wx - ww_ / 2 - 0.1, wx + ww_ / 2 + 0.1]) {
      if (Y.pillars) { B(0.42, 2.1, 0.42, u, 1.05, 0, pillar); B(0.55, 0.1, 0.55, u, 2.15, 0, 0xcfc9bb); } else B(0.14, 2.0, 0.14, u, 1.0, 0, pillar);
    }
    if (f !== 'picket') for (let u = -15; u <= 15; u += 3) if (!ops.some(([a, b]) => u > a - 0.4 && u < b + 0.4)) B(0.1, H + 0.2, 0.1, u, (H + 0.2) / 2, 0.04, f === 'sheet' ? 0x4a4f55 : f === 'tyn' ? 0x6b5238 : 0x7d8286);
    else for (let u = -15; u <= 15; u += 2.5) if (!ops.some(([a, b]) => u > a - 0.4 && u < b + 0.4)) B(0.12, H + 0.2, 0.12, u, (H + 0.2) / 2, 0.05, c);
    // колайдер: усі двори закриті зі вулиці
    const m = new THREE.Vector3(-15, 0, 0).applyMatrix4(G), m2 = new THREE.Vector3(15, 0, 0).applyMatrix4(G);
    colliders.push({ minX: Math.min(m.x, m2.x), maxX: Math.max(m.x, m2.x), minZ: m.z - 0.2, maxZ: m.z + 0.2 });
    return { gx, wx };
  }

  // боковий/задній паркан із сітки-рабиці на оцинкованих стовпах
  function wireFence(ua, va, ub, vb) {
    const len = Math.hypot(ub - ua, vb - va), ang = Math.atan2(vb - va, ub - ua), n = Math.round(len / 3);
    plane(len, 1.4, (ua + ub) / 2, 0.8, (va + vb) / 2, -ang, 0xb8bcbe);
    for (let i = 0; i <= n; i++) Cy(0.035, 0.035, 1.6, ua + (ub - ua) * i / n, 0.8, va + (vb - va) * i / n, 0xaab0b4, { seg: 6 });
    B(len, 0.03, 0.03, (ua + ub) / 2, 1.5, (va + vb) / 2, 0xaab0b4, { ry: -ang });
  }

  // ---------- тварини (дивляться в бік +x локальної системи, ноги на y = 0) ----------
  const geos = {};
  const animalGeo = (key, fn) => geos[key] || (geos[key] = makeGeo(fn));
  const cowGeo = (coat, patch) => animalGeo('cow' + coat + patch, () => {
    B(1.7, 0.75, 0.65, 0, 1.05, 0, coat);
    for (const [x, z] of [[0.6, 0.22], [0.6, -0.22], [-0.6, 0.22], [-0.6, -0.22]]) B(0.14, 0.7, 0.14, x, 0.35, z, coat);
    for (const [x, z] of [[0.6, 0.22], [0.6, -0.22], [-0.6, 0.22], [-0.6, -0.22]]) B(0.15, 0.1, 0.15, x, 0.05, z, 0x2a2420);
    B(0.5, 0.4, 0.4, 0.95, 1.2, 0, coat, { rz: -0.4 });
    B(0.45, 0.3, 0.3, 1.25, 1.0, 0, coat, { rz: -0.35 }); B(0.14, 0.22, 0.26, 1.46, 0.94, 0, 0xd8a0a0);
    for (const s of [-1, 1]) { B(0.05, 0.1, 0.2, 1.12, 1.2, s * 0.23, coat); B(0.04, 0.2, 0.04, 1.15, 1.32, s * 0.12, 0xe8e2d0); B(0.04, 0.04, 0.04, 1.36, 1.08, s * 0.15, 0x111111); }
    B(0.25, 0.15, 0.3, -0.35, 0.62, 0, 0xe0a8a8);
    B(0.04, 0.75, 0.04, -0.9, 0.95, 0, coat, { rz: 0.1 }); B(0.07, 0.18, 0.07, -0.95, 0.5, 0, 0x2a2420);
    if (patch !== coat) { B(0.6, 0.55, 0.67, 0.2, 1.12, 0, patch); B(0.45, 0.45, 0.67, -0.55, 1.02, 0, patch); B(0.3, 0.3, 0.42, 0.9, 1.22, 0, patch, { rz: -0.4 }); }
  });
  const pigGeo = pink => animalGeo('pig' + pink, () => {
    Sp(0.3, 0, 0.5, 0, pink, 1.8, 1.1, 1.0); Sp(0.2, 0.6, 0.5, 0, pink, 1, 1, 0.95);
    Cy(0.1, 0.1, 0.1, 0.78, 0.45, 0, 0xd49a96, { rz: Math.PI / 2, seg: 8 });
    for (const [x, z] of [[0.35, 0.15], [0.35, -0.15], [-0.35, 0.15], [-0.35, -0.15]]) B(0.1, 0.25, 0.1, x, 0.13, z, pink);
    for (const s of [-1, 1]) B(0.1, 0.12, 0.05, 0.55, 0.72, s * 0.14, 0xd49a96, { rx: s * 0.3 });
    B(0.04, 0.04, 0.1, -0.55, 0.62, 0, 0xd49a96, { rz: 0.5 });
  });
  const goatGeo = (coat, dark) => animalGeo('goat' + coat + dark, () => {
    B(0.85, 0.4, 0.32, 0, 0.7, 0, coat);
    for (const [x, z] of [[0.3, 0.1], [0.3, -0.1], [-0.3, 0.1], [-0.3, -0.1]]) B(0.05, 0.5, 0.05, x, 0.25, z, dark);
    B(0.3, 0.4, 0.2, 0.5, 0.95, 0, coat, { rz: -0.4 }); B(0.24, 0.16, 0.16, 0.7, 1.1, 0, coat);
    for (const s of [-1, 1]) { B(0.04, 0.2, 0.04, 0.62, 1.25, s * 0.06, 0x3a3228, { rz: 0.5 }); B(0.08, 0.04, 0.1, 0.62, 1.12, s * 0.14, dark); }
    B(0.03, 0.14, 0.03, 0.8, 0.98, 0, dark); B(0.15, 0.04, 0.04, -0.45, 0.85, 0, coat, { rz: 0.6 });
  });
  const henGeo = (c, rooster) => animalGeo('hen' + c + rooster, () => {
    const k = rooster ? 1.3 : 1;
    Sp(0.13 * k, 0, 0.27 * k, 0, c, 1.3, 1, 0.85); Sp(0.05 * k, 0.15 * k, 0.4 * k, 0, c);
    B(0.04 * k, 0.05 * k, 0.015, 0.15 * k, 0.46 * k, 0, 0xc02a1c); B(0.04 * k, 0.025, 0.03, 0.21 * k, 0.4 * k, 0, 0xe8b830);
    B(0.2 * k, 0.2 * k, 0.03, -0.2 * k, 0.38 * k, 0, rooster ? 0x2e5a3a : c, { rz: 0.9 });
    for (const s of [-1, 1]) B(0.015, 0.14 * k, 0.015, 0, 0.07 * k, s * 0.04, 0xe8b830);
  });
  const gooseGeo = animalGeo('goose', () => {
    Sp(0.2, 0, 0.35, 0, 0xf4f4f0, 1.6, 1, 0.9); B(0.06, 0.4, 0.06, 0.28, 0.6, 0, 0xf4f4f0, { rz: -0.25 }); Sp(0.06, 0.34, 0.82, 0, 0xf4f4f0);
    B(0.1, 0.04, 0.05, 0.42, 0.8, 0, 0xe8801c); B(0.25, 0.1, 0.15, -0.38, 0.4, 0, 0xf4f4f0, { rz: 0.4 });
    for (const s of [-1, 1]) B(0.025, 0.2, 0.025, 0, 0.1, s * 0.07, 0xe8801c);
  });
  const dogGeo = (c, c2) => animalGeo('dog' + c + c2, () => {
    B(0.75, 0.28, 0.26, 0, 0.5, 0, c); B(0.28, 0.24, 0.26, 0.28, 0.52, 0, c2);
    for (const [x, z] of [[0.3, 0.09], [0.3, -0.09], [-0.28, 0.09], [-0.28, -0.09]]) B(0.07, 0.36, 0.07, x, 0.18, z, c);
    B(0.26, 0.22, 0.22, 0.52, 0.72, 0, c); B(0.14, 0.1, 0.14, 0.68, 0.66, 0, c2);
    for (const s of [-1, 1]) B(0.06, 0.14, 0.04, 0.5, 0.78, s * 0.12, 0x2a2420, { rx: s * 0.4 });
    B(0.3, 0.05, 0.05, -0.45, 0.62, 0, c, { rz: 0.9 });
  });
  const catGeo = c => animalGeo('cat' + c, () => {
    Sp(0.12, 0, 0.18, 0, c, 1, 1.3, 0.9); Sp(0.08, 0.04, 0.42, 0, c);
    for (const s of [-1, 1]) B(0.03, 0.07, 0.03, 0.04, 0.5, s * 0.05, c);
    B(0.3, 0.04, 0.04, -0.15, 0.04, 0.06, c, { ry: 0.5 });
  });

  const animals = [];
  function animal(Y, geo, kind, u, v, yaw, o = {}) {
    const m = new THREE.Mesh(geo, mats.plain);
    m.rotation.order = 'YZX';
    m.position.set(Y.cx + Y.s * u, o.y || 0, Y.zf + Y.s * v);
    m.rotation.y = yaw + (Y.s < 0 ? Math.PI : 0);
    if (o.k) m.scale.setScalar(o.k);
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    animals.push({ m, kind, ph: (u * 7.3 + v * 3.1) % 6.28 });
    return m;
  }

  // ---------- електроввід у хату ----------
  // дріт від найближчого стовпа ЛЕП на вулиці йде на гак-ізолятор у щипці хати (з лічильником на стіні під ним); якщо хата далеко від вулиці або стовп стоїть
  // навпроти самої хати (дріт перетнув би дах), біля хати ставимо ще один стовп, а від нього вже короткий дріт на гак
  const poleZ = plot.d / 2 + 1.8, poles = [-100, -60, -20, 20, 60, 100];   // північне узбіччя (наш бік)
  const poleZS = street.z0 + street.w + 1.2, polesS = [-80, -40, 0, 40, 80];   // південне узбіччя: свої стовпи, щоб дроти не перетинали дорогу (висока техніка)
  const rowOf = side => side === "N" ? { z: poleZ, xs: poles } : { z: poleZS, xs: polesS };
  function seg3(a, b, r, color) {                                           // тонкий циліндр між двома довільними точками світу
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), v = Bv.clone().sub(A), m = A.clone().add(Bv).multiplyScalar(0.5);
    const g = new THREE.CylinderGeometry(r, r, v.length(), 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v.normalize()));
    g.translate(m.x, m.y, m.z);
    put('plain', g, color);
  }
  function sagWire(a, b, r = 0.017) {                                       // провід із провисом ~3 % довжини
    const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b), len = A.distanceTo(Bv), N = Math.max(4, Math.round(len / 1.5)), sag = len * 0.03;
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const t = i / N, p = A.clone().lerp(Bv, t);
      p.y -= sag * 4 * t * (1 - t);
      if (prev) seg3(prev.toArray(), p.toArray(), r, 0x1a1a1a);
      prev = p;
    }
  }
  function planService(Mh, hw, hd, row) {                                        // який кінець хати й від якого стовпа; чи треба свій стовп
    const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(Mh);
    let best = null;
    for (const e of [-1, 1]) {
      const tip = W(e * (hw / 2 + 0.55), 3.7, 0), base = W(e * hw / 2, 3.7, 0);
      for (const px of row.xs) { const d = Math.hypot(tip.x - px, tip.z - row.z); if (!best || d < best.d) best = { e, tip, base, px, pz: row.z, d }; }
    }
    const xs = [-1, 1].flatMap(sx => [-1, 1].map(sz => W(sx * hw / 2, 0, sz * hd / 2).x));
    best.direct = best.d <= 14 && (best.px < Math.min(...xs) - 0.5 || best.px > Math.max(...xs) + 0.5);
    return best;
  }
  function drawService(plan, Mh, hw, hd, Gy, reserve) {
    const W = (x, y, z) => new THREE.Vector3(x, y, z).applyMatrix4(Mh);
    const sT = T, sG = G;
    T = new THREE.Matrix4(); G = new THREE.Matrix4();                       // далі малюємо у світових координатах
    const { tip, base, e } = plan, dirv = tip.clone().sub(base).normalize(), back = tip.clone().addScaledVector(dirv, -0.05);
    seg3(base.toArray(), tip.toArray(), 0.014, 0x8f959a);                   // гак зі сталевого стрижня
    seg3(back.toArray(), tip.toArray(), 0.035, 0xe8e8e2);                   // білий ізолятор-котушка
    const S = [plan.px, 6.8, plan.pz];
    if (plan.direct) sagWire(S, tip.toArray());
    else {
      const P = W(e * (hw / 2 + 1.6), 0, -(hd / 2 + 1.5));                  // власний стовп перед кутом хати, трохи осторонь кінця
      B(0.2, 6.4, 0.2, P.x, 3.2, P.z, 0x9a9a95); B(0.1, 0.1, 1.2, P.x, 6.0, P.z, 0x6a4a30);
      for (const dz of [-0.45, 0.45]) Cy(0.04, 0.04, 0.14, P.x, 6.15, P.z + dz, 0xdddddd, { seg: 6 });
      colliders.push({ minX: P.x - 0.2, maxX: P.x + 0.2, minZ: P.z - 0.2, maxZ: P.z + 0.2 });
      sagWire(S, [P.x, 6.2, P.z]);                                          // від вуличного стовпа на власний
      sagWire([P.x, 6.1, P.z], tip.toArray());                              // і короткий дріт від нього на гак
      const Pl = P.clone().applyMatrix4(Gy.clone().invert());
      reserve(Pl.x, Pl.z, 1.0, 1.0);
    }
    T = sT; G = sG;
  }
  function meterAt(e, hw, hd) {                                             // лічильник на торцевій стіні у кутку (у системі хати), під гаком
    const x = e * (hw / 2 + 0.07), grey = 0xc9cbcc;
    B(0.14, 0.32, 0.22, x, 1.55, hd / 2 - 0.4, grey);
    B(0.02, 0.26, 0.18, x + e * 0.08, 1.55, hd / 2 - 0.4, 0x9fb4bf, { kind: 'glass' });
    Cy(0.055, 0.055, 0.01, x + e * 0.09, 1.6, hd / 2 - 0.4, 0xf2f0e8, { rz: Math.PI / 2, seg: 12 });
    B(0.006, 0.03, 0.12, x + e * 0.095, 1.5, hd / 2 - 0.4, 0x1a1d20);
  }
  function gasAt(e, hw, hd) {                                               // газ як у нас: труба виходить із землі між вікнами торця хати, кран, лічильник і в стіну (у системі хати)
    const x = e * (hw / 2 + 0.2), z = 0, yel = 0xe8b820;
    B(0.3, 0.08, 0.3, x, 0.04, z, C.concrete);                              // бетонна плитка навколо виходу
    Cy(0.017, 0.017, 1.8, x, 0.9, z, yel, { seg: 8 });                      // жовта труба з землі
    B(0.08, 0.05, 0.05, x, 0.95, z, yel); B(0.1, 0.015, 0.02, x, 0.99, z, 0xc03a2b);   // відключний кран із червоною ручкою
    B(0.14, 0.3, 0.22, x, 1.5, z, 0xb9bcbe);                                // лічильник газу
    B(0.012, 0.05, 0.12, x + e * 0.071, 1.55, z, 0x303535);
    Sp(0.021, x, 1.8, z, yel);                                             // коліно й вихід у стіну
    Cy(0.017, 0.017, 0.2 - 0.03, x - e * 0.1, 1.8, z, yel, { rz: Math.PI / 2, seg: 8 });
  }
  function woodHeatAt(e, hw, hd) {                                          // піч на дровах: біля торця складені дрова, колода-колун із сокирою, тріски
    const x = e * (hw / 2 + 0.55), z = hd / 2 - 1.6;
    for (let row = 0; row < 5; row++) for (let i = 0; i < 9 - row; i++)
      Cy(0.075, 0.075, 0.55, x, 0.08 + row * 0.14, z - 0.8 + i * 0.17 + row * 0.085, row % 2 ? 0x9a7a52 : 0x7d5e3c, { rz: Math.PI / 2, seg: 6 });
    for (const dz of [-1.0, 1.0]) for (const dx of [-0.28, 0.28]) B(0.07, 0.8, 0.07, x + dx, 0.4, z + dz, C.wood);   // стійки дровітні
    const bx = e * (hw / 2 + 1.7), bz = z + 1.8;   // колода-колун і сокира
    Cy(0.22, 0.24, 0.42, bx, 0.21, bz, 0x7a5a3a, { seg: 9 });
    B(0.03, 0.4, 0.03, bx, 0.62, bz, C.wood, { rz: 0.5 }); B(0.12, 0.09, 0.015, bx - 0.09, 0.8, bz, 0x6e7478);
    for (let i = 0; i < 9; i++) { const a = i * 2.4; Cy(0.04, 0.04, 0.22 + (i % 3) * 0.04, bx + Math.cos(a) * (0.5 + (i % 4) * 0.12), 0.04, bz + Math.sin(a) * (0.5 + (i % 3) * 0.15), i % 2 ? 0x9a7a52 : 0xb08a5a, { rx: Math.PI / 2, seg: 6 }); }
    at(x, z, 0, () => col(0.9, 2.1));
  }

  // ---------- один двір ----------
  function buildYard(Y, idx) {
    const r = rng0(101 + idx * 77), pick = a => a[Math.floor(r() * a.length)];
    const s = Y.side === 'N' ? -1 : 1;
    Y.s = s; Y.zf = s < 0 ? plot.d / 2 : street.z0 + street.w + 3;
    G = new THREE.Matrix4().makeRotationY(s < 0 ? Math.PI : 0).setPosition(Y.cx, 0, Y.zf);
    T = new THREE.Matrix4();
    const rects = [], gs = Y.gs, free = (u, v, rad) => !rects.some(q => u > q.u0 - rad && u < q.u1 + rad && v > q.v0 - rad && v < q.v1 + rad);
    const reserve = (u, v, hu, hv) => rects.push({ u0: u - hu, u1: u + hu, v0: v - hv, v1: v + hv });
    const hr = (a, b) => a + r() * (b - a);

    frontFence(Y, r);
    // бічні й задній паркани: з рабиці; між сусідніми дворами лінія спільна — будуємо лише одну
    const uOf = wx => (wx - Y.cx) * s;
    if (Y.sideW) wireFence(uOf(Y.cx - 15), 0.3, uOf(Y.cx - 15), 80);
    if (Y.sideE) wireFence(uOf(Y.cx + 15), 0.3, uOf(Y.cx + 15), 80);
    wireFence(-15, 80, 15, 80);

    // хата
    const long = Y.orient === 'long', hw = hr(9.5, 12), hd = hr(5.8, 7), set = hr(6, 10);
    const cu = -gs * (long ? hr(2, 4) : hr(4, 6)), hv = set + (long ? hd : hw) / 2;
    const ry = long ? 0 : gs * Math.PI / 2;
    let door;
    at(cu, hv, ry, () => {
      door = house({ w: hw, d: hd, H: 2.8, wall: Y.wall, plinth: Y.plinth, roof: Y.roof, shutter: Y.shutter, r, porch: true, doorSlot: pick([0, 99]), rise: hr(1.8, 2.4), frame: Y.frame });
      if (Y.dish) dish(0, -hd / 2, Math.PI);
    });
    const hhu = (long ? hw : hd) / 2 + 1.2, hhv = (long ? hd : hw) / 2 + 1.5;
    reserve(cu, hv, hhu, hhv);
    // електроввід: гак у щипці, лічильник на торці, стовп — власний або вуличний
    const Mh = new THREE.Matrix4();
    at(cu, hv, ry, () => Mh.copy(G).multiply(T));
    const plan = planService(Mh, hw, hd, rowOf(Y.side));
    const wood = Y.extra.includes('woodpile');                              // піч на дровах у дворах із дровітнею, решта на газу
    at(cu, hv, ry, () => { meterAt(plan.e, hw, hd); if (wood) woodHeatAt(plan.e, hw, hd); else gasAt(plan.e, hw, hd); });
    drawService(plan, Mh, hw, hd, G.clone(), reserve);
    const frontV = hv - (long ? hd : hw) / 2, backV = hv + (long ? hd : hw) / 2;

    // шлях від ґанку до хвіртки, під'їзд до хліва
    const doorU = long ? cu + door.slotX(door.ds) : cu - gs * (hd / 2 + 0.8);
    B(0.9, 0.025, frontV - 1.0, doorU, 0.013, (frontV + 1.0) / 2, 0xb9b2a4);
    // літня кухня (ззаду хати)
    const kw = hr(4.6, 5.6), kd = hr(3.6, 4.4), ku = cu + (long ? 0 : -gs * 0), kv = backV + 2.6 + kd / 2;
    at(ku, kv, 0, () => house({ w: kw, d: kd, H: 2.4, wall: Y.kitchenWall, plinth: Y.plinth, roof: Y.roof2 || Y.roof, shutter: Y.shutter, r, small: true, doorSlot: 0, rise: 1.3, frame: Y.frame, chimney: -0.25 }));
    reserve(ku, kv, kw / 2 + 1, kd / 2 + 1);
    // хлів і загін
    const bu = gs * 8, bw = hr(6, 8), bd = hr(3.6, 4.4), bv = Math.max(24, kv + 3);
    at(bu, bv, 0, () => barn({ w: bw, d: bd, H: 2.3, wall: Y.barnBlock ? 0xe8e4d6 : pick([0x8c7a62, 0x7a6a56, 0x9a8668]), block: Y.barnBlock, roof: pick([C.slate, C.rust, C.slate]), r }));
    reserve(bu, bv, bw / 2 + 0.8, bd / 2 + 0.8);
    const penU0 = bu - bw / 2, penU1 = bu + bw / 2 - 1.8, penV0 = bv - bd / 2 - 4.5, penV1 = bv - bd / 2;
    if (Y.animals.includes('pigs') || Y.animals.includes('goats')) { pen(penU0, penU1, penV0, penV1); reserve((penU0 + penU1) / 2, (penV0 + penV1) / 2, (penU1 - penU0) / 2, 2.3); }
    B(1.4, 0.02, 3, bu + bw / 2 - 0.9, 0.012, bv - bd / 2 - 1.8, C.dirt);
    B(3.2, 0.015, bv - bd / 2, Y.gateU, 0.01, (bv - bd / 2) / 2, C.dirt);
    // курник
    const hu0 = -gs * hr(10, 12), hvv = hr(16, 22);
    at(hu0, hvv, 0, () => { B(1.8, 1.0, 1.4, 0, 1.0, 0, 0x8a6a45, { kind: 'plank' }); B(0.2, 1.0, 0.2, 0.7, 0.5, 0.5, C.wood); B(0.2, 1.0, 0.2, -0.7, 0.5, 0.5, C.wood); B(0.2, 1.0, 0.2, 0.7, 0.5, -0.5, C.wood); B(0.2, 1.0, 0.2, -0.7, 0.5, -0.5, C.wood); B(2.0, 0.05, 1.7, 0, 1.55, 0, 0x6a4634, { rx: 0.15 }); B(0.4, 0.5, 0.04, 0, 0.9, -0.72, 0x1a1512); B(0.3, 0.04, 1, 0, 0.45, -1.1, C.wood, { rx: 0.45 }); col(2.2, 1.8); });
    reserve(hu0, hvv, 1.6, 1.6);

    // дрібні господарські речі
    if (Y.extra.includes('woodpile')) { woodpile(-gs * 12.2, kv + 1, Math.PI / 2); reserve(-gs * 12.2, kv + 1, 1, 1.4); }
    if (Y.extra.includes('hay')) { haystack(-gs * 10, bv + 2); reserve(-gs * 10, bv + 2, 1.8, 1.8); bales(bu + 1.5, bv + bd / 2 + 1.5); }
    if (Y.extra.includes('well')) { well(-gs * 9, frontV - 2.5); reserve(-gs * 9, frontV - 2.5, 3, 1.5); }
    if (Y.extra.includes('laundry')) { laundry(cu, backV + 1.3, r); reserve(cu, backV + 1.3, 2.4, 0.6); }
    if (Y.extra.includes('barrel')) barrel(cu + (long ? hw / 2 + 0.4 : hd / 2 + 0.4), backV - 0.3);
    if (Y.extra.includes('greenhouse')) { greenhouse(-gs * 7.5, bv + 11.5, r); reserve(-gs * 7.5, bv + 11.5, 1.6, 3.2); }
    if (Y.extra.includes('car')) { car(Y.gateU, set - 1.6, Math.PI / 2, Y.carC); reserve(Y.gateU, set - 1.6, 2.4, 1.2); }
    if (Y.extra.includes('bench')) bench(-gs * 8, 1.2, 0);

    // палісадник: мальви вздовж паркану й квіти під вікнами
    if (Y.extra.includes('mallows')) for (let u = -13; u < 13; u += 0.9) {
      if (Math.abs(u - Y.gateU) < 2.2 || Math.abs(u - (Y.gateU - gs * 2.6)) < 1.0 || r() < 0.2) continue;
      const h = 1.5 + r() * 0.7;
      B(0.04, h, 0.04, u, h / 2, 0.7, 0x4f7a30);
      for (let i = 0; i < 5; i++) Sp(0.09, u + (r() - 0.5) * 0.1, h * (0.5 + i * 0.11), 0.7 + (r() - 0.5) * 0.1, pick([0xd8527a, 0xe8a0b8, 0xf2f0e8, 0xb02a50]));
    }
    // квіти під вікнами
    for (let i = 0; i < 18; i++) {
      const fu = cu + (r() - 0.5) * (long ? hw : hd) * 0.9, fv = frontV - 0.4 - r() * 0.5;
      B(0.03, 0.4, 0.03, fu, 0.2, fv, 0x4f7a30); Sp(0.08, fu, 0.45, fv, pick([0xe8c030, 0xd8321c, 0xf2f0e8, 0xc050c0, 0xf08030]));
    }

    // город: смуги за господарством
    const vg0 = Math.max(kv + kd / 2, bv + bd / 2) + 4, vg1 = 76;
    let u = -13.5, k = 0;
    while (u < 13) {
      const wd = hr(4, 6.5), u1 = Math.min(u + wd, 13.5);
      if (u1 - u > 2.5) {
        const kind = Y.crops[k++ % Y.crops.length], vEnd = vg1 - r() * 6;
        crops(kind, u, u1, vg0 + (r() < 0.5 ? 0 : 1.5), vEnd, r);
        reserve((u + u1) / 2, (vg0 + vEnd) / 2, (u1 - u) / 2, (vEnd - vg0) / 2);
      }
      u = u1 + 0.8;
    }
    // дерева: плодові по двору й уздовж заднього паркану, горіх або липа
    const kinds = ['apple', 'apple', 'cherry', 'fruit', 'fruit'];
    for (let n = 0, tries = 0; n < 11 && tries < 200; tries++) {
      const tu = hr(-13.5, 13.5), tv = hr(3, 30);
      if (!free(tu, tv, 1.5) || (Math.abs(tu - Y.gateU) < 3.2 && tv < bv)) continue;
      tree(tu, tv, hr(0.85, 1.25), pick(kinds), r); reserve(tu, tv, 1.2, 1.2); n++;
    }
    for (let tu = -13; tu < 13.5; tu += hr(3.5, 5)) tree(tu, hr(77, 79), hr(0.9, 1.3), pick(kinds), r);
    if (Y.walnut) { const wu = -gs * 12, wv = frontV + 12; tree(wu, wv, 1.2, 'walnut', r); reserve(wu, wv, 2.5, 2.5); }

    // тварини
    const hens = Y.animals.includes('hens'), geese = Y.animals.includes('geese');
    if (hens) for (let i = 0; i < 7; i++) animal(Y, henGeo(pick([0xf0eadc, 0xa8602a, 0x3a2e28, 0xc89a50]), i === 0), 'hen', hu0 + hr(-3, 3), hvv + hr(-4, 3), hr(0, 6.28));
    if (geese) for (let i = 0; i < 4; i++) animal(Y, gooseGeo, 'goose', hr(-9, -3) * gs + gs * 2, hr(8, 14), hr(0, 6.28));
    if (Y.animals.includes('pigs')) for (let i = 0; i < 3; i++) animal(Y, pigGeo(pick([0xe8b4a8, 0xe0a898, 0xd89888])), 'pig', hr(penU0 + 1, penU1 - 1), hr(penV0 + 1, penV1 - 1), hr(0, 6.28));
    if (Y.animals.includes('goats')) for (let i = 0; i < 3; i++) animal(Y, goatGeo(...pick([[0xeeeadf, 0xc8c2b0], [0x7a5b3f, 0x4a3828], [0xf2f0e8, 0x3a322a]])), 'goat', hr(penU0 + 1, penU1 - 1), hr(penV0 + 1, penV1 - 1), hr(0, 6.28));
    if (Y.animals.includes('cow')) {
      const cu0 = -gs * 6, cv0 = Math.max(bv + 8, vg0 - 3);
      animal(Y, cowGeo(...pick([[0xece8e0, 0x2a2420], [0xece8e0, 0x7a4a2a], [0x8a4a2a, 0x8a4a2a]])), 'cow', gs * 3, hr(bv + 6, bv + 10), hr(0, 6.28));
      B(0.05, 0.7, 0.05, gs * 3 + 1.5, 0.35, bv + 7, C.wood);
    }
    if (Y.animals.includes('dog')) { const du = Y.gateU + gs * 4.2, dv = 4; doghouse(du, dv, Math.PI * 0.5, 0x6a8f58); animal(Y, dogGeo(...pick([[0x2a2622, 0xe8e2d0], [0x7a5a3a, 0x4a3524], [0x9a9890, 0x6a6a64]])), 'dog', du - 1.2 * gs, dv + 0.3, gs > 0 ? Math.PI * 1.6 : Math.PI * 0.4); }
    if (Y.animals.includes('cat')) animal(Y, catGeo(pick([0xd88a3a, 0x2a2622, 0xb8b4aa])), 'cat', long ? cu + door.slotX(door.ds) + 0.7 : doorU + 0.5, frontV - 1.4, hr(0, 6.28), { y: 0.2 });
    // на узбіччі: корова чи коза на прив'язі
    if (Y.verge) {
      const vu = Y.gateU - gs * 9, vv = -1.8;
      animal(Y, Y.verge === 'cow' ? cowGeo(0xece8e0, 0x2a2420) : goatGeo(0xeeeadf, 0xc8c2b0), Y.verge, vu, vv, Math.PI / 2 + hr(-0.4, 0.4), { k: Y.verge === 'goat' ? 1.15 : 1 });
      B(0.06, 0.4, 0.06, vu + 1.2, 0.2, vv - 0.9, C.wood);
      const p = new THREE.Vector3(vu, 0, vv).applyMatrix4(G);
      colliders.push({ minX: p.x - 0.9, maxX: p.x + 0.9, minZ: p.z - 0.5, maxZ: p.z + 0.5 });
    }
    // на лавці з протилежного боку — коти-ледарі на воротах
    if (Y.catFence) animal(Y, catGeo(0xd88a3a), 'cat', Y.gateU + gs * 2.1, 0.0, Math.PI * 0.8, { y: 1.4 });
  }

  // ---------- двори: хата, колір паркану, живність, город ----------
  const yards = [
    // північний бік (праворуч і ліворуч від нашої ділянки), x — центр двору
    { side: 'N', cx: -30, gs: 1, wall: C.white, plinth: C.fBlue, roof: C.slate, shutter: C.fBlue, orient: 'long', fence: 'picket', fcol: C.fWhite, kitchenWall: C.white, animals: ['hens', 'geese', 'cat', 'dog'], extra: ['mallows', 'greenhouse', 'barrel'], crops: ['potato', 'cabbage', 'tomato', 'potato'], barnBlock: false, dish: true, sideW: true, walnut: false, catFence: true },
    { side: 'N', cx: -60, gs: -1, wall: C.brick, plinth: 0x4a4a48, roof: C.green, shutter: C.fGreen, orient: 'gable', fence: 'sheet', fcol: C.fBrown, kitchenWall: C.cream, animals: ['goats', 'dog', 'cat', 'hens'], extra: ['bench', 'laundry', 'woodpile'], crops: ['potato', 'onion', 'corn'], barnBlock: true, sideW: true, pillars: true, verge: 'goat' },
    { side: 'N', cx: -90, gs: 1, wall: C.paleBlue, plinth: C.fBlue, roof: C.slate, shutter: C.white, orient: 'long', fence: 'wire', fcol: 0x9ca0a2, kitchenWall: C.paleBlue, animals: ['pigs', 'cow', 'hens', 'dog'], extra: ['well', 'hay', 'car'], crops: ['potato', 'corn', 'cabbage'], carC: 0xc8c4b0, sideW: true, sideE: false, walnut: true, verge: 'cow' },
    { side: 'N', cx: 30, gs: -1, wall: C.white, plinth: C.fGreen, roof: C.green, shutter: 0x6b3f22, orient: 'long', fence: 'sheet', fcol: C.fBlue, kitchenWall: C.white, animals: ['cow', 'dog', 'hens'], extra: ['barrel', 'mallows', 'woodpile'], crops: ['sunflower', 'corn', 'potato', 'tomato'], barnBlock: false, sideW: false, verge: 'cow', roof2: C.slate },
    { side: 'N', cx: 60, gs: 1, wall: C.peach, plinth: C.brown, roof: C.slate, shutter: C.fGreen, orient: 'gable', fence: 'tyn', fcol: 0x8a6a45, kitchenWall: C.peach, animals: ['pigs', 'goats', 'hens', 'cat'], extra: ['well', 'woodpile', 'hay'], crops: ['potato', 'bean', 'cabbage', 'onion'], barnBlock: false, sideW: true, walnut: true },
    { side: 'N', cx: 90, gs: -1, wall: C.grey, plinth: C.fRed, roof: C.brown, shutter: null, orient: 'long', fence: 'picket', fcol: C.fNat, kitchenWall: C.grey, animals: ['geese', 'hens', 'dog', 'cat'], extra: ['car', 'laundry', 'barrel'], crops: ['corn', 'potato', 'sunflower'], carC: 0x6a8f58, sideW: true, sideE: true, dish: true, catFence: true },
    // південний бік (навпроти)
    { side: 'S', cx: -90, gs: 1, wall: C.yellow, plinth: C.brown, roof: C.red, shutter: C.fBrown, orient: 'long', fence: 'picket', fcol: C.fGreen, kitchenWall: C.cream, animals: ['hens', 'dog', 'cat', 'goats'], extra: ['mallows', 'bench', 'woodpile'], crops: ['potato', 'tomato', 'onion'], sideW: true },
    { side: 'S', cx: -60, gs: -1, wall: C.white, plinth: C.fBlue, roof: C.slate, shutter: C.fBlue, orient: 'gable', fence: 'sheet', fcol: C.fGreen, kitchenWall: C.white, animals: ['cow', 'pigs', 'hens', 'dog'], extra: ['well', 'hay', 'barrel'], crops: ['potato', 'corn', 'cabbage'], barnBlock: true, sideW: true, walnut: true, verge: 'cow' },
    { side: 'S', cx: -30, gs: 1, wall: C.mint, plinth: 0x4a4a48, roof: C.blue, shutter: C.white, orient: 'long', fence: 'wire', fcol: 0x9ca0a2, kitchenWall: C.mint, animals: ['geese', 'hens', 'cat'], extra: ['greenhouse', 'laundry', 'mallows'], crops: ['cabbage', 'potato', 'tomato'], sideW: true, dish: true, pillars: true },
    { side: 'S', cx: 0, gs: -1, wall: C.brick, plinth: 0x4a4a48, roof: C.slate, shutter: C.fGreen, orient: 'long', fence: 'picket', fcol: C.fBlue, kitchenWall: C.cream, animals: ['goats', 'dog', 'hens', 'cat'], extra: ['car', 'woodpile', 'mallows'], crops: ['potato', 'sunflower', 'corn'], carC: 0xe8e4d6, sideW: true, verge: 'goat', catFence: true },
    { side: 'S', cx: 30, gs: 1, wall: C.cream, plinth: C.fRed, roof: C.brown, shutter: C.fBlue, orient: 'gable', fence: 'sheet', fcol: C.fBrown, kitchenWall: C.cream, animals: ['pigs', 'cow', 'hens', 'dog'], extra: ['hay', 'barrel', 'well'], crops: ['corn', 'potato', 'bean'], sideW: true, barnBlock: false, walnut: true },
    { side: 'S', cx: 60, gs: -1, wall: C.white, plinth: C.fGreen, roof: C.slate, shutter: C.fGreen, orient: 'long', fence: 'tyn', fcol: 0x8a6a45, kitchenWall: C.white, animals: ['goats', 'geese', 'dog', 'cat'], extra: ['bench', 'laundry', 'mallows'], crops: ['potato', 'cabbage', 'onion', 'tomato'], sideW: true, dish: true },
    { side: 'S', cx: 90, gs: 1, wall: C.peach, plinth: C.fBlue, roof: C.red, shutter: C.white, orient: 'long', fence: 'picket', fcol: C.fWhite, kitchenWall: C.peach, animals: ['cow', 'hens', 'dog', 'cat'], extra: ['woodpile', 'mallows', 'barrel'], crops: ['potato', 'corn', 'sunflower'], sideW: true, sideE: true, verge: 'cow' },
  ];
  yards.forEach((Y, i) => { Y.gateU = Y.gs * 8; Y.frame = Y.wall === C.brick ? 0xf4f2ea : 0xf4f2ea; Y.sideE = Y.sideE ?? false; buildYard(Y, i); });

  // ---------- стовпи ЛЕП вздовж вулиці: на кожному узбіччі свій ряд із проводами; дорогу дроти не перетинають, верби низькі й осторонь ----------
  G = new THREE.Matrix4(); T = new THREE.Matrix4();
  for (const { z: pz, xs } of [rowOf('N'), rowOf('S')]) {
    for (const x of xs) {
      B(0.22, 7.2, 0.22, x, 3.6, pz, 0x9a9a95); B(0.1, 0.1, 1.8, x, 6.7, pz, 0x6a4a30); B(0.1, 0.1, 1.8, x, 6.0, pz, 0x6a4a30);
      for (const z of [-0.8, 0, 0.8]) Cy(0.04, 0.04, 0.14, x, 6.8, pz + z, 0xdddddd, { seg: 6 });
      colliders.push({ minX: x - 0.2, maxX: x + 0.2, minZ: pz - 0.2, maxZ: pz + 0.2 });
    }
    for (let i = 0; i < xs.length - 1; i++) for (const z of [-0.8, 0, 0.8]) {
      const x0 = xs[i], x1 = xs[i + 1], N = 10, y = t => 6.8 - 0.7 * 4 * t * (1 - t);
      for (let j = 0; j < N; j++) {
        const a = j / N, b = (j + 1) / N, xa = x0 + (x1 - x0) * a, xb = x0 + (x1 - x0) * b;
        B(Math.hypot(xb - xa, y(b) - y(a)), 0.014, 0.014, (xa + xb) / 2, (y(a) + y(b)) / 2, pz + z, 0x1a1a1a, { rz: Math.atan2(y(b) - y(a), xb - xa) });
      }
    }
  }
  const wr = rng0(9);
  for (const x of [-96, -68, -45, -22, 14, 46, 73, 98]) tree(x, street.z0 + street.w + 2.7, 0.55 + wr() * 0.2, 'willow', wr);   // нижче проводів (≈4.5 м) і осторонь їх лінії

  // ---------- збираємо меші ----------
  for (const k of Object.keys(L)) {
    if (!L[k].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(L[k]), mats[k]);
    mesh.castShadow = k !== 'glass' && k !== 'wire'; mesh.receiveShadow = true;
    scene.add(mesh);
    L[k].forEach(g => g.dispose());
  }
  // земля дворів: трохи сухіша трава, щоб відрізнялась від нашого газону
  const gt = grassTex.clone(); gt.needsUpdate = true;
  const yardGround = (x0, x1, z0, z1) => {
    const t = gt.clone(); t.needsUpdate = true; t.repeat.set((x1 - x0) / 2, (z1 - z0) / 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshStandardMaterial({ map: t, color: 0xd2d9ae, roughness: 1 }));
    m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2); m.receiveShadow = true; scene.add(m);
  };
  yardGround(-105, -15, -40, 40); yardGround(15, 105, -40, 40);
  yardGround(-105, 105, street.z0 + street.w + 3, street.z0 + street.w + 3 + 80);

  const peck = t => Math.pow(Math.max(0, Math.sin(t)), 4);
  return {
    pole: { x: -20, y: 6.8, z: poleZ },                      // найближчий до нас стовп ЛЕП — від нього заводимо електрику в хату
    update(t) {
      for (const a of animals) {
        const m = a.m, p = a.ph;
        if (a.kind === 'hen') m.rotation.z = -0.9 * peck(t * 2.4 + p);
        else if (a.kind === 'goose') m.rotation.z = -0.35 * peck(t * 1.1 + p);
        else if (a.kind === 'cow' || a.kind === 'goat') m.rotation.z = -0.06 * peck(t * 0.5 + p);
        else if (a.kind === 'pig') m.rotation.z = Math.sin(t * 1.4 + p) * 0.04;
        else if (a.kind === 'dog') m.scale.y = 1 + 0.015 * Math.sin(t * 2.2 + p);
      }
    },
  };
}
