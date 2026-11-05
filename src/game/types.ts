export type Grade = '特' | '一' | '二' | '三';

export type StationSide = -1 | 1;

export interface Station {
  name: string;
  km: number;
  grade: Grade;
  stop: boolean;
  lat: number;
  lon: number;
  paxIn: number;
  paxOut: number;
}

export interface StationOnRoute extends Station {
  s: number;
  side: StationSide;
}

export interface Vec2 {
  x: number;
  z: number;
}

export interface PathSample {
  x: number;
  z: number;
  heading: number;
  curvature: number;
  normalX: number;
  normalZ: number;
}

export interface RiverCrossing {
  name: string;
  s: number;
  width: number;
  bridgeLength: number;
  kind: 'yangtze' | 'yellow';
}

export interface PathData {
  length: number;
  coreStart: number;
  coreEnd: number;
  x: Float32Array;
  z: Float32Array;
  heading: Float32Array;
  curvature: Float32Array;
  normalX: Float32Array;
  normalZ: Float32Array;
  minRadius: number;
  riverCrossings: RiverCrossing[];
  mainlineBypass: Vec2[];
  mainlineTrack: Vec2[];
  jinanBypassMinDistance: number;
  sampleAt(s: number): PathSample;
  nearestS(x: number, z: number): number;
}
