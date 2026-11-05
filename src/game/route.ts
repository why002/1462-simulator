import { GAME } from './config';
import { STATIONS } from './stations';
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

// 66 个建模车站全部作为几何控制点；济南线再插入以下非车站途径点：
// 泰山后的京沪/济南线分歧点、济南东北经点、济南线经点、西侧经点、
// 桥南西经点、京沪正线会合点、黄河大桥。站台仍严格按 s 定位。
const ROUTE_VIAS: ControlPoint[] = [
  { name: '京沪/济南线分歧点', lat: 36.578613, lon: 116.903536, km: 952.5 },
  { name: '济南东北经点', lat: 36.70959, lon: 117.000743, km: 970.0 },
  { name: '济南线经点', lat: 36.705241, lon: 116.942292, km: 975.0 },
  { name: '济南西经点', lat: 36.701534, lon: 116.917067, km: 977.0 },
  { name: '桥南西经点', lat: 36.690657, lon: 116.861892, km: 981.7 },
  { name: '京沪正线会合点', lat: 36.700742, lon: 116.835851, km: 984.3 },
  { name: '黄河大桥', lat: 36.717332, lon: 116.818034, km: 987.2 },
];

const CONTROL_POINTS: ControlPoint[] = [
  ...STATIONS.map((station) => ({
    name: station.name,
    lat: station.lat,
    lon: station.lon,
    km: station.km,
  })),
  ...ROUTE_VIAS,
].sort((a, b) => a.km - b.km);

// 用户提供的京沪正线：与 1462 在泰山后分歧点分开，在桥南会合点与
// 1462 会合，之后共用黄河大桥。游戏内正线取「分离点 → 汇合点」的
// 直线方向铺轨，两端用缓和曲线接入；详细测点保留在本地数据备查。
const BYPASS_POINTS: Array<[number, number]> = [
  [36.578613, 116.903536],
  [36.601198, 116.901847],
  [36.636368, 116.891005],
  [36.668667, 116.891422],
  [36.700742, 116.835851],
  [36.717332, 116.818034],
];

const MAINLINE_END_INDEX = 4;

// 真实尺度：1 游戏米 = 100 真实米。长江在南京桥址约 1.5 km 宽，
// 南京长江大桥约 6.8 km；黄河大桥（用户提供桥位）约 1.0 km 宽、1.3 km 长。
const RIVERS: RiverDefinition[] = [
  {
    name: '长江',
    km: 311,
    width: 15,
    bridgeLength: 68,
    kind: 'yangtze',
  },
  {
    name: '黄河大桥',
    km: 987.2,
    width: 10,
    bridgeLength: 13,
    kind: 'yellow',
  },
];

const PROJECTION_LAT0 = 32;
const PROJECTION_LON0 = 119.5;
// 66 个真实站坐标经 1:100,000 压缩后，个别相邻小站只隔 30–60 游戏米；
// 只做很轻的平滑（σ=50 m），保留真实走向中的急弯与发卡弯，最小半径约 50 m，
// 弯道必须提前大幅制动。
const SMOOTH_SIGMA = 50;

