import * as THREE from 'three';
import { GAME } from './config';
import type {
  PathData,
  PathSample,
  RiverCrossing,
  Station,
  StationOnRoute,
  Vec2,
} from './types';

interface ControlPoint {
  name: string;
  lat: number;
  lon: number;
  km: number;
}

interface RiverDefinition {
  name: string;
  km: number;
  width: number;
  bridgeLength: number;
  kind: 'yangtze' | 'yellow';
}

// 几何控制点只保留 1:100,000 下仍能保持缓弯的城际锚点。
// 长江桥、党家庄、济南南等站台里程仍由 stations.ts 按 s=70+km×10 定位，
// 不再作为几何控制点，避免 2–8 km 的小折角被压缩成发卡弯。
const CONTROL_POINTS: ControlPoint[] = [
  { name: '上海', lat: 31.2495, lon: 121.4557, km: 0 },
  { name: '安亭', lat: 31.31, lon: 121.16, km: 27 },
  { name: '昆山', lat: 31.385, lon: 120.98, km: 49 },
  { name: '苏州', lat: 31.329, lon: 120.609, km: 84 },
  { name: '无锡', lat: 31.58, lon: 120.3, km: 126 },
  { name: '常州', lat: 31.78, lon: 119.95, km: 165 },
  { name: '丹阳', lat: 32.0, lon: 119.6, km: 209 },
  { name: '镇江', lat: 32.19, lon: 119.43, km: 238 },
  { name: '南京', lat: 32.088, lon: 118.798, km: 303 },
  { name: '滁州北', lat: 32.3, lon: 118.31, km: 359 },
  { name: '明光', lat: 32.78, lon: 117.99, km: 423 },
  { name: '蚌埠', lat: 32.92, lon: 117.36, km: 484 },
  { name: '宿州', lat: 33.64, lon: 116.98, km: 574 },
  { name: '徐州', lat: 34.267, lon: 117.183, km: 649 },
  { name: '枣庄西', lat: 34.81, lon: 117.32, km: 716 },
  { name: '滕州', lat: 35.09, lon: 117.16, km: 750 },
  { name: '邹城', lat: 35.4, lon: 116.97, km: 790 },
  { name: '兖州', lat: 35.55, lon: 116.83, km: 810 },
  { name: '泰山', lat: 36.19, lon: 117.1, km: 895 },
  { name: '济南', lat: 36.67, lon: 116.99, km: 966 },
  { name: '泺口桥', lat: 36.76, lon: 117.0, km: 975 },
  { name: '禹城', lat: 36.94, lon: 116.64, km: 1021 },
  { name: '德州', lat: 37.44, lon: 116.36, km: 1087 },
  { name: '沧州', lat: 38.3, lon: 116.87, km: 1201 },
  { name: '天津西', lat: 39.15, lon: 117.15, km: 1316 },
  { name: '杨村', lat: 39.38, lon: 117.06, km: 1354 },
  { name: '广阳', lat: 39.51, lon: 116.7, km: 1389 },
  { name: '黄村', lat: 39.73, lon: 116.34, km: 1430 },
  { name: '北京丰台', lat: 39.85, lon: 116.32, km: 1447 },
  { name: '北京', lat: 39.902, lon: 116.427, km: 1463 },
];

const BYPASS_POINTS: Array<[number, number]> = [
  [36.579, 116.897],
  [36.62, 116.86],
  [36.72, 116.8],
  [36.82, 116.72],
  [36.94, 116.64],
];

// s 由里程给出，并避开站台净空：长江水面不能盖住南京站，
// 黄河水面不能盖住济南站；两处仍严格位于相邻建模车站之间。
const RIVERS: RiverDefinition[] = [
  {
    name: '长江',
    km: 325,
    width: 320,
    bridgeLength: 380,
    kind: 'yangtze',
  },
  {
    name: '黄河（泺口桥）',
    km: 986,
    width: 250,
    bridgeLength: 300,
    kind: 'yellow',
  },
];

