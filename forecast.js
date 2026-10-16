// Прогноз броска: берём текущее состояние костей, при необходимости подбрасываем их,
// и заранее, с фиксированным шагом, считаем весь полёт до остановки.
// Результат: записанные кадры (shape [steps, n, 7]), верхние грани, моменты ударов
// и моменты, когда безопасно менять числа на гранях (кость в воздухе и быстро вращается).
import { CONFIG } from './config.js';
import { buildWorld, createDieBody, setBodyPose, topFace, rnd } from './physics.js';

const { STEP_HZ, MAX_SECONDS, SETTLE_STEPS, SETTLE_SPEED, KICK, SWAP } = CONFIG;
const DT = 1 / STEP_HZ;

// Кость либо ЛЕЖИТ на столе, либо ЛЕТИТ (её подбросила тряска). С ними обращаемся по-разному:
//   лежит  -> финальный подброс, чтобы у броска был видимый полёт (там и меняются числа на гранях);
//   летит  -> скорость не трогаем совсем (никаких скачков). Если она почти не вращается, вращение
//            нарастает плавно за KICK.RAMP_STEPS шагов, как будто кость задел удар.
// Пример: лежит, v=(0.3,0,0.1) -> vy = 8.5..10.5 ед/с, подскок до y ≈ 0.5 + 8.5²/70 ≈ 1.5
//         летит, y=1.3, w=1 рад/с, цель 18 рад/с, RAMP=24 -> +0.7 рад/с на шаг, 0.2 с до полной
// Возвращает { kicked, spin }: spin = null | {target:[wx,wy,wz], at:'rise'|'ramp'}
const randSpin = (lo = KICK.SPIN_MIN, hi = KICK.SPIN_MAX) => {
  const s = rnd(lo, hi);
  const a = rnd(0, Math.PI * 2), c = rnd(-1, 1), r = Math.sqrt(1 - c * c);
  return [s * r * Math.cos(a), s * c, s * r * Math.sin(a)];   // случайная ось, |w| = s
};

function applyKick(body) {
  const v = body.velocity, w = body.angularVelocity;
  // Кость, прислонённая к стенке или другой кости (центр выше 0.75, но почти не движется), тоже «лежит»
  const still = v.length() < 1 && w.length() < 1;
  const resting = (body.position.y < KICK.REST_Y && Math.abs(v.y) < KICK.REST_VY) || still;
  if (resting) {
    if (v.length() < KICK.MIN_SPEED) {
      v.x += rnd(-KICK.SIDE, KICK.SIDE);
      v.z += rnd(-KICK.SIDE, KICK.SIDE);
    }
    v.y = Math.max(v.y, KICK.UP_MIN + rnd(0, KICK.UP_RAND));
    if (w.length() < KICK.MIN_SPIN) {
      w.set(0, 0, 0);
      return { kicked: true, spin: { target: randSpin(), at: 'rise' } };   // вращение включим, когда кость поднимется
    }
    return { kicked: true, spin: null };
  }
  // Летящая кость: скорость не трогаем. Разгоняем вращение только если она почти не вращается;
  // кость, уже кувыркающаяся (2..10 рад/с), остаётся как есть, без «магической» раскрутки.
  if (w.length() < KICK.RAMP_BELOW) return { kicked: false, spin: { target: randSpin(KICK.RAMP_SPIN_MIN, KICK.RAMP_SPIN_MAX), at: 'ramp', left: KICK.RAMP_STEPS } };
  return { kicked: false, spin: null };
}

// Подброшенные кости, лежавшие рядом, расталкиваем: вращающийся куб занимает сферу радиусом ≈0.87,
// и две кости на расстоянии 1.25 при вращении сталкиваются и гасят друг другу вращение.
function spreadApart(bodies, kicked) {
  bodies.forEach((bi, i) => {
    if (!kicked[i]) return;
    bi.velocity.z += (i % 2 ? 1 : -1) * rnd(1.5, 3);        // веер: соседи уходят в разные стороны по z
    bodies.forEach((bj, j) => {
      if (i === j) return;
      let dx = bi.position.x - bj.position.x, dz = bi.position.z - bj.position.z;
      let d = Math.hypot(dx, dz);
      if (d >= KICK.SPREAD_R) return;
      if (d < 0.01) { const a = rnd(0, Math.PI * 2); dx = Math.cos(a); dz = Math.sin(a); d = 1; }
      const f = KICK.SPREAD * (1 - d / KICK.SPREAD_R) / d;
      bi.velocity.x += dx * f; bi.velocity.z += dz * f;
    });
  });
}

function minDistToOthers(bodies, i) {
  let m = Infinity;
  bodies.forEach((b, j) => { if (j !== i) m = Math.min(m, b.position.distanceTo(bodies[i].position)); });
  return m;
}

