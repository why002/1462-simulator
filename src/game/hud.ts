import { GAME } from './config';
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

  const start = path.sampleAt(path.coreStart);
  const end = path.sampleAt(path.coreEnd);
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const chord = Math.max(1e-6, Math.hypot(dx, dz));
  const nx = -dz / chord;
  const nz = dx / chord;

  let minDev = Infinity;
  let maxDev = -Infinity;
  for (let s = path.coreStart; s <= path.coreEnd; s += 10) {
    const sample = path.sampleAt(s);
    const dev = (sample.x - start.x) * nx + (sample.z - start.z) * nz;
    minDev = Math.min(minDev, dev);
    maxDev = Math.max(maxDev, dev);
  }
  const devCenter = (minDev + maxDev) * 0.5;
  const devHalf = Math.max(1, (maxDev - minDev) * 0.5);

  function deviateOf(s: number): number {
    const sample = path.sampleAt(s);
    return (sample.x - start.x) * nx + (sample.z - start.z) * nz;
  }

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
    lastS = -Infinity;
    return true;
  }

  function update(s: number): void {
    if (!ctx || !layout()) {
      return;
    }
    if (Math.abs(s - lastS) < 1.5) {
      return;
    }
    lastS = s;

    const compact = width < 112;
    const padTop = 8;
    const padBottom = 30;
    const cx = width * 0.52;
    const halfW = width * 0.24;
    const usable = height - padTop - padBottom;

    const yOfKm = (km: number): number =>
      padTop + usable * (1 - clamp(km / GAME.realKm, 0, 1));
    const xOfDev = (dev: number): number =>
      cx + ((dev - devCenter) / devHalf) * halfW;
    const yOfS = (value: number): number =>
      yOfKm(
        ((value - path.coreStart) / (path.coreEnd - path.coreStart)) * GAME.realKm,
      );
    const xOfS = (value: number): number => xOfDev(deviateOf(value));

    ctx.clearRect(0, 0, width, height);

    const jinan = stations.find((station) => station.name === '济南');
    const yangtze = path.riverCrossings.find((river) => river.kind === 'yangtze');
    const yellow = path.riverCrossings.find((river) => river.kind === 'yellow');

    ctx.lineCap = 'round';

    if (yangtze) {
      drawRiver(yangtze.s, '#8fd8ef', '长江', compact);
    }
    if (yellow) {
      drawRiver(yellow.s, '#e6b25a', '黄河', compact);
    }

    ctx.beginPath();
    for (let value = path.coreStart; value <= path.coreEnd; value += 20) {
      const x = xOfS(value);
      const y = yOfS(value);
      if (value === path.coreStart) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = 'rgba(214, 238, 225, 0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    for (const station of stations) {
      const x = xOfS(station.s);
      const y = yOfKm(station.km);
      if (station.stop) {
        ctx.beginPath();
        ctx.arc(x, y, 2.4, 0, Math.PI * 2);
        ctx.fillStyle = '#3ddc84';
        ctx.fill();
        ctx.strokeStyle = 'rgba(5, 22, 15, 0.9)';
        ctx.lineWidth = 1;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(x, y, compact ? 1.3 : 1.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(190, 210, 200, 0.55)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    const majors: Array<{ name: string; side: 'left' | 'right' }> = [
      { name: '上海', side: 'left' },
      { name: '南京', side: 'left' },
      { name: '徐州', side: 'left' },
      { name: '天津西', side: 'left' },
      { name: '北京', side: 'left' },
    ];
    ctx.font = `${compact ? 8 : 9}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    ctx.textBaseline = 'middle';
    for (const major of majors) {
      const station = stations.find((item) => item.name === major.name);
      if (!station) {
        continue;
      }
      if (compact && !['上海', '济南', '北京'].includes(major.name)) {
        continue;
      }
      const x = xOfS(station.s);
      const y = yOfKm(station.km);
      ctx.fillStyle = major.name === '济南' ? '#ffd24a' : 'rgba(238, 248, 242, 0.92)';
      if (major.side === 'left') {
        ctx.textAlign = 'right';
        ctx.fillText(major.name, x - 5, y);
      } else {
        ctx.textAlign = 'left';
        ctx.fillText(major.name, x + 5, y);
      }
    }

    if (jinan) {
      const jx = xOfS(jinan.s);
      const jy = yOfKm(jinan.km);
      ctx.beginPath();
      ctx.moveTo(jx, jy + 15);
      ctx.lineTo(jx + 10, jy + 9);
      ctx.lineTo(jx + 14, jy);
      ctx.lineTo(jx + 10, jy - 9);
      ctx.lineTo(jx, jy - 15);
      ctx.strokeStyle = '#3ddc84';
      ctx.lineWidth = 1.7;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(jx - 8, jy + 17);
      ctx.lineTo(jx - 8, jy - 17);
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = 'rgba(170, 180, 175, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(jx + 14, jy, 2.6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd24a';
      ctx.fill();

      ctx.font = `${compact ? 8 : 9}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = '#ffd24a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('济南', jx + 18, jy);

      if (!compact) {
        ctx.font = '8px "Noto Sans SC", "Microsoft YaHei", sans-serif';
        ctx.fillStyle = 'rgba(255, 210, 74, 0.9)';
        ctx.textAlign = 'left';
        ctx.fillText('济南线', jx + 7, jy + 17);
      }
    }

    const trainX = xOfS(clamp(s, path.coreStart, path.coreEnd));
    const trainY = yOfS(clamp(s, path.coreStart, path.coreEnd));
    ctx.beginPath();
    ctx.arc(trainX, trainY, 5.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 92, 60, 0.22)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(trainX, trainY, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5c3c';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.9)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = `${compact ? 7 : 8}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(61, 220, 132, 0.9)';
    ctx.fillText('● 停靠', 4, height - 9);
    ctx.fillStyle = 'rgba(190, 210, 200, 0.65)';
    ctx.fillText('○ 通过', compact ? 4 : width * 0.5, height - 9);

    function drawRiver(
      riverS: number,
      color: string,
      label: string,
      small: boolean,
    ): void {
      const c = ctx;
      if (!c) {
        return;
      }
      const x = xOfS(riverS);
      const y = yOfS(riverS);
      c.beginPath();
      c.moveTo(x - 9, y);
      c.lineTo(x + 9, y);
      c.strokeStyle = color;
      c.lineWidth = 1.4;
      c.stroke();
      c.font = `${small ? 7 : 8}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
      c.fillStyle = color;
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      c.fillText(label, x - 11, y);
    }
  }

  return { update };
}

export function createSpeedometer(canvas: HTMLCanvasElement): Speedometer {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let shown = 0;

  const startAngle = Math.PI * 0.75;
  const sweep = Math.PI * 1.5;
  const maxValue = 20000;

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

    for (let i = 0; i <= 20; i += 1) {
      const t = i / 20;
      const angle = startAngle + sweep * t;
      const major = i % 4 === 0;
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
    for (let i = 0; i <= 4; i += 1) {
      const value = i * 5000;
      const angle = startAngle + sweep * (value / maxValue);
      const labelRadius = radius - 22;
      ctx.fillText(
        i === 0 ? '0' : `${i * 5}k`,
        cx + Math.cos(angle) * labelRadius,
        cy + Math.sin(angle) * labelRadius,
      );
    }

    const needleAngle = startAngle + sweep * clamp(shown / maxValue, 0, 1);
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
    const target = clamp(displaySpeed, 0, maxValue);
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