const PROJECTION_LAT0 = 32;
const PROJECTION_LON0 = 119.5;
const DENSE_SAMPLES = 30000;
const SMOOTH_SIGMA = 220;

export function buildRoute(): PathData {
  const projected = CONTROL_POINTS.map((point) => project(point.lat, point.lon));
  const curvePoints = projected.map((point) => new THREE.Vector3(point.x, 0, point.z));
  const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'centripetal', 0.5);

  const dense: THREE.Vector3[] = [];
  for (let i = 0; i <= DENSE_SAMPLES; i += 1) {
    dense.push(curve.getPoint(i / DENSE_SAMPLES));
  }

  const cumulative = new Float64Array(dense.length);
  for (let i = 1; i < dense.length; i += 1) {
    cumulative[i] = cumulative[i - 1] + dense[i].distanceTo(dense[i - 1]);
  }

  const geometricLength = cumulative[cumulative.length - 1];
  if (!(geometricLength > 0)) {
    throw new Error('Route geometric length is zero');
  }
  const scale = GAME.coreLength / geometricLength;

  const controlArc = CONTROL_POINTS.map((_, index) => {
    const t = index / (CONTROL_POINTS.length - 1);
    const denseIndex = Math.round(t * DENSE_SAMPLES);
    return cumulative[denseIndex];
  });

  const sAtControl = CONTROL_POINTS.map(
    (point) => GAME.coreStart + point.km * GAME.metersPerKm,
  );

  for (let i = 1; i < sAtControl.length; i += 1) {
    if (!(sAtControl[i] > sAtControl[i - 1])) {
      throw new Error(`Control point km must increase at ${CONTROL_POINTS[i].name}`);
    }
  }
  if (sAtControl[0] !== GAME.coreStart || sAtControl[sAtControl.length - 1] !== GAME.coreEnd) {
    throw new Error('Control point range must match the core route range');
  }

  const coreCount = GAME.coreLength + 1;
  const rawX = new Float64Array(coreCount);
  const rawZ = new Float64Array(coreCount);

  let segment = 0;
  for (let i = 0; i < coreCount; i += 1) {
    const s = GAME.coreStart + i;
    while (segment < sAtControl.length - 2 && s > sAtControl[segment + 1]) {
      segment += 1;
    }
    const s0 = sAtControl[segment];
    const s1 = sAtControl[segment + 1];
    const t = s1 > s0 ? clamp((s - s0) / (s1 - s0), 0, 1) : 0;
    const targetArc = controlArc[segment] + t * (controlArc[segment + 1] - controlArc[segment]);
    const sample = sampleDense(dense, cumulative, targetArc);
    rawX[i] = sample.x * scale;
    rawZ[i] = sample.z * scale;
  }

  const smoothed = smoothPolyline(rawX, rawZ, SMOOTH_SIGMA);
  const { x: coreX, z: coreZ } = resampleUniform(smoothed.x, smoothed.z);

  const totalSamples = GAME.trackLength + 1;
  const X = new Float32Array(totalSamples);
  const Z = new Float32Array(totalSamples);

  const startTangent = normalize2(coreX[1] - coreX[0], coreZ[1] - coreZ[0]);
  for (let i = 0; i < GAME.coreStart; i += 1) {
    const back = GAME.coreStart - i;
    X[i] = coreX[0] - startTangent.x * back;
    Z[i] = coreZ[0] - startTangent.z * back;
  }

  for (let i = 0; i < coreCount; i += 1) {
    X[GAME.coreStart + i] = coreX[i];
    Z[GAME.coreStart + i] = coreZ[i];
  }

  const lastCore = coreCount - 1;
  const endTangent = normalize2(
    coreX[lastCore] - coreX[lastCore - 1],
    coreZ[lastCore] - coreZ[lastCore - 1],
  );
  for (let i = 1; i <= GAME.trackLength - GAME.coreEnd; i += 1) {
    X[GAME.coreEnd + i] = coreX[lastCore] + endTangent.x * i;
    Z[GAME.coreEnd + i] = coreZ[lastCore] + endTangent.z * i;
  }

  const heading = new Float32Array(totalSamples);
  const normalX = new Float32Array(totalSamples);
  const normalZ = new Float32Array(totalSamples);

  for (let i = 0; i < totalSamples; i += 1) {
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(totalSamples - 1, i + 1);
    const tangent = normalize2(X[i1] - X[i0], Z[i1] - Z[i0]);
    heading[i] = Math.atan2(-tangent.x, -tangent.z);
    normalX[i] = -tangent.z;
    normalZ[i] = tangent.x;
  }

  const curvature = new Float32Array(totalSamples);
  for (let i = 1; i < totalSamples; i += 1) {
    curvature[i] = wrapAngle(heading[i] - heading[i - 1]);
  }

  let minRadius = Number.POSITIVE_INFINITY;
  for (let i = GAME.coreStart; i <= GAME.coreEnd; i += 1) {
    const kappa = Math.abs(curvature[i]);
    if (kappa > 1e-6) {
      minRadius = Math.min(minRadius, 1 / kappa);
    }
  }
  if (!Number.isFinite(minRadius)) {
    minRadius = 0;
  }

  const nearestS = (x: number, z: number): number => {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < totalSamples; i += 1) {
      const dx = X[i] - x;
      const dz = Z[i] - z;
      const distance = dx * dx + dz * dz;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    return bestIndex;
  };

  const mainlineBypass: Vec2[] = BYPASS_POINTS.map(([lat, lon]) => {
    const point = project(lat, lon);
    return { x: point.x * scale, z: point.z * scale };
  });

  const jinanBypassMinDistance = minInteriorDistance(mainlineBypass, X, Z);

  const riverCrossings: RiverCrossing[] = RIVERS.map((river) => ({
    name: river.name,
    s: GAME.coreStart + river.km * GAME.metersPerKm,
    width: river.width,
    bridgeLength: river.bridgeLength,
    kind: river.kind,
  }));

  const sampleAt = (s: number): PathSample => {
    const clamped = clamp(s, 0, GAME.trackLength);
    const i0 = Math.min(totalSamples - 1, Math.floor(clamped));
    const i1 = Math.min(totalSamples - 1, i0 + 1);
    const f = clamped - i0;
    return {
      x: X[i0] + (X[i1] - X[i0]) * f,
      z: Z[i0] + (Z[i1] - Z[i0]) * f,
      heading: interpolateAngle(heading[i0], heading[i1], f),
      curvature: curvature[i0] + (curvature[i1] - curvature[i0]) * f,
      normalX: normalX[i0] + (normalX[i1] - normalX[i0]) * f,
      normalZ: normalZ[i0] + (normalZ[i1] - normalZ[i0]) * f,
    };
  };

  const path: PathData = {
    length: GAME.trackLength,
    coreStart: GAME.coreStart,
    coreEnd: GAME.coreEnd,
    x: X,
    z: Z,
    heading,
    curvature,
    normalX,
    normalZ,
    minRadius,
    riverCrossings,
    mainlineBypass,
    jinanBypassMinDistance,
    sampleAt,
    nearestS,
  };

  const yangtze = riverCrossings.find((river) => river.kind === 'yangtze');
  const yellow = riverCrossings.find((river) => river.kind === 'yellow');
  console.info(
    `[route] length=${GAME.trackLength} core=${GAME.coreLength} minRadius=${minRadius.toFixed(
      1,
    )}m 长江s=${yangtze?.s ?? '-'} 黄河s=${yellow?.s ?? '-'} bypassMin=${jinanBypassMinDistance.toFixed(
      1,
    )}m`,
  );

  return path;
}

