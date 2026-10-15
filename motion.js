// Превращает сырые показания акселерометра в «гравитацию стола».
//
// Идея: стол = экран телефона. Всё, что чувствует телефон, чувствуют и кости.
//   сырое показание r (Android-конвенция, с гравитацией): покой экраном вверх -> (0, 0, +9.8)
//   эффективная гравитация в системе телефона = -r
//   оси сцены: x вправо, y вверх (из экрана), z к зрителю (вниз по экрану)
//   значит: g_world = k * ( -rx, -rz, +ry )     k = 35/9.81
//
// Пример (k = 3.57): телефон лежит ровно, r=(0,0,9.8)      -> наклон 0, вниз -35
//   наклон вправо,       r=(-3.4,0,9.2) -> baseline.x=-3.4 -> g.x = +0.6*3.57*3.4 = +7.3 (кости едут вправо)
//   рывок вверх по y,    dyn=(0,+10,0)  -> g.z = +5*3.57*10 = +178 (кости прижимает к нижней стенке)
//
// Конвенция знаков (iOS CoreMotion даёт противоположную): определяем сами по тому, что экран
// смотрит на пользователя, то есть в покое r_z > 0 для «Android» и r_z < 0 для «iOS».
import { CONFIG } from './config.js';

const L = CONFIG.LIVE;

export function createMotion({ flip = null } = {}) {   // flip: null = авто, true/false = вручную
  let sign = flip === true ? -1 : 1;
  let detected = flip !== null;                         // вручную задали -> не определяем
  let init = false, lastAt = 0, samples = 0;
  let bx = 0, by = 0, bz = 0;                           // медленное среднее (гравитация/наклон)
  let dx = 0, dy = 0, dz = 0, devVal = 0;               // быстрая часть (тряска), с мёртвой зоной
  let raw = [0, 0, 0];

  function feed(rx, ry, rz, now = performance.now()) {
    raw = [rx, ry, rz];
    const x = rx * sign, y = ry * sign, z = rz * sign;
    const dt = Math.min(0.1, Math.max(0.005, (now - lastAt) / 1000));
    lastAt = now;
    samples++;

    if (!init) { bx = x; by = y; bz = z; init = true; }
    const ex = x - bx, ey = y - by, ez = z - bz;        // отклонение от среднего
    const a = 1 - Math.exp(-dt / L.BASELINE_TAU);
    bx += ex * a; by += ey * a; bz += ez * a;

    devVal = Math.hypot(ex, ey, ez);
    const k = devVal > L.DEADZONE ? (devVal - L.DEADZONE) / devVal : 0;
    dx = ex * k; dy = ey * k; dz = ez * k;

    // Автоопределение знака: ~0.5 с спокойствия и заметный наклон по z
    if (!detected && samples >= 25 && devVal < 1.5 && Math.abs(bz) > 2) {
      detected = true;
      if (bz < 0) { sign = -sign; bx = -bx; by = -by; bz = -bz; }
    }
  }

  const fresh = (now) => init && now - lastAt < L.STALE_MS;

  return {
    feed,
    // Вектор гравитации для cannon-es [gx, gy, gz] в ед/с²
    gravity(now = performance.now()) {
      if (!fresh(now)) return [0, CONFIG.GRAVITY, 0];
      const k = L.G_SCALE;
      let gx = k * (L.TILT_GAIN * -bx + L.DYN_GAIN * -dx);
      let gy = CONFIG.GRAVITY + k * L.DYN_GAIN * -dz;
      let gz = k * (L.TILT_GAIN * by + L.DYN_GAIN * dy);
      const m = Math.hypot(gx, gy, gz);
      if (m > L.MAX_ACC) { const s = L.MAX_ACC / m; gx *= s; gy *= s; gz *= s; }
      return [gx, gy, gz];
    },
    // Сила тряски (м/с²), 0 если датчик молчит
    dev(now = performance.now()) { return fresh(now) ? devVal : 0; },
    info() { return { sign, detected, raw, dev: devVal, samples }; },
  };
}
