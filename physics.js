// Общие части физики: мир со стенами, тело кости, определение верхней грани.
import * as CANNON from 'cannon-es';
import { CONFIG, FACE_NORMALS } from './config.js';

const { ARENA, GRAVITY } = CONFIG;
export const rnd = (a, b) => a + Math.random() * (b - a);

export function buildWorld() {
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

export function createDieBody(dieMat) {
  const h = CONFIG.DIE_SIZE / 2;
  return new CANNON.Body({
    mass: 1, material: dieMat,
    shape: new CANNON.Box(new CANNON.Vec3(h, h, h)),
    linearDamping: 0.05, angularDamping: 0.05,
  });
}

// Телепорт кости в позу p=[x,y,z], q=[x,y,z,w] без скорости.
// previous*/interpolated* тоже обновляем, иначе интерполяция покажет старую позу.
export function setBodyPose(body, p, q) {
  body.position.set(p[0], p[1], p[2]);
  body.previousPosition.set(p[0], p[1], p[2]);
  body.interpolatedPosition.set(p[0], p[1], p[2]);
  body.quaternion.set(q[0], q[1], q[2], q[3]);
  body.previousQuaternion.set(q[0], q[1], q[2], q[3]);
  body.interpolatedQuaternion.set(q[0], q[1], q[2], q[3]);
  body.velocity.set(0, 0, 0);
  body.angularVelocity.set(0, 0, 0);
  body.force.set(0, 0, 0);
  body.torque.set(0, 0, 0);
}

// Какая локальная грань смотрит вверх и насколько точно (up=1 — идеально плашмя)
export function topFace(body) {
  let best = { face: 0, up: -2 };
  FACE_NORMALS.forEach((nrm, f) => {
    const w = body.quaternion.vmult(new CANNON.Vec3(nrm[0], nrm[1], nrm[2]));
    if (w.y > best.up) best = { face: f, up: w.y };
  });
  return best;
}
