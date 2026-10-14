// Равномерное целое 1..sides без смещения (rejection sampling)
export function rollDie(sides = 6) {
  const limit = 256 - (256 % sides);       // sides=6 -> 252
  const buf = new Uint8Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return (buf[0] % sides) + 1;             // пример: 0..251 -> 1..6, по 42 значения на грань
}
