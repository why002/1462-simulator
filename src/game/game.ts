import * as THREE from 'three';
import { GAME } from './config';
import type { Train } from './train';

export interface Game {
  update(dt: number): void;
}

export interface GameDebug {
  readonly pathLength: number;
  readonly s: number;
  readonly v: number;
  readonly time: number;
  readonly finished: boolean;
  displaySpeed(speed: number): number;
  teleport(value: number): void;
  setSpeed(speed: number): void;
  reset(): void;
}

const FINISH_LABEL = GAME.finishS.toLocaleString('en-US');

export function createGame(camera: THREE.PerspectiveCamera, train: Train): Game {
  const timerElement = getElement('timer');
  const speedElement = getElement('speed');
  const distanceElement = getElement('distance');
  const progressElement = getElement('progress-fill');
  const startHint = getElement('start-hint');
  const resultElement = getElement('result');
  const resultTimeElement = getElement('result-time');
  const resultMaxElement = getElement('result-max');
  const retryButton = getElement<HTMLButtonElement>('retry');

  let s: number = GAME.startS;
  let v = 0;
  let time = 0;
  let started = false;
  let finished = false;
  let pressing = false;
  let maxV = 0;

  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const smoothTarget = new THREE.Vector3();

  function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing #${id}`);
    }
    return element as T;
  }

  function formatTime(value: number): string {
    const totalTenths = Math.max(0, Math.floor(value * 10));
    const minutes = Math.floor(totalTenths / 600);
    const seconds = Math.floor((totalTenths % 600) / 10);
    const tenths = totalTenths % 10;
    return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
  }

  function updateCamera(dt: number, snap: boolean): void {
    desiredPosition.set(GAME.cameraSide, GAME.cameraHeight, -(s - GAME.cameraBack));
    desiredTarget.set(0, 2.6, -(s + GAME.cameraAhead));

    const blend = snap ? 1 : 1 - Math.exp(-7 * dt);
    camera.position.lerp(desiredPosition, blend);
    smoothTarget.lerp(desiredTarget, blend);
    camera.lookAt(smoothTarget);

    const targetFov = 55 + 8 * (v / GAME.vMax);
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  }

  function updateHud(): void {
    timerElement.textContent = formatTime(time);
    speedElement.textContent = Math.round(v * GAME.speedScale).toLocaleString('en-US');
    distanceElement.textContent = `${Math.round(
      Math.min(s, GAME.finishS),
    ).toLocaleString('en-US')} / ${FINISH_LABEL} m`;
    progressElement.style.width = `${Math.min(100, (s / GAME.finishS) * 100)}%`;
  }

  function finish(): void {
    s = GAME.finishS;
    v = 0;
    finished = true;
    pressing = false;
    train.place(s);
    resultTimeElement.textContent = formatTime(time);
    resultMaxElement.textContent = `${Math.round(maxV * GAME.speedScale).toLocaleString(
      'en-US',
    )} km/h`;
    resultElement.classList.remove('hidden');
    startHint.classList.add('hidden');
  }

  function reset(): void {
    s = GAME.startS;
    v = 0;
    time = 0;
    started = false;
    finished = false;
    pressing = false;
    maxV = 0;
    train.place(s);
    resultElement.classList.add('hidden');
    startHint.classList.remove('hidden');
    updateCamera(0, true);
    updateHud();
  }

  function press(): void {
    if (finished) {
      return;
    }
    pressing = true;
    if (!started) {
      started = true;
      startHint.classList.add('hidden');
    }
  }

  function release(): void {
    pressing = false;
  }

  function isUiTarget(target: EventTarget | null): boolean {
    return target instanceof Element && target.closest('#result, #retry') !== null;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      if (!event.repeat) {
        press();
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'KeyW') {
      event.preventDefault();
      release();
    }
  });

  window.addEventListener('pointerdown', (event) => {
    if (!isUiTarget(event.target)) {
      press();
    }
  });
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);
  window.addEventListener('blur', release);
  window.addEventListener('contextmenu', (event) => event.preventDefault());

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      release();
    }
  });

  retryButton.addEventListener('click', (event) => {
    event.stopPropagation();
    reset();
    retryButton.blur();
  });

  function step(dt: number): void {
    if (finished) {
      return;
    }

    if (started) {
      time += dt;
    }

    if (pressing) {
      const acceleration = GAME.accMax * (1 - v / GAME.vMax);
      v += Math.max(0, acceleration) * dt;
    } else {
      v = Math.max(0, v - GAME.brake * dt);
    }

    v = Math.min(v, GAME.vMax);
    s += v * dt;
    maxV = Math.max(maxV, v);

    if (s >= GAME.finishS) {
      finish();
      return;
    }

    train.place(s);
  }

  const debug: GameDebug = {
    pathLength: GAME.trackLength,
    get s() {
      return s;
    },
    get v() {
      return v;
    },
    get time() {
      return time;
    },
    get finished() {
      return finished;
    },
    displaySpeed: (speed: number) => speed * GAME.speedScale,
    teleport: (value: number) => {
      finished = false;
      pressing = false;
      started = true;
      resultElement.classList.add('hidden');
      startHint.classList.add('hidden');
      s = Math.max(0, Math.min(GAME.finishS - 0.5, value));
      train.place(s);
      updateCamera(0, true);
    },
    setSpeed: (speed: number) => {
      v = Math.max(0, Math.min(GAME.vMax, speed));
    },
    reset,
  };

  (window as unknown as { __game: GameDebug }).__game = debug;

  reset();

  return {
    update(dt: number): void {
      step(dt);
      updateCamera(dt, false);
      updateHud();
    },
  };
}
