import * as THREE from 'three';
import { GAME } from './config';

export interface Train {
  group: THREE.Group;
  place(s: number): void;
}

const materials = {
  body: new THREE.MeshStandardMaterial({ color: 0x17603e, roughness: 0.55, metalness: 0.15 }),
  bodyDark: new THREE.MeshStandardMaterial({ color: 0x0e3b27, roughness: 0.7, metalness: 0.1 }),
  face: new THREE.MeshStandardMaterial({ color: 0xd9e7d8, roughness: 0.5, metalness: 0.1 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xf3c53d, roughness: 0.45, metalness: 0.2 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x3d4742, roughness: 0.8, metalness: 0.3 }),
  glass: new THREE.MeshStandardMaterial({ color: 0x14211d, roughness: 0.2, metalness: 0.5 }),
  wheel: new THREE.MeshStandardMaterial({ color: 0x1d1f20, roughness: 0.75, metalness: 0.4 }),
  headlight: new THREE.MeshStandardMaterial({
    color: 0xfff2c0,
    emissive: 0xffd76a,
    emissiveIntensity: 2.4,
  }),
  tail: new THREE.MeshStandardMaterial({
    color: 0x7a1010,
    emissive: 0xff2a1a,
    emissiveIntensity: 2.2,
  }),
};

export function createTrain(): Train {
  const group = new THREE.Group();
  const loco = buildLoco();
  const coach = buildCoach();
  group.add(loco, coach);

  function place(s: number): void {
    loco.position.set(0, 0, -s);
    coach.position.set(0, 0, -(s - GAME.coachOffset));
  }

  place(GAME.startS);

  return { group, place };
}

function addBox(
  parent: THREE.Group,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  material: THREE.Material,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addBogies(parent: THREE.Group, centers: number[]): void {
  const wheelGeometry = new THREE.CylinderGeometry(0.48, 0.48, 0.24, 14);

  for (const center of centers) {
    addBox(parent, 2.5, 0.5, 2.4, 0, 0.95, center, materials.bodyDark);
    for (const z of [center - 0.95, center + 0.95]) {
      for (const x of [-1.62, 1.62]) {
        const wheel = new THREE.Mesh(wheelGeometry, materials.wheel);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 1, z);
        parent.add(wheel);
      }
    }
  }
}

function buildLoco(): THREE.Group {
  const loco = new THREE.Group();

  addBox(loco, 3.1, 2.7, 12, 0, 2.75, 0, materials.body);
  addBox(loco, 3.2, 0.5, 12.05, 0, 1.35, 0, materials.bodyDark);
  addBox(loco, 3.12, 0.3, 12.02, 0, 2.25, 0, materials.yellow);
  addBox(loco, 3.14, 0.55, 6, 0, 3.25, -0.8, materials.glass);
  addBox(loco, 2.85, 0.22, 11.6, 0, 4.16, 0, materials.roof);
  addBox(loco, 2.6, 1.7, 0.15, 0, 2.9, -6.06, materials.face);

  addBox(loco, 0.3, 0.3, 0.08, -0.8, 3.2, -6.14, materials.headlight);
  addBox(loco, 0.3, 0.3, 0.08, 0.8, 3.2, -6.14, materials.headlight);
  addBox(loco, 2.9, 0.3, 0.18, 0, 1.45, -6.08, materials.tail);
  addBox(loco, 0.35, 0.35, 1.7, 0, 1.35, 6.8, materials.bodyDark);

  addBogies(loco, [-3.4, 3.4]);

  return loco;
}

function buildCoach(): THREE.Group {
  const coach = new THREE.Group();

  addBox(coach, 3.1, 2.7, 11, 0, 2.75, 0, materials.body);
  addBox(coach, 3.12, 0.28, 11.02, 0, 2.25, 0, materials.yellow);
  addBox(coach, 3.14, 0.68, 8.2, 0, 3.28, 0, materials.glass);
  addBox(coach, 2.85, 0.2, 10.6, 0, 4.15, 0, materials.roof);

  for (const z of [-3.2, -1.6, 0, 1.6, 3.2]) {
    addBox(coach, 3.18, 0.7, 0.08, 0, 3.28, z, materials.body);
  }

  for (const z of [-4, 4]) {
    addBox(coach, 0.05, 1.8, 0.9, -1.56, 2.4, z, materials.bodyDark);
    addBox(coach, 0.05, 1.8, 0.9, 1.56, 2.4, z, materials.bodyDark);
  }

  addBox(coach, 0.18, 0.18, 0.08, -0.9, 1.8, 5.56, materials.tail);
  addBox(coach, 0.18, 0.18, 0.08, 0.9, 1.8, 5.56, materials.tail);

  addBogies(coach, [-3, 3]);

  return coach;
}
