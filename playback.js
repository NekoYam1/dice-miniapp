import * as THREE from 'three';
import { CONFIG } from './config.js';

const qa = new THREE.Quaternion();
const qb = new THREE.Quaternion();

// Ставит кости в позу на момент t (секунды от старта записи).
// sim.frames — Float32Array shape [steps, n, 7]. Возвращает true, пока запись не закончилась.
export function poseAt(sim, meshes, t) {
  const last = sim.steps - 1;
  const x = Math.max(0, Math.min(t * CONFIG.STEP_HZ, last));   // дробный индекс кадра
  const i0 = Math.floor(x);
  const i1 = Math.min(i0 + 1, last);
  const a = x - i0;                                             // пример: t=1.0035 с -> x=120.42, a=0.42
  const stride = sim.n * 7;
  const d = sim.frames;

  meshes.forEach((m, k) => {
    const o0 = i0 * stride + k * 7;
    const o1 = i1 * stride + k * 7;
    m.position.set(
      d[o0]     + (d[o1]     - d[o0])     * a,
      d[o0 + 1] + (d[o1 + 1] - d[o0 + 1]) * a,
      d[o0 + 2] + (d[o1 + 2] - d[o0 + 2]) * a,
    );
    qa.set(d[o0 + 3], d[o0 + 4], d[o0 + 5], d[o0 + 6]);
    qb.set(d[o1 + 3], d[o1 + 4], d[o1 + 5], d[o1 + 6]);
    m.quaternion.copy(qa).slerp(qb, a);
  });
  return x < last;
}

// Поза последнего кадра записи: Float32Array длины n*7 (для world.freezeAt)
export function finalPose(sim) {
  const stride = sim.n * 7;
  return sim.frames.subarray((sim.steps - 1) * stride, sim.steps * stride);
}
