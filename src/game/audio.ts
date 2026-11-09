import { JOINT_SAMPLE_B64, JOINT_SAMPLE_RATE } from './jointSample';

const MUTE_KEY = 'fast-train-1462-muted-v1';

// 基频 f1 = 10 + 0.9v（Hz），显示速度 = v × 360，即 f1 = 10 + 显示速度 / 400。
// 异步 300 Hz → 400 Hz 两段；同步 21 → 15 → 11(SHE) → 7(SHE) → 5 → 3(广域) → 1(方波)。
// 切换点仍按 f1 设定，+10 Hz 偏置使同一 f1 对应的显示速度整体提前（括号内为新速度）。
const MOTOR_BASE_HZ = 10;
const MOTOR_HZ_PER_SPEED = 0.9;
const ASYNC_LOW_HZ = 300;
const ASYNC_HIGH_HZ = 400;
const ASYNC_SWITCH_HZ = 12; // ≈800 km/h
const ASYNC_SWITCH_EXIT_HZ = 11.76;
const SYNC_ENTER_HZ = 19; // 21 × 19 ≈ 400 Hz，≈3,600 km/h
const SYNC_EXIT_HZ = 18.7;
const SYNC_STAGE_HYSTERESIS = 0.98;
const SYNC_STAGES = [
  { pulses: 21, fromHz: 19, she: false }, // ≈3,600 km/h
  { pulses: 15, fromHz: 28.8, she: false }, // ≈7,520
  { pulses: 11, fromHz: 36, she: true }, // SHE ≈10,400
  { pulses: 7, fromHz: 45.6, she: true }, // SHE ≈14,240
  { pulses: 5, fromHz: 56.4, she: false }, // ≈18,560
  { pulses: 3, fromHz: 75, she: false }, // 广域 3 分频 ≈26,000
  { pulses: 1, fromHz: 112.5, she: false }, // 方波 ≈41,000
] as const;
const SYNC_STAGE_TOP = SYNC_STAGES.length - 1;

// 声音由 AudioWorklet 中正弦与三角载波比较后的 A 相开关电压产生：
// 载波、边带 (fs ± k·f1) 和方波谐波都来自开关过程，不再手工叠加正弦分音；
// worklet 再对电压做约 1.8 kHz 两级一阶低通，模拟电机电感/车体声学响应。
// 用单相电压而非线电压 U-V，避免共模载波被抵消后听感变成 2fs。
const VVVF = {
  motorBaseHz: MOTOR_BASE_HZ,
  motorHzPerSpeed: MOTOR_HZ_PER_SPEED,
  asyncLowHz: ASYNC_LOW_HZ,
  asyncHighHz: ASYNC_HIGH_HZ,
  asyncSwitchHz: ASYNC_SWITCH_HZ,
  asyncSwitchExitHz: ASYNC_SWITCH_EXIT_HZ,
  syncEnterHz: SYNC_ENTER_HZ,
  syncExitHz: SYNC_EXIT_HZ,
  stageHysteresis: SYNC_STAGE_HYSTERESIS,
  level: 0.1,
  asyncAmplitudeMin: 0.45,
  squareAmplitude: 1.35,
} as const;

export interface VvvfState {
  readonly motorHz: number;
  readonly carrierHz: number;
  readonly pulses: number;
  readonly sync: boolean;
  readonly she: boolean;
  readonly square: boolean;
  readonly level: number;
}

export interface AudioEngine {
  unlock(): void;
  update(dt: number, speed: number, active: boolean, traction: boolean): void;
  horn(): void;
  chime(): void;
  crash(): void;
  fanfare(): void;
  toggleMute(): boolean;
  reset(): void;
  readonly muted: boolean;
  readonly running: boolean;
  readonly vvvf: VvvfState;
}

