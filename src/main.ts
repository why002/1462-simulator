import './style.css';
import * as THREE from 'three';
import { createGame } from './game/game';
import { attachStations, buildRoute } from './game/route';
import { STATIONS } from './game/stations';
import { createTrain } from './game/train';
import { buildWorld } from './game/world';

const canvas = document.getElementById('scene');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #scene canvas');
}

const bootError = document.getElementById('boot-error');
const bootErrorTitle = document.getElementById('boot-error-title');
const bootErrorMessage = document.getElementById('boot-error-message');
const bootErrorDetail = document.getElementById('boot-error-detail');

function showBootError(title: string, message: string, detail = ''): void {
  if (!(bootError instanceof HTMLElement)) {
    return;
  }
  if (bootErrorTitle) {
    bootErrorTitle.textContent = title;
  }
  if (bootErrorMessage) {
    bootErrorMessage.textContent = message;
  }
  if (bootErrorDetail) {
    bootErrorDetail.textContent = detail;
  }
  bootError.classList.remove('hidden');
}

function hideBootError(): void {
  bootError?.classList.add('hidden');
}

document.getElementById('boot-error-reload')?.addEventListener('click', () => {
  window.location.reload();
});

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function viewportSize(): { width: number; height: number } {
  const width = window.innerWidth || document.documentElement.clientWidth || 1;
  const height = window.innerHeight || document.documentElement.clientHeight || 1;
  return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

const forceWebGL1 =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('webgl1') === '1';

function preferWebGL1(canvas: HTMLCanvasElement): void {
  const original = canvas.getContext.bind(canvas) as (
    contextId: string,
    options?: unknown,
  ) => RenderingContext | null;
  canvas.getContext = ((contextId: string, options?: unknown) =>
    contextId === 'webgl2' ? null : original(contextId, options)) as typeof canvas.getContext;
}

function createRenderer(target: HTMLCanvasElement): THREE.WebGLRenderer {
  // 第一次失败时换更保守的上下文参数重试；旧手机/内置浏览器对 antialias
  // 或 high-performance 可能直接拒绝创建上下文。
  const attempts = [
    { antialias: true, powerPreference: 'high-performance' as const },
    { antialias: false, powerPreference: 'default' as const },
  ];
  let lastError: unknown = null;
  for (let index = 0; index < attempts.length; index += 1) {
    // 每次重试都用全新的 canvas：部分浏览器会缓存上一次 getContext 的失败结果。
    const attemptCanvas =
      index === 0 ? target : (target.cloneNode(false) as HTMLCanvasElement);
    if (forceWebGL1) {
      preferWebGL1(attemptCanvas);
    }
    try {
      const renderer = new THREE.WebGLRenderer({ canvas: attemptCanvas, ...attempts[index] });
      if (attemptCanvas !== target) {
        target.replaceWith(attemptCanvas);
      }
      return renderer;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('无法创建 WebGL 渲染器');
}

function webglSupport(): 'webgl2' | 'webgl1' | 'none' {
  try {
    if (document.createElement('canvas').getContext('webgl2')) {
      return 'webgl2';
    }
    if (document.createElement('canvas').getContext('webgl')) {
      return 'webgl1';
    }
  } catch {
    // Some browsers throw instead of returning null when WebGL is disabled.
  }
  return 'none';
}

try {
  const renderer = createRenderer(canvas);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  const initial = viewportSize();
  renderer.setSize(initial.width, initial.height);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  (window as unknown as { __renderer: THREE.WebGLRenderer }).__renderer = renderer;
  if (!renderer.capabilities.isWebGL2) {
    document.getElementById('compat-badge')?.classList.remove('hidden');
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    55,
    initial.width / initial.height,
    0.5,
    40000,
  );

  const path = buildRoute();
  const stations = attachStations(path, STATIONS);

  const world = buildWorld(scene, path, stations);

  const train = createTrain(path);
  scene.add(train.group);

  const game = createGame(scene, camera, train, path, stations, world);

  const applyViewport = (): void => {
    const size = viewportSize();
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    renderer.setSize(size.width, size.height);
  };
  window.addEventListener('resize', applyViewport);
  window.addEventListener('orientationchange', applyViewport);
  window.visualViewport?.addEventListener('resize', applyViewport);
  requestAnimationFrame(applyViewport);

  let halted = false;
  renderer.domElement.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    if (halted) {
      return;
    }
    showBootError(
      '3D 画面已中断',
      '浏览器回收了显卡资源，正在尝试自动恢复。如果长时间停在这里，请点下方按钮重新加载。',
    );
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => {
    if (!halted) {
      hideBootError();
    }
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    try {
      game.update(dt);
      renderer.render(scene, camera);
    } catch (error) {
      halted = true;
      renderer.setAnimationLoop(null);
      console.error(error);
      showBootError(
        '游戏运行出错',
        '刷新后可以重新开始。如果反复出现，请把下面的错误信息反馈给我们。',
        describeError(error),
      );
    }
  });
} catch (error) {
  console.error(error);
  const support = webglSupport();
  const message =
    support === 'none'
      ? '当前浏览器没有可用的 WebGL，部分 App 的内置浏览器会禁用 3D 画面。请改用系统浏览器，或 Chrome / Safari 的最新版本打开。'
      : '初始化 3D 场景时出错，请刷新重试。';
  showBootError('无法显示 3D 画面', message, describeError(error));
}