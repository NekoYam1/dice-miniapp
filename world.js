// Живой физический мир: кости лежат на столе, гравитация приходит с датчика каждый кадр.
import { CONFIG } from './config.js';
import { buildWorld, createDieBody, setBodyPose } from './physics.js';

const { STEP_HZ, LIVE: L } = CONFIG;

const yawQuat = (yaw) => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];

// Стартовая раскладка [x, z] на каждую кость; кости не касаются друг друга
//   n=1: (0,0)   n=2: (±0.8, 0)   n=3: (-1.6|0|1.6, 0)
//   n=4: сетка 2x2 (±0.8, ±0.9)   n=5: ряд из 3 (z=-0.9) + ряд из 2 (z=+0.9)
function layout(n) {
  if (n <= 3) {
    const step = n === 3 ? 1.6 : 1.6;                      // шаг между центрами > 1.0 + запас на поворот
    return Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * step, 0]);
  }
  const top = Math.ceil(n / 2), bottom = n - top;           // верхний ряд длиннее
  const row = (m, z) => Array.from({ length: m }, (_, i) => [(i - (m - 1) / 2) * 1.6, z]);
  return [...row(top, -0.9), ...row(bottom, 0.9)];
}

export function createLiveWorld(count, onImpact = () => {}) {
  const { world, dieMat } = buildWorld();
  const bodies = [];
  const spots = layout(count);

  for (let i = 0; i < count; i++) {
    const b = createDieBody(dieMat);
    setBodyPose(b, [spots[i][0], 0.5, spots[i][1]], yawQuat(i * 0.4));
    b.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v >= L.HAPTIC_MIN_IMPACT) onImpact(v);
    });
    world.addBody(b);
    bodies.push(b);
  }

  return {
    bodies,

    // dt — секунды с прошлого кадра, g — [gx, gy, gz] от motion.gravity()
    step(dt, g) {
      world.gravity.set(g[0], g[1], g[2]);
      world.step(1 / STEP_HZ, dt, L.MAX_SUBSTEPS);       // интерполяция внутри cannon-es
      for (const b of bodies) {                           // защита от пролёта сквозь стенки
        const s = b.velocity.length();
        if (s > L.MAX_SPEED) b.velocity.scale(L.MAX_SPEED / s, b.velocity);
        const w = b.angularVelocity.length();
        if (w > 60) b.angularVelocity.scale(60 / w, b.angularVelocity);
      }
    },

    // Состояние для прогноза броска. Позиция = та, что только что нарисована (интерполированная),
    // поэтому на кадре перехода к проигрыванию записи нет скачка.
    snapshot() {
      return bodies.map((b) => ({
        p: [b.interpolatedPosition.x, b.interpolatedPosition.y, b.interpolatedPosition.z],
        q: [b.interpolatedQuaternion.x, b.interpolatedQuaternion.y, b.interpolatedQuaternion.z, b.interpolatedQuaternion.w],
        v: [b.velocity.x, b.velocity.y, b.velocity.z],
        w: [b.angularVelocity.x, b.angularVelocity.y, b.angularVelocity.z],
      }));
    },

    // Поставить кости в позу последнего кадра записи (Float32Array длины n*7) и обнулить скорости
    freezeAt(frame) {
      bodies.forEach((b, i) => {
        const o = i * 7;
        setBodyPose(b, [frame[o], frame[o + 1], frame[o + 2]],
                       [frame[o + 3], frame[o + 4], frame[o + 5], frame[o + 6]]);
      });
    },
  };
}
