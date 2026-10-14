// Запускает датчик движения. Возвращает название источника или null.
// onStatus(text) — для вывода диагностики на экран.
export async function startMotion(feed, onStatus = () => {}) {
  const tg = window.Telegram?.WebApp;

  // 1. Telegram Accelerometer (Bot API 8.0+), разрешение пользователя не требуется
  if (tg?.isVersionAtLeast?.('8.0') && tg.Accelerometer) {
    tg.onEvent('accelerometerChanged', () => {
      const a = tg.Accelerometer;
      feed(a.x, a.y, a.z);
    });
    tg.onEvent('accelerometerFailed', (e) => onStatus('tg-accel failed: ' + (e?.error || '?')));
    const ok = await new Promise((res) => {
      try { tg.Accelerometer.start({ refresh_rate: 20 }, (started) => res(!!started)); }
      catch (e) { onStatus('tg-accel error: ' + e.message); res(false); }
    });
    if (ok) return 'tg-accel';
    onStatus('tg-accel не запустился, пробую devicemotion');
  }

  // 2. Обычный DeviceMotion (на iOS нужен жест пользователя и разрешение)
  if (typeof DeviceMotionEvent !== 'undefined') {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission().catch(() => 'denied');
      if (r !== 'granted') { onStatus('devicemotion: доступ отклонён'); return null; }
    }
    window.addEventListener('devicemotion', (e) => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (a) feed(a.x || 0, a.y || 0, a.z || 0);
    });
    return 'devicemotion';
  }
  onStatus('датчиков нет');
  return null;
}
