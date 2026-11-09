import { LED_FONT, LED_ROWS } from './ledFont';
import type { PathData, PathSample, StationOnRoute } from './types';

export interface RouteMap {
  update(s: number): void;
}

export interface Speedometer {
  update(displaySpeed: number): void;
}

export interface SpeedProfile {
  startS: number;
  step: number;
  speeds: Float32Array;
  max: number;
}

export interface SpeedMap {
  show(profile: SpeedProfile): void;
  clear(): void;
}

export interface LedBoard {
  setText(text: string): void;
  update(dt: number): void;
}

const LED_FALLBACK = [
  '1111111111',
  '1000000001',
  '1000000001',
  '1000000001',
  '1000000001',
  '1000000001',
  '1000000001',
  '1000000001',
  '1000000001',
  '1000000001',
  '1000000001',
  '1111111111',
];
const LED_GAP = 1;
const LED_PAD = 2;

interface LedBitmap {
  rows: number;
  cols: number;
  data: Uint8Array;
}

function composeLed(text: string): LedBitmap {
  const chars = Array.from(text);
  let cols = LED_PAD * 2;
  let missing = '';
  for (const ch of chars) {
    const glyph = LED_FONT[ch];
    if (!glyph) {
      missing += ch;
    }
    cols += (glyph?.[0]?.length ?? LED_FALLBACK[0].length) + LED_GAP;
  }
  if (missing) {
    console.warn(`LED font missing glyphs: ${missing}`);
  }
  const data = new Uint8Array(LED_ROWS * cols);
  let cursor = LED_PAD;
  for (const ch of chars) {
    const glyph = LED_FONT[ch] ?? LED_FALLBACK;
    const width = glyph[0]?.length ?? LED_FALLBACK[0].length;
    for (let y = 0; y < LED_ROWS; y += 1) {
      const row = glyph[y] ?? '';
      for (let x = 0; x < width; x += 1) {
        if (row[x] === '1') {
          data[y * cols + cursor + x] = 1;
        }
      }
    }
    cursor += width + LED_GAP;
  }
  return { rows: LED_ROWS, cols, data };
}

export function createLedBoard(
  canvas: HTMLCanvasElement,
  viewport: HTMLElement,
  label: HTMLElement,
): LedBoard {
  const context = canvas.getContext('2d');
  const color = '#ffd24a';
  const speed = 40;
  let text = '';
  let bitmap: LedBitmap | null = null;
  let bitmapText = '';
  let strip: HTMLCanvasElement | null = null;
  let offsetDevice = 0;
  let stepDevice = 2;
  let stepTime = 0;
  let accumulator = 0;
  let measuredWidth = -1;
  let measuredHeight = -1;
  let measuredDpr = -1;

  function deviceScale(): number {
    return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  }

  function ensureBitmap(): void {
    if (!bitmap || bitmapText !== text) {
      bitmap = composeLed(text);
      bitmapText = text;
    }
  }

  function draw(): void {
    if (!context || !strip) {
      return;
    }
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(strip, -offsetDevice, 0);
    if (strip.width - offsetDevice < canvas.width) {
      context.drawImage(strip, strip.width - offsetDevice, 0);
    }
  }

  function build(): void {
    const width = Math.round(viewport.clientWidth);
    const height = Math.round(viewport.clientHeight);
    const dpr = deviceScale();
    measuredWidth = width;
    measuredHeight = height;
    measuredDpr = dpr;
    strip = null;
    offsetDevice = 0;
    accumulator = 0;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    if (!context) {
      return;
    }
    context.clearRect(0, 0, canvas.width, canvas.height);
    ensureBitmap();
    if (!bitmap || !text || width <= 0 || height <= 0) {
      return;
    }

    const compact = width < 160;
    const pitchCss = compact ? 2 : 3;
    const pitchDevice = Math.max(2, Math.round(pitchCss * dpr));
    stepDevice = pitchDevice;
    stepTime = pitchCss / speed;
    const radius = Math.max(0.75, pitchDevice * 0.36);
    const originY = Math.floor((canvas.height - bitmap.rows * pitchDevice) / 2);
    const snap = pitchDevice % 2 === 0 ? 0.5 : 0;

    const nextStrip = document.createElement('canvas');
    nextStrip.width = bitmap.cols * pitchDevice;
    nextStrip.height = canvas.height;
    const stripContext = nextStrip.getContext('2d');
    if (!stripContext) {
      return;
    }
    stripContext.fillStyle = color;
    for (let y = 0; y < bitmap.rows; y += 1) {
      const cy = originY + pitchDevice / 2 + snap + y * pitchDevice;
      for (let x = 0; x < bitmap.cols; x += 1) {
        if (!bitmap.data[y * bitmap.cols + x]) {
          continue;
        }
        const cx = pitchDevice / 2 + snap + x * pitchDevice;
        stripContext.beginPath();
        stripContext.arc(cx, cy, radius, 0, Math.PI * 2);
        stripContext.fill();
      }
    }
    strip = nextStrip;
    draw();
  }

  return {
    setText(value: string): void {
      if (value === text) {
        return;
      }
      text = value;
      label.textContent = value;
      build();
    },
    update(dt: number): void {
      if (!text) {
        return;
      }
      if (
        Math.round(viewport.clientWidth) !== measuredWidth ||
        Math.round(viewport.clientHeight) !== measuredHeight ||
        deviceScale() !== measuredDpr
      ) {
        build();
        return;
      }
      if (!strip || !(strip.width > 0) || !(stepTime > 0)) {
        return;
      }
      accumulator += dt;
      let moved = false;
      while (accumulator >= stepTime) {
        accumulator -= stepTime;
        offsetDevice = (offsetDevice + stepDevice) % strip.width;
        moved = true;
      }
      if (moved) {
        draw();
      }
    },
  };
}

