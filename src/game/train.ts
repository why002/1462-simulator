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
  | 'coachGreen'
  | 'coachDark'
  | 'coachRoof'
  | 'locoRed'
  | 'locoRoof'
  | 'white'
  | 'silver'
  | 'yellow'
  | 'roof'
  | 'glass'
  | 'wheel'
  | 'chassis'
  | 'red'
  | 'metal'
  | 'headlight'
  | 'tail'
  | 'gangway';

type Parts = Partial<Record<MaterialKey, THREE.BufferGeometry[]>>;

const materials: Record<MaterialKey, THREE.MeshStandardMaterial> = {
  coachGreen: new THREE.MeshStandardMaterial({ color: 0x1a6544, roughness: 0.46, metalness: 0.18 }),
  coachDark: new THREE.MeshStandardMaterial({ color: 0x0f3a29, roughness: 0.64, metalness: 0.12 }),
  coachRoof: new THREE.MeshStandardMaterial({ color: 0x8b948d, roughness: 0.78, metalness: 0.3 }),
  locoRed: new THREE.MeshStandardMaterial({ color: 0xbe2a21, roughness: 0.42, metalness: 0.16 }),
  locoRoof: new THREE.MeshStandardMaterial({ color: 0x8f211b, roughness: 0.6, metalness: 0.2 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe7e9e3, roughness: 0.46, metalness: 0.14 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc6ccc8, roughness: 0.5, metalness: 0.5 }),
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
    color: 0x5c0a07,
    emissive: 0xe01612,
    emissiveIntensity: 1.5,
  }),
  gangway: new THREE.MeshStandardMaterial({ color: 0x111513, roughness: 0.94, metalness: 0.05 }),
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
  addBox(parts, 'locoRed', 3.04, 0.55, 10.9, 0, 1.72, 0);
  addBox(parts, 'locoRed', 3.06, 2.15, 10.9, 0, 3.02, 0);
  addBox(parts, 'locoRoof', 2.9, 0.22, 10.7, 0, 4.24, 0);

  addLocoFace(parts);

  for (const side of [-1, 1] as const) {
    const x = side * 1.535;
    addBox(parts, 'white', 0.05, 1.18, 10.7, x, 3.12, 0);

    addBox(parts, 'white', 0.05, 1.2, 0.8, side * 1.55, 3.12, -3.9);
    addBox(parts, 'chassis', 0.03, 1.2, 0.03, side * 1.565, 3.12, -4.3);
    addBox(parts, 'chassis', 0.03, 1.2, 0.03, side * 1.565, 3.12, -3.5);
    addBox(parts, 'chassis', 0.05, 0.54, 0.42, side * 1.575, 3.43, -3.9);
    addBox(parts, 'glass', 0.05, 0.44, 0.32, side * 1.58, 3.43, -3.9);
    addBox(parts, 'metal', 0.04, 0.18, 0.05, side * 1.58, 3.05, -3.62);

    for (const z of [-5.0, -4.55]) {
      addBox(parts, 'chassis', 0.05, 0.7, 0.36, side * 1.575, 3.45, z);
      addBox(parts, 'glass', 0.05, 0.6, 0.26, side * 1.58, 3.45, z);
    }

    for (const z of [-1.4, 0.3, 2.0, 3.7]) {
      addBox(parts, 'metal', 0.05, 0.62, 1.2, side * 1.555, 3.08, z);
      addBox(parts, 'roof', 0.06, 0.5, 1.06, side * 1.56, 3.08, z);
    }

    addBox(parts, 'chassis', 0.34, 0.06, 0.7, side * 1.62, 1.52, -3.9);
    addBox(parts, 'chassis', 0.34, 0.06, 0.7, side * 1.62, 1.26, -3.9);
    addBox(parts, 'metal', 0.05, 0.34, 0.9, x, 1.72, -4.3);
    addBox(parts, 'metal', 0.05, 0.34, 0.9, x, 1.72, 4.3);
  }

  addBox(parts, 'chassis', 1.6, 0.5, 1.6, -0.5, 1.16, -1.0);
  addBox(parts, 'chassis', 1.1, 0.42, 1.0, 0.7, 1.22, 1.15);
  addCylinder(parts, 'metal', 0.26, 0.26, 1.6, 14, 0.85, 1.08, -0.3, Math.PI / 2);
  addCylinder(parts, 'metal', 0.17, 0.17, 1.2, 12, -0.9, 1.12, 1.1, Math.PI / 2);

  addBogies(parts, [-3.45, 3.45], [-1.02, 0, 1.02], 3.1);
  addPantograph(parts);
  addCoupler(parts, 1);
  addCoupler(parts, -1);

  for (const x of [-0.8, 0.8]) {
    for (const z of [1.15, 2.95]) {
      addCylinder(parts, 'red', 0.07, 0.07, 0.26, 8, x, 4.42, z);
    }
  }

  addMerged(group, parts);
  addLocoSideLabel(group, 1.575, 3.2, -2.72, 1);
  addLocoSideLabel(group, -1.575, 3.2, -2.72, -1);
  addLocoNumberLabel(group);

  return group;
}

