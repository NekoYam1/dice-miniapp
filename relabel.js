import { FACE_NORMALS } from './config.js';

// Стандартная раскладка по граням [+x, -x, +y, -y, +z, -z]
// Противоположные грани дают 7 (3+4, 1+6, 2+5), 1-2-3 идут против часовой вокруг вершины
export const STANDARD = [3, 4, 1, 6, 2, 5];

const det = (m) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);

const apply = (m, v) => m.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);

const faceOf = (v) => FACE_NORMALS.findIndex(n => n[0] === v[0] && n[1] === v[1] && n[2] === v[2]);

// 24 поворота куба = знаковые перестановки осей с det = +1 (без зеркальных)
function buildRotations() {
  const out = [];
  const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
  for (const p of perms) for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const s = [sx, sy, sz];
    const m = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++) m[i][p[i]] = s[i];
    if (det(m) === 1) out.push(m);         // 6*8 = 48 -> 24 подходят
  }
  return out;
}
const ROTATIONS = buildRotations();

// topFace — локальная грань (0..5), оказавшаяся сверху; value — число из RNG (1..6)
// Возвращает labels[6]: какое число нарисовать на каждой локальной грани
export function computeLabels(topFace, value) {
  const target = STANDARD.indexOf(value);
  // Поворотов, переводящих topFace в target, ровно 4 (вращение вокруг этой оси)
  const fits = ROTATIONS.filter(m => faceOf(apply(m, FACE_NORMALS[topFace])) === target);
  const m = fits[Math.floor(Math.random() * fits.length)];
  return FACE_NORMALS.map(nrm => STANDARD[faceOf(apply(m, nrm))]);
}
// Пример: сверху легла грань 0 (+x), из RNG выпало 5.
// target = STANDARD.indexOf(5) = 5 (-z). Поворот вокруг Y на 90° переводит +x в -z, получаем
// labels = [5, 2, 1, 6, 3, 4]. Сумма противоположных 5+2, 1+6, 3+4 = 7 везде.
