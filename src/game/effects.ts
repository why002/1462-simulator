import * as THREE from 'three';
import { GAME } from './config';
import type { PathData } from './types';

export interface EffectsState {
  s: number;
  v: number;
  pressing: boolean;
  derailing: boolean;
  tilt: number;
}

export interface Effects {
  update(dt: number, state: EffectsState): void;
  reset(): void;
  readonly sparkCount: number;
  readonly windOpacity: number;
}

const SPARK_POOL = 72;
const WIND_LINES = 36;
const COACH_PIVOT = 3.6;
const TAIL_LAMP_OFFSET = 1.08;
const TAIL_LAMP_HEIGHT = 3.45;
const TAIL_LAMP_DEPTH = 5.62;

interface Spark {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
}

interface WindLine {
  s: number;
  lateral: number;
  height: number;
  length: number;
}

export function createEffects(scene: THREE.Scene, path: PathData): Effects {
  const rand = mulberry32(0x51a7);

  const sparkGeometry = new THREE.BoxGeometry(0.075, 0.075, 0.42);
  const sparkMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparkMesh = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, SPARK_POOL);
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sparkMesh.frustumCulled = false;
  scene.add(sparkMesh);

  const sparks: Spark[] = [];
  const sparkDummy = new THREE.Object3D();
  const sparkColor = new THREE.Color();
  for (let i = 0; i < SPARK_POOL; i += 1) {
    sparks.push({
      position: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      life: 0,
      maxLife: 1,
      scale: 0,
    });
    sparkMesh.setColorAt(i, sparkColor.setHex(0xffc056));
    sparkDummy.position.set(0, -100, 0);
    sparkDummy.scale.setScalar(0);
    sparkDummy.updateMatrix();
    sparkMesh.setMatrixAt(i, sparkDummy.matrix);
  }
  if (sparkMesh.instanceColor) {
    sparkMesh.instanceColor.needsUpdate = true;
  }
  sparkMesh.instanceMatrix.needsUpdate = true;
  let sparkCursor = 0;
  let sparkTimer = 0;
  let aliveSparks = 0;

  const windPositions = new Float32Array(WIND_LINES * 6);
  const windGeometry = new THREE.BufferGeometry();
  windGeometry.setAttribute('position', new THREE.BufferAttribute(windPositions, 3));
  const windMaterial = new THREE.LineBasicMaterial({
    color: 0xe9f6ef,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const windMesh = new THREE.LineSegments(windGeometry, windMaterial);
  windMesh.frustumCulled = false;
  scene.add(windMesh);
  const windLines: WindLine[] = [];
  for (let i = 0; i < WIND_LINES; i += 1) {
    windLines.push({
      s: GAME.startS + 20 + rand() * 160,
      lateral: (rand() - 0.5) * 34,
      height: 1.2 + rand() * 7.5,
      length: 5 + rand() * 11,
    });
  }

  const glowTexture = createGlowTexture();
  const tailMaterial = new THREE.MeshBasicMaterial({
    map: glowTexture,
    color: 0xff3b22,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const tailGlowGeometry = new THREE.PlaneGeometry(0.82, 0.82);
  const tailGlows = [
    new THREE.Mesh(tailGlowGeometry, tailMaterial),
    new THREE.Mesh(tailGlowGeometry, tailMaterial),
  ];
  for (const glow of tailGlows) {
    scene.add(glow);
  }
  const tailEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  const tailQuaternion = new THREE.Quaternion();
  const tailLocal = new THREE.Vector3();

  function spawnSpark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
  ): void {
    const index = sparkCursor;
    const spark = sparks[index];
    sparkCursor = (sparkCursor + 1) % SPARK_POOL;
    spark.position.set(x, y, z);
    spark.velocity.set(vx, vy, vz);
    spark.maxLife = 0.22 + rand() * 0.24;
    spark.life = spark.maxLife;
    spark.scale = 0.9 + rand() * 0.9;
    sparkColor.setHex(rand() > 0.35 ? 0xffc056 : 0xff7a33);
    sparkMesh.setColorAt(index, sparkColor);
    if (sparkMesh.instanceColor) {
      sparkMesh.instanceColor.needsUpdate = true;
    }
  }

  function emitPantographSparks(s: number): void {
    const sample = path.sampleAt(clamp(s + 2.1, path.coreStart, path.coreEnd));
    const count = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i += 1) {
      spawnSpark(
        sample.x + (rand() - 0.5) * 0.6,
        6.08 + rand() * 0.12,
        sample.z + (rand() - 0.5) * 0.6,
        (rand() - 0.5) * 2.4,
        1.2 + rand() * 2.6,
        (rand() - 0.5) * 2.4,
      );
    }
  }

  function emitWheelSparks(s: number, side: -1 | 1): void {
    const sample = path.sampleAt(
      clamp(s + side * 3.4, path.coreStart, path.coreEnd),
    );
    spawnSpark(
      sample.x + sample.normalX * side * 1.45,
      0.32 + rand() * 0.2,
      sample.z + sample.normalZ * side * 1.45,
      sample.normalX * side * (1.2 + rand() * 2.2) + Math.sin(sample.heading) * 0.8,
      0.9 + rand() * 2.2,
      sample.normalZ * side * (1.2 + rand() * 2.2) + Math.cos(sample.heading) * 0.8,
    );
  }

  function update(dt: number, state: EffectsState): void {
    const { s, v, pressing, derailing, tilt } = state;
    sparkTimer -= dt;
    const sparking =
      (pressing && v > 6) ||
      (!pressing && v > 24) ||
      Math.abs(tilt) > 0.45 ||
      derailing;
    if (sparking && sparkTimer <= 0) {
      sparkTimer = 0.05 + rand() * 0.08;
      if (pressing || v > 34) {
        emitPantographSparks(s);
      }
      if (!pressing || derailing || Math.abs(tilt) > 0.45) {
        emitWheelSparks(s, -1);
        emitWheelSparks(s, 1);
      }
    }

    aliveSparks = 0;
    for (let i = 0; i < SPARK_POOL; i += 1) {
      const spark = sparks[i];
      if (spark.life <= 0) {
        sparkDummy.position.set(0, -100, 0);
        sparkDummy.scale.setScalar(0);
      } else {
        spark.life -= dt;
        spark.position.addScaledVector(spark.velocity, dt);
        spark.velocity.y -= 13 * dt;
        const ratio = Math.max(0, spark.life / spark.maxLife);
        sparkDummy.position.copy(spark.position);
        sparkDummy.scale.setScalar(spark.scale * (0.35 + ratio * 0.65));
        aliveSparks += 1;
      }
      sparkDummy.updateMatrix();
      sparkMesh.setMatrixAt(i, sparkDummy.matrix);
    }
    sparkMesh.instanceMatrix.needsUpdate = true;

    const windOpacity = clamp((v - 24) / 28, 0, 1) * 0.3;
    windMaterial.opacity = windOpacity;
    if (windOpacity > 0.001) {
      for (let i = 0; i < WIND_LINES; i += 1) {
        const line = windLines[i];
        line.s -= v * dt * 1.7;
        if (line.s < s - 55 || line.s > s + 190) {
          line.s = s + 60 + rand() * 130;
          line.lateral = (rand() - 0.5) * 34;
          line.height = 1.2 + rand() * 7.5;
          line.length = 5 + rand() * 11;
        }
        const start = path.sampleAt(clamp(line.s, 0, path.length - 1));
        const end = path.sampleAt(
          clamp(line.s + line.length, 0, path.length - 1),
        );
        const offset = i * 6;
        windPositions[offset] = start.x + start.normalX * line.lateral;
        windPositions[offset + 1] = line.height;
        windPositions[offset + 2] = start.z + start.normalZ * line.lateral;
        windPositions[offset + 3] = end.x + end.normalX * line.lateral;
        windPositions[offset + 4] = line.height;
        windPositions[offset + 5] = end.z + end.normalZ * line.lateral;
      }
      windGeometry.attributes.position.needsUpdate = true;
    }

    const coachCenter = s - GAME.coachOffset;
    const coachFront = path.sampleAt(
      clamp(coachCenter + COACH_PIVOT, path.coreStart, path.coreEnd),
    );
    const coachRear = path.sampleAt(
      clamp(coachCenter - COACH_PIVOT, path.coreStart, path.coreEnd),
    );
    const carX = (coachFront.x + coachRear.x) * 0.5;
    const carZ = (coachFront.z + coachRear.z) * 0.5;
    const carHeading = Math.atan2(
      -(coachFront.x - coachRear.x),
      -(coachFront.z - coachRear.z),
    );
    tailEuler.set(0, carHeading, tilt);
    tailQuaternion.setFromEuler(tailEuler);
    for (let i = 0; i < tailGlows.length; i += 1) {
      const side = i === 0 ? -1 : 1;
      tailLocal.set(side * TAIL_LAMP_OFFSET, TAIL_LAMP_HEIGHT, TAIL_LAMP_DEPTH);
      tailLocal.applyQuaternion(tailQuaternion);
      const glow = tailGlows[i];
      glow.position.set(carX + tailLocal.x, tailLocal.y, carZ + tailLocal.z);
      glow.quaternion.copy(tailQuaternion);
    }
    tailMaterial.opacity = !pressing && v > 1 ? 0.85 : 0.5;
  }

  function reset(): void {
    for (const spark of sparks) {
      spark.life = 0;
    }
    sparkTimer = 0;
    aliveSparks = 0;
    windMaterial.opacity = 0;
    for (let i = 0; i < WIND_LINES; i += 1) {
      const line = windLines[i];
      line.s = GAME.startS + 20 + rand() * 160;
    }
  }

  return {
    update,
    reset,
    get sparkCount() {
      return aliveSparks;
    },
    get windOpacity() {
      return windMaterial.opacity;
    },
  };
}

function createGlowTexture(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      1,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255, 235, 210, 0.95)');
    gradient.addColorStop(0.3, 'rgba(255, 90, 50, 0.65)');
    gradient.addColorStop(1, 'rgba(255, 40, 20, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
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
