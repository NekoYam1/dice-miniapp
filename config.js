export const CONFIG = {
  DIE_SIZE: 1,
  ARENA: { halfX: 2.6, halfZ: 3.8, ceiling: 7 },  // стол 5.2 x 7.6 ед., кость = 1 ед.
  GRAVITY: -35,        // -25 «плавает», -50 «резкая»
  STEP_HZ: 120,        // шаг физики
  MAX_SECONDS: 6,      // предохранитель
  SETTLE_STEPS: 30,    // 30 шагов покоя = 0.25 с -> бросок окончен
  SETTLE_SPEED: 0.05,
  MAX_DICE: 5,
};

// Нормали граней в локальных осях кости. Порядок = порядок групп BoxGeometry:
// 0:+x  1:-x  2:+y  3:-y  4:+z  5:-z
export const FACE_NORMALS = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
