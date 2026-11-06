import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GAME } from './config';
import type { PathData, RiverCrossing, StationOnRoute } from './types';

interface Bounds {
  centerX: number;
  centerZ: number;
  sizeX: number;
  sizeZ: number;
}

interface RibbonLine {
  x: ArrayLike<number>;
  z: ArrayLike<number>;
  normalX: ArrayLike<number>;
  normalZ: ArrayLike<number>;
}

export function buildWorld(
  scene: THREE.Scene,
  path: PathData,
  stations: StationOnRoute[],
): void {
  const bounds = getBounds(path);
  const sky = new THREE.Color(0xa9d0ea);
  scene.background = sky;
  scene.fog = new THREE.Fog(sky, 1200, 9000);

  addLights(scene);
  buildGround(scene, bounds);
  buildTrack(scene, path);
  buildCatenary(scene, path);
  buildGuideBand(scene, path);
  buildLimitSigns(scene, path);
  buildScenery(scene, path, stations);
  buildGates(scene, path);
  buildStations(scene, path, stations);
  for (const river of path.riverCrossings) {
    buildRiver(scene, path, river);
  }
  buildMainlineTrack(scene, path);
}

function addLights(scene: THREE.Scene): void {
  const hemisphere = new THREE.HemisphereLight(0xe3f3ff, 0x46543b, 1.45);
  scene.add(hemisphere);

  const sun = new THREE.DirectionalLight(0xffefcf, 2.2);
  sun.position.set(-700, 1000, -500);
  scene.add(sun);

  const fill = new THREE.DirectionalLight(0xbfd8ff, 0.85);
  fill.position.set(400, 300, 900);
  scene.add(fill);
}

function buildGround(scene: THREE.Scene, bounds: Bounds): void {
  const size = Math.max(bounds.sizeX, bounds.sizeZ) + 16000;
  const texture = makeGroundTexture(size / 100);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      metalness: 0,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(bounds.centerX, -0.05, bounds.centerZ);
  scene.add(ground);
}

function buildTrack(scene: THREE.Scene, path: PathData): void {
  const ballastMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b6259,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  addRibbon(scene, path, 5.4, 0, 0.25, ballastMaterial);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7d0d6,
    roughness: 0.32,
    metalness: 0.82,
    side: THREE.DoubleSide,
  });
  addRibbon(scene, path, 0.14, -0.75, 0.45, railMaterial);
  addRibbon(scene, path, 0.14, 0.75, 0.45, railMaterial);

  buildSleepers(scene, path);
}

function addRibbon(
  scene: THREE.Scene,
  line: RibbonLine,
  width: number,
  offset: number,
  y: number,
  material: THREE.Material,
): void {
  const sampleCount = line.x.length;
  const positions = new Float32Array(sampleCount * 2 * 3);
  const uvs = new Float32Array(sampleCount * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < sampleCount; i += 1) {
    const nx = line.normalX[i];
    const nz = line.normalZ[i];
    const centerX = line.x[i] + nx * offset;
    const centerZ = line.z[i] + nz * offset;
    const leftX = centerX - nx * width * 0.5;
    const leftZ = centerZ - nz * width * 0.5;
    const rightX = centerX + nx * width * 0.5;
    const rightZ = centerZ + nz * width * 0.5;

    const vertex = i * 6;
    positions[vertex] = leftX;
    positions[vertex + 1] = y;
    positions[vertex + 2] = leftZ;
    positions[vertex + 3] = rightX;
    positions[vertex + 4] = y;
    positions[vertex + 5] = rightZ;

    const uv = i * 4;
    uvs[uv] = 0;
    uvs[uv + 1] = i / 10;
    uvs[uv + 2] = 1;
    uvs[uv + 3] = i / 10;

    if (i > 0) {
      const previous = (i - 1) * 2;
      const current = i * 2;
      indices.push(previous, previous + 1, current);
      indices.push(previous + 1, current + 1, current);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);
}

function buildSleepers(scene: THREE.Scene, path: PathData): void {
  const spacing = 3.2;
  const count = Math.floor((path.length - 10) / spacing);
  const sleepers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2.7, 0.12, 0.26),
    new THREE.MeshStandardMaterial({ color: 0x8b7a67, roughness: 1 }),
    count,
  );
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i += 1) {
    const sample = path.sampleAt(5 + i * spacing);
    dummy.position.set(sample.x, 0.31, sample.z);
    dummy.rotation.set(0, sample.heading, 0);
    dummy.updateMatrix();
    sleepers.setMatrixAt(i, dummy.matrix);
  }

  sleepers.instanceMatrix.needsUpdate = true;
  sleepers.frustumCulled = false;
  scene.add(sleepers);
}

function buildGates(scene: THREE.Scene, path: PathData): void {
  buildGate(scene, path, path.coreStart + 22, '上海 · 1462');
  buildGate(scene, path, path.coreEnd, '北京 · 终点');
}