export function attachStations(path: PathData, stations: Station[]): StationOnRoute[] {
  return stations.map((station) => {
    const s = GAME.coreStart + station.km * GAME.metersPerKm;
    const sample = path.sampleAt(s);
    return {
      ...station,
      s,
      side: sample.curvature < 0 ? 1 : -1,
    };
  });
}

function project(lat: number, lon: number): Vec2 {
  const radians = Math.PI / 180;
  return {
    x: (lon - PROJECTION_LON0) * Math.cos(PROJECTION_LAT0 * radians) * 111320,
    z: -(lat - PROJECTION_LAT0) * 111320,
  };
}

function sampleDense(
  points: THREE.Vector3[],
  cumulative: Float64Array,
  target: number,
): THREE.Vector3 {
  let low = 0;
  let high = cumulative.length - 1;
  while (low + 1 < high) {
    const middle = (low + high) >> 1;
    if (cumulative[middle] <= target) {
      low = middle;
    } else {
      high = middle;
    }
  }
  const span = cumulative[high] - cumulative[low];
  const f = span > 1e-9 ? (target - cumulative[low]) / span : 0;
  return new THREE.Vector3().lerpVectors(points[low], points[high], f);
}

function smoothPolyline(
  x: Float64Array,
  z: Float64Array,
  sigma: number,
): { x: Float64Array; z: Float64Array } {
  const radius = Math.ceil(sigma * 3);
  const weights = new Float64Array(radius * 2 + 1);
  let weightSum = 0;
  for (let offset = -radius; offset <= radius; offset += 1) {
    const weight = Math.exp(-(offset * offset) / (2 * sigma * sigma));
    weights[offset + radius] = weight;
    weightSum += weight;
  }
  for (let i = 0; i < weights.length; i += 1) {
    weights[i] /= weightSum;
  }

  const apply = (source: Float64Array): Float64Array => {
    const count = source.length;
    const result = new Float64Array(count);
    for (let i = 0; i < count; i += 1) {
      let value = 0;
      for (let k = -radius; k <= radius; k += 1) {
        let index = i + k;
        if (index < 0) {
          index = -index;
        } else if (index >= count) {
          index = 2 * count - 2 - index;
        }
        value += source[index] * weights[k + radius];
      }
      result[i] = value;
    }
    return result;
  };

  return { x: apply(x), z: apply(z) };
}

