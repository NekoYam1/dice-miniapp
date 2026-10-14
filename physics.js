import * as CANNON from 'cannon-es';
import { CONFIG, FACE_NORMALS } from './config.js';

const { ARENA, GRAVITY, STEP_HZ, MAX_SECONDS, SETTLE_STEPS, SETTLE_SPEED } = CONFIG;
const DT = 1 / STEP_HZ;
const rnd = (a, b) => a + Math.random() * (b - a);

function buildWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, GRAVITY, 0) });
  world.solver.iterations = 20;           // стабильнее покой кости на полу
  world.allowSleep = false;

  const surface = new CANNON.Material('surface');
  const die = new CANNON.Material('die');
  world.addContactMaterial(new CANNON.ContactMaterial(die, surface, { friction: 0.35, restitution: 0.38 }));
  world.addContactMaterial(new CANNON.ContactMaterial(die, die, { friction: 0.2, restitution: 0.3 }));

  // Плоскость: нормаль (nx,ny,nz) смотрит ВНУТРЬ арены, p — точка на плоскости
  const plane = (nx, ny, nz, px, py, pz) => {
    const b = new CANNON.Body({ mass: 0, material: surface, shape: new CANNON.Plane() });
    b.quaternion.setFromVectors(new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(nx, ny, nz));
    b.position.set(px, py, pz);
    world.addBody(b);
  };
  plane(0, 1, 0, 0, 0, 0);                 // пол
  plane(0, -1, 0, 0, ARENA.ceiling, 0);    // потолок
  plane(1, 0, 0, -ARENA.halfX, 0, 0);      // левая стена
  plane(-1, 0, 0, ARENA.halfX, 0, 0);      // правая
  plane(0, 0, 1, 0, 0, -ARENA.halfZ);      // дальняя
  plane(0, 0, -1, 0, 0, ARENA.halfZ);      // ближняя (к пользователю)
  return { world, dieMat: die };
}

function makeDie(dieMat, i, n, strength) {
  const h = CONFIG.DIE_SIZE / 2;
  const body = new CANNON.Body({
    mass: 1, material: dieMat,
    shape: new CANNON.Box(new CANNON.Vec3(h, h, h)),
    linearDamping: 0.05, angularDamping: 0.05,
  });

  // Старт: кости друг над другом (шаг по высоте 1.05 > размера кости) и повёрнуты только вокруг Y,
  // поэтому пересечений в начале нет. Пример n=3: y = 1.8, 2.85, 3.9
  const dx = n > 1 ? Math.min(1.25, (2 * ARENA.halfX - 1.2) / (n - 1)) : 0;
  body.position.set((i - (n - 1) / 2) * dx, 1.8 + i * 1.05, ARENA.halfZ - 1 + rnd(-0.15, 0.15));
  body.quaternion.setFromEuler(0, rnd(0, Math.PI * 2), 0);

  // strength 0..1. Пример 0.5: скорость 9.5 ед/с, вращение до ±19 рад/с по каждой оси
  const speed = 5 + 9 * strength;
  const spin = 8 + 22 * strength;
  body.velocity.set(rnd(-1.5, 1.5), rnd(-1, 0.5), -speed + rnd(-1, 1));   // к дальней стене
  body.angularVelocity.set(rnd(-spin, spin), rnd(-spin, spin), rnd(-spin, spin));
  return body;
}

// Какая локальная грань смотрит вверх и насколько точно (up=1 — идеально плашмя)
function topFace(body) {
  let best = { face: 0, up: -2 };
  FACE_NORMALS.forEach((nrm, f) => {
    const w = body.quaternion.vmult(new CANNON.Vec3(nrm[0], nrm[1], nrm[2]));
    if (w.y > best.up) best = { face: f, up: w.y };
  });
  return best;
}

function runOnce(n, strength, strict) {
  const { world, dieMat } = buildWorld();
  const bodies = [];
  const impacts = [];                      // [{step, v}] удары для тактильного отклика
  let step = 0;

  for (let i = 0; i < n; i++) {
    const b = makeDie(dieMat, i, n, strength);
    b.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 1.5) impacts.push({ step: step + 1, v });
    });
    world.addBody(b);
    bodies.push(b);
  }

  const frames = [];                       // каждый элемент: Float32Array[n*7]
  const record = () => {
    const f = new Float32Array(n * 7);     // на кость: x,y,z, qx,qy,qz,qw
    let moving = false;
    bodies.forEach((b, i) => {
      const p = b.position, q = b.quaternion;
      f.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], i * 7);
      if (b.velocity.length() > SETTLE_SPEED || b.angularVelocity.length() > SETTLE_SPEED) moving = true;
    });
    frames.push(f);
    return moving;
  };

  record();                                // кадр 0 — стартовая поза
  let calm = 0;
  while (step < MAX_SECONDS * STEP_HZ) {
    world.step(DT);                        // фиксированный шаг => результат не зависит от FPS
    step++;
    calm = record() ? 0 : calm + 1;
    if (calm >= SETTLE_STEPS) break;
  }

  const tops = bodies.map(topFace);
  if (strict && tops.some(t => t.up < 0.985)) return null;   // кость «повисла» на стене/другой кости

  // Плоский массив: shape [steps, n, 7]. Пример: 3.1 с -> 373 шага, n=2 -> 5222 float ≈ 21 КБ
  const flat = new Float32Array(frames.length * n * 7);
  frames.forEach((f, k) => flat.set(f, k * n * 7));
  return { n, frames: flat, steps: frames.length, impacts, tops: tops.map(t => t.face) };
}

export function simulateThrow(n, strength) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const sim = runOnce(n, strength, true);
    if (sim) return sim;
  }
  return runOnce(n, strength, false);      // крайне редкий запасной вариант
}