export function buildRoute(): PathData {
  const projected = CONTROL_POINTS.map((point) => project(point.lat, point.lon));
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
  rawX[0] = projected[0].x;
  rawZ[0] = projected[0].z;

  const ghostStart = {
    x: 2 * projected[0].x - projected[1].x,
    z: 2 * projected[0].z - projected[1].z,
  };
  const lastPoint = projected.length - 1;
  const ghostEnd = {
    x: 2 * projected[lastPoint].x - projected[lastPoint - 1].x,
    z: 2 * projected[lastPoint].z - projected[lastPoint - 1].z,
  };

  let segment = 0;
  for (let i = 0; i < coreCount; i += 1) {
    const s = GAME.coreStart + i;
    while (segment < sAtControl.length - 2 && s > sAtControl[segment + 1]) {
      segment += 1;
    }
    const s0 = sAtControl[segment];
    const s1 = sAtControl[segment + 1];
    const u = s1 > s0 ? clamp((s - s0) / (s1 - s0), 0, 1) : 0;
    const p0 = segment > 0 ? projected[segment - 1] : ghostStart;
    const p1 = projected[segment];
    const p2 = projected[segment + 1];
    const p3 = segment + 2 <= lastPoint ? projected[segment + 2] : ghostEnd;
    const point = catmullRomPoint(p0, p1, p2, p3, u);
    rawX[i] = point.x;
    rawZ[i] = point.z;
  }

  // 在首尾各延长 3σ 的直线再平滑，避免反射边界把端点切线压成零、
  // 导致首尾上百米内采样挤在一起；平滑后只取中间的核心段。
  const extend = Math.ceil(SMOOTH_SIGMA * 3);
  const extendedCount = coreCount + extend * 2;
  const extendedX = new Float64Array(extendedCount);
  const extendedZ = new Float64Array(extendedCount);
  const startDir = normalize2(
    rawX[20] - rawX[0],
    rawZ[20] - rawZ[0],
  );
  const endDir = normalize2(
    rawX[coreCount - 1] - rawX[coreCount - 21],
    rawZ[coreCount - 1] - rawZ[coreCount - 21],
  );
  for (let k = 1; k <= extend; k += 1) {
    extendedX[extend - k] = rawX[0] - startDir.x * k;
    extendedZ[extend - k] = rawZ[0] - startDir.z * k;
    extendedX[extend + coreCount - 1 + k] = rawX[coreCount - 1] + endDir.x * k;
    extendedZ[extend + coreCount - 1 + k] = rawZ[coreCount - 1] + endDir.z * k;
  }
  for (let i = 0; i < coreCount; i += 1) {
    extendedX[extend + i] = rawX[i];
    extendedZ[extend + i] = rawZ[i];
  }
  const smoothedExtended = smoothPolyline(extendedX, extendedZ, SMOOTH_SIGMA);
  const smoothed = {
    x: smoothedExtended.x.slice(extend, extend + coreCount),
    z: smoothedExtended.z.slice(extend, extend + coreCount),
  };

  let geometricLength = 0;
  for (let i = 1; i < coreCount; i += 1) {
    geometricLength += Math.hypot(
      smoothed.x[i] - smoothed.x[i - 1],
      smoothed.z[i] - smoothed.z[i - 1],
    );
  }
  if (!(geometricLength > 0)) {
    throw new Error('Route geometric length is zero');
  }
  const scale = GAME.coreLength / geometricLength;
  const coreX = new Float64Array(coreCount);
  const coreZ = new Float64Array(coreCount);
  for (let i = 0; i < coreCount; i += 1) {
    coreX[i] = smoothed.x[i] * scale;
    coreZ[i] = smoothed.z[i] * scale;
  }

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

  const mainlineTrack = buildMainlineTrack(
    [mainlineBypass[0], mainlineBypass[MAINLINE_END_INDEX]],
    nearestS,
    X,
    Z,
  );

  const jinanBypassMinDistance = minInteriorDistance(
    mainlineBypass.slice(1, MAINLINE_END_INDEX),
    X,
    Z,
  );

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
    mainlineTrack,
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

function catmullRomPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, u: number): Vec2 {
  const d01 = Math.max(1e-6, Math.hypot(p1.x - p0.x, p1.z - p0.z) ** 0.5);
  const d12 = Math.max(1e-6, Math.hypot(p2.x - p1.x, p2.z - p1.z) ** 0.5);
  const d23 = Math.max(1e-6, Math.hypot(p3.x - p2.x, p3.z - p2.z) ** 0.5);
  const t0 = 0;
  const t1 = t0 + d01;
  const t2 = t1 + d12;
  const t3 = t2 + d23;
  const t = t1 + (t2 - t1) * u;
  const lerp = (a: Vec2, b: Vec2, ta: number, tb: number): Vec2 => ({
    x: a.x + ((b.x - a.x) * (t - ta)) / (tb - ta),
    z: a.z + ((b.z - a.z) * (t - ta)) / (tb - ta),
  });
  const a1 = lerp(p0, p1, t0, t1);
  const a2 = lerp(p1, p2, t1, t2);
  const a3 = lerp(p2, p3, t2, t3);
  const b1 = lerp(a1, a2, t0, t2);
  const b2 = lerp(a2, a3, t1, t3);
  return lerp(b1, b2, t1, t2);
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

function buildMainlineTrack(
  bypass: Vec2[],
  nearestS: (x: number, z: number) => number,
  X: Float32Array,
  Z: Float32Array,
): Vec2[] {
  if (bypass.length < 2) {
    return [];
  }
  const startPoint = bypass[0];
  const endPoint = bypass[bypass.length - 1];
  const startIndex = nearestS(startPoint.x, startPoint.z);
  const endIndex = nearestS(endPoint.x, endPoint.z);
  const startJoin = { x: X[startIndex], z: Z[startIndex] };
  const endJoin = { x: X[endIndex], z: Z[endIndex] };

  const routeTangent = (index: number): Vec2 => {
    const i0 = Math.max(0, index - 1);
    const i1 = Math.min(X.length - 1, index + 1);
    const dx = X[i1] - X[i0];
    const dz = Z[i1] - Z[i0];
    const length = Math.hypot(dx, dz);
    return length > 1e-6 ? { x: dx / length, z: dz / length } : { x: 0, z: -1 };
  };

  const startTangent = routeTangent(startIndex);
  const endTangent = routeTangent(endIndex);
  const dx = endPoint.x - startPoint.x;
  const dz = endPoint.z - startPoint.z;
  const chordLength = Math.hypot(dx, dz);
  if (!(chordLength > 0.01)) {
    return [];
  }
  const ux = dx / chordLength;
  const uz = dz / chordLength;
  const transition = Math.min(70, chordLength * 0.4);
  const handle = transition * 0.5;
  const chordStart = {
    x: startPoint.x + ux * transition,
    z: startPoint.z + uz * transition,
  };
  const chordEnd = {
    x: endPoint.x - ux * transition,
    z: endPoint.z - uz * transition,
  };

  const samples: Vec2[] = [];
  const pushPoint = (x: number, z: number): void => {
    const last = samples[samples.length - 1];
    if (!last || Math.hypot(x - last.x, z - last.z) > 0.05) {
      samples.push({ x, z });
    }
  };
  const addBezier = (p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2): void => {
    const steps = Math.max(8, Math.ceil(transition / 1.5));
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const mt = 1 - t;
      const a = mt * mt * mt;
      const b = 3 * mt * mt * t;
      const c = 3 * mt * t * t;
      const d = t * t * t;
      pushPoint(
        p0.x * a + p1.x * b + p2.x * c + p3.x * d,
        p0.z * a + p1.z * b + p2.z * c + p3.z * d,
      );
    }
  };

  // 分离点：从既有线路切线方向平滑转出，接到正线直线段。
  addBezier(
    startJoin,
    {
      x: startJoin.x + startTangent.x * handle,
      z: startJoin.z + startTangent.z * handle,
    },
    {
      x: chordStart.x - ux * handle,
      z: chordStart.z - uz * handle,
    },
    chordStart,
  );
  // 正线中段保持直线。
  const middleLength = Math.hypot(chordEnd.x - chordStart.x, chordEnd.z - chordStart.z);
  if (middleLength > 0.01) {
    const steps = Math.max(1, Math.ceil(middleLength / 1.5));
    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      pushPoint(
        chordStart.x + (chordEnd.x - chordStart.x) * t,
        chordStart.z + (chordEnd.z - chordStart.z) * t,
      );
    }
  }
  // 汇合点：沿既有线路切线平滑并入。
  addBezier(
    chordEnd,
    {
      x: chordEnd.x + ux * handle,
      z: chordEnd.z + uz * handle,
    },
    {
      x: endJoin.x - endTangent.x * handle,
      z: endJoin.z - endTangent.z * handle,
    },
    endJoin,
  );

  return samples;
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