function resampleUniform(
  x: Float64Array,
  z: Float64Array,
): { x: Float64Array; z: Float64Array } {
  const count = x.length;
  const cumulative = new Float64Array(count);
  for (let i = 1; i < count; i += 1) {
    cumulative[i] = cumulative[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  const total = cumulative[count - 1];
  const resultX = new Float64Array(count);
  const resultZ = new Float64Array(count);
  let cursor = 0;
  for (let i = 0; i < count; i += 1) {
    const target = (i * total) / (count - 1);
    while (cursor < count - 2 && cumulative[cursor + 1] < target) {
      cursor += 1;
    }
    const span = cumulative[cursor + 1] - cumulative[cursor];
    const f = span > 1e-9 ? (target - cumulative[cursor]) / span : 0;
    resultX[i] = x[cursor] + (x[cursor + 1] - x[cursor]) * f;
    resultZ[i] = z[cursor] + (z[cursor + 1] - z[cursor]) * f;
  }
  return { x: resultX, z: resultZ };
}

function minInteriorDistance(bypass: Vec2[], X: Float32Array, Z: Float32Array): number {
  if (bypass.length < 3) {
    return 0;
  }
  let minimum = Number.POSITIVE_INFINITY;
  for (let i = 1; i < bypass.length - 1; i += 1) {
    const point = bypass[i];
    let best = Number.POSITIVE_INFINITY;
    for (let j = 0; j < X.length; j += 1) {
      const dx = X[j] - point.x;
      const dz = Z[j] - point.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      if (distance < best) {
        best = distance;
      }
    }
    minimum = Math.min(minimum, best);
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function normalize2(x: number, z: number): Vec2 {
  const length = Math.hypot(x, z);
  if (length < 1e-9) {
    return { x: 0, z: -1 };
  }
  return { x: x / length, z: z / length };
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function interpolateAngle(a: number, b: number, f: number): number {
  return a + wrapAngle(b - a) * f;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