export function createSpeedProfile(
  startS: number,
  endS: number,
  step: number,
): SpeedProfile {
  const count = Math.max(1, Math.ceil((endS - startS) / step) + 1);
  const speeds = new Float32Array(count);
  speeds.fill(Number.NaN);
  return { startS, step, speeds, max: 0 };
}

export function resetSpeedProfile(profile: SpeedProfile): void {
  profile.speeds.fill(Number.NaN);
  profile.max = 0;
}

export function recordSpeed(
  profile: SpeedProfile,
  fromS: number,
  toS: number,
  speed: number,
): void {
  if (!(speed > 0)) {
    return;
  }
  const first = clamp(
    Math.floor((Math.min(fromS, toS) - profile.startS) / profile.step),
    0,
    profile.speeds.length - 1,
  );
  const last = clamp(
    Math.floor((Math.max(fromS, toS) - profile.startS) / profile.step),
    0,
    profile.speeds.length - 1,
  );
  for (let i = first; i <= last; i += 1) {
    profile.speeds[i] = speed;
  }
  profile.max = Math.max(profile.max, speed);
}

export interface BestRecord {
  time: number;
  maxSpeed: number;
  date: string;
}

const BEST_KEY = 'fast-train-1462-best-v1';

interface LocalPoint {
  x: number;
  y: number;
  forward: number;
  lateral: number;
}

const LOOKAHEAD = 1500;
const BEHIND = 40;
// 车头朝上时，大弯的横向偏移可达约 1.3 km；用软压缩保持整段道路仍在窄地图内。
const MAX_LATERAL = 1400;
const LATERAL_SOFT = 420;

