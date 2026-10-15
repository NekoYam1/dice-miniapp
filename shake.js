// Детектор тряски: высокочастотный фильтр по каждой оси.
// Почему не длина вектора: при боковом рывке 10 м/с² и гравитации 9.8 по Z длина |a| = 14 (отклонение 4.2),
// а отклонение самого вектора от «покоя» = 10. Вектор в 2.4 раза чувствительнее.
//   покой:            baseline≈(0,0,9.8), dev≈0.2-0.5
//   ходьба:           dev ≈ 2-4
//   лёгкая тряска:    dev ≈ 7-12
//   сильная тряска:   dev ≈ 15-30
export function createShakeDetector(onShake, {
  threshold = 5,      // м/с² отклонения вектора от среднего
  hitsNeeded = 3,     // пиков за окно (один пик = одно движение туда или обратно)
  windowMs = 900,     // окно, за которое нужно набрать пики
  cooldownMs = 1200,  // пауза после срабатывания
  alpha = 0.05,       // скорость обновления среднего (~0.4 с при 50 Гц)
} = {}) {
  let bx = null, by = 0, bz = 0;           // скользящее среднее вектора (≈ гравитация)
  let armed = true;                        // пик считается заново только после спада
  let hits = [];                           // [{t, dev}]
  let lastShake = -Infinity;

  function feed(x, y, z) {
    const now = performance.now();
    if (bx === null) { bx = x; by = y; bz = z; }
    const dev = Math.hypot(x - bx, y - by, z - bz);
    bx += (x - bx) * alpha; by += (y - by) * alpha; bz += (z - bz) * alpha;

    feed.stats.dev = dev;
    feed.stats.mag = Math.hypot(x, y, z);
    feed.stats.peak = Math.max(feed.stats.peak * 0.97, dev);

    if (dev < threshold * 0.5) armed = true;           // гистерезис: спад ниже половины порога
    if (dev < threshold || !armed) return;
    armed = false;                                      // фронт: считаем один пик на одно движение

    hits = hits.filter(h => now - h.t <= windowMs);
    hits.push({ t: now, dev });
    if (hits.length >= hitsNeeded && now - lastShake > cooldownMs) {
      const peak = Math.max(...hits.map(h => h.dev));
      lastShake = now; hits = [];
      feed.stats.shakes++;
      // сила броска: даже лёгкая тряска даёт нормальный бросок (0.3), сильная — максимум (1.0)
      onShake(0.3 + 0.7 * Math.min(1, Math.max(0, (peak - threshold) / 15)));
    }
  }
  feed.stats = { dev: 0, mag: 0, peak: 0, shakes: 0 };
  return feed;
}
