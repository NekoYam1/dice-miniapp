import { CONFIG } from './config.js';
import { createScene } from './scene.js';
import { createDie, setLabels } from './dieMesh.js';
import { createLiveWorld } from './world.js';
import { forecastRoll } from './forecast.js';
import { computeLabels, STANDARD } from './relabel.js';
import { poseAt, finalPose } from './playback.js';
import { requestRoll } from './api.js';
import { createMotion } from './motion.js';
import { createShakeTracker } from './shake.js';
import { startMotion } from './sensor.js';

const tg = window.Telegram?.WebApp;
const debugEl = document.getElementById('debug');
const params = new URLSearchParams(location.search);
const SHOW_DEBUG = params.get('debug') !== '0';                 // скрыть диагностику: ?debug=0
const FLIP = params.get('flip') === null ? null : params.get('flip') === '1';   // ?flip=1 / ?flip=0 — знак осей вручную

// ---------- Telegram: полный экран ----------
let fsError = '';
function goFullscreen() {
  if (!tg) return;
  try {
    if (tg.isVersionAtLeast('8.0') && !tg.isFullscreen) tg.requestFullscreen();
  } catch (e) { fsError = e.message; }
}
if (tg) {
  tg.ready();
  tg.expand();
  try { if (tg.isVersionAtLeast('7.7')) tg.disableVerticalSwipes(); } catch {}   // тряска не должна закрывать окно
  goFullscreen();
  tg.onEvent?.('fullscreenFailed', (e) => { fsError = e?.error || 'failed'; });
}

// ---------- Сцена ----------
const isIOS = tg?.platform === 'ios';                 // iOS не считаем слабым: hardwareConcurrency там занижен
const lowEnd = !isIOS && (navigator.hardwareConcurrency || 4) <= 4;
const view = createScene(document.getElementById('c'), {
  dpr: lowEnd ? 1 : Math.min(window.devicePixelRatio || 1, 2),
  shadows: !lowEnd,
  antialias: !lowEnd,
});

const resultEl = document.getElementById('result');
const countEl = document.getElementById('count');

// ---------- Вибрация от ударов ----------
let lastHaptic = 0;
function haptic(v) {
  const now = performance.now();
  if (now - lastHaptic < CONFIG.LIVE.HAPTIC_GAP_MS) return;
  lastHaptic = now;
  tg?.HapticFeedback?.impactOccurred(v > 10 ? 'heavy' : v > 5 ? 'medium' : 'light');
}

// ---------- Кости: живой мир + меши ----------
let count = 2;
let dice = [];
let world = null;

function syncMeshes() {
  world.bodies.forEach((b, i) => {
    dice[i].position.copy(b.interpolatedPosition);
    dice[i].quaternion.copy(b.interpolatedQuaternion);
  });
}

function rebuild() {
  dice.forEach(d => view.scene.remove(d));
  world = createLiveWorld(count, haptic);
  dice = Array.from({ length: count }, () => {
    const m = createDie();
    setLabels(m, STANDARD);
    view.scene.add(m);
    return m;
  });
  syncMeshes();
  countEl.textContent = count;
  view.render();
}

// ---------- Состояние: live (поднос) -> rolling (проигрыш записанного броска) -> live ----------
let mode = 'live';
const BUILD = 4;                                // номер сборки: виден в диагностике, чтобы понимать, какая версия открыта
const lastThrow = { fc: 0, maxDt: 0, info: '-' };   // данные последнего броска для диагностики
let playback = null;
let pendingRoll = null;        // значения запрашиваем в начале тряски, к броску они уже готовы

const motion = createMotion({ flip: FLIP });
const tracker = createShakeTracker({ onStart: handleStart, onRelease: handleRelease });

function handleStart() {
  pendingRoll = requestRoll(count);
  pendingRoll.catch(() => {});                  // ошибку обработаем при броске
  resultEl.textContent = '...';
}

async function handleRelease() {
  if (mode !== 'live') return;
  mode = 'rolling';
  playback = null;

  let sim;
  try {
    const tf = performance.now();
    sim = forecastRoll(world.snapshot());       // 20-60 мс: весь полёт считается заранее
    lastThrow.fc = performance.now() - tf;
    lastThrow.maxDt = 0;
    lastThrow.info = `n=${count} kick=${sim.stats.kicked} ramp=${sim.stats.ramped} swap=${sim.swapKind.map(k => k[0]).join('')} dur=${(sim.steps / CONFIG.STEP_HZ).toFixed(1)}s`;
  } catch (e) {
    console.error(e);
    resultEl.textContent = 'Ошибка физики';
    mode = 'live';
    return;
  }

  let values;
  try {
    values = await (pendingRoll ?? requestRoll(count));
  } catch {
    resultEl.textContent = 'Ошибка сети';
    pendingRoll = null;
    mode = 'live';                              // мир не менялся, продолжаем с того же места
    return;
  }
  pendingRoll = null;

  // Какие числа на какой грани — решаем сейчас, но покажем их, когда кость в воздухе
  const labels = dice.map((_, i) => computeLabels(sim.tops[i], values[i]));
  playback = {
    sim, values, labels,
    swapped: dice.map(() => false),
    impactIdx: 0,
    pt: 0,                                      // собственные часы записи, секунды
    started: false,
  };
}

