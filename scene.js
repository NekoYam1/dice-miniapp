import * as THREE from 'three';
import { CONFIG } from './config.js';

export function createScene(canvas, quality) {
  const { halfX, halfZ } = CONFIG.ARENA;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias });
  renderer.setPixelRatio(quality.dpr);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#141821');
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a4a, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(3, 9, 4);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -halfX - 1, right: halfX + 1, top: halfZ + 1, bottom: -halfZ - 1, near: 1, far: 25,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(halfX * 2 + 1.2, halfZ * 2 + 1.2),
    new THREE.MeshStandardMaterial({ color: '#1f5c46', roughness: 0.95 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Бортики (чисто визуальные; физические стены — плоскости в physics.js)
  const railMat = new THREE.MeshStandardMaterial({ color: '#5b3a22', roughness: 0.6 });
  const t = 0.3;
  const rail = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), railMat);
    m.position.set(x, 0.25, z);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };
  rail(t, halfZ * 2 + 2 * t, -halfX - t / 2, 0);
  rail(t, halfZ * 2 + 2 * t,  halfX + t / 2, 0);
  rail(halfX * 2, t, 0, -halfZ - t / 2);
  rail(halfX * 2, t, 0,  halfZ + t / 2);

  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Подбираем дистанцию, чтобы стол целиком влезал и в портрете, и в ландшафте
    const vTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needW = halfX * 2 + 1.4, needH = halfZ * 2 + 1.4;
    const dist = Math.max(needH / (2 * vTan), needW / (2 * vTan * camera.aspect));
    const elev = THREE.MathUtils.degToRad(68);
    camera.position.set(0, dist * Math.sin(elev), dist * Math.cos(elev));
    camera.lookAt(0, 0, 0.8);              // сдвиг вверх: нижнюю часть закрывает панель кнопок
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', () => { resize(); renderer.render(scene, camera); });

  return { scene, render: () => renderer.render(scene, camera) };
}
