const G = 9.81;

export function createShakeDetector(onShake, {
  threshold = 12, hitsNeeded = 3, windowMs = 600, cooldownMs = 1500, minGapMs = 100,
} = {}) {
  let hits = [];                           // [{t, dev}]
  let lastHit = 0, lastShake = 0;

  return function feed(x, y, z) {
    const now = performance.now();
    const dev = Math.abs(Math.hypot(x, y, z) - G);
    if (dev < threshold || now - lastHit < minGapMs) return;
    lastHit = now;
    hits = hits.filter(h => now - h.t <= windowMs);
    hits.push({ t: now, dev });
    if (hits.length >= hitsNeeded && now - lastShake > cooldownMs) {
      const peak = Math.max(...hits.map(h => h.dev));            // обычно 15..35
      lastShake = now; hits = [];
      onShake(Math.min(1, Math.max(0, (peak - threshold) / 20))); // пик 22 -> сила 0.5
    }
  };
}
