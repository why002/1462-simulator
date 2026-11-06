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

export async function shareText(text: string, url: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: '京沪神车 1462', text, url });
      return 'shared';
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return 'failed';
      }
    }
  }
  const full = `${text}\n${url}`;
  try {
    await navigator.clipboard.writeText(full);
    return 'copied';
  } catch {
    // Fall through to the legacy textarea copy path.
  }
  try {
    const area = document.createElement('textarea');
    area.value = full;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok ? 'copied' : 'failed';
  } catch {
    return 'failed';
  }
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
