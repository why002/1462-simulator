import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAME } from './config';
import type { PathData } from './types';

export interface Train {
  group: THREE.Group;
  place(s: number): void;
  setTilt(angle: number): void;
}

type MaterialKey =
  | 'body'
  | 'bodyDark'
  | 'face'
  | 'yellow'
  | 'roof'
  | 'glass'
  | 'wheel'
  | 'chassis'
  | 'red'
  | 'metal'
  | 'headlight'
  | 'tail';

type Parts = Partial<Record<MaterialKey, THREE.BufferGeometry[]>>;

const materials: Record<MaterialKey, THREE.MeshStandardMaterial> = {
  body: new THREE.MeshStandardMaterial({ color: 0x1a7049, roughness: 0.46, metalness: 0.18 }),
  bodyDark: new THREE.MeshStandardMaterial({ color: 0x0f3f2b, roughness: 0.64, metalness: 0.12 }),
  face: new THREE.MeshStandardMaterial({ color: 0xe3eddd, roughness: 0.42, metalness: 0.12 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xffcf45, roughness: 0.38, metalness: 0.2 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x4b554f, roughness: 0.82, metalness: 0.28 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x101e22, roughness: 0.16, metalness: 0.55 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x1b1e1f, roughness: 0.72, metalness: 0.45 }),
  chassis: new THREE.MeshStandardMaterial({ color: 0x232925, roughness: 0.86, metalness: 0.25 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa8231b, roughness: 0.58, metalness: 0.2 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x9aa4a3, roughness: 0.36, metalness: 0.72 }),
  headlight: new THREE.MeshStandardMaterial({
    color: 0xfff2c2,
    emissive: 0xffd76a,
    emissiveIntensity: 3.2,
  }),
  tail: new THREE.MeshStandardMaterial({
    color: 0x76100c,
    emissive: 0xff2c1c,
    emissiveIntensity: 2.8,
  }),
};

const LOCO_LENGTH = 12;
const COACH_LENGTH = 11;

export function createTrain(path: PathData): Train {
  const group = new THREE.Group();
  const loco = buildLoco();
  const coach = buildCoach();
  for (const car of [loco, coach]) {
    car.rotation.order = 'YXZ';
  }
  group.add(loco, coach);

  function placeCar(car: THREE.Group, centerS: number, length: number): void {
    const pivotInset = 1.9;
    const front = path.sampleAt(centerS + length * 0.5 - pivotInset);
    const rear = path.sampleAt(centerS - length * 0.5 + pivotInset);
    car.position.set((front.x + rear.x) * 0.5, 0, (front.z + rear.z) * 0.5);
    car.rotation.y = Math.atan2(-(front.x - rear.x), -(front.z - rear.z));
  }

  function place(s: number): void {
    placeCar(loco, s, LOCO_LENGTH);
    placeCar(coach, s - GAME.coachOffset, COACH_LENGTH);
  }

  function setTilt(angle: number): void {
    loco.rotation.z = angle;
    coach.rotation.z = angle;
  }

  place(GAME.startS);

  return { group, place, setTilt };
}

