import { CONFIG } from './config.js';
import { createScene } from './scene.js';
import { createDie, setLabels } from './dieMesh.js';
import { simulateThrow } from './physics.js';
import { computeLabels, STANDARD } from './relabel.js';
import { poseAt } from './playback.js';
import { requestRoll } from './api.js';
import { createShakeDetector } from './shake.js';
import { startMotion } from './sensor.js';

const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

// Простая оценка мощности; можно заменить на computeTier из прошлого ответа
const lowEnd = (navigator.hardwareConcurrency || 4) <= 4;
const view = createScene(document.getElementById('c'), {
  dpr: lowEnd ? 1 : Math.min(window.devicePixelRatio || 1, 2),
  shadows: !lowEnd,
  antialias: !lowEnd,
});

const resultEl = document.getElementById('result');
const countEl = document.getElementById('count');
let count = 2;
let dice = [];
let rolling = false;
let lastHaptic = 0;

function rebuildDice() {
  dice.forEach(d => view.scene.remove(d));
  const { halfX } = CONFIG.ARENA;
  const dx = count > 1 ? Math.min(1.25, (2 * halfX - 1.2) / (count - 1)) : 0;
  dice = Array.from({ length: count }, (_, i) => {
    const m = createDie();
    setLabels(m, STANDARD);
    m.position.set((i - (count - 1) / 2) * dx, 0.5, 0);
    m.rotation.set(0, i * 0.4, 0);
    view.scene.add(m);
    return m;
  });
  countEl.textContent = count;
  view.render();
}

async function roll(strength) {
  if (rolling) return;
  rolling = true;
  resultEl.textContent = '';

  const valuesPromise = requestRoll(count);        // значения: RNG или сервер, идут параллельно
  const sim = simulateThrow(count, strength);      // физика заранее, ~20-60 мс
  let values;
  try {
    values = await valuesPromise;
  } catch {
    resultEl.textContent = 'Ошибка сети';
    rolling = false;
    return;
  }

  // Подгоняем числа на гранях ДО старта анимации
  dice.forEach((m, i) => setLabels(m, computeLabels(sim.tops[i], values[i])));

  const t0 = performance.now();
  let impactIdx = 0;
  function frame(now) {
    const t = Math.max(0, (now - t0) / 1000);
    const going = poseAt(sim, dice, t);

    const curStep = t * CONFIG.STEP_HZ;            // тактильный отклик на удары
    while (impactIdx < sim.impacts.length && sim.impacts[impactIdx].step <= curStep) {
      const { v } = sim.impacts[impactIdx++];
      if (now - lastHaptic > 60) {
        tg?.HapticFeedback?.impactOccurred(v > 8 ? 'medium' : 'light');
        lastHaptic = now;
      }
    }

    view.render();
    if (going) {
      requestAnimationFrame(frame);
    } else {
      const sum = values.reduce((a, b) => a + b, 0);
      resultEl.textContent = count > 1 ? `${values.join(' + ')} = ${sum}` : `${values[0]}`;
      rolling = false;
    }
  }
  requestAnimationFrame(frame);
}

const feed = createShakeDetector((strength) => roll(strength));
let motionStarted = false;
document.getElementById('rollBtn').addEventListener('click', () => {
  if (!motionStarted) { motionStarted = true; startMotion(feed); }   // жест пользователя нужен iOS
  roll(0.4 + Math.random() * 0.5);
});
document.getElementById('plus').addEventListener('click', () => {
  if (!rolling && count < CONFIG.MAX_DICE) { count++; rebuildDice(); }
});
document.getElementById('minus').addEventListener('click', () => {
  if (!rolling && count > 1) { count--; rebuildDice(); }
});

rebuildDice();
