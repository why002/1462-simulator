import * as THREE from 'three';
import { createAudio, type AudioEngine } from './audio';
import { GAME } from './config';
import { createEffects } from './effects';
import { createPassengerFx } from './exchange';
import { stationEnglishName } from './stations';
import {
  createLedBoard,
  createResultMap,
  createRouteMap,
  createSpeedProfile,
  createSpeedometer,
  loadBest,
  recordSpeed,
  resetSpeedProfile,
  saveBest,
  type ResultShareData,
} from './hud';
import { createLeaderboard } from './leaderboard';
import { createShareController } from './share';
import type { PathData, PathSample, StationOnRoute } from './types';
import type { Train } from './train';
import type { World } from './world';

export type DebugView =
  | 'follow'
  | 'jinan'
  | 'yangtze'
  | 'luokou'
  | 'train'
  | 'station'
  | 'door'
  | 'rear'
  | 'overview';

export interface Game {
  update(dt: number): void;
}

export interface GameDebug {
  readonly pathLength: number;
  readonly path: PathData;
  readonly stations: StationOnRoute[];
  readonly riverCrossings: PathData['riverCrossings'];
  readonly mainlineBypass: PathData['mainlineBypass'];
  readonly routeSummary: { minRadius: number; jinanBypassMinDistance: number };
  readonly s: number;
  readonly km: number;
  readonly v: number;
  readonly time: number;
  readonly finished: boolean;
  readonly pax: number;
  readonly massFactor: number;
  readonly derailing: boolean;
  readonly tilt: number;
  readonly derails: number;
  readonly lateralAccel: number;
  readonly visitedStops: number;
  readonly passedStations: number;
  readonly popupVisible: boolean;
  readonly jumpers: number;
  readonly bestTime: number | null;
  readonly helpVisible: boolean;
  readonly muted: boolean;
  readonly audioRunning: boolean;
  readonly vvvf: AudioEngine['vvvf'];
  readonly sparkCount: number;
  readonly windOpacity: number;
  displaySpeed(speed: number): number;
  realKmAt(s: number): number;
  pathAt(s: number): PathSample;
  nearestS(x: number, z: number): number;
  teleport(s: number): void;
  teleportKm(km: number): void;
  teleportToStation(name: string): void;
  teleportToRiver(name: string): void;
  setView(view: DebugView): void;
  setSpeed(speed: number): void;
  setPax(value: number): void;
  forceDerail(): void;
  reset(): void;
}