function buildCoach(): THREE.Group {
  const group = new THREE.Group();
  const parts: Parts = {};

  addBox(parts, 'chassis', 2.7, 0.38, 11.2, 0, 1.32, 0);
  addBox(parts, 'coachDark', 3.04, 0.5, 10.9, 0, 1.7, 0);
  addBox(parts, 'coachGreen', 3.06, 2.25, 10.9, 0, 3.0, 0);
  addBox(parts, 'yellow', 3.08, 0.3, 10.86, 0, 2.42, 0);
  addBox(parts, 'yellow', 3.08, 0.14, 10.86, 0, 3.98, 0);
  addCoachRoof(parts);

  for (const side of [-1, 1] as const) {
    const x = side * 1.535;
    for (let i = 0; i < 10; i += 1) {
      const z = -3.96 + i * 0.88;
      addWindow(parts, x, 3.42, z, 0.74, 0.82, side);
    }

    for (const z of [-4.75, 4.75]) {
      addBox(parts, 'coachGreen', 0.07, 2.0, 0.78, x, 2.85, z);
      addBox(parts, 'coachDark', 0.04, 2.0, 0.03, x + side * 0.045, 2.85, z - 0.39);
      addBox(parts, 'coachDark', 0.04, 2.0, 0.03, x + side * 0.045, 2.85, z + 0.39);
      addBox(parts, 'yellow', 0.03, 0.3, 0.8, x + side * 0.03, 2.42, z);
      addWindow(parts, x + side * 0.05, 3.5, z, 0.6, 0.68, side);
      addBox(parts, 'metal', 0.06, 0.16, 0.04, x + side * 0.055, 2.72, z - 0.28);
      addBox(parts, 'chassis', 0.34, 0.06, 0.62, side * 1.63, 1.52, z);
      addBox(parts, 'chassis', 0.34, 0.06, 0.62, side * 1.63, 1.26, z);
      addCylinder(
        parts,
        'metal',
        0.022,
        0.022,
        1.25,
        8,
        side * 1.575,
        2.85,
        z + Math.sign(z) * 0.46,
      );
    }

    addBox(parts, 'metal', 0.05, 0.25, 9.2, x, 1.68, 0);
  }

  addBogies(parts, [-3.35, 3.35]);
  addCoachUnderframe(parts);
  addCoachRearEnd(parts);
  addCoupler(parts, -1);
  addCoupler(parts, 1);
  addRoofVents(parts);
  addRoofUnit(parts);

  addMerged(group, parts);
  addLowerLabel(group, 1.55, 2.1, 0.6, 1, '1462 上海—北京 · 硬座车');
  addLowerLabel(group, -1.55, 2.1, 0.6, -1, '1462 上海—北京 · 硬座车');

  return group;
}

function addLocoFace(parts: Parts): void {
  addBox(parts, 'locoRed', 2.96, 2.32, 0.18, 0, 3.0, -5.5);
  addBox(parts, 'locoRoof', 2.94, 0.2, 1.4, 0, 4.2, -5.05, -0.12);
  addBox(parts, 'metal', 0.46, 0.2, 0.04, 0, 3.95, -5.59);
  addBox(parts, 'glass', 0.4, 0.14, 0.05, 0, 3.95, -5.605);

  for (const x of [-0.58, 0.58]) {
    addBox(parts, 'glass', 1.06, 0.68, 0.06, x, 3.56, -5.6);
  }

  addBox(parts, 'white', 2.9, 0.56, 0.14, 0, 2.56, -5.6);

  for (const x of [-0.98, 0.98]) {
    addBox(parts, 'metal', 0.66, 0.36, 0.08, x, 2.56, -5.69);
    addBox(parts, 'chassis', 0.56, 0.28, 0.05, x, 2.56, -5.72);
    addBox(parts, 'headlight', 0.2, 0.2, 0.04, x - 0.13, 2.56, -5.75);
    addCylinder(parts, 'tail', 0.06, 0.06, 0.04, 12, x + 0.16, 2.56, -5.75, Math.PI / 2);
  }

  addBox(parts, 'metal', 0.6, 0.32, 0.06, 0, 2.56, -5.69);
  addBox(parts, 'chassis', 0.5, 0.24, 0.04, 0, 2.56, -5.72);
  for (const y of [2.49, 2.56, 2.63]) {
    addBox(parts, 'metal', 0.46, 0.02, 0.02, 0, y, -5.75);
  }

  for (const x of [-1.26, 1.26]) {
    addCylinder(parts, 'tail', 0.055, 0.055, 0.04, 10, x, 2.02, -5.6, Math.PI / 2);
  }

  for (const z of [-5.52, 5.52]) {
    const direction = Math.sign(z);
    addBox(parts, 'red', 2.86, 0.3, 0.34, 0, 1.48, z + direction * 0.08);
    addBox(parts, 'chassis', 0.32, 0.34, 0.7, 0, 1.38, z + direction * 0.35);
  }

  addBox(parts, 'locoRed', 2.96, 2.2, 0.18, 0, 3.0, 5.5);
}

