const MUTE_KEY = 'fast-train-1462-muted-v1';

export interface AudioEngine {
  unlock(): void;
  update(dt: number, speed: number, pressing: boolean, active: boolean): void;
  horn(): void;
  chime(): void;
  crash(): void;
  fanfare(): void;
  toggleMute(): boolean;
  reset(): void;
  readonly muted: boolean;
  readonly running: boolean;
}

export function createAudio(): AudioEngine {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let motorOsc: OscillatorNode | null = null;
  let motorSub: OscillatorNode | null = null;
  let motorFilter: BiquadFilterNode | null = null;
  let motorGain: GainNode | null = null;
  let windGain: GainNode | null = null;
  let windFilter: BiquadFilterNode | null = null;
  let noiseBuffer: AudioBuffer | null = null;
  let distance = 0;
  let muted = loadMuted();

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

    motorFilter = context.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 240;
    motorFilter.Q.value = 0.8;
    motorGain = context.createGain();
    motorGain.gain.value = 0;
    motorOsc = context.createOscillator();
    motorOsc.type = 'sawtooth';
    motorOsc.frequency.value = 42;
    motorSub = context.createOscillator();
    motorSub.type = 'sine';
    motorSub.frequency.value = 84;
    const subGain = context.createGain();
    subGain.gain.value = 0.5;
    motorOsc.connect(motorFilter);
    motorSub.connect(subGain).connect(motorFilter);
    motorFilter.connect(motorGain).connect(master);
    motorOsc.start();
    motorSub.start();

    const windSource = context.createBufferSource();
    windSource.buffer = noiseBuffer;
    windSource.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter).connect(windGain).connect(master);
    windSource.start();

    if (context.state === 'suspended') {
      void context.resume();
    }
  }

  function setTarget(param: AudioParam | null, value: number, time = 0.08): void {
    if (!context || !param) {
      return;
    }
    param.setTargetAtTime(value, context.currentTime, time);
  }

  function update(
    dt: number,
    speed: number,
    pressing: boolean,
    active: boolean,
  ): void {
    if (context && context.state === 'suspended') {
      void context.resume();
    }
    if (!context) {
      return;
    }
    const working = active && !muted;
    const speedRatio = clamp(speed / 54, 0, 1);
    setTarget(
      motorOsc ? motorOsc.frequency : null,
      40 + speed * 1.2 + (pressing ? 7 : 0),
    );
    setTarget(motorSub ? motorSub.frequency : null, 80 + speed * 2.4);
    setTarget(motorFilter ? motorFilter.frequency : null, 190 + speed * 14);
    setTarget(
      motorGain ? motorGain.gain : null,
      working && speed > 0.6 ? 0.05 + (pressing ? 0.035 : 0) : 0,
      0.12,
    );
    setTarget(windFilter ? windFilter.frequency : null, 520 + speed * 20);
    setTarget(
      windGain ? windGain.gain : null,
      working ? speedRatio * speedRatio * 0.22 : 0,
      0.16,
    );

    if (working && speed > 2) {
      distance += speed * dt;
      while (distance >= 18) {
        distance -= 18;
        playJoint();
      }
    } else if (!active) {
      distance = 0;
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
    if (!context || muted) {
      return;
    }
    playNoise(0.07, 0.09, 1650);
    playNoise(0.06, 0.06, 1100, 0.06);
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
    playTone(880, 0.45, 0.04, 'sine');
    playTone(660, 0.6, 0.035, 'sine', 0.14);
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
    if (motorGain && context) {
      motorGain.gain.setTargetAtTime(0, context.currentTime, 0.06);
    }
    if (windGain && context) {
      windGain.gain.setTargetAtTime(0, context.currentTime, 0.06);
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
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