export function createGame(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  train: Train,
  path: PathData,
  stations: StationOnRoute[],
  world: World,
): Game {
  const timerElement = getElement('timer');
  const speedElement = getElement('speed');
  const distanceElement = getElement('distance');
  const statusElement = getElement('status');
  const progressElement = getElement('progress-fill');
  const startHint = getElement('start-hint');
  const resultElement = getElement('result');
  const resultTimeElement = getElement('result-time');
  const resultMaxElement = getElement('result-max');
  const retryButton = getElement<HTMLButtonElement>('retry');
  const paxElement = getElement('pax');
  const stationPopup = getElement('station-popup');
  const popupName = getElement('popup-name');
  const popupMeta = getElement('popup-meta');
  const popupRemain = getElement('popup-remain');
  const passToast = getElement('pass-toast');
  const resultBestElement = getElement('result-best');
  const resultNewElement = getElement('result-new');
  const resultEggElement = getElement('result-egg');
  const resultAvgElement = getElement('result-avg');
  const resultMapMaxElement = getElement('result-map-max');
  const shareButton = getElement<HTMLButtonElement>('share');
  const saveButton = getElement<HTMLButtonElement>('save');
  const challengeElement = getElement('hint-challenge');
  const helpButton = getElement<HTMLButtonElement>('help');
  const helpOverlay = getElement('help-overlay');
  const helpCloseButton = getElement<HTMLButtonElement>('help-close');
  const helpRestartButton = getElement<HTMLButtonElement>('help-restart');
  const muteButton = getElement<HTMLButtonElement>('mute');
  const defaultFog = scene.fog;
  const passengerFx = createPassengerFx(scene, path);
  const effects = createEffects(scene, path);
  const audio = createAudio();
  updateMuteLabel(audio.muted);
  const routeMap = createRouteMap(getElement<HTMLCanvasElement>('map-canvas'), path, stations);
  const resultMapCanvas = getElement<HTMLCanvasElement>('result-map');
  const resultMap = createResultMap(resultMapCanvas, path, stations);
  const speedProfile = createSpeedProfile(path.coreStart, path.coreEnd, 10);
  const ledBoard = createLedBoard(
    getElement<HTMLCanvasElement>('led-canvas'),
    getElement('led-window'),
    getElement('led-text'),
  );
  const speedometer = createSpeedometer(
    getElement<HTMLCanvasElement>('speedo'),
    GAME.vMax * GAME.speedScale,
  );
  let lastFinishTime = 0;
  const leaderboard = createLeaderboard({
    isResultVisible: () => !resultElement.classList.contains('hidden'),
    onOpen: () => release(),
  });

  function buildShareData(): ResultShareData {
    return {
      timeText: resultTimeElement.textContent ?? formatTime(lastFinishTime),
      bestTimeText: resultBestElement.textContent ?? '—',
      maxSpeedText: resultMaxElement.textContent ?? '—',
      averageSpeedText: resultAvgElement.textContent ?? '—',
      distanceText: `${GAME.realKm.toLocaleString('en-US')} km`,
      mapMaxText: resultMapMaxElement.textContent ?? '',
      eggText: resultEggElement.textContent ?? '',
      isNewBest: !resultNewElement.classList.contains('hidden'),
      mapCanvas: resultMapCanvas,
    };
  }

  const shareController = createShareController({
    shareButton,
    saveButton,
    getPoster: buildShareData,
    getTime: () => lastFinishTime,
  });

  let s: number = path.coreStart;
  let v = 0;
  let time = 0;
  let started = false;
  let finished = false;
  let pressing = false;
  let maxV = 0;
  let pax: number = GAME.paxStart;
  let derailing = false;
  let derailTimer = 0;
  let derailDirection = 1;
  let tilt = 0;
  let tiltVel = 0;
  let smoothedAccel = 0;
  let cameraSwing = 0;
  let brakeRamp = 0;
  let derails = 0;
  let debugView: DebugView | null = null;
  const visitedStops = new Set<string>();
  const alightSpawned = new Set<string>();
  const passedStations = new Set<string>();
  const crossedRivers = new Set<string>();
  let lastMidpoint = GAME.startS - GAME.coachOffset * 0.5;
  let popupTimer = 0;
  let passTimer = 0;

  const desiredPosition = new THREE.Vector3();
  const desiredTarget = new THREE.Vector3();
  const smoothTarget = new THREE.Vector3();
  const pathPosition = new THREE.Vector3();
  const pathTarget = new THREE.Vector3();
  const tangentPosition = new THREE.Vector3();
  const tangentTarget = new THREE.Vector3();

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

  function updateMuteLabel(muted: boolean): void {
    muteButton.textContent = muted ? '关闭' : '开启';
    muteButton.classList.toggle('off', muted);
  }

  function realKmAt(value: number): number {
    return clamp((value - path.coreStart) / GAME.metersPerKm, 0, GAME.realKm);
  }

  function massFactor(): number {
    return 1 + pax * GAME.paxWeight;
  }

  function lateralAccel(): number {
    const sample = path.sampleAt(s);
    return v * v * Math.abs(sample.curvature);
  }

  function triggerDerail(): void {
    if (finished || derailing) {
      return;
    }
    const sample = path.sampleAt(s);
    derailing = true;
    derailTimer = 0;
    tiltVel = 0;
    // 离心力把车体甩向弯外侧，弯外方向与曲率符号相反。
    derailDirection = sample.curvature < 0 ? 1 : -1;
    v = 0;
    pressing = false;
    derails += 1;
    audio.crash();
    startHint.classList.add('hidden');
  }

  function showStationPopup(
    station: StationOnRoute,
    boarded: number,
    alighted: number,
  ): void {
    popupName.textContent = station.name;
    popupMeta.textContent = `上车 +${boarded} · 下车 −${alighted}`;
    const remaining = stations.filter(
      (item) => item.stop && item.s > station.s,
    ).length;
    popupRemain.textContent = `剩余 ${remaining} 站`;
    if (station.name !== '北京') {
      audio.chime();
    }
    stationPopup.classList.add('show');
    window.clearTimeout(popupTimer);
    popupTimer = window.setTimeout(() => {
      stationPopup.classList.remove('show');
    }, 1800);
  }

  function showPassToast(name: string): void {
    passToast.textContent = `通过 · ${name}`;
    passToast.classList.add('show');
    window.clearTimeout(passTimer);
    passTimer = window.setTimeout(() => {
      passToast.classList.remove('show');
    }, 1200);
  }

  function hideStationOverlays(): void {
    stationPopup.classList.remove('show');
    passToast.classList.remove('show');
    window.clearTimeout(popupTimer);
    window.clearTimeout(passTimer);
  }

  function processStations(midpoint: number): void {
    if (midpoint <= lastMidpoint) {
      return;
    }

    const alightLead = Math.min(v * GAME.alightLeadTime, GAME.alightLeadMax);
    for (const station of stations) {
      // 下车提前量随速度增大，让旅客在进站前离开车门滑行到站台。
      if (
        station.stop &&
        station.s > midpoint &&
        !visitedStops.has(station.name) &&
        !alightSpawned.has(station.name) &&
        station.s - alightLead > lastMidpoint &&
        station.s - alightLead <= midpoint
      ) {
        const alighting = Math.min(pax, station.paxOut);
        if (alighting > 0) {
          passengerFx.spawnAlighting(s, station.side, alighting, v);
        }
        alightSpawned.add(station.name);
      }

      if (station.s <= lastMidpoint || station.s > midpoint) {
        continue;
      }
      if (station.stop) {
        if (visitedStops.has(station.name)) {
          continue;
        }
        visitedStops.add(station.name);
        const alighted = Math.min(pax, station.paxOut);
        pax -= alighted;
        const boarded = Math.min(station.paxIn, GAME.paxMax - pax);
        pax += boarded;
        passengerFx.spawnBoarding(s, station.side, boarded);
        if (!alightSpawned.has(station.name)) {
          passengerFx.spawnAlighting(s, station.side, alighted, v);
        }
        showStationPopup(station, boarded, alighted);
      } else if (!passedStations.has(station.name)) {
        passedStations.add(station.name);
        showPassToast(station.name);
      }
    }

    lastMidpoint = midpoint;
  }

  function processRivers(previous: number, midpoint: number): void {
    if (midpoint <= previous) {
      return;
    }
    for (const river of path.riverCrossings) {
      if (river.s <= previous || river.s > midpoint || crossedRivers.has(river.name)) {
        continue;
      }
      crossedRivers.add(river.name);
      passToast.textContent =
        river.kind === 'yangtze' ? '跨越长江 · 南京长江大桥' : '跨越黄河 · 黄河大桥';
      passToast.classList.add('show');
      window.clearTimeout(passTimer);
      passTimer = window.setTimeout(() => {
        passToast.classList.remove('show');
      }, 2200);
    }
  }

  function updateCamera(dt: number, snap: boolean): void {
    if (debugView) {
      return;
    }

    const current = path.sampleAt(s);
    const curvature = Math.abs(current.curvature);
    const radius = curvature > 1e-6 ? 1 / curvature : Number.POSITIVE_INFINITY;
    const tight = clamp(1 - radius / GAME.cameraTightRadius, 0, 1);
    const swingTarget =
      Math.sign(current.curvature) *
      clamp((v * v * curvature) / GAME.cameraSwingAccel, 0, 1);
    cameraSwing = snap
      ? swingTarget
      : cameraSwing + (swingTarget - cameraSwing) * (1 - Math.exp(-dt / GAME.cameraSwingSmoothTime));
    const cameraBack = GAME.cameraBack * (1 - GAME.cameraTightBack * tight);
    const cameraHeight = GAME.cameraHeight + GAME.cameraTightHeight * tight;
    const cameraAhead = GAME.cameraAhead * (1 - GAME.cameraTightAhead * tight);

    const cameraS = Math.max(0, s - cameraBack);
    const cameraSample = path.sampleAt(cameraS);
    pathPosition.set(cameraSample.x, cameraHeight, cameraSample.z);

    const lookS = Math.min(path.length, s + cameraAhead);
    const lookSample = path.sampleAt(lookS);
    pathTarget.set(lookSample.x, 2.6, lookSample.z);

    // 急弯时改用沿列车当前切线的追车相机，避免相机绕到弯道外侧丢失列车。
    const forwardX = -Math.sin(current.heading);
    const forwardZ = -Math.cos(current.heading);
    tangentPosition.set(
      current.x - forwardX * cameraBack,
      cameraHeight,
      current.z - forwardZ * cameraBack,
    );
    tangentTarget.set(
      current.x + forwardX * cameraAhead,
      2.6,
      current.z + forwardZ * cameraAhead,
    );

    desiredPosition.copy(pathPosition).lerp(tangentPosition, tight);
    desiredTarget.copy(pathTarget).lerp(tangentTarget, tight);

    const swingOffset = GAME.cameraSwingDistance * cameraSwing;
    desiredPosition.x += current.normalX * swingOffset;
    desiredPosition.z += current.normalZ * swingOffset;

    const blend = snap ? 1 : 1 - Math.exp(-7 * dt);
    camera.position.lerp(desiredPosition, blend);
    smoothTarget.lerp(desiredTarget, blend);
    camera.lookAt(smoothTarget);
    // 过弯时相机向弯外滚转，强化离心甩出的视觉感受。
    if (cameraSwing !== 0) {
      camera.rotateZ(-GAME.cameraSwingRoll * cameraSwing);
    }

    const accelFov = clamp(
      smoothedAccel * GAME.fovAccelGain,
      -GAME.fovBrakeMax,
      GAME.fovAccelMax,
    );
    const targetFov = GAME.fovBase + GAME.fovSpeedGain * (v / GAME.vMax) + accelFov;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  }

  function updateHud(): void {
    timerElement.textContent = formatTime(time);
    const displaySpeed = v * GAME.speedScale;
    speedElement.textContent = Math.round(displaySpeed).toLocaleString('en-US');
    speedometer.update(displaySpeed);
    routeMap.update(s);
    paxElement.textContent = String(pax);
    distanceElement.textContent = `已跑 ${Math.round(realKmAt(s)).toLocaleString(
      'en-US',
    )} / ${GAME.realKm.toLocaleString('en-US')} km`;

    const next = stations.find((station) => station.s > s + 0.5);
    const nextStop = stations.find(
      (station) => station.stop && station.s > s + 0.5,
    );
    ledBoard.setText(
      nextStop
        ? `下一站：${nextStop.name}站　　终点站：北京站　　next station: ${stationEnglishName(nextStop)} Station　　terminal station: Beijing Station`
        : '终点站：北京站　　terminal station: Beijing Station',
    );
    const remaining = stations.filter(
      (station) => station.stop && station.s >= s - 1,
    ).length;
    if (derailing) {
      statusElement.textContent = `脱线 · ${Math.max(
        0,
        GAME.derailReset - derailTimer,
      ).toFixed(1)} s 后回轨`;
    } else if (Math.abs(tilt) > GAME.derailAngle * 0.82) {
      statusElement.textContent = `曲线临界 · ${Math.round(
        v * GAME.speedScale,
      ).toLocaleString('en-US')} km/h · 松手减速`;
    } else {
      statusElement.textContent = next
        ? `下一站 ${next.name}${next.stop ? '' : '（通过）'} · 剩余 ${remaining} 站`
        : '终点 北京 · 剩余 0 站';
    }

    progressElement.style.width = `${clamp(
      ((s - path.coreStart) / (path.coreEnd - path.coreStart)) * 100,
      0,
      100,
    )}%`;
  }

  function finish(): void {
    s = path.coreEnd;
    v = 0;
    finished = true;
    pressing = false;
    derailing = false;
    tilt = 0;
    tiltVel = 0;
    smoothedAccel = 0;
    processStations(path.coreEnd + GAME.coachOffset * 0.5 + 1);
    train.setTilt(0);
    train.place(s);
    lastFinishTime = time;
    const previousBest = loadBest();
    const isNewBest = previousBest === null || time < previousBest.time;
    if (isNewBest) {
      saveBest({ time, maxSpeed: maxV, date: new Date().toISOString() });
    }
    resultTimeElement.textContent = formatTime(time);
    resultMaxElement.textContent = `${Math.round(maxV * GAME.speedScale).toLocaleString(
      'en-US',
    )} km/h`;
    const averageSpeed = time > 0 ? (GAME.realKm * 3600) / time : 0;
    resultAvgElement.textContent = `${Math.round(averageSpeed).toLocaleString(
      'en-US',
    )} km/h`;
    resultBestElement.textContent = formatTime(
      isNewBest ? time : (previousBest?.time ?? time),
    );
    resultNewElement.classList.toggle('hidden', !isNewBest);
    const saved = 22 * 3600 + 31 * 60 - time;
    resultEggElement.textContent =
      saved > 0
        ? `比 1462 次快 ${Math.floor(saved / 3600)} 小时 ${Math.floor(
            (saved % 3600) / 60,
          )} 分`
        : '';
    resultElement.classList.remove('hidden');
    resultMapMaxElement.textContent = `0 – ${Math.round(
      Math.max(speedProfile.max, 0) * GAME.speedScale,
    ).toLocaleString('en-US')} km/h`;
    resultMap.show(speedProfile);
    startHint.classList.add('hidden');
    audio.fanfare();
    void leaderboard.submit(lastFinishTime);
  }

  function reset(): void {
    s = path.coreStart;
    v = 0;
    time = 0;
    started = false;
    finished = false;
    pressing = false;
    maxV = 0;
    pax = GAME.paxStart;
    derailing = false;
    derailTimer = 0;
    tilt = 0;
    tiltVel = 0;
    smoothedAccel = 0;
    brakeRamp = 0;
    derails = 0;
    debugView = null;
    visitedStops.clear();
    alightSpawned.clear();
    passedStations.clear();
    crossedRivers.clear();
    lastMidpoint = GAME.startS - GAME.coachOffset * 0.5;
    hideStationOverlays();
    setHelpVisible(false);
    leaderboard.hideResult();
    leaderboard.close();
    shareController.reset();
    passengerFx.reset();
    effects.reset();
    audio.reset();
    resetSpeedProfile(speedProfile);
    resultMap.clear();
    train.setTilt(0);
    train.place(s);
    resultElement.classList.add('hidden');
    startHint.classList.remove('hidden');
    updateCamera(0, true);
    updateHud();
  }

  function teleportTo(value: number): void {
    finished = false;
    pressing = false;
    started = true;
    derailing = false;
    derailTimer = 0;
    tilt = 0;
    tiltVel = 0;
    smoothedAccel = 0;
    brakeRamp = 0;
    debugView = null;
    resultElement.classList.add('hidden');
    startHint.classList.add('hidden');
    leaderboard.hideResult();
    leaderboard.close();
    shareController.reset();
    s = clamp(value, 0, path.coreEnd - 0.5);
    visitedStops.clear();
    alightSpawned.clear();
    passedStations.clear();
    crossedRivers.clear();
    lastMidpoint = s - GAME.coachOffset * 0.5;
    hideStationOverlays();
    passengerFx.reset();
    effects.reset();
    audio.reset();
    resetSpeedProfile(speedProfile);
    resultMap.clear();
    train.setTilt(0);
    train.place(s);
    updateCamera(0, true);
    updateHud();
  }

  function teleportToKm(km: number): void {
    if (!Number.isFinite(km)) {
      return;
    }
    teleportTo(GAME.coreStart + clamp(km, 0, GAME.realKm) * GAME.metersPerKm);
  }

  function teleportToStation(name: string): void {
    const station = stations.find((item) => item.name === name);
    if (station) {
      teleportTo(station.s);
    }
  }

  function teleportToRiver(name: string): void {
    const river = path.riverCrossings.find(
      (item) => item.name.includes(name) || name.includes(item.name),
    );
    if (river) {
      teleportTo(river.s);
    }
  }

  function setView(view: DebugView): void {
    scene.fog = view === 'overview' ? null : defaultFog;

    if (view === 'follow') {
      debugView = null;
      updateCamera(0, true);
      return;
    }

    if (view === 'overview') {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let value = path.coreStart; value <= path.coreEnd; value += 20) {
        const sample = path.sampleAt(value);
        minX = Math.min(minX, sample.x);
        maxX = Math.max(maxX, sample.x);
        minZ = Math.min(minZ, sample.z);
        maxZ = Math.max(maxZ, sample.z);
      }
      const centerX = (minX + maxX) * 0.5;
      const centerZ = (minZ + maxZ) * 0.5;
      const extent = Math.max(maxX - minX, maxZ - minZ, 1000);
      const height = (extent * 1.3) / (2 * Math.tan((55 * Math.PI) / 360));
      debugView = view;
      camera.position.set(centerX, height, centerZ + extent * 0.08);
      camera.lookAt(centerX, 0, centerZ);
      camera.fov = 55;
      camera.updateProjectionMatrix();
      return;
    }

    if (view === 'train') {
      const midS = clamp(s - 6, path.coreStart, path.coreEnd);
      const lookS = clamp(s + 22, path.coreStart, path.coreEnd);
      const mid = path.sampleAt(midS);
      const front = path.sampleAt(lookS);
      debugView = view;
      camera.position.set(
        front.x - front.normalX * 10,
        6.2,
        front.z - front.normalZ * 10,
      );
      camera.lookAt(mid.x, 3.1, mid.z);
      camera.fov = 50;
      camera.updateProjectionMatrix();
      return;
    }

    if (view === 'door') {
      const coachS = clamp(s - GAME.coachOffset, path.coreStart, path.coreEnd);
      const sample = path.sampleAt(coachS);
      const nearest = stations.reduce((best, item) =>
        Math.abs(item.s - coachS) < Math.abs(best.s - coachS) ? item : best,
      );
      debugView = view;
      camera.position.set(
        sample.x + sample.normalX * nearest.side * 17,
        7.2,
        sample.z + sample.normalZ * nearest.side * 17,
      );
      camera.lookAt(
        sample.x + sample.normalX * nearest.side * 3,
        1.6,
        sample.z + sample.normalZ * nearest.side * 3,
      );
      camera.fov = 50;
      camera.updateProjectionMatrix();
      return;
    }

    if (view === 'rear') {
      const rearS = clamp(s - GAME.coachOffset - 5.5, path.coreStart, path.coreEnd);
      const cameraS = clamp(rearS - 9, path.coreStart, path.coreEnd);
      const rear = path.sampleAt(rearS);
      const sample = path.sampleAt(cameraS);
      debugView = view;
      camera.position.set(
        sample.x + sample.normalX * 5,
        6.4,
        sample.z + sample.normalZ * 5,
      );
      camera.lookAt(rear.x, 3.2, rear.z);
      camera.fov = 48;
      camera.updateProjectionMatrix();
      return;
    }

    if (view === 'station') {
      const nearest = stations.reduce((best, item) =>
        Math.abs(item.s - s) < Math.abs(best.s - s) ? item : best,
      );
      const target = path.sampleAt(nearest.s);
      const cameraSample = path.sampleAt(Math.max(path.coreStart, nearest.s - 24));
      const sideOffset = nearest.side * 14;
      debugView = view;
      camera.position.set(
        cameraSample.x + cameraSample.normalX * sideOffset,
        6,
        cameraSample.z + cameraSample.normalZ * sideOffset,
      );
      camera.lookAt(
        target.x + target.normalX * nearest.side * 4,
        2.6,
        target.z + target.normalZ * nearest.side * 4,
      );
      camera.fov = 52;
      camera.updateProjectionMatrix();
      return;
    }

    let targetX = 0;
    let targetZ = 0;
    let height = 700;
    let offsetX = 300;
    let offsetZ = 500;

    if (view === 'jinan') {
      const jinan = stations.find((station) => station.name === '济南');
      if (!jinan) {
        return;
      }
      const sample = path.sampleAt(jinan.s);
      targetX = sample.x;
      targetZ = sample.z;
    } else {
      const kind = view === 'yangtze' ? 'yangtze' : 'yellow';
      const river = path.riverCrossings.find((item) => item.kind === kind);
      if (!river) {
        return;
      }
      const sample = path.sampleAt(river.s);
      targetX = sample.x;
      targetZ = sample.z;
      height = 420;
      offsetX = 120;
      offsetZ = 420;
    }

    debugView = view;
    camera.position.set(targetX + offsetX, height, targetZ + offsetZ);
    camera.lookAt(targetX, 2, targetZ);
    camera.fov = 55;
    camera.updateProjectionMatrix();
  }

  function press(): void {
    if (
      finished ||
      derailing ||
      !helpOverlay.classList.contains('hidden') ||
      leaderboard.isOpen() ||
      shareController.isOpen()
    ) {
      return;
    }
    audio.unlock();
    pressing = true;
    if (!started) {
      started = true;
      startHint.classList.add('hidden');
      audio.horn();
    }
  }

  function release(): void {
    pressing = false;
  }

  function isUiTarget(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest(
        '#result, #retry, #save, #share, #help, #help-overlay, #rank, #rank-hint, #rank-overlay, #share-overlay',
      ) !== null
    );
  }

  function setHelpVisible(visible: boolean): void {
    helpOverlay.classList.toggle('hidden', !visible);
    if (visible) {
      release();
    }
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
  document.addEventListener('selectstart', (event) => {
    if (event.target instanceof Element && event.target.closest('#share-link')) {
      return;
    }
    event.preventDefault();
  });

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

  helpButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setHelpVisible(true);
    helpButton.blur();
  });

  helpCloseButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setHelpVisible(false);
    helpCloseButton.blur();
  });

  helpRestartButton.addEventListener('click', (event) => {
    event.stopPropagation();
    setHelpVisible(false);
    helpRestartButton.blur();
    reset();
  });

  muteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    audio.unlock();
    updateMuteLabel(audio.toggleMute());
    muteButton.blur();
  });

  helpOverlay.addEventListener('pointerdown', (event) => {
    if (event.target === helpOverlay) {
      setHelpVisible(false);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      setHelpVisible(false);
    }
  });

  function step(dt: number): void {
    if (finished) {
      return;
    }

    if (started) {
      time += dt;
    }

    if (derailing) {
      derailTimer += dt;
      smoothedAccel += (0 - smoothedAccel) * (1 - Math.exp(-dt / GAME.fovAccelSmoothTime));
      const targetTilt = derailDirection * GAME.derailTilt;
      tilt += (targetTilt - tilt) * Math.min(1, dt * 10);
      train.setTilt(tilt);
      if (derailTimer >= GAME.derailReset) {
        derailing = false;
        derailTimer = 0;
        tilt = 0;
        tiltVel = 0;
        train.setTilt(0);
        train.place(s);
      }
      return;
    }

    const mass = massFactor();
    let appliedAccel = 0;
    if (pressing) {
      brakeRamp = 0;
      // 起步牵引力从静止的 10% 平滑爬升，到 accRampSpeed 后恢复正常加速曲线。
      const launch = Math.min(1, v / GAME.accRampSpeed);
      const traction =
        GAME.accStart + (1 - GAME.accStart) * launch * launch * (3 - 2 * launch);
      const acceleration = (GAME.accMax / mass) * (1 - v / GAME.vMax) * traction;
      appliedAccel = Math.max(0, acceleration);
      v += appliedAccel * dt;
    } else {
      // 制动缸压力快速建立，避免松手瞬间出现满制动。
      brakeRamp = Math.min(1, brakeRamp + dt / GAME.brakeRampTime);
      const bite = brakeRamp * brakeRamp * (3 - 2 * brakeRamp);
      const delta = Math.min((GAME.brake / mass) * bite * dt, v);
      v -= delta;
      appliedAccel = dt > 0 ? -delta / dt : 0;
    }
    smoothedAccel +=
      (appliedAccel - smoothedAccel) * (1 - Math.exp(-dt / GAME.fovAccelSmoothTime));

    v = Math.min(v, GAME.vMax);
    const previousS = s;
    s += v * dt;
    maxV = Math.max(maxV, v);
    recordSpeed(speedProfile, previousS, s, v);

    const sample = path.sampleAt(s);
    const lateral = v * v * Math.abs(sample.curvature);
    // 平衡位置始终竖直：横向加速度只提供瞬时外甩力，直线或低速时车体收回垂直。
    // rotation.z 为正会抬起右侧（车身向左倾）；弯外方向与曲率符号相反。
    const direction = -Math.sign(sample.curvature);
    const targetTilt =
      direction *
      clamp(Math.atan2(lateral, GAME.tiltGravity) * GAME.tiltGain, 0, GAME.tiltMax);
    // 二阶弹簧阻尼：车体惯性由当前倾角和角速度共同决定，不会瞬间贴到目标角。
    tiltVel += ((targetTilt - tilt) * GAME.tiltSpring - tiltVel * GAME.tiltDamping) * dt;
    tilt = clamp(tilt + tiltVel * dt, -GAME.tiltMax, GAME.tiltMax);
    train.setTilt(tilt);

    if (s >= path.coreEnd) {
      finish();
      return;
    }

    train.place(s);
    const midpoint = s - GAME.coachOffset * 0.5;
    const previousMidpoint = lastMidpoint;
    processStations(midpoint);
    processRivers(previousMidpoint, midpoint);

    if (Math.abs(tilt) >= GAME.derailAngle) {
      triggerDerail();
      return;
    }
  }

  const debug: GameDebug = {
    pathLength: path.length,
    path,
    stations,
    riverCrossings: path.riverCrossings,
    mainlineBypass: path.mainlineBypass,
    routeSummary: {
      minRadius: path.minRadius,
      jinanBypassMinDistance: path.jinanBypassMinDistance,
    },
    get s() {
      return s;
    },
    get km() {
      return realKmAt(s);
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
    get pax() {
      return pax;
    },
    get massFactor() {
      return massFactor();
    },
    get derailing() {
      return derailing;
    },
    get tilt() {
      return tilt;
    },
    get derails() {
      return derails;
    },
    get lateralAccel() {
      return lateralAccel();
    },
    get visitedStops() {
      return visitedStops.size;
    },
    get passedStations() {
      return passedStations.size;
    },
    get popupVisible() {
      return stationPopup.classList.contains('show');
    },
    get jumpers() {
      return passengerFx.count;
    },
    get bestTime() {
      return loadBest()?.time ?? null;
    },
    get helpVisible() {
      return !helpOverlay.classList.contains('hidden');
    },
    get muted() {
      return audio.muted;
    },
    get audioRunning() {
      return audio.running;
    },
    get vvvf() {
      return audio.vvvf;
    },
    get sparkCount() {
      return effects.sparkCount;
    },
    get windOpacity() {
      return effects.windOpacity;
    },
    displaySpeed: (speed: number) => speed * GAME.speedScale,
    realKmAt,
    pathAt: (value: number) => path.sampleAt(value),
    nearestS: (x: number, z: number) => path.nearestS(x, z),
    teleport: teleportTo,
    teleportKm: teleportToKm,
    teleportToStation,
    teleportToRiver,
    setView,
    setSpeed: (speed: number) => {
      v = clamp(speed, 0, GAME.vMax);
    },
    setPax: (value: number) => {
      pax = clamp(value, 0, GAME.paxMax);
    },
    forceDerail: triggerDerail,
    reset,
  };

  (window as unknown as { __game: GameDebug }).__game = debug;

  const challengeTenths = Number.parseInt(
    new URLSearchParams(window.location.search).get('c') ?? '',
    10,
  );
  if (
    Number.isFinite(challengeTenths) &&
    challengeTenths > 0 &&
    challengeTenths <= 864000
  ) {
    challengeElement.textContent = `分享纪录 ${formatTime(
      challengeTenths / 10,
    )} · 来挑战`;
    challengeElement.classList.remove('hidden');
  }

  reset();

  return {
    update(dt: number): void {
      step(dt);
      world.updateGuideBand(v);
      passengerFx.update(dt, s, v);
      effects.update(dt, { s, v, pressing, derailing, tilt });
      audio.update(dt, v, started && !finished && !derailing, pressing);
      updateCamera(dt, false);
      updateHud();
      ledBoard.update(dt);
    },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
