import './style.css';
import * as THREE from 'three';
import { createGame } from './game/game';
import { attachStations, buildRoute } from './game/route';
import { STATIONS } from './game/stations';
import { createTrain } from './game/train';
import { buildWorld } from './game/world';

const canvas = document.getElementById('scene');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #scene canvas');
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
(window as unknown as { __renderer: THREE.WebGLRenderer }).__renderer = renderer;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.5,
  40000,
);

const path = buildRoute();
const stations = attachStations(path, STATIONS);

buildWorld(scene, path, stations);

const train = createTrain(path);
scene.add(train.group);

const game = createGame(scene, camera, train, path, stations);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  game.update(dt);
  renderer.render(scene, camera);
});