function runOnce(snapshot, strict, attempt = 0) {
  const n = snapshot.length;
  const { world, dieMat } = buildWorld();              // обычная гравитация вниз
  const bodies = [];
  const impacts = [];                                   // [{step, v}] для вибрации
  let step = 0;
  const kicked = new Array(n).fill(false);
  const pendingSpin = new Array(n).fill(null);          // отложенное вращение на кость
  const rotAcc = new Array(n).fill(0);                  // накопленный угол поворота кости, рад
  const stats = { kicked: 0, ramped: 0 };               // для диагностики

  snapshot.forEach((s, i) => {
    const b = createDieBody(dieMat);
    setBodyPose(b, s.p, s.q);
    b.velocity.set(s.v[0], s.v[1], s.v[2]);
    b.angularVelocity.set(s.w[0], s.w[1], s.w[2]);
    if (attempt > 0) {                                  // повторная попытка: крошечное возмущение, чтобы исход отличался
      b.velocity.x += rnd(-0.4, 0.4); b.velocity.z += rnd(-0.4, 0.4);
      b.angularVelocity.x += rnd(-0.8, 0.8); b.angularVelocity.y += rnd(-0.8, 0.8); b.angularVelocity.z += rnd(-0.8, 0.8);
    }
    const k = applyKick(b);
    kicked[i] = k.kicked;
    pendingSpin[i] = k.spin;
    stats.kicked += k.kicked ? 1 : 0; stats.ramped += k.spin?.at === 'ramp' ? 1 : 0;
    // Кость, которая к моменту броска уже кувыркалась (тряска), зрителю уже «непонятна»: угол считаем набранным
    if (b.angularVelocity.length() > SWAP.PRESET_SPIN) rotAcc[i] = 99;
    b.addEventListener('collide', (e) => {
      const v = Math.abs(e.contact.getImpactVelocityAlongNormal());
      if (v > 1.5) impacts.push({ step: step + 1, v });
    });
    world.addBody(b);
    bodies.push(b);
  });
  spreadApart(bodies, kicked);

  const swapSteps = new Array(n).fill(-1);             // подмена в воздухе (лучший вариант)
  const swapTable = new Array(n).fill(-1);             // запасной: кость кувыркается по столу
  const bestSpin = new Array(n).fill(0), bestStep = new Array(n).fill(-1);   // последний шанс: момент самого быстрого вращения
  const frames = [];                                    // каждый элемент: Float32Array[n*7]
  const record = () => {
    const idx = frames.length;
    const f = new Float32Array(n * 7);                  // на кость: x,y,z, qx,qy,qz,qw
    let moving = false;
    bodies.forEach((b, i) => {
      const p = b.position, q = b.quaternion;
      f.set([p.x, p.y, p.z, q.x, q.y, q.z, q.w], i * 7);
      const speed = b.velocity.length(), spin = b.angularVelocity.length();
      if (speed > SETTLE_SPEED || spin > SETTLE_SPEED || pendingSpin[i]) moving = true;
      // Подмена чисел: зритель уже потерял кость из виду, когда она в воздухе и повернулась на SWAP.MIN_ANGLE.
      // Пример: spin=18 рад/с -> 1.5 рад набирается за 0.083 с = 10 шагов; apex подброса через ≈0.25 с.
      if (idx > 0) rotAcc[i] += spin * DT;
      if (swapSteps[i] < 0 && p.y > SWAP.MIN_Y && spin > SWAP.MIN_SPIN && rotAcc[i] >= SWAP.MIN_ANGLE) swapSteps[i] = idx;
      if (swapTable[i] < 0 && spin > SWAP.SPIN2 && rotAcc[i] >= SWAP.ANGLE2) swapTable[i] = idx;
      if (idx <= 120 && spin > bestSpin[i]) { bestSpin[i] = spin; bestStep[i] = idx; }
    });
    frames.push(f);
    return moving;
  };

  record();                                             // кадр 0 = текущая поза
  let calm = 0;
  while (step < MAX_SECONDS * STEP_HZ) {
    world.step(DT);                                     // фиксированный шаг => результат не зависит от FPS
    step++;
    bodies.forEach((b, i) => {
      const ps = pendingSpin[i];
      if (!ps) return;
      const w = b.angularVelocity;
      if (ps.at === 'ramp') {                           // плавный разгон вращения у летящей кости
        const t = ps.target, k = 1 / ps.left;
        w.set(w.x + (t[0] - w.x) * k, w.y + (t[1] - w.y) * k, w.z + (t[2] - w.z) * k);
        if (--ps.left <= 0) pendingSpin[i] = null;
      } else if ((b.position.y > KICK.SPIN_Y && minDistToOthers(bodies, i) > KICK.SPIN_CLEAR) || step > KICK.SPIN_MAX_STEPS) {
        ps.at = 'ramp'; ps.left = KICK.RISE_RAMP_STEPS;   // лежавшая кость: вращение нарастает плавно после подъёма
      }
    });
    calm = record() ? 0 : calm + 1;
    if (calm >= SETTLE_STEPS) break;
  }

  const tops = bodies.map(topFace);
  if (strict && tops.some(t => t.up < 0.985)) return null;   // кость «повисла» на стене/другой кости

  const fallback = Math.min(SWAP.FALLBACK_STEP, frames.length - 1);
  const swapKind = [];                                  // 'air' | 'table' | 'fallback' (для диагностики)
  for (let i = 0; i < n; i++) {
    if (swapSteps[i] >= 0) swapKind.push('air');
    else if (swapTable[i] >= 0) { swapSteps[i] = swapTable[i]; swapKind.push('table'); }
    else { swapSteps[i] = bestSpin[i] > 2 ? bestStep[i] : fallback; swapKind.push('fallback'); }
  }

  // Плоский массив shape [steps, n, 7]. Пример: 2.2 с -> 264 шага, n=2 -> 3696 float ≈ 15 КБ
  const flat = new Float32Array(frames.length * n * 7);
  frames.forEach((f, k) => flat.set(f, k * n * 7));
  return { n, frames: flat, steps: frames.length, impacts, tops: tops.map(t => t.face), swapSteps, swapKind, stats };
}

export function forecastRoll(snapshot) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const sim = runOnce(snapshot, true, attempt);
    if (sim) return sim;
  }
  return runOnce(snapshot, false, 6);                      // крайне редкий запасной вариант
}
