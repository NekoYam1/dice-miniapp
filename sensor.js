// Возвращает true, если какой-то датчик запущен
export async function startMotion(feed) {
  const tg = window.Telegram?.WebApp;

  // 1. Telegram Accelerometer (Bot API 8.0+)
  if (tg?.isVersionAtLeast?.('8.0') && tg.Accelerometer) {
    tg.onEvent('accelerometerChanged', () => {
      const a = tg.Accelerometer;
      feed(a.x, a.y, a.z);
    });
    const ok = await new Promise(res =>
      tg.Accelerometer.start({ refresh_rate: 50 }, started => res(started)));
    if (ok) return true;
  }

  // 2. Обычный DeviceMotion (на iOS нужен жест пользователя + разрешение)
  if (typeof DeviceMotionEvent !== 'undefined') {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      const r = await DeviceMotionEvent.requestPermission().catch(() => 'denied');
      if (r !== 'granted') return false;
    }
    window.addEventListener('devicemotion', e => {
      const a = e.accelerationIncludingGravity;
      if (a) feed(a.x || 0, a.y || 0, a.z || 0);
    });
    return true;
  }
  return false;
}
