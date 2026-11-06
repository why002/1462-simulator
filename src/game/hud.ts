import type { PathData, StationOnRoute } from './types';

export interface RouteMap {
  update(s: number): void;
}

export interface Speedometer {
  update(displaySpeed: number): void;
}

export interface BestRecord {
  time: number;
  maxSpeed: number;
  date: string;
}

const BEST_KEY = 'fast-train-1462-best-v1';

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
  let offsetX = 0;
  let offsetY = 0;
  let padTop = 0;
  let padBottom = 0;

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  const include = (x: number, z: number): void => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };
  for (let s = path.coreStart; s <= path.coreEnd; s += 10) {
    const sample = path.sampleAt(s);
    include(sample.x, sample.z);
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
    padTop = compact ? 14 : 18;
    padBottom = compact ? 22 : 26;
    const padX = compact ? 6 : 8;
    const innerW = width - padX * 2;
    const innerH = height - padTop - padBottom;
    scale = Math.min(innerW / spanX, innerH / spanZ);
    offsetX = padX + (innerW - spanX * scale) * 0.5 - minX * scale;
    offsetY = padTop + (innerH - spanZ * scale) * 0.5 - minZ * scale;
    lastS = -Infinity;
    return true;
  }

  const sx = (x: number): number => offsetX + x * scale;
  const sy = (z: number): number => offsetY + z * scale;

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
    ctx.font = `${size}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2.5, size * 0.32);
    ctx.strokeStyle = 'rgba(4, 18, 15, 0.88)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  const routePoint = (value: number): { x: number; y: number } => {
    const sample = path.sampleAt(value);
    return { x: sx(sample.x), y: sy(sample.z) };
  };

  function drawRoute(): void {
    if (!ctx) {
      return;
    }
    const route = new Path2D();
    let first = true;
    for (let value = path.coreStart; value <= path.coreEnd; value += 25) {
      const x = sx(path.sampleAt(value).x);
      const y = sy(path.sampleAt(value).z);
      if (first) {
        route.moveTo(x, y);
        first = false;
      } else {
        route.lineTo(x, y);
      }
    }
    ctx.strokeStyle = 'rgba(61, 220, 132, 0.12)';
    ctx.lineWidth = 4;
    ctx.stroke(route);
    ctx.strokeStyle = 'rgba(214, 238, 225, 0.62)';
    ctx.lineWidth = 1.6;
    ctx.stroke(route);
  }

  function drawRivers(): void {
    if (!ctx) {
      return;
    }
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
      ctx.lineWidth = 1.6;
      ctx.stroke();
      const label = river.kind === 'yangtze' ? '长江' : '黄河';
      if (river.kind === 'yellow') {
        // 泺口桥紧贴济南站，横排会和「济南」重叠，改为放在过河点下方。
        drawText(
          label,
          clamp(centerX, 14, width - 14),
          centerY + (compact ? 10 : 11),
          color,
          compact ? 7 : 8,
          'center',
        );
      } else {
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const labelOnLeft = left > 34;
        drawText(
          label,
          labelOnLeft ? left - 3 : right + 3,
          centerY,
          color,
          compact ? 7 : 8,
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
      const point = routePoint(station.s);
      if (station.stop) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, compact ? 2 : 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#3ddc84';
        ctx.fill();
        ctx.strokeStyle = 'rgba(5, 22, 15, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(point.x, point.y, compact ? 1.2 : 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(190, 210, 200, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawMajorLabels(): void {
    const majors: Array<{ name: string; side: 'left' | 'right'; accent?: boolean }> = [
      { name: '上海', side: 'left' },
      { name: '南京', side: 'right' },
      { name: '徐州', side: 'right' },
      { name: '济南', side: 'right', accent: true },
      { name: '天津西', side: 'right' },
      { name: '北京', side: 'right' },
    ];
    for (const major of majors) {
      if (compact && !['上海', '济南', '北京'].includes(major.name)) {
        continue;
      }
      const station = stations.find((item) => item.name === major.name);
      if (!station) {
        continue;
      }
      const point = routePoint(station.s);
      const color = major.accent ? '#ffd24a' : 'rgba(238, 248, 242, 0.92)';
      const textX =
        major.side === 'left'
          ? Math.max(3, point.x - 5)
          : Math.min(width - 3, point.x + 5);
      drawText(
        major.name,
        textX,
        point.y,
        color,
        compact ? 8 : 9,
        major.side === 'left' ? 'right' : 'left',
      );
    }
  }

  function drawTrain(value: number): void {
    if (!ctx) {
      return;
    }
    const point = routePoint(clamp(value, path.coreStart, path.coreEnd));
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 92, 60, 0.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5c3c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawLegend(): void {
    if (!ctx) {
      return;
    }
    ctx.font = `${compact ? 7 : 8}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(61, 220, 132, 0.9)';
    ctx.fillText('● 停靠', 4, height - 8);
    ctx.fillStyle = 'rgba(190, 210, 200, 0.65)';
    ctx.fillText('○ 通过', compact ? 48 : width * 0.48, height - 8);
  }

  function update(s: number): void {
    if (!ctx || !layout()) {
      return;
    }
    if (Math.abs(s - lastS) < 1.5) {
      return;
    }
    lastS = s;

    ctx.clearRect(0, 0, width, height);
    drawRoute();
    drawRivers();
    drawStations();
    drawMajorLabels();
    drawTrain(s);
    drawText(
      '北 ↑',
      width - 6,
      padTop - 7,
      'rgba(214, 238, 225, 0.7)',
      compact ? 8 : 9,
      'right',
    );
    drawLegend();
  }

  return { update };
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