function addCoachRoof(parts: Parts): void {
  const geometry = new THREE.CylinderGeometry(1.6, 1.6, 10.86, 28);
  geometry.rotateX(Math.PI / 2);
  geometry.scale(1, 0.3, 1);
  geometry.translate(0, 4.12, 0);
  (parts.coachRoof ??= []).push(geometry);
  addBox(parts, 'metal', 0.05, 0.02, 10.6, 0, 4.605, 0);
}

function addRoofVents(parts: Parts): void {
  for (let i = 0; i < 6; i += 1) {
    const z = -4.2 + i * 1.2;
    addCylinder(parts, 'metal', 0.13, 0.09, 0.14, 10, 0, 4.56, z);
  }
}

function addRoofUnit(parts: Parts): void {
  const z = 4.1;
  addBox(parts, 'silver', 1.8, 0.1, 2.4, 0, 4.56, z);
  addBox(parts, 'silver', 1.66, 0.38, 2.24, 0, 4.76, z);
  addBox(parts, 'silver', 1.74, 0.08, 2.32, 0, 4.99, z);

  for (const side of [-1, 1] as const) {
    addBox(parts, 'chassis', 0.03, 0.28, 1.5, side * 0.84, 4.74, z);
    for (const y of [4.65, 4.71, 4.77, 4.83]) {
      addBox(parts, 'silver', 0.02, 0.035, 1.5, side * 0.855, y, z);
    }
    addBox(parts, 'white', 0.02, 0.08, 0.3, side * 0.86, 4.89, z - 0.36);
  }

  addBox(parts, 'chassis', 1.3, 0.28, 0.04, 0, 4.74, z + 1.14);
  for (const y of [4.65, 4.71, 4.77, 4.83]) {
    addBox(parts, 'silver', 1.3, 0.035, 0.02, 0, y, z + 1.16);
  }
}

function addWindow(
  parts: Parts,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  side: -1 | 1,
): void {
  const border = 0.05;
  const px = x + side * 0.012;
  addBox(parts, 'glass', 0.06, height - border * 2, width - border * 2, px - side * 0.01, y, z);
  addBox(parts, 'white', 0.06, border, width, px, y + height / 2 - border / 2, z);
  addBox(parts, 'white', 0.06, border, width, px, y - height / 2 + border / 2, z);
  addBox(parts, 'white', 0.06, height - border * 2, border, px, y, z - width / 2 + border / 2);
  addBox(parts, 'white', 0.06, height - border * 2, border, px, y, z + width / 2 - border / 2);
}

function addCoachUnderframe(parts: Parts): void {
  addBox(parts, 'chassis', 1.5, 0.55, 1.6, -0.55, 1.18, -0.7);
  addBox(parts, 'chassis', 1.1, 0.44, 1.0, 0.7, 1.22, 0.8);
  addCylinder(parts, 'metal', 0.17, 0.17, 1.7, 12, 0.85, 1.08, -1.1, Math.PI / 2);
  addCylinder(parts, 'metal', 0.15, 0.15, 1.2, 12, -0.9, 1.12, 1.4, Math.PI / 2);
}

