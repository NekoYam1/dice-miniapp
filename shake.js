// Детектор тряски, не зависящий от того, включена ли гравитация в показания датчика.
// Идея: сравниваем длину вектора ускорения с её медленным скользящим средним.
//   гравитация включена:  покой |a|≈9.8, baseline≈9.8 -> dev≈0.2;  тряска |a| 0..30 -> dev 8..20
//   гравитация вычтена:   покой |a|≈0.1, baseline≈0.1 -> dev≈0.1;  тряска |a| 0..25 -> dev 8..20
export function createShakeDetector(onShake, {
  threshold = 7,      // м/с² отклонения от среднего
  hitsNeeded = 3,     // пиков подряд
  windowMs = 700,     // за какое время
  cooldownMs = 1500,  // пауза после срабатывания
  minGapMs = 80,      // пики ближе этого считаем одним
  alpha = 0.05,       // скорость обновления среднего (~0.4 с при 50 Гц)
} = {}) {
  let baseline = null;
  let hits = [];                           // [{t, dev}]
  let lastHit = 0, lastShake = 0;

  function feed(x, y, z) {
    const now = performance.now();
    const mag = Math.hypot(x, y, z);
    if (baseline === null) baseline = mag;
    const dev = Math.abs(mag - baseline);
    baseline += (mag - baseline) * alpha;
    feed.stats.dev = dev; feed.stats.mag = mag; feed.stats.peak = Math.max(feed.stats.peak * 0.97, dev);

    if (dev < threshold || now - lastHit < minGapMs) return;
    lastHit = now;
    hits = hits.filter(h => now - h.t <= windowMs);
    hits.push({ t: now, dev });
    if (hits.length >= hitsNeeded && now - lastShake > cooldownMs) {
      const peak = Math.max(...hits.map(h => h.dev));
      lastShake = now; hits = [];
      feed.stats.shakes++;
      onShake(Math.min(1, Math.max(0, (peak - threshold) / 15)));   // пик 14.5 -> сила 0.5
    }
  }
  feed.stats = { dev: 0, mag: 0, peak: 0, shakes: 0 };
  return feed;
}
