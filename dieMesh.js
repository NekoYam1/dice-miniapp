import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CONFIG } from './config.js';

const PIPS = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };  // клетки сетки 3x3

function faceTexture(value) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#f5f0e6';
  g.fillRect(0, 0, S, S);
  const r = value === 1 ? 34 : 22;
  const colors = value === 1 ? ['#e0483a', '#8f1d14'] : ['#3a3a40', '#0d0d10'];
  for (const i of PIPS[value]) {
    const x = S * (0.27 + 0.23 * (i % 3));
    const y = S * (0.27 + 0.23 * Math.floor(i / 3));
    const grad = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(1, colors[1]);
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

let MATS = null;   // MATS[v] — материал грани со значением v (индекс 0 не используется)
function materials() {
  if (!MATS) {
    MATS = [null];
    for (let v = 1; v <= 6; v++) {
      MATS.push(new THREE.MeshStandardMaterial({ map: faceTexture(v), roughness: 0.35 }));
    }
  }
  return MATS;
}

export function createDie() {
  const s = CONFIG.DIE_SIZE;
  const geo = new RoundedBoxGeometry(s, s, s, 4, 0.09);   // скругление 0.09 ед.
  const mesh = new THREE.Mesh(geo, materials().slice(1, 7));
  mesh.castShadow = true;
  return mesh;
}

// labels[f] — число на локальной грани f (порядок групп BoxGeometry: +x,-x,+y,-y,+z,-z)
export function setLabels(mesh, labels) {
  const m = materials();
  mesh.material = labels.map(v => m[v]);
}