function buildGate(scene: THREE.Scene, path: PathData, s: number, title: string): void {
  const sample = path.sampleAt(s);
  const group = new THREE.Group();
  group.position.set(sample.x, 0, sample.z);
  group.rotation.y = sample.heading;

  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0xd7dde0,
    roughness: 0.5,
    metalness: 0.4,
  });
  for (const x of [-5.4, 5.4]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.34, 7, 0.34), postMaterial);
    post.position.set(x, 3.5, 0);
    group.add(post);
  }

  const sideMaterial = new THREE.MeshStandardMaterial({ color: 0x17332a, roughness: 0.8 });
  const faceMaterial = new THREE.MeshBasicMaterial({ map: makeBannerTexture(title) });
  const banner = new THREE.Mesh(new THREE.BoxGeometry(11.2, 1.5, 0.4), [
    sideMaterial,
    sideMaterial,
    sideMaterial,
    sideMaterial,
    faceMaterial,
    faceMaterial,
  ]);
  banner.position.set(0, 7, 0);
  group.add(banner);

  scene.add(group);
}

function buildStations(
  scene: THREE.Scene,
  path: PathData,
  stations: StationOnRoute[],
): void {
  const platformMatrices: THREE.Matrix4[] = [];
  const platformColors: number[] = [];
  const edgeMatrices: THREE.Matrix4[] = [];
  const canopyMatrices: THREE.Matrix4[] = [];
  const fasciaMatrices: THREE.Matrix4[] = [];
  const columnMatrices: THREE.Matrix4[] = [];
  const postMatrices: THREE.Matrix4[] = [];
  const bodyMatrices: THREE.Matrix4[] = [];
  const bodyColors: number[] = [];
  const headMatrices: THREE.Matrix4[] = [];

  const dummy = new THREE.Object3D();
  const rand = mulberry32(0x6142);
  const concrete = [0x9b9b91, 0xa6a69b, 0x8e9188];
  const clothes = [0x2f4e6b, 0x7a3b32, 0x4a5a3d, 0xd1c5a5, 0x3e3a45, 0x8a6b3f, 0x507a7a];
  const centerOffset = 7.1;

  const pushBox = (
    target: THREE.Matrix4[],
    x: number,
    y: number,
    z: number,
    rotation: number,
    scaleX: number,
    scaleY: number,
    scaleZ: number,
  ): void => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(scaleX, scaleY, scaleZ);
    dummy.updateMatrix();
    target.push(dummy.matrix.clone());
  };

  for (const station of stations) {
    const stop = station.stop;
    const length = stop ? 50 : 24;
    const width = stop ? 5.0 : 4.0;
    const segments = Math.max(3, Math.round(length / 8));
    const segmentLength = length / segments;
    const centerSample = path.sampleAt(station.s);

    for (let i = 0; i < segments; i += 1) {
      const s = station.s - length * 0.5 + segmentLength * (i + 0.5);
      const sample = path.sampleAt(s);
      const offset = station.side * centerOffset;
      const x = sample.x + sample.normalX * offset;
      const z = sample.z + sample.normalZ * offset;
      pushBox(platformMatrices, x, 0.46, z, sample.heading, width, 0.92, segmentLength + 0.05);
      platformColors.push(concrete[Math.floor(rand() * concrete.length)]);

      const edgeOffset = station.side * (centerOffset - width * 0.5 + 0.32);
      pushBox(
        edgeMatrices,
        sample.x + sample.normalX * edgeOffset,
        0.93,
        sample.z + sample.normalZ * edgeOffset,
        sample.heading,
        0.45,
        0.035,
        segmentLength,
      );
    }

    if (stop) {
      const canopyLength = Math.min(36, length - 6);
      const canopySegments = 4;
      const canopySegment = canopyLength / canopySegments;
      for (let i = 0; i < canopySegments; i += 1) {
        const s = station.s - canopyLength * 0.5 + canopySegment * (i + 0.5);
        const sample = path.sampleAt(s);
        const offset = station.side * 6.9;
        pushBox(
          canopyMatrices,
          sample.x + sample.normalX * offset,
          4.18,
          sample.z + sample.normalZ * offset,
          sample.heading,
          4.7,
          0.2,
          canopySegment + 0.04,
        );
      }
      for (let i = 0; i <= canopySegments; i += 1) {
        const s = station.s - canopyLength * 0.5 + canopySegment * i;
        const sample = path.sampleAt(s);
        const offset = station.side * 8.8;
        pushBox(
          columnMatrices,
          sample.x + sample.normalX * offset,
          2.42,
          sample.z + sample.normalZ * offset,
          sample.heading,
          0.18,
          3.0,
          0.18,
        );
      }

      pushBox(
        fasciaMatrices,
        centerSample.x + centerSample.normalX * station.side * 4.55,
        4.08,
        centerSample.z + centerSample.normalZ * station.side * 4.55,
        centerSample.heading,
        0.26,
        0.45,
        canopyLength,
      );

      const people =
        station.grade === '特' ? 18 : station.grade === '一' ? 14 : station.grade === '二' ? 10 : 8;
      for (let i = 0; i < people; i += 1) {
        const s = station.s + (rand() - 0.5) * (length - 10);
        const sample = path.sampleAt(s);
        const offset =
          station.side * (centerOffset + (rand() - 0.5) * (width - 2.2));
        const x = sample.x + sample.normalX * offset;
        const z = sample.z + sample.normalZ * offset;
        const scale = 0.9 + rand() * 0.2;
        pushBox(
          bodyMatrices,
          x,
          0.92,
          z,
          rand() * Math.PI * 2,
          scale,
          scale,
          scale,
        );
        headMatrices.push(bodyMatrices[bodyMatrices.length - 1]);
        bodyColors.push(clothes[Math.floor(rand() * clothes.length)]);
      }
    }

    scene.add(createStationSign(path, station));

    const signOffset = station.side * 7.0;
    const postHeight = stop ? 3.5 : 1.6;
    const postY = stop ? 2.67 : 1.72;
    pushBox(
      postMatrices,
      centerSample.x + centerSample.normalX * signOffset,
      postY,
      centerSample.z + centerSample.normalZ * signOffset,
      centerSample.heading,
      0.18,
      postHeight,
      0.18,
    );
  }

  const platformMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.94,
  });
  const platformMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    platformMaterial,
    platformMatrices.length,
  );
  platformMatrices.forEach((matrix, index) => {
    platformMesh.setMatrixAt(index, matrix);
    platformMesh.setColorAt(index, new THREE.Color(platformColors[index]));
  });
  finalizeInstances(platformMesh);
  scene.add(platformMesh);

  const edgeMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xd7ad3d, roughness: 0.8 }),
    edgeMatrices.length,
  );
  edgeMatrices.forEach((matrix, index) => edgeMesh.setMatrixAt(index, matrix));
  finalizeInstances(edgeMesh);
  scene.add(edgeMesh);

  if (canopyMatrices.length > 0) {
    const canopyMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x617a6d,
        roughness: 0.7,
        metalness: 0.2,
      }),
      canopyMatrices.length,
    );
    canopyMatrices.forEach((matrix, index) => canopyMesh.setMatrixAt(index, matrix));
    finalizeInstances(canopyMesh);
    scene.add(canopyMesh);
  }

  if (columnMatrices.length > 0) {
    const columnMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({
        color: 0x8a9694,
        roughness: 0.55,
        metalness: 0.4,
      }),
      columnMatrices.length,
    );
    columnMatrices.forEach((matrix, index) => columnMesh.setMatrixAt(index, matrix));
    finalizeInstances(columnMesh);
    scene.add(columnMesh);
  }

  if (fasciaMatrices.length > 0) {
    const fasciaMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ color: 0x3c5c4e, roughness: 0.7 }),
      fasciaMatrices.length,
    );
    fasciaMatrices.forEach((matrix, index) => fasciaMesh.setMatrixAt(index, matrix));
    finalizeInstances(fasciaMesh);
    scene.add(fasciaMesh);
  }

  const postMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x7d8784, roughness: 0.55, metalness: 0.4 }),
    postMatrices.length,
  );
  postMatrices.forEach((matrix, index) => postMesh.setMatrixAt(index, matrix));
  finalizeInstances(postMesh);
  scene.add(postMesh);

  if (bodyMatrices.length > 0) {
    const bodyGeometry = new THREE.BoxGeometry(0.36, 1.0, 0.24);
    bodyGeometry.translate(0, 0.5, 0);
    const bodyMesh = new THREE.InstancedMesh(
      bodyGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
      bodyMatrices.length,
    );
    bodyMatrices.forEach((matrix, index) => {
      bodyMesh.setMatrixAt(index, matrix);
      bodyMesh.setColorAt(index, new THREE.Color(bodyColors[index]));
    });
    finalizeInstances(bodyMesh);
    scene.add(bodyMesh);

    const headGeometry = new THREE.SphereGeometry(0.16, 8, 6);
    headGeometry.translate(0, 1.2, 0);
    const headMesh = new THREE.InstancedMesh(
      headGeometry,
      new THREE.MeshStandardMaterial({ color: 0xd2a47e, roughness: 0.9 }),
      headMatrices.length,
    );
    headMatrices.forEach((matrix, index) => headMesh.setMatrixAt(index, matrix));
    finalizeInstances(headMesh);
    scene.add(headMesh);
  }
}