export function createRouteMap(
  canvas: HTMLCanvasElement,
  path: PathData,
  stations: StationOnRoute[],
): RouteMap {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let lastS = -Infinity;
  let compact = false;
  let scale = 1;
  let halfWidth = 0;
  let lateralNormalization = 1;
  let trainX = 0;
  let trainY = 0;
  let topY = 0;

  function layout(): boolean {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth < 40 || cssHeight < 80) {
      return false;
    }
    if (cssWidth === width && cssHeight === height) {
      return true;
    }
    width = cssWidth;
    height = cssHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    compact = width < 112;
    const padTop = compact ? 20 : 24;
    const padBottom = compact ? 22 : 26;
    trainX = width * 0.5;
    trainY = height - padBottom;
    topY = padTop;
    halfWidth = width * 0.5 - (compact ? 6 : 8);
    lateralNormalization = 1 - Math.exp(-MAX_LATERAL / LATERAL_SOFT);
    scale = (trainY - topY) / LOOKAHEAD;
    lastS = -Infinity;
    return true;
  }

  function makeProjector(origin: PathSample): (x: number, z: number) => LocalPoint {
    const forwardX = -Math.sin(origin.heading);
    const forwardZ = -Math.cos(origin.heading);
    return (x: number, z: number): LocalPoint => {
      const dx = x - origin.x;
      const dz = z - origin.z;
      const forward = dx * forwardX + dz * forwardZ;
      const lateral = dx * origin.normalX + dz * origin.normalZ;
      const compressed =
        (Math.sign(lateral) * (1 - Math.exp(-Math.abs(lateral) / LATERAL_SOFT))) /
        lateralNormalization;
      return {
        x: trainX + clamp(compressed, -1, 1) * halfWidth,
        y: trainY - forward * scale,
        forward,
        lateral,
      };
    };
  }

  function drawText(
    text: string,
    x: number,
    y: number,
    color: string,
    size: number,
    align: CanvasTextAlign,
  ): void {
    if (!ctx) {
      return;
    }
    drawCanvasText(ctx, text, x, y, color, size, align);
  }

  function drawRoute(
    project: (x: number, z: number) => LocalPoint,
    currentS: number,
  ): void {
    if (!ctx) {
      return;
    }
    const from = Math.max(path.coreStart, currentS - BEHIND);
    const to = Math.min(path.coreEnd, currentS + LOOKAHEAD);
    if (!(to > from)) {
      return;
    }
    const route = new Path2D();
    let first = true;
    for (let value = from; value <= to; value += 10) {
      const sample = path.sampleAt(value);
      const point = project(sample.x, sample.z);
      if (first) {
        route.moveTo(point.x, point.y);
        first = false;
      } else {
        route.lineTo(point.x, point.y);
      }
    }
    const endSample = path.sampleAt(to);
    const endPoint = project(endSample.x, endSample.z);
    if (first) {
      route.moveTo(endPoint.x, endPoint.y);
    } else {
      route.lineTo(endPoint.x, endPoint.y);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(61, 220, 132, 0.18)';
    ctx.lineWidth = compact ? 7 : 8;
    ctx.stroke(route);
    ctx.strokeStyle = 'rgba(214, 238, 225, 0.9)';
    ctx.lineWidth = compact ? 3 : 3.4;
    ctx.stroke(route);
  }

  function drawRivers(
    project: (x: number, z: number) => LocalPoint,
    currentS: number,
  ): void {
    if (!ctx) {
      return;
    }
    for (const river of path.riverCrossings) {
      if (river.s < currentS - BEHIND || river.s > currentS + LOOKAHEAD) {
        continue;
      }
      const sample = path.sampleAt(river.s);
      const center = project(sample.x, sample.z);
      if (center.y < topY - 12 || center.y > height + 12) {
        continue;
      }
      const tangentSample = path.sampleAt(
        Math.min(path.coreEnd, river.s + 10),
      );
      const tangentPoint = project(tangentSample.x, tangentSample.z);
      let tangentX = tangentPoint.x - center.x;
      let tangentY = tangentPoint.y - center.y;
      const tangentLength = Math.hypot(tangentX, tangentY) || 1;
      tangentX /= tangentLength;
      tangentY /= tangentLength;
      const halfTick = compact ? 7 : 8;
      const a = {
        x: center.x + tangentY * halfTick,
        y: center.y - tangentX * halfTick,
      };
      const b = {
        x: center.x - tangentY * halfTick,
        y: center.y + tangentX * halfTick,
      };
      const color = river.kind === 'yangtze' ? '#8fd8ef' : '#e8b44e';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = color;
      ctx.lineWidth = compact ? 1.4 : 1.6;
      ctx.stroke();
      const label = river.kind === 'yangtze' ? '长江' : '黄河';
      const labelOnLeft = center.x > width * 0.5;
      drawText(
        label,
        labelOnLeft ? center.x - 13 : center.x + 13,
        center.y,
        color,
        compact ? 7 : 8,
        labelOnLeft ? 'right' : 'left',
      );
    }
  }

  function drawStations(
    project: (x: number, z: number) => LocalPoint,
    currentS: number,
  ): void {
    if (!ctx) {
      return;
    }
    for (const station of stations) {
      if (station.s < currentS - BEHIND || station.s > currentS + LOOKAHEAD) {
        continue;
      }
      const sample = path.sampleAt(station.s);
      const point = project(sample.x, sample.z);
      if (
        point.y < topY - 6 ||
        point.y > height - 4 ||
        point.x < -6 ||
        point.x > width + 6
      ) {
        continue;
      }
      if (station.stop) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, compact ? 2.2 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#3ddc84';
        ctx.fill();
        ctx.strokeStyle = 'rgba(5, 22, 15, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(point.x, point.y, compact ? 1.3 : 1.6, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(190, 210, 200, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawStopLabels(
    project: (x: number, z: number) => LocalPoint,
    currentS: number,
  ): void {
    if (!ctx) {
      return;
    }
    const size = compact ? 8.5 : 9.5;
    const placed: Array<{ left: number; right: number; top: number; bottom: number }> = [];
    for (const station of stations) {
      if (!station.stop) {
        continue;
      }
      if (station.s < currentS - BEHIND || station.s > currentS + LOOKAHEAD) {
        continue;
      }
      const sample = path.sampleAt(station.s);
      const point = project(sample.x, sample.z);
      const minY = topY + 4;
      const maxY = height - (compact ? 32 : 36);
      if (point.y < minY || point.y > maxY || point.x < 4 || point.x > width - 4) {
        continue;
      }
      ctx.font = `${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
      const textWidth = ctx.measureText(station.name).width;
      let labelOnLeft = point.x > width * 0.5;
      let labelX = labelOnLeft ? point.x - 7 : point.x + 7;
      const fitsLeft = labelX - textWidth >= 2;
      const fitsRight = labelX + textWidth <= width - 2;
      if ((labelOnLeft && !fitsLeft && fitsRight) || (!labelOnLeft && !fitsRight && fitsLeft)) {
        labelOnLeft = !labelOnLeft;
        labelX = labelOnLeft ? point.x - 7 : point.x + 7;
      }
      const labelHeight = size + 2;
      let labelY = point.y;
      let found = false;
      for (const offset of [0, -1, 1, -2, 2]) {
        const candidateY = point.y + offset * (labelHeight + 2);
        if (candidateY < minY || candidateY > maxY) {
          continue;
        }
        const left = labelOnLeft ? labelX - textWidth : labelX;
        const right = left + textWidth;
        const top = candidateY - labelHeight * 0.5;
        const bottom = top + labelHeight;
        const overlaps = placed.some(
          (rect) =>
            left < rect.right + 2 &&
            right > rect.left - 2 &&
            top < rect.bottom + 2 &&
            bottom > rect.top - 2,
        );
        if (!overlaps) {
          labelY = candidateY;
          placed.push({ left, right, top, bottom });
          found = true;
          break;
        }
      }
      if (!found) {
        continue;
      }
      drawText(
        station.name,
        labelX,
        labelY,
        'rgba(238, 248, 242, 0.95)',
        size,
        labelOnLeft ? 'right' : 'left',
      );
    }
  }

  function drawTrain(): void {
    if (!ctx) {
      return;
    }
    const x = trainX;
    const y = trainY;
    const halfWidth = compact ? 4.6 : 5.2;
    const nose = compact ? 9 : 10;
    const tail = compact ? 5 : 6;
    ctx.beginPath();
    ctx.arc(x, y - 3, compact ? 7 : 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 92, 60, 0.18)';
    ctx.fill();
    // 车头朝上：底部中央的箭头形车头，线路从上方延伸出去。
    ctx.beginPath();
    ctx.moveTo(x, y - nose);
    ctx.lineTo(x + halfWidth, y - 1);
    ctx.lineTo(x + halfWidth, y + tail);
    ctx.lineTo(x - halfWidth, y + tail);
    ctx.lineTo(x - halfWidth, y - 1);
    ctx.closePath();
    ctx.fillStyle = '#ff5c3c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.92)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - halfWidth * 0.55, y - nose * 0.35);
    ctx.lineTo(x + halfWidth * 0.55, y - nose * 0.35);
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function update(value: number): void {
    if (!ctx || !layout()) {
      return;
    }
    if (Math.abs(value - lastS) < 1.5) {
      return;
    }
    lastS = value;
    const currentS = clamp(value, path.coreStart, path.coreEnd);
    const origin = path.sampleAt(currentS);
    const project = makeProjector(origin);

    ctx.clearRect(0, 0, width, height);
    drawRoute(project, currentS);
    drawRivers(project, currentS);
    drawStations(project, currentS);
    drawStopLabels(project, currentS);
    drawTrain();
    drawText(
      '前 ↑',
      width - 6,
      compact ? 10 : 12,
      'rgba(214, 238, 225, 0.6)',
      compact ? 8 : 9,
      'right',
    );
  }

  return { update };
}

export function createResultMap(
  canvas: HTMLCanvasElement,
  path: PathData,
  stations: StationOnRoute[],
): SpeedMap {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let lastProfile: SpeedProfile | null = null;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let s = path.coreStart; s <= path.coreEnd; s += 10) {
    const sample = path.sampleAt(s);
    minX = Math.min(minX, sample.x);
    maxX = Math.max(maxX, sample.x);
    minZ = Math.min(minZ, sample.z);
    maxZ = Math.max(maxZ, sample.z);
  }
  const marginX = Math.max(1, maxX - minX) * 0.02;
  const marginZ = Math.max(1, maxZ - minZ) * 0.02;
  minX -= marginX;
  maxX += marginX;
  minZ -= marginZ;
  maxZ += marginZ;
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);

  function layout(): boolean {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth < 60 || cssHeight < 60) {
      return false;
    }
    if (cssWidth === width && cssHeight === height) {
      return true;
    }
    width = cssWidth;
    height = cssHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    const padX = 12;
    const padY = 10;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;
    scale = Math.min(innerW / spanX, innerH / spanZ);
    offsetX = padX + (innerW - spanX * scale) * 0.5 - minX * scale;
    offsetY = padY + (innerH - spanZ * scale) * 0.5 - minZ * scale;
    return true;
  }

  const sx = (x: number): number => offsetX + x * scale;
  const sy = (z: number): number => offsetY + z * scale;
  const compact = (): boolean => width < 240;
  const routePoint = (value: number): { x: number; y: number } => {
    const sample = path.sampleAt(value);
    return { x: sx(sample.x), y: sy(sample.z) };
  };

  function drawBaseRoute(): void {
    if (!ctx) {
      return;
    }
    ctx.beginPath();
    let first = true;
    for (let s = path.coreStart; s <= path.coreEnd; s += 10) {
      const sample = path.sampleAt(s);
      const x = sx(sample.x);
      const y = sy(sample.z);
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = 'rgba(214, 238, 225, 0.16)';
    ctx.lineWidth = 5;
    ctx.stroke();
  }

  function drawRivers(): void {
    if (!ctx) {
      return;
    }
    const size = compact() ? 8 : 9;
    for (const river of path.riverCrossings) {
      const sample = path.sampleAt(river.s);
      const centerX = sx(sample.x);
      const centerY = sy(sample.z);
      const halfWorld = 8 / scale;
      const x1 = sx(sample.x - sample.normalX * halfWorld);
      const y1 = sy(sample.z - sample.normalZ * halfWorld);
      const x2 = sx(sample.x + sample.normalX * halfWorld);
      const y2 = sy(sample.z + sample.normalZ * halfWorld);
      const color = river.kind === 'yangtze' ? '#8fd8ef' : '#e8b44e';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.stroke();
      const label = river.kind === 'yangtze' ? '长江' : '黄河';
      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const labelOnLeft = left > 42;
      if (river.kind === 'yellow' && !labelOnLeft) {
        // 泺口桥紧贴济南站，横向放不下时改到过河点下方。
        drawCanvasText(
          ctx,
          label,
          clamp(centerX, 14, width - 14),
          centerY + 11,
          color,
          size,
          'center',
        );
      } else {
        drawCanvasText(
          ctx,
          label,
          labelOnLeft ? left - 4 : right + 4,
          centerY,
          color,
          size,
          labelOnLeft ? 'right' : 'left',
        );
      }
    }
  }

  function drawStations(): void {
    if (!ctx) {
      return;
    }
    for (const station of stations) {
      if (!station.stop) {
        continue;
      }
      const point = routePoint(station.s);
      ctx.beginPath();
      ctx.arc(point.x, point.y, compact() ? 1.8 : 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#3ddc84';
      ctx.fill();
      ctx.strokeStyle = 'rgba(5, 22, 15, 0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function drawMajorLabels(): void {
    if (!ctx) {
      return;
    }
    const majors: Array<{ name: string; side: 'left' | 'right'; accent?: boolean }> = [
      { name: '上海', side: 'left' },
      { name: '南京', side: 'right' },
      { name: '徐州', side: 'right' },
      { name: '济南', side: 'right', accent: true },
      { name: '天津西', side: 'right' },
      { name: '北京', side: 'right' },
    ];
    for (const major of majors) {
      const station = stations.find((item) => item.name === major.name);
      if (!station) {
        continue;
      }
      const point = routePoint(station.s);
      const color = major.accent ? '#ffd24a' : 'rgba(238, 248, 242, 0.92)';
      const textX =
        major.side === 'left'
          ? Math.max(3, point.x - 6)
          : Math.min(width - 3, point.x + 6);
      drawCanvasText(
        ctx,
        major.name,
        textX,
        point.y,
        color,
        compact() ? 9 : 10,
        major.side === 'left' ? 'right' : 'left',
      );
    }
  }

  function drawSpeedRoute(profile: SpeedProfile): void {
    if (!ctx || !(profile.max > 0)) {
      return;
    }
    const count = profile.speeds.length;
    const smoothed = new Float32Array(count);
    smoothed.fill(Number.NaN);
    for (let i = 0; i < count; i += 1) {
      let sum = 0;
      let samples = 0;
      for (let k = -2; k <= 2; k += 1) {
        const index = i + k;
        if (index < 0 || index >= count) {
          continue;
        }
        const value = profile.speeds[index];
        if (Number.isFinite(value)) {
          sum += value;
          samples += 1;
        }
      }
      if (samples > 0) {
        smoothed[i] = sum / samples;
      }
    }

    const points: Array<{ x: number; y: number }> = new Array(count);
    for (let i = 0; i < count; i += 1) {
      const s = clamp(
        profile.startS + (i + 0.5) * profile.step,
        path.coreStart,
        path.coreEnd,
      );
      const sample = path.sampleAt(s);
      points[i] = { x: sx(sample.x), y: sy(sample.z) };
    }

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = compact() ? 2.8 : 3.4;
    for (let i = 0; i < count - 1; i += 1) {
      const value = smoothed[i];
      if (!Number.isFinite(value) || value <= 0) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(points[i].x, points[i].y);
      ctx.lineTo(points[i + 1].x, points[i + 1].y);
      ctx.strokeStyle = speedGradientColor(clamp(value / profile.max, 0, 1));
      ctx.stroke();
    }
  }

  function draw(): void {
    if (!ctx || !layout()) {
      return;
    }
    ctx.clearRect(0, 0, width, height);
    drawBaseRoute();
    drawRivers();
    if (lastProfile) {
      drawSpeedRoute(lastProfile);
    }
    drawStations();
    drawMajorLabels();
  }

  window.addEventListener('resize', () => {
    if (lastProfile) {
      draw();
    }
  });

  return {
    show(profile: SpeedProfile): void {
      lastProfile = profile;
      draw();
    },
    clear(): void {
      lastProfile = null;
      if (ctx) {
        ctx.clearRect(0, 0, width, height);
      }
    },
  };
}

export function createSpeedometer(
  canvas: HTMLCanvasElement,
  fullScale: number,
): Speedometer {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let shown = 0;

  const startAngle = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  // 刻度画到 30k；更高速度时指针继续旋转，可超过一整圈。
  const dialMax = 30000;

  function layout(): boolean {
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    if (cssWidth < 40 || cssHeight < 40) {
      return false;
    }
    if (cssWidth === width && cssHeight === height) {
      return true;
    }
    width = cssWidth;
    height = cssHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  function draw(): void {
    if (!ctx || !layout()) {
      return;
    }
    const cx = width * 0.5;
    const cy = height * 0.52;
    const radius = Math.min(width, height) * 0.5 - 7;

    ctx.clearRect(0, 0, width, height);
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(4, 14, 10, 0.6)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(134, 255, 189, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();

    const zones: Array<[number, number, string]> = [
      [0, 0.5, 'rgba(61, 220, 132, 0.75)'],
      [0.5, 0.75, 'rgba(255, 210, 74, 0.85)'],
      [0.75, 1, 'rgba(255, 92, 60, 0.9)'],
    ];
    ctx.lineCap = 'round';
    for (const [from, to, color] of zones) {
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        radius - 1,
        startAngle + sweep * from,
        startAngle + sweep * to,
      );
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    const tickCount = dialMax / 1000;
    for (let i = 0; i <= tickCount; i += 1) {
      const t = i / tickCount;
      const angle = startAngle + sweep * t;
      const major = i % 5 === 0;
      const inner = radius - (major ? 12 : 7);
      const outer = radius - 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.strokeStyle = major ? 'rgba(255, 210, 74, 0.95)' : 'rgba(190, 210, 200, 0.5)';
      ctx.lineWidth = major ? 1.8 : 1;
      ctx.stroke();
    }

    ctx.font = `${Math.max(7, Math.round(width * 0.065))}px "Bahnschrift", "DIN Alternate", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255, 210, 74, 0.85)';
    const labelCount = dialMax / 5000;
    for (let i = 0; i <= labelCount; i += 1) {
      const value = i * 5000;
      const angle = startAngle + sweep * (value / dialMax);
      const labelRadius = radius - 22;
      ctx.fillText(
        i === 0 ? '0' : `${i * 5}k`,
        cx + Math.cos(angle) * labelRadius,
        cy + Math.sin(angle) * labelRadius,
      );
    }

    const needleAngle = startAngle + sweep * (shown / dialMax);
    ctx.save();
    ctx.shadowColor = 'rgba(255, 92, 60, 0.9)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(cx - Math.cos(needleAngle) * 7, cy - Math.sin(needleAngle) * 7);
    ctx.lineTo(cx + Math.cos(needleAngle) * (radius - 16), cy + Math.sin(needleAngle) * (radius - 16));
    ctx.strokeStyle = '#ff6b4a';
    ctx.lineWidth = Math.max(2, width * 0.016);
    ctx.stroke();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(3, width * 0.026), 0, Math.PI * 2);
    ctx.fillStyle = '#ffd24a';
    ctx.fill();

    ctx.font = `${Math.max(6, Math.round(width * 0.055))}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    ctx.fillStyle = 'rgba(167, 188, 177, 0.9)';
    ctx.fillText('km/h', cx, cy + radius * 0.46);
  }

  function update(displaySpeed: number): void {
    const target = clamp(displaySpeed, 0, fullScale);
    shown += (target - shown) * 0.22;
    if (Math.abs(target - shown) < 8) {
      shown = target;
    }
    draw();
  }

  return { update };
}

export function loadBest(): BestRecord | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<BestRecord>;
    if (typeof parsed.time !== 'number' || !Number.isFinite(parsed.time) || parsed.time <= 0) {
      return null;
    }
    return {
      time: parsed.time,
      maxSpeed: typeof parsed.maxSpeed === 'number' ? parsed.maxSpeed : 0,
      date: typeof parsed.date === 'string' ? parsed.date : '',
    };
  } catch {
    return null;
  }
}

export function saveBest(record: BestRecord): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(record));
  } catch {
    // Storage can be unavailable in private mode; record keeping is best-effort.
  }
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds - minutes * 60;
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`;
}

function formatFollowerCount(value: number): string {
  if (value < 10000) {
    return String(Math.round(value));
  }
  return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}万`;
}

export interface ResultAuthorData {
  nickname: string;
  sign: string;
  follower: number;
  archiveCount: number;
  avatarImage: HTMLImageElement | null;
}

export interface ResultShareData {
  timeText: string;
  bestTimeText: string;
  maxSpeedText: string;
  averageSpeedText: string;
  distanceText: string;
  mapMaxText: string;
  eggText: string;
  isNewBest: boolean;
  mapCanvas: HTMLCanvasElement;
  qrImage?: HTMLImageElement | null;
  author?: ResultAuthorData | null;
}

export function renderResultImage(data: ResultShareData): string | null {
  const width = 1200;
  const mainHeight = 1200;
  const hasQr = Boolean(data.qrImage);
  const hasAuthor = Boolean(data.author);
  const height = hasQr || hasAuthor ? 1520 : mainHeight;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  const fontSans = '"Noto Sans SC", "Microsoft YaHei", sans-serif';
  const fontDigits =
    '"Bahnschrift", "DIN Alternate", ui-monospace, monospace';
  const ink = '#eef8f2';
  const muted = '#a7b8b1';
  const accent = '#ffd24a';
  const green = '#3ddc84';
  const leftX = 92;
  const leftW = 520;
  const rightX = 648;
  const rightW = 460;
  const bodyTop = 470;
  const panelH = 570;
  const rowGap = 92;

  const background = ctx.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#0c2018');
  background.addColorStop(0.55, '#081711');
  background.addColorStop(1, '#050f0b');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(
    width * 0.78,
    100,
    10,
    width * 0.78,
    100,
    620,
  );
  glow.addColorStop(0, 'rgba(61, 220, 132, 0.16)');
  glow.addColorStop(1, 'rgba(61, 220, 132, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  roundedRect(ctx, 2, 2, width - 4, mainHeight - 4, 34);
  ctx.strokeStyle = 'rgba(255, 210, 74, 0.3)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const text = (
    value: string,
    x: number,
    y: number,
    size: number,
    color: string,
    align: CanvasTextAlign = 'left',
    weight = 400,
    family = fontSans,
  ): void => {
    ctx.font = `${weight} ${size}px ${family}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillText(value, x, y);
  };

  const fit = (
    value: string,
    maxWidth: number,
    size: number,
    weight: number,
  ): string => {
    ctx.font = `${weight} ${size}px ${fontSans}`;
    if (ctx.measureText(value).width <= maxWidth) {
      return value;
    }
    let fitted = value;
    while (
      fitted.length > 1 &&
      ctx.measureText(`${fitted}…`).width > maxWidth
    ) {
      fitted = fitted.slice(0, -1);
    }
    return `${fitted}…`;
  };

  text('京沪线 · 1462', width / 2, 92, 26, green, 'center', 600);
  text('抵达北京站', width / 2, 160, 54, ink, 'center', 700);

  ctx.save();
  ctx.shadowColor = 'rgba(255, 210, 74, 0.22)';
  ctx.shadowBlur = 42;
  text(data.timeText, width / 2, 300, 148, accent, 'center', 800, fontDigits);
  ctx.restore();

  if (data.isNewBest) {
    ctx.font = `800 22px ${fontSans}`;
    const badgeWidth = ctx.measureText('新纪录').width + 48;
    roundedRect(ctx, width / 2 - badgeWidth / 2, 362, badgeWidth, 42, 21);
    ctx.fillStyle = accent;
    ctx.fill();
    text('新纪录', width / 2, 383, 22, '#181206', 'center', 800);
  }

  const rows: Array<[string, string]> = [
    ['历史最快', data.bestTimeText],
    ['最高等效时速', data.maxSpeedText],
    ['平均等效时速', data.averageSpeedText],
    ['全程', data.distanceText],
  ];
  rows.forEach(([label, value], index) => {
    const y = bodyTop + 74 + index * rowGap;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(leftX, y - 32);
    ctx.lineTo(leftX + leftW, y - 32);
    ctx.stroke();
    text(label, leftX, y, 24, muted, 'left', 500);
    text(value, leftX + leftW, y, 30, ink, 'right', 700);
  });

  if (data.eggText) {
    text(data.eggText, leftX, bodyTop + 462, 24, green, 'left', 500);
  }
  text(
    `速度表按真实 ${data.distanceText} 尺度等效显示`,
    leftX,
    bodyTop + 522,
    17,
    muted,
    'left',
    400,
  );

  roundedRect(ctx, rightX, bodyTop, rightW, panelH, 20);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  text('本局线路 · 速度着色', rightX + 22, bodyTop + 28, 18, muted, 'left', 500);
  text('北 ↑', rightX + rightW - 22, bodyTop + 28, 18, muted, 'right', 500);

  const mapX = rightX + 16;
  const mapY = bodyTop + 50;
  const mapW = rightW - 32;
  const mapH = panelH - 112;
  roundedRect(ctx, mapX, mapY, mapW, mapH, 12);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fill();

  const map = data.mapCanvas;
  if (map.width > 0 && map.height > 0) {
    const scale = Math.min(mapW / map.width, mapH / map.height);
    const drawW = map.width * scale;
    const drawH = map.height * scale;
    ctx.drawImage(
      map,
      mapX + (mapW - drawW) / 2,
      mapY + (mapH - drawH) / 2,
      drawW,
      drawH,
    );
  }

  const legendY = bodyTop + panelH - 34;
  text('慢', rightX + 22, legendY, 16, muted, 'left', 500);
  const barX = rightX + 52;
  const barW = 210;
  const bar = ctx.createLinearGradient(barX, 0, barX + barW, 0);
  bar.addColorStop(0, '#4ca8ff');
  bar.addColorStop(0.35, '#3ddc84');
  bar.addColorStop(0.7, '#ffd24a');
  bar.addColorStop(1, '#ff5c3c');
  roundedRect(ctx, barX, legendY - 4, barW, 8, 4);
  ctx.fillStyle = bar;
  ctx.fill();
  text('快', barX + barW + 10, legendY, 16, muted, 'left', 500);
  text(
    data.mapMaxText,
    rightX + rightW - 22,
    legendY,
    16,
    ink,
    'right',
    600,
  );

  const footerLineY = 1118;
  const footerY = 1152;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftX, footerLineY);
  ctx.lineTo(width - leftX, footerLineY);
  ctx.stroke();
  text(`上海 → 北京 · ${data.distanceText}`, leftX, footerY, 20, muted, 'left', 500);
  text('《京沪神车 1462》', width - leftX, footerY, 20, muted, 'right', 500);

  if (hasQr || hasAuthor) {
    const cardY = mainHeight + 20;
    const cardH = 280;
    roundedRect(ctx, 2, cardY, width - 4, cardH, 34);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 210, 74, 0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();

    let infoRight = width - leftX;
    if (data.qrImage) {
      const qrSize = 184;
      const qrPad = 12;
      const qrCardSize = qrSize + qrPad * 2;
      const qrCardX = width - leftX - qrCardSize;
      const qrCardY = cardY + (cardH - qrCardSize) / 2;
      roundedRect(ctx, qrCardX, qrCardY, qrCardSize, qrCardSize, 16);
      ctx.fillStyle = '#f4fff9';
      ctx.fill();
      ctx.drawImage(
        data.qrImage,
        qrCardX + qrPad,
        qrCardY + qrPad,
        qrSize,
        qrSize,
      );
      const captionFont = `600 22px ${fontSans}`;
      ctx.font = captionFont;
      const captionWidth = Math.max(
        ctx.measureText('扫码打开游戏').width,
        ctx.measureText('挑战这个成绩').width,
      );
      const captionX = qrCardX - 28;
      text('扫码打开游戏', captionX, cardY + 120, 22, ink, 'right', 600);
      text('挑战这个成绩', captionX, cardY + 156, 22, muted, 'right', 500);
      infoRight = captionX - captionWidth - 40;
    }

    if (data.author) {
      const author = data.author;
      const avatarSize = 96;
      const avatarX = leftX;
      const avatarY = cardY + (cardH - avatarSize) / 2;
      const avatarCx = avatarX + avatarSize / 2;
      const avatarCy = avatarY + avatarSize / 2;
      if (author.avatarImage) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarCx, avatarCy, avatarSize / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(
          author.avatarImage,
          avatarX,
          avatarY,
          avatarSize,
          avatarSize,
        );
        ctx.restore();
        ctx.beginPath();
        ctx.arc(avatarCx, avatarCy, avatarSize / 2 - 1, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(61, 220, 132, 0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(avatarCx, avatarCy, avatarSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(61, 220, 132, 0.16)';
        ctx.fill();
        text(
          author.nickname.slice(0, 1) || '?',
          avatarCx,
          avatarCy,
          40,
          green,
          'center',
          700,
        );
      }

      const meta: string[] = [];
      if (author.follower > 0) {
        meta.push(`粉丝 ${formatFollowerCount(author.follower)}`);
      }
      if (author.archiveCount > 0) {
        meta.push(`稿件 ${author.archiveCount}`);
      }
      const lines: Array<{
        value: string;
        size: number;
        color: string;
        weight: number;
      }> = [{ value: author.nickname, size: 30, color: ink, weight: 700 }];
      if (author.sign) {
        lines.push({ value: author.sign, size: 20, color: muted, weight: 400 });
      }
      if (meta.length) {
        lines.push({
          value: meta.join(' · '),
          size: 17,
          color: muted,
          weight: 500,
        });
      }
      const infoX = avatarX + avatarSize + 24;
      const maxWidth = Math.max(120, infoRight - infoX);
      const gap = 12;
      const totalHeight =
        lines.reduce((sum, line) => sum + line.size, 0) +
        gap * (lines.length - 1);
      let lineTop = avatarCy - totalHeight / 2;
      for (const line of lines) {
        text(
          fit(line.value, maxWidth, line.size, line.weight),
          infoX,
          lineTop + line.size / 2,
          line.size,
          line.color,
          'left',
          line.weight,
        );
        lineTop += line.size + gap;
      }
    }
  }

  let url: string;
  try {
    url = canvas.toDataURL('image/png');
  } catch {
    return null;
  }
  return url;
}

const SPEED_GRADIENT: Array<{ at: number; rgb: [number, number, number] }> = [
  { at: 0, rgb: [76, 168, 255] },
  { at: 0.35, rgb: [61, 220, 132] },
  { at: 0.7, rgb: [255, 210, 74] },
  { at: 1, rgb: [255, 92, 60] },
];

function speedGradientColor(t: number): string {
  let from = SPEED_GRADIENT[0];
  let to = SPEED_GRADIENT[SPEED_GRADIENT.length - 1];
  for (let i = 1; i < SPEED_GRADIENT.length; i += 1) {
    if (t <= SPEED_GRADIENT[i].at) {
      from = SPEED_GRADIENT[i - 1];
      to = SPEED_GRADIENT[i];
      break;
    }
  }
  const span = Math.max(1e-6, to.at - from.at);
  const u = clamp((t - from.at) / span, 0, 1);
  const r = Math.round(from.rgb[0] + (to.rgb[0] - from.rgb[0]) * u);
  const g = Math.round(from.rgb[1] + (to.rgb[1] - from.rgb[1]) * u);
  const b = Math.round(from.rgb[2] + (to.rgb[2] - from.rgb[2]) * u);
  return `rgb(${r}, ${g}, ${b})`;
}

function drawCanvasText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  size: number,
  align: CanvasTextAlign,
): void {
  ctx.font = `${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2.5, size * 0.32);
  ctx.strokeStyle = 'rgba(4, 18, 15, 0.88)';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
