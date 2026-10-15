// Автомат тряски. Состояния: idle -> shaking -> (бросок) -> idle.
//   start:   3 пика (локальных максимума) отклонения > START_DEV за START_WINDOW_MS,
//            либо отклонение выше порога непрерывно SUSTAIN_MS (круговая тряска без провалов)
//   release: рука остановилась (отклонение < CALM_DEV дольше CALM_MS), но не раньше MIN_SHAKE_MS;
//            либо тряска дольше MAX_SHAKE_MS; либо нажали кнопку.
// Пик = максимум, после которого отклонение упало ниже 65% от него. Следующий пик начинается,
// когда отклонение выросло на 35% над минимумом («впадиной»). Так считаются и тряска вдоль одной оси
// (впадины глубокие), и тряска по двум осям со сдвигом фаз (впадины мелкие, но есть).
// Пример: тряска 1.4 с, затем пауза -> release через 220 мс после остановки.
import { CONFIG } from './config.js';

const S = CONFIG.SHAKE;

export function createShakeTracker({ onStart, onRelease }) {
  let state = 'idle', hits = [], startAt = 0, calmSince = null, cooldownUntil = 0;
  let inPeak = false, peakVal = 0, valley = 0, aboveSince = null;
  const api = { shakes: 0, peak: 0, get state() { return state; } };

  function clearPeaks() { hits = []; inPeak = false; peakVal = 0; valley = 0; aboveSince = null; }

  function begin(now) {
    state = 'shaking'; startAt = now; calmSince = null; clearPeaks();
    api.shakes++;
    onStart();
  }
  function end(reason, now) {
    state = 'idle'; clearPeaks(); cooldownUntil = now + S.COOLDOWN_MS;
    onRelease(reason);
  }

  api.update = (dev, now) => {
    api.peak = Math.max(api.peak * 0.97, dev);

    if (state === 'idle') {
      if (now < cooldownUntil) { clearPeaks(); return; }

      // непрерывное отклонение выше порога
      if (dev >= S.START_DEV) { if (aboveSince === null) aboveSince = now; } else aboveSince = null;
      if (aboveSince !== null && now - aboveSince >= S.SUSTAIN_MS) { begin(now); return; }

      // поиск пиков
      if (inPeak) {
        if (dev > peakVal) peakVal = dev;
        else if (dev < peakVal * 0.65) {              // пик завершён
          inPeak = false; valley = dev;
          hits = hits.filter(t => now - t <= S.START_WINDOW_MS);
          hits.push(now);
          if (hits.length >= S.START_HITS) begin(now);
        }
      } else {
        valley = Math.min(valley, dev);
        if (dev >= S.START_DEV && dev > valley * 1.35 + 0.5) { inPeak = true; peakVal = dev; }
      }
      return;
    }

    const dur = now - startAt;
    if (dev < S.CALM_DEV) { if (calmSince === null) calmSince = now; } else calmSince = null;
    if (dur >= S.MAX_SHAKE_MS) end('timeout', now);
    else if (dur >= S.MIN_SHAKE_MS && calmSince !== null && now - calmSince >= S.CALM_MS) end('calm', now);
  };

  api.force = (now) => { if (state === 'idle') begin(now); end('button', now); };
  api.reset = (now) => { state = 'idle'; clearPeaks(); cooldownUntil = now + S.COOLDOWN_MS; };
  return api;
}