function buildLoco(): THREE.Group {
  const group = new THREE.Group();
  const parts: Parts = {};

  addBox(parts, 'chassis', 2.7, 0.38, 11.8, 0, 1.32, 0);
  addBox(parts, 'bodyDark', 3.04, 0.55, 10.9, 0, 1.72, 0);
  addBox(parts, 'body', 3.06, 2.15, 10.9, 0, 3.02, 0);
  addBox(parts, 'yellow', 3.08, 0.26, 10.92, 0, 2.42, 0);
  addBox(parts, 'roof', 2.9, 0.22, 10.7, 0, 4.24, 0);

  addBox(parts, 'face', 2.96, 2.35, 0.22, 0, 3.0, -5.46);
  addBox(parts, 'face', 2.96, 2.15, 0.18, 0, 3.0, 5.46);
  addBox(parts, 'roof', 2.7, 0.34, 1.15, 0, 4.05, -5.18, -0.26);

  for (const z of [-5.52, 5.52]) {
    const direction = Math.sign(z);
    addBox(parts, 'red', 2.86, 0.3, 0.34, 0, 1.48, z + direction * 0.08);
    addBox(parts, 'chassis', 0.32, 0.34, 0.7, 0, 1.38, z + direction * 0.35);
  }

  for (const x of [-0.66, 0.66]) {
    addBox(parts, 'glass', 0.92, 0.72, 0.06, x, 3.58, -5.58);
    addBox(parts, 'glass', 0.92, 0.62, 0.06, x, 3.56, 5.57);
    addBox(parts, 'glass', 0.05, 0.82, 0.64, x < 0 ? -1.54 : 1.54, 3.5, -4.62);
    addBox(parts, 'glass', 0.05, 0.82, 0.64, x < 0 ? -1.54 : 1.54, 3.5, 4.62);
  }

  for (const x of [-1.02, 1.02]) {
    addCylinder(parts, 'headlight', 0.15, 0.15, 0.12, 14, x, 2.72, -5.6, Math.PI / 2);
    addCylinder(parts, 'tail', 0.085, 0.085, 0.1, 12, x, 2.1, -5.6, Math.PI / 2);
  }

  for (const side of [-1, 1]) {
    const x = side * 1.535;
    for (const z of [-3.45, -2.2, 2.2, 3.45]) {
      addBox(parts, 'glass', 0.05, 0.72, 0.92, x, 3.46, z);
    }
    for (const z of [-0.9, 0.9]) {
      addBox(parts, 'bodyDark', 0.06, 0.82, 1.02, x, 2.82, z);
      addBox(parts, 'metal', 0.02, 0.06, 0.86, x + side * 0.03, 2.82, z);
    }
    addBox(parts, 'metal', 0.05, 0.34, 0.9, x, 1.72, -4.3);
    addBox(parts, 'metal', 0.05, 0.34, 0.9, x, 1.72, 4.3);
  }

  addBogies(parts, [-3.45, 3.45]);
  addPantograph(parts);
  addCoupler(parts, 1);

  addMerged(group, parts);
  addSideLabel(group, 1.55, 3.2, 0.7, 1, 'SS9 0146', '上局沪段', 2.9, 0.72);
  addSideLabel(group, -1.55, 3.2, 0.7, -1, 'SS9 0146', '上局沪段', 2.9, 0.72);
  addFrontLabel(group);

  return group;
}

function buildCoach(): THREE.Group {
  const group = new THREE.Group();
  const parts: Parts = {};

  addBox(parts, 'chassis', 2.7, 0.38, 11.2, 0, 1.32, 0);
  addBox(parts, 'bodyDark', 3.04, 0.5, 10.9, 0, 1.7, 0);
  addBox(parts, 'body', 3.06, 2.25, 10.9, 0, 3.0, 0);
  addBox(parts, 'yellow', 3.08, 0.3, 10.92, 0, 2.42, 0);
  addBox(parts, 'roof', 2.86, 0.2, 10.6, 0, 4.24, 0);

  for (const side of [-1, 1]) {
    const x = side * 1.535;
    for (let i = 0; i < 10; i += 1) {
      const z = -4.08 + i * 0.91;
      addBox(parts, 'glass', 0.05, 0.76, 0.68, x, 3.42, z);
      addBox(parts, 'bodyDark', 0.055, 0.04, 0.76, x, 3.0, z);
    }
    for (const z of [-4.75, 4.75]) {
      addBox(parts, 'bodyDark', 0.06, 2.0, 0.78, x, 2.85, z);
      addBox(parts, 'glass', 0.06, 0.54, 0.5, x, 3.55, z);
      addBox(parts, 'metal', 0.02, 0.09, 0.8, x + side * 0.03, 1.95, z);
    }
    addBox(parts, 'metal', 0.05, 0.25, 9.2, x, 1.68, 0);
  }

  for (const z of [-2.2, 2.2]) {
    addBox(parts, 'roof', 1.55, 0.3, 1.8, 0, 4.42, z);
    addBox(parts, 'bodyDark', 1.0, 0.08, 1.2, 0, 4.6, z);
  }

  addBogies(parts, [-3.35, 3.35]);
  addCoupler(parts, -1);

  for (const x of [-0.9, 0.9]) {
    addBox(parts, 'chassis', 0.26, 0.26, 0.24, x, 2.0, 5.48);
    addBox(parts, 'tail', 0.2, 0.2, 0.06, x, 2.0, 5.62);
  }

  addMerged(group, parts);
  addSideLabel(group, 1.55, 2.98, 0.5, 1, '上海—北京', '1462 · 硬座车', 3.0, 0.7);
  addSideLabel(group, -1.55, 2.98, 0.5, -1, '上海—北京', '1462 · 硬座车', 3.0, 0.7);

  return group;
}

function addMerged(group: THREE.Group, parts: Parts): void {
  for (const [key, geometries] of Object.entries(parts) as Array<[MaterialKey, THREE.BufferGeometry[]]>) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) {
      throw new Error(`Failed to merge train geometry: ${key}`);
    }
    const mesh = new THREE.Mesh(merged, materials[key]);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    group.add(mesh);
  }
}

function addBox(
  parts: Parts,
  key: MaterialKey,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
): void {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  applyTransform(
    geometry,
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, rotationY, rotationZ)),
  );
  (parts[key] ??= []).push(geometry);
}

