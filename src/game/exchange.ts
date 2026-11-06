import * as THREE from 'three';
import { GAME } from './config';
import type { PathData } from './types';

export interface PassengerFx {
  spawnBoarding(trainS: number, side: -1 | 1, boarding: number): void;
  spawnAlighting(trainS: number, side: -1 | 1, alighting: number, trainSpeed: number): void;
  update(dt: number, trainS: number, trainSpeed: number): void;
  reset(): void;
  readonly count: number;
}

interface Mover {
  kind: 'board' | 'alight';
  doorRel: number;
  startS: number;
  gap: number;
  age: number;
  duration: number;
  hold: number;
  arc: number;
  scale: number;
  rotation: number;
  side: -1 | 1;
  platformOffset: number;
  color: number;
}

const POOL = 48;
const DOOR_LATERAL = 1.72;
const ALIGHT_MAX_DISTANCE = 18;

export function createPassengerFx(scene: THREE.Scene, path: PathData): PassengerFx {
  const bodyGeometry = new THREE.BoxGeometry(0.36, 1.0, 0.24);
  bodyGeometry.translate(0, 0.5, 0);
  const bodyMesh = new THREE.InstancedMesh(
    bodyGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
    POOL,
  );
  bodyMesh.frustumCulled = false;
  bodyMesh.count = 0;
  scene.add(bodyMesh);

  const headGeometry = new THREE.SphereGeometry(0.16, 8, 6);
  headGeometry.translate(0, 1.2, 0);
  const headMesh = new THREE.InstancedMesh(
    headGeometry,
    new THREE.MeshStandardMaterial({ color: 0xd2a47e, roughness: 0.9 }),
    POOL,
  );
  headMesh.frustumCulled = false;
  headMesh.count = 0;
  scene.add(headMesh);

  const movers: Mover[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const colors = [0x2f4e6b, 0x7a3b32, 0x4a5a3d, 0xd1c5a5, 0x3e3a45, 0x8a6b3f, 0x507a7a];
  const rand = mulberry32(0x77aa);

  function pushMover(mover: Mover): void {
    if (movers.length >= POOL) {
      movers.shift();
    }
    movers.push(mover);
  }

  function spawnBoarding(
    trainS: number,
    side: -1 | 1,
    boarding: number,
  ): void {
    const doors = [-3.1, 3.1];
    const spawnCount = Math.min(boarding, 8);

    for (let i = 0; i < spawnCount; i += 1) {
      const doorRel = -GAME.coachOffset + doors[i % doors.length];
      const gap = 4 + rand() * 5;
      pushMover({
        kind: 'board',
        doorRel,
        startS: trainS + doorRel - gap,
        gap,
        age: 0,
        duration: 0.62 + rand() * 0.22,
        hold: 0,
        arc: 0.9 + rand() * 0.55,
        scale: 0.9 + rand() * 0.2,
        rotation: rand() * Math.PI * 2,
        side,
        platformOffset: side * (4.75 + rand() * 1.5),
        color: colors[Math.floor(rand() * colors.length)],
      });
    }
  }

  function spawnAlighting(
    trainS: number,
    side: -1 | 1,
    alighting: number,
    trainSpeed: number,
  ): void {
    const doors = [-3.1, 3.1];
    const leaveCount = Math.min(alighting, 6);

    for (let i = 0; i < leaveCount; i += 1) {
      const doorRel = -GAME.coachOffset + doors[i % doors.length];
      const baseDuration = 0.62 + rand() * 0.22;
      const duration = Math.min(baseDuration, (2 * ALIGHT_MAX_DISTANCE) / trainSpeed);
      const distance = (trainSpeed * duration) / 2;
      pushMover({
        kind: 'alight',
        doorRel,
        startS: trainS + doorRel,
        gap: distance,
        age: 0,
        duration,
        hold: 0.35,
        arc: 0.25 + rand() * 0.2,
        scale: 0.9 + rand() * 0.2,
        rotation: rand() * Math.PI * 2,
        side,
        platformOffset: side * (4.75 + rand() * 1.6),
        color: colors[Math.floor(rand() * colors.length)],
      });
    }
  }

  function update(dt: number, trainS: number, trainSpeed: number): void {
    for (let i = movers.length - 1; i >= 0; i -= 1) {
      const mover = movers[i];
      mover.age += dt;
      if (mover.age >= mover.duration + mover.hold) {
        movers.splice(i, 1);
      }
    }

    for (let i = 0; i < movers.length; i += 1) {
      const mover = movers[i];
      const u = clamp(mover.age / mover.duration, 0, 1);
      const eased = u * u * (3 - 2 * u);

      let personS: number;
      let lateral: number;
      let y: number;

      if (mover.kind === 'board') {
        // 门在前进，乘客从站台静止起步、逐渐加速追到车门，末速与车门一致。
        const remaining = 1 - u;
        const gap =
          remaining * remaining * (mover.gap * (2 * u + 1) + trainSpeed * mover.duration * u);
        personS = trainS + mover.doorRel - gap;
        lateral = lerp(mover.platformOffset, mover.side * DOOR_LATERAL, eased);
        y = lerp(0.94, 1.85, eased) + Math.sin(Math.PI * u) * mover.arc;
      } else {
        // 下车乘客带着车速离开车门，沿站台匀减速到 0 后站定。
        personS = mover.startS + mover.gap * (2 * u - u * u);
        lateral = lerp(mover.side * DOOR_LATERAL, mover.platformOffset, eased);
        y = lerp(1.85, 0.94, eased) + Math.sin(Math.PI * u) * mover.arc;
      }

      const sample = path.sampleAt(personS);
      dummy.position.set(
        sample.x + sample.normalX * lateral,
        y,
        sample.z + sample.normalZ * lateral,
      );
      dummy.rotation.set(0, mover.rotation, 0);
      dummy.scale.setScalar(mover.scale);
      dummy.updateMatrix();
      bodyMesh.setMatrixAt(i, dummy.matrix);
      headMesh.setMatrixAt(i, dummy.matrix);
      color.setHex(mover.color);
      bodyMesh.setColorAt(i, color);
    }

    bodyMesh.count = movers.length;
    headMesh.count = movers.length;
    bodyMesh.instanceMatrix.needsUpdate = true;
    headMesh.instanceMatrix.needsUpdate = true;
    if (bodyMesh.instanceColor) {
      bodyMesh.instanceColor.needsUpdate = true;
    }
  }

  function reset(): void {
    movers.length = 0;
    bodyMesh.count = 0;
    headMesh.count = 0;
  }

  return {
    spawnBoarding,
    spawnAlighting,
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

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