function finalizeInstances(mesh: THREE.InstancedMesh): void {
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.frustumCulled = false;
}

function createStationSign(path: PathData, station: StationOnRoute): THREE.Mesh {
  const sample = path.sampleAt(station.s);
  const texture = makeStationSignTexture(station);
  const width = station.stop ? 5.4 : 4.2;
  const height = station.stop ? 1.35 : 1.05;

  const front = new THREE.PlaneGeometry(width, height);
  front.rotateY(Math.PI / 2);
  front.translate(0.035, 0, 0);
  const back = new THREE.PlaneGeometry(width, height);
  back.rotateY(-Math.PI / 2);
  back.translate(-0.035, 0, 0);
  const merged = mergeGeometries([front, back], false);
  if (!merged) {
    throw new Error('Failed to build station sign geometry');
  }

  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.FrontSide }),
  );
  const offset = station.side * 7.0;
  mesh.position.set(
    sample.x + sample.normalX * offset,
    station.stop ? 5.05 : 3.15,
    sample.z + sample.normalZ * offset,
  );
  mesh.rotation.y = sample.heading;
  return mesh;
}

function makeStationSignTexture(station: StationOnRoute): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 144;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  const gradeLabel =
    station.grade === '特'
      ? '特等站'
      : station.grade === '一'
        ? '一等站'
        : station.grade === '二'
          ? '二等站'
          : '三等站';

  context.fillStyle = station.stop ? '#0c3b28' : '#33443e';
  context.fillRect(0, 0, 512, 144);
  context.strokeStyle = station.stop ? '#ffd24a' : '#b7c2bc';
  context.lineWidth = 8;
  context.strokeRect(4, 4, 504, 136);

  context.fillStyle = '#ffffff';
  context.font = `700 ${station.name.length > 5 ? 54 : 64}px "Microsoft YaHei", "Noto Sans SC", sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(station.name, 256, 60);

  context.fillStyle = station.stop ? '#ffd24a' : '#c4cec8';
  context.font = '500 24px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText(
    `${gradeLabel} · ${station.stop ? '1462 停靠' : '通过'}`,
    256,
    116,
  );

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildRiver(scene: THREE.Scene, path: PathData, river: RiverCrossing): void {
  const sample = path.sampleAt(river.s);
  const group = new THREE.Group();
  group.position.set(sample.x, 0, sample.z);
  group.rotation.y = sample.heading;

  const waterColor = river.kind === 'yangtze' ? 0x2e6f8f : 0xc08b2e;
  // river.width 是真实河宽（沿线路方向，1 游戏米 = 100 真实米）；
  // 横向水面延伸到雾距，避免在 1:100,000 尺度下露出一条短水沟。
  const waterExtent = 9000;
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(waterExtent, river.width),
    new THREE.MeshStandardMaterial({
      color: waterColor,
      roughness: 0.25,
      metalness: 0.1,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.02;
  group.add(water);

  const deckMaterial = new THREE.MeshStandardMaterial({
    color: 0x565e60,
    roughness: 0.75,
    metalness: 0.25,
  });
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(8.4, 0.24, river.bridgeLength),
    deckMaterial,
  );
  deck.position.y = 0.45;
  group.add(deck);

  // 桁架用细杆合并成一格 mesh，避免实心墙挡住车窗。
  const trussMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d888a,
    roughness: 0.45,
    metalness: 0.55,
  });
  const trussHeight = river.kind === 'yangtze' ? 5.6 : 5.2;
  const panel = river.kind === 'yangtze' ? 8.5 : 4.3;
  const panels = Math.max(2, Math.round(river.bridgeLength / panel));
  const panelLength = river.bridgeLength / panels;
  const deckY = 0.45;
  const parts: THREE.BufferGeometry[] = [];
  const addBar = (
    width: number,
    height: number,
    length: number,
    x: number,
    y: number,
    z: number,
    rotationX = 0,
  ): void => {
    const geometry = new THREE.BoxGeometry(width, height, length);
    if (rotationX !== 0) {
      geometry.rotateX(rotationX);
    }
    geometry.translate(x, y, z);
    parts.push(geometry);
  };

  for (const side of [-1, 1]) {
    const x = side * 4;
    addBar(0.2, 0.2, river.bridgeLength, x, deckY + trussHeight, 0);
    addBar(0.18, 0.18, river.bridgeLength, x, deckY + 0.18, 0);
    for (let i = 0; i <= panels; i += 1) {
      const z = -river.bridgeLength * 0.5 + i * panelLength;
      addBar(0.16, trussHeight, 0.16, x, deckY + trussHeight * 0.5, z);
    }
    const diagonalLength = Math.hypot(panelLength, trussHeight);
    for (let i = 0; i < panels; i += 1) {
      const z = -river.bridgeLength * 0.5 + (i + 0.5) * panelLength;
      const rotationX = (i % 2 === 0 ? -1 : 1) * Math.atan2(trussHeight, panelLength);
      addBar(0.12, 0.12, diagonalLength, x, deckY + trussHeight * 0.5, z, rotationX);
    }
  }
  for (let i = 0; i <= panels; i += 1) {
    const z = -river.bridgeLength * 0.5 + i * panelLength;
    addBar(8.2, 0.14, 0.14, 0, deckY + trussHeight, z);
  }
  const truss = new THREE.Mesh(mergeGeometries(parts, false), trussMaterial);
  group.add(truss);

  scene.add(group);
}

function buildMainlineTrack(scene: THREE.Scene, path: PathData): void {
  const track = path.mainlineTrack;
  if (track.length < 2) {
    return;
  }

  const count = track.length;
  const x = new Float64Array(count);
  const z = new Float64Array(count);
  const normalX = new Float64Array(count);
  const normalZ = new Float64Array(count);
  const heading = new Float64Array(count);
  for (let i = 0; i < count; i += 1) {
    x[i] = track[i].x;
    z[i] = track[i].z;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(count - 1, i + 1);
    const dx = track[i1].x - track[i0].x;
    const dz = track[i1].z - track[i0].z;
    const length = Math.hypot(dx, dz);
    const tx = length > 1e-6 ? dx / length : 0;
    const tz = length > 1e-6 ? dz / length : -1;
    heading[i] = Math.atan2(-tx, -tz);
    normalX[i] = -tz;
    normalZ[i] = tx;
  }
  const line: RibbonLine = { x, z, normalX, normalZ };

  const ballastMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b6259,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  addRibbon(scene, line, 5.4, 0, 0.256, ballastMaterial);

  const railMaterial = new THREE.MeshStandardMaterial({
    color: 0xc7d0d6,
    roughness: 0.32,
    metalness: 0.82,
    side: THREE.DoubleSide,
  });
  addRibbon(scene, line, 0.14, -0.75, 0.456, railMaterial);
  addRibbon(scene, line, 0.14, 0.75, 0.456, railMaterial);

  const cumulative = new Float64Array(count);
  for (let i = 1; i < count; i += 1) {
    cumulative[i] =
      cumulative[i - 1] + Math.hypot(x[i] - x[i - 1], z[i] - z[i - 1]);
  }
  const totalLength = cumulative[count - 1];
  const spacing = 3.2;
  const sleepers: Array<{ x: number; z: number; heading: number }> = [];
  let segment = 0;
  for (let distance = spacing * 0.5; distance < totalLength; distance += spacing) {
    while (segment < count - 2 && cumulative[segment + 1] < distance) {
      segment += 1;
    }
    const segmentLength = cumulative[segment + 1] - cumulative[segment];
    const t = segmentLength > 1e-6 ? (distance - cumulative[segment]) / segmentLength : 0;
    sleepers.push({
      x: x[segment] + (x[segment + 1] - x[segment]) * t,
      z: z[segment] + (z[segment + 1] - z[segment]) * t,
      heading: heading[segment],
    });
  }
  if (sleepers.length > 0) {
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(2.7, 0.12, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x8b7a67, roughness: 1 }),
      sleepers.length,
    );
    const dummy = new THREE.Object3D();
    sleepers.forEach((sleeper, index) => {
      dummy.position.set(sleeper.x, 0.316, sleeper.z);
      dummy.rotation.set(0, sleeper.heading, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
}

function curveLimitSpeed(curvature: number): number {
  const limitAcc = GAME.tiltGravity * Math.tan(GAME.derailAngle / GAME.tiltGain);
  return Math.sqrt(limitAcc / Math.max(curvature, 1e-6));
}

function buildGuideBand(scene: THREE.Scene, path: PathData): void {
  const step = 4;
  const halfWidth = 0.32;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const green = new THREE.Color(0x4cc76d);
  const yellow = new THREE.Color(0xe5bf47);
  const red = new THREE.Color(0xdf583e);
  let vertex = 0;

  for (let s = path.coreStart; s <= path.coreEnd; s += step) {
    const sample = path.sampleAt(s);
    positions.push(
      sample.x + sample.normalX * halfWidth,
      0.5,
      sample.z + sample.normalZ * halfWidth,
      sample.x - sample.normalX * halfWidth,
      0.5,
      sample.z - sample.normalZ * halfWidth,
    );

    const curvature = Math.abs(sample.curvature);
    const safeSpeed = curveLimitSpeed(curvature);
    const ratio = safeSpeed / GAME.vMax;
    const color = ratio >= 0.98 ? green : ratio >= 0.82 ? yellow : red;
    colors.push(color.r, color.g, color.b, color.r, color.g, color.b);

    if (vertex > 0) {
      indices.push(vertex - 2, vertex - 1, vertex, vertex - 1, vertex + 1, vertex);
    }
    vertex += 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.frustumCulled = false;
  scene.add(mesh);
}

function buildCatenary(scene: THREE.Scene, path: PathData): void {
  const spacing = 55;
  const count = Math.floor((path.coreEnd - path.coreStart) / spacing);
  const poleGeometry = buildCatenaryPoleGeometry();
  const poleMaterial = new THREE.MeshStandardMaterial({
    color: 0x7d8784,
    roughness: 0.55,
    metalness: 0.45,
  });
  const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, count);
  const dummy = new THREE.Object3D();

  for (let i = 0; i < count; i += 1) {
    const s = path.coreStart + i * spacing;
    const sample = path.sampleAt(s);
    dummy.position.set(
      sample.x + sample.normalX * 4.3,
      0,
      sample.z + sample.normalZ * 4.3,
    );
    dummy.rotation.set(0, sample.heading, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
  }

  poles.instanceMatrix.needsUpdate = true;
  poles.frustumCulled = false;
  scene.add(poles);

  const wirePositions: number[] = [];
  const step = 4;
  for (let s = path.coreStart; s < path.coreEnd; s += step) {
    const next = Math.min(s + step, path.coreEnd);
    const a = path.sampleAt(s);
    const b = path.sampleAt(next);
    wirePositions.push(a.x, 6.28, a.z, b.x, 6.28, b.z);

    const phaseA = ((s - path.coreStart) % spacing) / spacing;
    const phaseB = ((next - path.coreStart) % spacing) / spacing;
    const messengerA = 6.98 - 0.26 * Math.sin(Math.PI * phaseA);
    const messengerB = 6.98 - 0.26 * Math.sin(Math.PI * phaseB);
    wirePositions.push(a.x, messengerA, a.z, b.x, messengerB, b.z);

    if (Math.floor(s) % 16 < step) {
      wirePositions.push(a.x, 6.28, a.z, a.x, messengerA, a.z);
    }
  }

  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(wirePositions, 3),
  );
  const wires = new THREE.LineSegments(
    wireGeometry,
    new THREE.LineBasicMaterial({ color: 0x333a37, transparent: true, opacity: 0.82 }),
  );
  wires.frustumCulled = false;
  scene.add(wires);
}

function buildCatenaryPoleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const addBox = (
    width: number,
    height: number,
    depth: number,
    x: number,
    y: number,
    z: number,
  ): void => {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    geometry.translate(x, y, z);
    parts.push(geometry);
  };

  addBox(0.8, 0.4, 0.8, 0, 0.2, 0);
  addBox(0.24, 7, 0.24, 0, 3.5, 0);
  addBox(4.35, 0.14, 0.14, -2.18, 6.68, 0);
  addBox(0.12, 0.72, 0.12, -4.2, 6.38, 0);
  addBox(0.55, 0.14, 0.14, -4.12, 6.98, 0);

  const braceStart = new THREE.Vector3(-0.2, 5.8, 0);
  const braceEnd = new THREE.Vector3(-3.9, 6.62, 0);
  const direction = new THREE.Vector3().subVectors(braceEnd, braceStart);
  const brace = new THREE.CylinderGeometry(0.06, 0.06, direction.length(), 6);
  brace.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize(),
    ),
  );
  brace.translate(
    (braceStart.x + braceEnd.x) * 0.5,
    (braceStart.y + braceEnd.y) * 0.5,
    (braceStart.z + braceEnd.z) * 0.5,
  );
  parts.push(brace);

  const merged = mergeGeometries(parts, false);
  if (!merged) {
    throw new Error('Failed to build catenary pole geometry');
  }
  return merged;
}

function buildLimitSigns(scene: THREE.Scene, path: PathData): void {
  const candidates: Array<{ s: number; curvature: number }> = [];
  for (let s = path.coreStart + 160; s <= path.coreEnd - 200; s += 8) {
    const curvature = Math.abs(path.sampleAt(s).curvature);
    if (curvature > 1 / 700) {
      candidates.push({ s, curvature });
    }
  }
  candidates.sort((a, b) => b.curvature - a.curvature);

  const picked: Array<{ s: number; curvature: number }> = [];
  for (const candidate of candidates) {
    if (picked.every((item) => Math.abs(item.s - candidate.s) > 1600)) {
      picked.push(candidate);
    }
    if (picked.length === 4) {
      break;
    }
  }

  for (const curve of picked) {
    const safeSpeed = curveLimitSpeed(curve.curvature);
    const display = Math.floor((safeSpeed * GAME.speedScale) / 500) * 500;
    const label = `${(display / 1000).toFixed(1)}k`;
    const signS = Math.max(path.coreStart + 20, curve.s - 90);
    const sample = path.sampleAt(signS);
    const side = sample.curvature > 0 ? -1 : 1;
    const offset = side * 11;
    const group = new THREE.Group();
    group.position.set(
      sample.x + sample.normalX * offset,
      0,
      sample.z + sample.normalZ * offset,
    );
    group.rotation.y = sample.heading;

    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 4.4, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x7d8784, roughness: 0.55, metalness: 0.4 }),
    );
    post.position.y = 2.2;
    group.add(post);

    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 1.3),
      new THREE.MeshBasicMaterial({ map: makeLimitSignTexture(label) }),
    );
    board.position.y = 4.5;
    group.add(board);

    scene.add(group);
  }
}

function makeLimitSignTexture(label: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.fillStyle = '#13251f';
  context.fillRect(0, 0, 512, 256);
  context.strokeStyle = '#ffd24a';
  context.lineWidth = 10;
  context.strokeRect(5, 5, 502, 246);
  context.fillStyle = '#e8f0e8';
  context.font = '600 34px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('曲线限速', 256, 52);
  context.fillStyle = '#ffd24a';
  context.font = '800 92px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText(label, 256, 145);
  context.fillStyle = '#b7c8c0';
  context.font = '500 22px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.fillText('等效 1463 km 尺度', 256, 220);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function buildScenery(
  scene: THREE.Scene,
  path: PathData,
  stations: StationOnRoute[],
): void {
  const rand = mulberry32(0x1462);
  const nearRiver = (s: number): boolean =>
    path.riverCrossings.some(
      (river) => Math.abs(s - river.s) < river.bridgeLength * 0.5 + 90,
    );

  buildFields(scene, path, rand, nearRiver);
  buildTrees(scene, path, rand, nearRiver);
  buildBuildings(scene, path, stations, rand, nearRiver);
}

function buildFields(
  scene: THREE.Scene,
  path: PathData,
  rand: () => number,
  nearRiver: (s: number) => boolean,
): void {
  const count = 460;
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.06, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }),
    count,
  );
  const colors = [0x6f8b4d, 0x7f9950, 0x9aa35b, 0xb0a05f, 0x5f7d49, 0x8f9a57];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const s = path.coreStart + rand() * (path.coreEnd - path.coreStart);
    if (nearRiver(s)) {
      continue;
    }
    const width = 24 + rand() * 70;
    const depth = 18 + rand() * 60;
    const sample = path.sampleAt(s);
    const side = rand() < 0.5 ? -1 : 1;
    const offset = width * 0.5 + 10 + rand() * 220;
    dummy.position.set(
      sample.x + sample.normalX * side * offset,
      0.02,
      sample.z + sample.normalZ * side * offset,
    );
    dummy.rotation.set(0, sample.heading + (rand() - 0.5) * 0.35, 0);
    dummy.scale.set(width, 1, depth);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);
    color.setHex(colors[Math.floor(rand() * colors.length)]);
    mesh.setColorAt(placed, color);
    placed += 1;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.frustumCulled = false;
  scene.add(mesh);
}

function buildTrees(
  scene: THREE.Scene,
  path: PathData,
  rand: () => number,
  nearRiver: (s: number) => boolean,
): void {
  const count = 900;
  const trunkGeometry = new THREE.CylinderGeometry(0.24, 0.32, 2.4, 6);
  trunkGeometry.translate(0, 1.2, 0);
  const foliageGeometry = new THREE.ConeGeometry(1.7, 4.6, 6);
  foliageGeometry.translate(0, 3.6, 0);

  const trunks = new THREE.InstancedMesh(
    trunkGeometry,
    new THREE.MeshStandardMaterial({ color: 0x5a4934, roughness: 1 }),
    count,
  );
  const foliage = new THREE.InstancedMesh(
    foliageGeometry,
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    count,
  );
  const greens = [0x3f6a3a, 0x4b7a42, 0x567f45, 0x365f37, 0x67884b];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 8) {
    attempts += 1;
    const s = path.coreStart + rand() * (path.coreEnd - path.coreStart);
    if (nearRiver(s)) {
      continue;
    }
    const sample = path.sampleAt(s);
    const side = rand() < 0.5 ? -1 : 1;
    const offset = 18 + rand() * 260;
    const scale = 0.7 + rand() * 1.2;
    dummy.position.set(
      sample.x + sample.normalX * side * offset,
      0,
      sample.z + sample.normalZ * side * offset,
    );
    dummy.rotation.set(0, rand() * Math.PI * 2, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    foliage.setMatrixAt(placed, dummy.matrix);
    color.setHex(greens[Math.floor(rand() * greens.length)]);
    foliage.setColorAt(placed, color);
    placed += 1;
  }

  trunks.count = placed;
  foliage.count = placed;
  trunks.instanceMatrix.needsUpdate = true;
  foliage.instanceMatrix.needsUpdate = true;
  if (foliage.instanceColor) {
    foliage.instanceColor.needsUpdate = true;
  }
  trunks.frustumCulled = false;
  foliage.frustumCulled = false;
  scene.add(trunks, foliage);
}

function buildBuildings(
  scene: THREE.Scene,
  path: PathData,
  stations: StationOnRoute[],
  rand: () => number,
  nearRiver: (s: number) => boolean,
): void {
  interface Building {
    x: number;
    z: number;
    rotation: number;
    width: number;
    depth: number;
    height: number;
    wallColor: number;
    roofColor: number;
  }

  const buildings: Building[] = [];
  const wallPalette = [0xe7e0d1, 0xd8d0bf, 0xc9b8a4, 0xc1ccd0, 0xd8c6ab, 0xb8b8ac];
  const roofPalette = [0x737b7b, 0x8a4f3e, 0x5d686b, 0x6d6259, 0x4f5d62];

  for (const station of stations) {
    const base =
      station.grade === '特' ? 18 : station.grade === '一' ? 13 : station.grade === '二' ? 8 : 4;
    const density = base * (station.stop ? 1 : 0.65);
    const spread =
      station.grade === '特' ? 240 : station.grade === '一' ? 190 : station.grade === '二' ? 150 : 110;
    const count = Math.round(density * (0.75 + rand() * 0.5));
    for (let i = 0; i < count; i += 1) {
      const s = clamp(station.s + (rand() - 0.5) * spread * 2, path.coreStart, path.coreEnd);
      if (nearRiver(s)) {
        continue;
      }
      const sample = path.sampleAt(s);
      const side = rand() < 0.5 ? -1 : 1;
      const width = 6 + rand() * 12;
      const depth = 6 + rand() * 12;
      const height =
        4 + rand() * (station.grade === '特' ? 19 : station.grade === '一' ? 14 : 9);
      const offset = Math.max(width, depth) * 0.5 + 42 + rand() * 190;
      buildings.push({
        x: sample.x + sample.normalX * side * offset,
        z: sample.z + sample.normalZ * side * offset,
        rotation: sample.heading + (rand() - 0.5) * 0.7,
        width,
        depth,
        height,
        wallColor: wallPalette[Math.floor(rand() * wallPalette.length)],
        roofColor: roofPalette[Math.floor(rand() * roofPalette.length)],
      });
    }
  }

  if (buildings.length === 0) {
    return;
  }

  const walls = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      map: makeBuildingTexture(),
    }),
    buildings.length,
  );
  const roofs = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }),
    buildings.length,
  );
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  buildings.forEach((building, index) => {
    dummy.position.set(building.x, building.height * 0.5, building.z);
    dummy.rotation.set(0, building.rotation, 0);
    dummy.scale.set(building.width, building.height, building.depth);
    dummy.updateMatrix();
    walls.setMatrixAt(index, dummy.matrix);
    color.setHex(building.wallColor);
    walls.setColorAt(index, color);

    dummy.position.y = building.height + 0.2;
    dummy.scale.set(building.width * 1.08, 0.4, building.depth * 1.08);
    dummy.updateMatrix();
    roofs.setMatrixAt(index, dummy.matrix);
    color.setHex(building.roofColor);
    roofs.setColorAt(index, color);
  });

  walls.instanceMatrix.needsUpdate = true;
  roofs.instanceMatrix.needsUpdate = true;
  if (walls.instanceColor) {
    walls.instanceColor.needsUpdate = true;
  }
  if (roofs.instanceColor) {
    roofs.instanceColor.needsUpdate = true;
  }
  walls.frustumCulled = false;
  roofs.frustumCulled = false;
  scene.add(walls, roofs);
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

function getBounds(path: PathData): Bounds {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < path.x.length; i += 1) {
    minX = Math.min(minX, path.x[i]);
    maxX = Math.max(maxX, path.x[i]);
    minZ = Math.min(minZ, path.z[i]);
    maxZ = Math.max(maxZ, path.z[i]);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    sizeX: maxX - minX,
    sizeZ: maxZ - minZ,
  };
}

function makeGroundTexture(repeat: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.fillStyle = '#6d8a55';
  context.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    const width = 6 + Math.random() * 46;
    const height = 3 + Math.random() * 20;
    context.fillStyle =
      Math.random() < 0.5 ? 'rgba(88,112,62,0.5)' : 'rgba(126,150,92,0.45)';
    context.fillRect(x, y, width, height);
  }

  context.strokeStyle = 'rgba(78,102,58,0.35)';
  context.lineWidth = 1;
  for (let i = 0; i < 10; i += 1) {
    const y = Math.random() * 256;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(256, y + (Math.random() - 0.5) * 20);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, repeat), Math.max(1, repeat));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeBuildingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.fillStyle = '#e6e4dc';
  context.fillRect(0, 0, 128, 128);
  context.fillStyle = '#4c5b60';
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      context.fillRect(12 + column * 28, 14 + row * 28, 17, 14);
    }
  }
  context.fillStyle = 'rgba(255,255,255,0.28)';
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      context.fillRect(12 + column * 28, 14 + row * 28, 17, 3);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeBannerTexture(title: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('2D canvas is unavailable');
  }

  context.fillStyle = '#0c2b20';
  context.fillRect(0, 0, 1024, 128);

  const tile = 16;
  for (let x = 0; x < 1024; x += tile) {
    context.fillStyle = (x / tile) % 2 === 0 ? '#f5f5f0' : '#18261f';
    context.fillRect(x, 0, tile, tile);
    context.fillRect(x, 128 - tile, tile, tile);
  }

  context.fillStyle = '#ffd24a';
  context.font = '700 58px "Microsoft YaHei", "Noto Sans SC", sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(title, 512, 66);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