function addCylinder(
  parts: Parts,
  key: MaterialKey,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  segments: number,
  x: number,
  y: number,
  z: number,
  rotationX = 0,
  rotationY = 0,
  rotationZ = 0,
): void {
  const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
  applyTransform(
    geometry,
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, rotationY, rotationZ)),
  );
  (parts[key] ??= []).push(geometry);
}

function addRod(
  parts: Parts,
  key: MaterialKey,
  radius: number,
  start: THREE.Vector3,
  end: THREE.Vector3,
  segments = 8,
): void {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  if (length < 1e-6) {
    return;
  }
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
  const quaternion = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
  applyTransform(geometry, center, quaternion);
  (parts[key] ??= []).push(geometry);
}

function applyTransform(
  geometry: THREE.BufferGeometry,
  position: THREE.Vector3,
  quaternion: THREE.Quaternion,
): void {
  const matrix = new THREE.Matrix4().compose(position, quaternion, new THREE.Vector3(1, 1, 1));
  geometry.applyMatrix4(matrix);
}

function addBogies(parts: Parts, centers: number[]): void {
  for (const center of centers) {
    addBox(parts, 'chassis', 2.2, 0.42, 2.5, 0, 1.05, center);
    addBox(parts, 'metal', 1.9, 0.2, 1.7, 0, 1.2, center);
    for (const z of [center - 0.92, center + 0.92]) {
      addCylinder(parts, 'wheel', 0.46, 0.46, 0.22, 16, -0.75, 0.93, z, 0, 0, Math.PI / 2);
      addCylinder(parts, 'wheel', 0.46, 0.46, 0.22, 16, 0.75, 0.93, z, 0, 0, Math.PI / 2);
      addCylinder(parts, 'metal', 0.12, 0.12, 1.7, 10, 0, 0.93, z, 0, 0, Math.PI / 2);
    }
  }
}

function addPantograph(parts: Parts): void {
  const baseZ = 2.05;
  addBox(parts, 'roof', 1.7, 0.12, 1.0, 0, 4.4, baseZ);
  for (const x of [-0.62, 0.62]) {
    for (const z of [baseZ - 0.32, baseZ + 0.32]) {
      addCylinder(parts, 'bodyDark', 0.085, 0.085, 0.3, 8, x, 4.57, z);
    }
  }

  const lowerStart = new THREE.Vector3(0, 4.7, baseZ + 0.24);
  const knee = new THREE.Vector3(0, 5.62, baseZ - 0.55);
  const top = new THREE.Vector3(0, 6.2, baseZ + 0.18);
  addRod(parts, 'metal', 0.06, lowerStart, knee);
  addRod(parts, 'metal', 0.045, knee, top);
  addRod(parts, 'metal', 0.035, new THREE.Vector3(-0.5, 4.7, baseZ + 0.2), knee);
  addRod(parts, 'metal', 0.035, new THREE.Vector3(0.5, 4.7, baseZ + 0.2), knee);
  addBox(parts, 'metal', 1.9, 0.07, 0.16, 0, 6.24, baseZ + 0.18);
  addRod(parts, 'metal', 0.035, knee, new THREE.Vector3(0, 6.14, baseZ + 0.72));
  addBox(parts, 'metal', 0.1, 0.06, 0.6, 0, 6.13, baseZ + 0.45);
}

function addCoupler(parts: Parts, direction: 1 | -1): void {
  addBox(parts, 'chassis', 0.34, 0.28, 0.8, 0, 1.4, direction * 5.8);
  addBox(parts, 'metal', 0.5, 0.14, 0.24, 0, 1.33, direction * 6.15);
}

function addSideLabel(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  side: -1 | 1,
  title: string,
  subtitle: string,
  width = 2.4,
  height = 0.62,
): void {
  const texture = makeLabelTexture(title, subtitle);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  plane.position.set(x, y, z);
  plane.rotation.y = side * (Math.PI / 2);
  group.add(plane);
}

function addFrontLabel(group: THREE.Group): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }
  context.fillStyle = '#10261c';
  context.fillRect(0, 0, 512, 128);
  context.fillStyle = '#ffd24a';
  context.font = '700 54px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('1462 上海—北京', 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.7, 0.42),
    new THREE.MeshBasicMaterial({ map: texture }),
  );
  plane.position.set(0, 1.95, -5.62);
  plane.rotation.y = Math.PI;
  group.add(plane);
}

function makeLabelTexture(title: string, subtitle: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 132;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.clearRect(0, 0, 512, 132);
  context.fillStyle = '#f4c63c';
  context.font = '700 58px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(title, 256, 48);
  context.fillStyle = '#e7efe4';
  context.font = '500 30px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText(subtitle, 256, 102);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