export function createAudio(): AudioEngine {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let jointBuffer: AudioBuffer | null = null;
  const jointVoices = new Set<AudioBufferSourceNode>();
  let distance = 0;
  let muted = loadMuted();
  let vfdBus: GainNode | null = null;
  let vfdNode: AudioWorkletNode | null = null;
  let vfdWorkletLoading = false;
  let vvvfMotorHz: number = VVVF.motorBaseHz;
  let vvvfCarrierHz: number = VVVF.asyncLowHz;
  let vvvfPulses = 0;
  let vvvfSync = false;
  let vvvfShe = false;
  let vvvfStage = 0;
  let vvvfHighAsync = false;
  let vvvfModulation = 0.55;
  let vvvfLevel = 0;

  function loadMuted(): boolean {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function saveMuted(value: boolean): void {
    try {
      localStorage.setItem(MUTE_KEY, value ? '1' : '0');
    } catch {
      // Ignore storage failures; the setting stays for the session.
    }
  }

  function unlock(): void {
    if (context) {
      if (context.state === 'suspended') {
        void context.resume();
      }
      return;
    }
    const Constructor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Constructor) {
      return;
    }
    try {
      context = new Constructor();
    } catch {
      context = null;
      return;
    }
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.8;
    master.connect(context.destination);

    noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = Math.random() * 2 - 1;
    }

    jointBuffer = decodeJointSample(context);
    setupVvvf();

    if (context.state === 'suspended') {
      void context.resume();
    }
  }

  function setupVvvf(): void {
    const ctx = context;
    if (!ctx || !master) {
      return;
    }
    const bus = ctx.createGain();
    bus.gain.value = 0;
    const smooth = ctx.createBiquadFilter();
    smooth.type = 'lowpass';
    smooth.frequency.value = 6500;
    smooth.Q.value = 0.4;
    bus.connect(smooth).connect(master);
    vfdBus = bus;
    void loadVvvfWorklet(ctx);
  }

  async function loadVvvfWorklet(ctx: AudioContext): Promise<void> {
    if (vfdWorkletLoading || !ctx.audioWorklet) {
      return;
    }
    vfdWorkletLoading = true;
    try {
      const url = new URL('vvvf-worklet.js', document.baseURI).toString();
      await ctx.audioWorklet.addModule(url);
      if (context !== ctx || !vfdBus) {
        return;
      }
      const node = new AudioWorkletNode(ctx, 'vvvf-processor', {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.connect(vfdBus);
      vfdNode = node;
      sendVvvfState();
    } catch (error) {
      console.error('VVVF worklet 加载失败', error);
    }
  }

  function sendVvvfState(): void {
    if (!vfdNode) {
      return;
    }
    vfdNode.port.postMessage({
      type: 'params',
      baseHz: vvvfMotorHz,
      carrierHz: vvvfCarrierHz,
      pulses: vvvfPulses,
      sync: vvvfSync,
      she: vvvfShe,
      amplitude: vvvfModulation,
    });
  }

  function updateVvvf(speed: number, active: boolean, traction: boolean): void {
    if (!context || !vfdBus) {
      return;
    }
    const now = context.currentTime;
    const motor = VVVF.motorBaseHz + Math.max(0, speed) * VVVF.motorHzPerSpeed;
    vvvfMotorHz = motor;

    if (!vvvfHighAsync) {
      if (motor >= VVVF.asyncSwitchHz) {
        vvvfHighAsync = true;
      }
    } else if (motor < VVVF.asyncSwitchExitHz) {
      vvvfHighAsync = false;
    }
    const asyncCarrier = vvvfHighAsync ? VVVF.asyncHighHz : VVVF.asyncLowHz;

    if (!vvvfSync) {
      if (motor >= VVVF.syncEnterHz) {
        vvvfSync = true;
        vvvfStage = 0;
      }
    } else if (motor < VVVF.syncExitHz) {
      vvvfSync = false;
    }

    if (vvvfSync) {
      while (
        vvvfStage < SYNC_STAGE_TOP &&
        motor >= SYNC_STAGES[vvvfStage + 1].fromHz
      ) {
        vvvfStage += 1;
      }
      while (
        vvvfStage > 0 &&
        motor < SYNC_STAGES[vvvfStage].fromHz * VVVF.stageHysteresis
      ) {
        vvvfStage -= 1;
      }
      const stage = SYNC_STAGES[vvvfStage];
      vvvfPulses = stage.pulses;
      vvvfShe = stage.she;
      vvvfCarrierHz = vvvfPulses * motor;
    } else {
      vvvfPulses = 0;
      vvvfShe = false;
      vvvfCarrierHz = asyncCarrier;
    }

    const square = vvvfSync && vvvfPulses === 1;
    vvvfModulation = square
      ? VVVF.squareAmplitude
      : Math.min(
          1,
          VVVF.asyncAmplitudeMin +
            (1 - VVVF.asyncAmplitudeMin) * Math.min(1, motor / VVVF.syncEnterHz),
        );
    sendVvvfState();

    const motion = Math.min(1, Math.max(0, speed) / 6);
    // 松手即再生制动：保留 VVVF 声，响度为牵引的 85%，约 2 m/s 以下淡出。
    const regen = Math.min(1, Math.max(0, speed) / 2);
    const target = active
      ? traction
        ? 0.18 + 0.82 * motion
        : 0.85 * regen
      : 0;
    vvvfLevel = target;
    if (vfdBus) {
      vfdBus.gain.setTargetAtTime(target * VVVF.level, now, active ? 0.12 : 0.3);
    }
  }

  function update(dt: number, speed: number, active: boolean, traction: boolean): void {
    if (context && context.state === 'suspended') {
      void context.resume();
    }
    if (!context) {
      return;
    }
    updateVvvf(speed, active, traction);
    if (active && !muted && speed > 2) {
      distance += speed * dt;
      while (distance >= 150) {
        distance -= 150;
        playJoint();
      }
    } else if (!active) {
      distance = 0;
    }
    if (speed <= 2) {
      stopJointVoices();
    }
  }

  function playTone(
    frequency: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
    delay = 0,
    endFrequency?: number,
  ): void {
    if (!context || !master) {
      return;
    }
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (endFrequency !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(gainValue, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function playNoise(
    duration: number,
    gainValue: number,
    frequency: number,
    delay = 0,
  ): void {
    if (!context || !master || !noiseBuffer) {
      return;
    }
    const t0 = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 0.9;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  }

  function playJoint(): void {
    if (!context || !master || muted || !jointBuffer) {
      return;
    }
    const source = context.createBufferSource();
    source.buffer = jointBuffer;
    const gain = context.createGain();
    gain.gain.value = 0.55;
    source.connect(gain).connect(master);
    jointVoices.add(source);
    source.onended = () => {
      jointVoices.delete(source);
    };
    source.start();
  }

  function stopJointVoices(): void {
    for (const voice of jointVoices) {
      voice.onended = null;
      voice.stop();
    }
    jointVoices.clear();
  }

  function horn(): void {
    if (!context || muted) {
      return;
    }
    playTone(311, 0.7, 0.05, 'triangle');
    playTone(392, 0.7, 0.04, 'triangle', 0.02);
    playTone(155, 0.7, 0.035, 'sine', 0.02);
  }

  function chime(): void {
    if (!context || muted) {
      return;
    }
    playTone(880, 0.45, 0.4, 'sine');
    playTone(660, 0.6, 0.3, 'sine', 0.14);
  }

  function crash(): void {
    if (!context || muted) {
      return;
    }
    playNoise(0.6, 0.42, 900);
    playNoise(0.35, 0.22, 320, 0.04);
    playTone(120, 0.55, 0.2, 'sawtooth', 0, 38);
  }

  function fanfare(): void {
    if (!context || muted) {
      return;
    }
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((value, index) => {
      playTone(value, 0.42, 0.05, 'triangle', index * 0.16);
    });
    playTone(261.63, 0.8, 0.03, 'sine', 0.48);
  }

  function toggleMute(): boolean {
    muted = !muted;
    saveMuted(muted);
    if (master && context) {
      master.gain.setTargetAtTime(muted ? 0 : 0.8, context.currentTime, 0.05);
    }
    return muted;
  }

  function reset(): void {
    distance = 0;
    vvvfSync = false;
    vvvfPulses = 0;
    vvvfShe = false;
    vvvfStage = 0;
    vvvfHighAsync = false;
    vvvfMotorHz = VVVF.motorBaseHz;
    vvvfCarrierHz = VVVF.asyncLowHz;
    vvvfModulation = 0.55;
    vvvfLevel = 0;
    vfdNode?.port.postMessage({ type: 'reset' });
    if (context && vfdBus) {
      vfdBus.gain.setTargetAtTime(0, context.currentTime, 0.08);
    }
  }

  return {
    unlock,
    update,
    horn,
    chime,
    crash,
    fanfare,
    toggleMute,
    reset,
    get muted() {
      return muted;
    },
    get running() {
      return context !== null && context.state === 'running';
    },
    get vvvf() {
      return {
        motorHz: vvvfMotorHz,
        carrierHz: vvvfCarrierHz,
        pulses: vvvfPulses,
        sync: vvvfSync,
        she: vvvfShe,
        square: vvvfSync && vvvfPulses === 1,
        level: vvvfLevel,
      };
    },
  };
}

function decodeJointSample(context: AudioContext): AudioBuffer {
  const binary = atob(JOINT_SAMPLE_B64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const pcm = new Int16Array(bytes.buffer);
  const buffer = context.createBuffer(1, pcm.length, JOINT_SAMPLE_RATE);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < pcm.length; i += 1) {
    channel[i] = pcm[i] / 32768;
  }
  return buffer;
}