function addCoachRearEnd(parts: Parts): void {
  const z = 5.45;

  addBox(parts, 'gangway', 1.02, 1.92, 0.1, 0, 2.94, z + 0.03);
  addBox(parts, 'coachGreen', 0.98, 1.86, 0.06, 0, 2.94, z + 0.11);
  addBox(parts, 'white', 0.36, 0.05, 0.04, 0, 3.675, z + 0.155);
  addBox(parts, 'white', 0.36, 0.05, 0.04, 0, 3.245, z + 0.155);
  addBox(parts, 'white', 0.05, 0.38, 0.04, -0.155, 3.46, z + 0.155);
  addBox(parts, 'white', 0.05, 0.38, 0.04, 0.155, 3.46, z + 0.155);
  addBox(parts, 'glass', 0.26, 0.38, 0.03, 0, 3.46, z + 0.14);
  addBox(parts, 'metal', 0.06, 0.16, 0.04, 0.3, 2.8, z + 0.16);
  addBox(parts, 'gangway', 0.14, 2.0, 0.2, -0.58, 2.94, z + 0.11);
  addBox(parts, 'gangway', 0.14, 2.0, 0.2, 0.58, 2.94, z + 0.11);
  addBox(parts, 'gangway', 1.3, 0.14, 0.2, 0, 3.94, z + 0.11);
  addBox(parts, 'gangway', 1.3, 0.12, 0.2, 0, 1.96, z + 0.11);

  for (const x of [-1.08, 1.08]) {
    addCylinder(parts, 'metal', 0.15, 0.15, 0.07, 16, x, 3.45, z + 0.02, Math.PI / 2);
    addCylinder(parts, 'tail', 0.105, 0.105, 0.05, 16, x, 3.45, z + 0.06, Math.PI / 2);
  }

  for (const x of [-0.76, 0.76]) {
    addCylinder(parts, 'metal', 0.022, 0.022, 1.7, 8, x, 2.95, z + 0.1);
  }

  for (const x of [-1.06, -0.82]) {
    addCylinder(parts, 'metal', 0.022, 0.022, 1.5, 8, x, 2.25, z + 0.08);
  }
  for (let i = 0; i < 5; i += 1) {
    addBox(parts, 'metal', 0.26, 0.03, 0.03, -0.94, 1.62 + i * 0.32, z + 0.08);
  }

  addBox(parts, 'chassis', 0.9, 0.07, 0.34, 0, 1.6, z + 0.12);
  addBox(parts, 'red', 0.12, 0.34, 0.03, 0.86, 2.7, z + 0.02);
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

function addBogies(
  parts: Parts,
  centers: number[],
  axleOffsets: number[] = [-0.92, 0.92],
  frameDepth = 2.5,
): void {
  for (const center of centers) {
    addBox(parts, 'chassis', 2.2, 0.42, frameDepth, 0, 1.05, center);
    addBox(parts, 'metal', 1.9, 0.2, frameDepth * 0.68, 0, 1.2, center);
    for (const offset of axleOffsets) {
      const z = center + offset;
      addCylinder(parts, 'wheel', 0.46, 0.46, 0.22, 16, -0.75, 0.93, z, 0, 0, Math.PI / 2);
      addCylinder(parts, 'wheel', 0.46, 0.46, 0.22, 16, 0.75, 0.93, z, 0, 0, Math.PI / 2);
      addCylinder(parts, 'metal', 0.12, 0.12, 1.7, 10, 0, 0.93, z, 0, 0, Math.PI / 2);
    }
    for (const x of [-0.9, 0.9]) {
      for (const offset of [-0.55, 0.55]) {
        addCylinder(parts, 'metal', 0.09, 0.09, 0.2, 10, x, 1.35, center + offset);
      }
    }
  }
}

function addPantograph(parts: Parts): void {
  const baseZ = 2.05;
  addBox(parts, 'roof', 1.7, 0.12, 1.0, 0, 4.4, baseZ);
  for (const x of [-0.62, 0.62]) {
    for (const z of [baseZ - 0.32, baseZ + 0.32]) {
      addCylinder(parts, 'chassis', 0.085, 0.085, 0.3, 8, x, 4.57, z);
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

function addLowerLabel(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  side: -1 | 1,
  text: string,
  width = 2.4,
  height = 0.24,
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }
  context.clearRect(0, 0, 640, 64);
  context.fillStyle = '#f4c63c';
  context.font = '700 34px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, 320, 34);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  plane.position.set(x, y, z);
  plane.rotation.y = side * (Math.PI / 2);
  group.add(plane);
}

function addLocoSideLabel(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  side: -1 | 1,
): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }
  context.clearRect(0, 0, 512, 160);
  context.fillStyle = '#b3271f';
  context.font = '700 56px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('SS9 0146', 256, 58);
  context.font = '500 32px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText('上局沪段', 256, 118);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.36, 0.44),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  plane.position.set(x, y, z);
  plane.rotation.y = side * (Math.PI / 2);
  group.add(plane);
}

function addLocoNumberLabel(group: THREE.Group): void {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }
  context.clearRect(0, 0, 512, 128);
  context.fillStyle = '#f2f3ee';
  context.font = '700 62px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('SS9 0146', 256, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 0.34),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  plane.position.set(0, 2.1, -5.62);
  plane.rotation.y = Math.PI;
  group.add(plane);
}
