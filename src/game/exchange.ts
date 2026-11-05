import * as THREE from 'three';
import { GAME } from './config';
import type { PathData } from './types';

export interface PassengerFx {
  spawn(trainS: number, side: -1 | 1, boarding: number, alighting: number): void;
  update(dt: number): void;
  reset(): void;
  readonly count: number;
}

interface Mover {
  start: THREE.Vector3;
  end: THREE.Vector3;
  age: number;
  delay: number;
  duration: number;
  arc: number;
  scale: number;
  rotation: number;
}

const POOL = 48;

export function createPassengerFx(scene: THREE.Scene, path: PathData): PassengerFx {
  const geometry = new THREE.CapsuleGeometry(0.16, 0.68, 2, 6);
  geometry.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88 }),
    POOL,
  );
  mesh.frustumCulled = false;
  mesh.count = 0;
  scene.add(mesh);

  const movers: Mover[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const colors = [0xd94f2b, 0xf2a541, 0xe8d44d, 0x3f88c5, 0xc4455c, 0x6aa84f];
  const rand = mulberry32(0x77aa);

  function addMover(
    start: THREE.Vector3,
    end: THREE.Vector3,
    scale: number,
  ): void {
    if (movers.length >= POOL) {
      movers.shift();
    }
    movers.push({
      start,
      end,
      age: 0,
      delay: rand() * 0.12,
      duration: 0.62 + rand() * 0.22,
      arc: 0.9 + rand() * 0.55,
      scale,
      rotation: rand() * Math.PI * 2,
    });
  }

  function spawn(
    trainS: number,
    side: -1 | 1,
    boarding: number,
    alighting: number,
  ): void {
    const coachCenter = trainS - GAME.coachOffset;
    const doors = [-3.1, 3.1];
    const spawnCount = Math.min(boarding, 8);
    const leaveCount = Math.min(alighting, 6);

    for (let i = 0; i < spawnCount; i += 1) {
      const doorS = coachCenter + doors[i % doors.length];
      const doorSample = path.sampleAt(doorS);
      const platformS = doorS + (rand() - 0.5) * 7;
      const platformSample = path.sampleAt(platformS);
      const platformOffset = side * (4.75 + rand() * 1.5);
      const start = new THREE.Vector3(
        platformSample.x + platformSample.normalX * platformOffset,
        0.94,
        platformSample.z + platformSample.normalZ * platformOffset,
      );
      const end = new THREE.Vector3(
        doorSample.x + doorSample.normalX * side * 1.72,
        1.85,
        doorSample.z + doorSample.normalZ * side * 1.72,
      );
      addMover(start, end, 1.15 + rand() * 0.25);
    }

    for (let i = 0; i < leaveCount; i += 1) {
      const doorS = coachCenter + doors[i % doors.length];
      const doorSample = path.sampleAt(doorS);
      const platformS = doorS + (rand() - 0.5) * 8;
      const platformSample = path.sampleAt(platformS);
      const platformOffset = side * (4.75 + rand() * 1.6);
      const start = new THREE.Vector3(
        doorSample.x + doorSample.normalX * side * 1.72,
        1.85,
        doorSample.z + doorSample.normalZ * side * 1.72,
      );
      const end = new THREE.Vector3(
        platformSample.x + platformSample.normalX * platformOffset,
        0.94,
        platformSample.z + platformSample.normalZ * platformOffset,
      );
      addMover(start, end, 1.15 + rand() * 0.25);
    }
  }

  function update(dt: number): void {
    for (let i = movers.length - 1; i >= 0; i -= 1) {
      const mover = movers[i];
      mover.age += dt;
      if (mover.age >= mover.delay + mover.duration) {
        movers.splice(i, 1);
      }
    }

    for (let i = 0; i < movers.length; i += 1) {
      const mover = movers[i];
      const t = clamp((mover.age - mover.delay) / mover.duration, 0, 1);
      dummy.position.lerpVectors(mover.start, mover.end, t);
      dummy.position.y += Math.sin(Math.PI * t) * mover.arc;
      dummy.rotation.set(0, mover.rotation, 0);
      dummy.scale.setScalar(mover.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.setHex(colors[i % colors.length]);
      mesh.setColorAt(i, color);
    }

    mesh.count = movers.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }

  function reset(): void {
    movers.length = 0;
    mesh.count = 0;
  }

  return {
    spawn,
    update,
    reset,
    get count() {
      return movers.length;
    },
  };
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
