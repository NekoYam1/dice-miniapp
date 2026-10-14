import { rollDie } from './rng.js';

// Когда появится сервер, укажи URL. Сервер валидирует initData, бросает кости и возвращает значения
const API_URL = null;   // например 'https://your-server.example/api/roll'

export async function requestRoll(count) {
  if (!API_URL) return Array.from({ length: count }, () => rollDie(6));   // например [4, 6]
  const r = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, initData: window.Telegram?.WebApp?.initData }),
  });
  if (!r.ok) throw new Error('roll failed');
  return (await r.json()).values;
}
