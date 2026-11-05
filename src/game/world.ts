import * as THREE from 'three';
import { GAME } from './config';

export function buildWorld(scene: THREE.Scene): void {
  const sky = new THREE.Color(0xa9d0ea);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 1000, 7000);

  const hemi = new THREE.HemisphereLight(0xe3f3ff, 0x46543b, 1.35);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xffefcf, 2.2);
  sun.position.set(-700, 1000, -500);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xbfd8ff, 0.65);
  fill.position.set(400, 300, 900);
  scene.add(fill);

  buildGround(scene);
  buildTrack(scene);
  buildFinishGate(scene);
}

function buildGround(scene: THREE.Scene): void {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14000, 14000),
    new THREE.MeshStandardMaterial({
      map: makeGroundTexture(),
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, -2500);
  scene.add(ground);
}

function buildTrack(scene: THREE.Scene): void {
  const trackStart = 100;
  const trackEnd = -GAME.trackVisualEnd;
  const trackLength = trackStart - trackEnd;
  const trackCenter = (trackStart + trackEnd) / 2;

  const ballast = new THREE.Mesh(
    new THREE.BoxGeometry(5.4, 0.3, trackLength),
    new THREE.MeshStandardMaterial({
      map: makeBallastTexture(),
      color: 0x9a8f84,
      roughness: 1,
    }),
  );
  ballast.position.set(0, 0.1, trackCenter);
  scene.add(ballast);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7d0d6,
    roughness: 0.32,
    metalness: 0.82,
  });
  for (const x of [-0.75, 0.75]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, trackLength), railMaterial);
    rail.position.set(x, 0.45, trackCenter);
    scene.add(rail);
  }

  const sleeperCount = Math.floor(trackLength / 3.2);
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.7, 0.12, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x8b7a67, roughness: 1 }),
    sleeperCount,
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < sleeperCount; i += 1) {
    dummy.position.set(0, 0.31, trackStart - i * 3.2);
    dummy.updateMatrix();
    sleepers.setMatrixAt(i, dummy.matrix);
  }
  sleepers.instanceMatrix.needsUpdate = true;
  scene.add(sleepers);

  const startLine = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 0.6),
    new THREE.MeshBasicMaterial({ color: 0xf5f0d8, transparent: true, opacity: 0.55 }),
  );
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(0, 0.385, -GAME.startS);
  scene.add(startLine);
}

function buildFinishGate(scene: THREE.Scene): void {
  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7dde0,
    roughness: 0.5,
    metalness: 0.4,
  });
  for (const x of [-5.4, 5.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 7, 0.34), postMaterial);
    post.position.set(x, 3.5, -GAME.finishS);
    scene.add(post);
  }

  const sideMaterial = new THREE.MeshStandardMaterial({ color: 0x17332a, roughness: 0.8 });
  const faceMaterial = new THREE.MeshBasicMaterial({ map: makeBannerTexture() });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(11.2, 1.5, 0.4), [
    sideMaterial,
    sideMaterial,
    sideMaterial,
    sideMaterial,
    faceMaterial,
    faceMaterial,
  ]);
  banner.position.set(0, 7, -GAME.finishS);
  scene.add(banner);
}

function makeGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.fillStyle = '#6d8a55';
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const width = 6 + Math.random() * 46;
    const height = 3 + Math.random() * 20;
    context.fillStyle =
      Math.random() < 0.5 ? 'rgba(88,112,62,0.5)' : 'rgba(126,150,92,0.45)';
    context.fillRect(x, y, width, height);
  }

  context.strokeStyle = 'rgba(78,102,58,0.35)';
  context.lineWidth = 1;
  for (let i = 0; i < 10; i += 1) {
    const y = Math.random() * 256;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(256, y + (Math.random() - 0.5) * 20);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(140, 140);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeBallastTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.fillStyle = '#6f665c';
  context.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i += 1) {
    const shade = Math.floor(70 + Math.random() * 60);
    context.fillStyle = `rgba(${shade},${shade - 6},${shade - 12},0.7)`;
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    const size = 0.6 + Math.random() * 1.6;
    context.fillRect(x, y, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 400);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.fillStyle = '#0c2b20';
  context.fillRect(0, 0, 1024, 128);

  const tile = 16;
  for (let x = 0; x < 1024; x += tile) {
    context.fillStyle = (x / tile) % 2 === 0 ? '#f5f5f0' : '#18261f';
    context.fillRect(x, 0, tile, tile);
    context.fillRect(x, 128 - tile, tile, tile);
  }

  context.fillStyle = '#ffd24a';
  context.font = '700 58px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('终 点 · 4,000 m', 512, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