function playbackFrame(now, frameDt) {
  if (!playback) return;                        // ждём значения (сервер)
  const { sim, labels, swapped } = playback;
  // Часы записи ведём по тем же rAF-кадрам, что и всё остальное (frameDt), а не по performance.now():
  // иначе первый шаг получается нулевым (расчёт траектории съедает время) и кости замирают на кадр.
  // Первый кадр: ровно один номинальный шаг 1/60 с, без учёта задержки на расчёт.
  // Дальше: не быстрее 2 кадров за раз (подвисание 120 мс -> шаг 0.034 с вместо 0.12 с).
  playback.pt += playback.started ? Math.min(frameDt, CONFIG.PLAYBACK_MAX_DT) : 1 / 60;
  playback.started = true;
  const t = playback.pt;
  const going = poseAt(sim, dice, t);
  const step = t * CONFIG.STEP_HZ;

  for (let i = 0; i < dice.length; i++) {       // подмена чисел в воздухе
    if (!swapped[i] && step >= sim.swapSteps[i]) {
      setLabels(dice[i], labels[i]);
      swapped[i] = true;
    }
  }
  while (playback.impactIdx < sim.impacts.length && sim.impacts[playback.impactIdx].step <= step) {
    haptic(sim.impacts[playback.impactIdx++].v);
  }
  if (!going) finishRoll();
}

function finishRoll() {
  const { sim, values, labels, swapped } = playback;
  dice.forEach((m, i) => { if (!swapped[i]) setLabels(m, labels[i]); });
  world.freezeAt(finalPose(sim));               // живой мир продолжается с места остановки
  const sum = values.reduce((a, b) => a + b, 0);
  resultEl.textContent = count > 1 ? `${values.join(' + ')} = ${sum}` : `${values[0]}`;
  playback = null;
  mode = 'live';
  tracker.reset(performance.now());
}

// ---------- Главный цикл ----------
let lastTime = performance.now();
function frame(now) {
  if (mode === 'rolling') lastThrow.maxDt = Math.max(lastThrow.maxDt, now - lastTime);   // реальная длина кадра, мс
  const dt = Math.max(0, Math.min((now - lastTime) / 1000, 0.05));
  lastTime = now;
  if (mode === 'live') {
    world.step(dt, motion.gravity(now));
    syncMeshes();
    tracker.update(motion.dev(now), now);
  } else {
    playbackFrame(now, dt);
  }
  view.render();
  requestAnimationFrame(frame);
}

// ---------- Датчики ----------
let source = 'не запущен';
let statusMsg = '';
let motionStarting = false;
async function ensureMotion() {                 // безопасно вызывать много раз
  if (motionStarting) return;
  motionStarting = true;
  source = (await startMotion((x, y, z) => motion.feed(x, y, z), (s) => { statusMsg = s; })) || 'нет';
}
ensureMotion();                                 // Telegram-акселерометр стартует без жеста
window.addEventListener('pointerdown', () => { goFullscreen(); ensureMotion(); }, { once: true });
// ^ первое касание: повторный запрос полного экрана и запуск датчика (нужно для iOS DeviceMotion)

// ---------- Кнопки ----------
document.getElementById('rollBtn').addEventListener('click', () => {
  if (mode === 'live') tracker.force(performance.now());   // без тряски: сразу финальный подброс
});
document.getElementById('plus').addEventListener('click', () => {
  if (mode === 'live' && count < CONFIG.MAX_DICE) { count++; rebuild(); }
});
document.getElementById('minus').addEventListener('click', () => {
  if (mode === 'live' && count > 1) { count--; rebuild(); }
});

// ---------- Диагностика ----------
if (SHOW_DEBUG) {
  setInterval(() => {
    const m = motion.info();
    const g = motion.gravity().map(v => v.toFixed(0)).join(',');
    debugEl.textContent =
      `tg ${tg?.version ?? '-'} ${tg?.platform ?? '-'} fullscreen=${tg?.isFullscreen ?? '-'} ${fsError}\n` +
      `sensor=${source} samples=${m.samples} ${statusMsg}\n` +
      `xyz=${m.raw.map(v => v.toFixed(1)).join(' ')} dev=${m.dev.toFixed(1)} sign=${m.sign > 0 ? '+' : '-'}${m.detected ? '' : '?'}\n` +
      `mode=${mode}/${tracker.state} shakes=${tracker.shakes} g=[${g}]\n` +
      `build ${BUILD}; бросок: расчёт ${lastThrow.fc.toFixed(0)} мс, макс. кадр ${lastThrow.maxDt.toFixed(0)} мс, ${lastThrow.info}`;
  }, 250);
}

rebuild();
requestAnimationFrame(frame);
