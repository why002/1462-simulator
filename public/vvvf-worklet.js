// 三相正弦与三角载波比较，输出 A 相电压（以直流母线中点为参考）。
// 线电压 U-V 会抵消共模载波，使开关簇落在 2fs；单相电压才能保留给定的
// 300 / 400 Hz 载波与 N·f1 同步频率。
// 异步段载波独立；同步段 21/15/5/3 与基波锁相（N 倍）；
// 11/7 分频使用 SHE 开关角；方波段 N=1、调制系数 >1。
const TAU = Math.PI * 2;

// 11 / 7 分频 SHE 的四分之一周期开关角（M = 1.0），角度单位为弧度。
const SHE_TABLES = {
  11: {
    start: 2,
    angles: [
      [0.142685228942267, 0],
      [0.2711061645361, 2],
      [0.839230173600874, 0],
      [0.892123243477527, 2],
      [1.53012183496568, 0],
    ],
  },
  7: {
    start: 0,
    angles: [
      [0.153216393407092, 2],
      [1.30209891284285, 0],
      [1.40007870202193, 2],
    ],
  },
};

function sheLevel(table, x) {
  let angleX = x % TAU;
  if (angleX < 0) angleX += TAU;
  const orthant = Math.floor(angleX / (Math.PI / 2));
  let angle = angleX % (Math.PI / 2);
  if ((orthant & 1) === 1) angle = Math.PI / 2 - angle;
  let level = table.start;
  for (let i = 0; i < table.angles.length; i += 1) {
    if (table.angles[i][0] <= angle) level = table.angles[i][1];
    else break;
  }
  if (orthant > 1) level = 2 - level;
  return level === 2 ? 1 : -1;
}

class VvvfProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.basePhase = 0;
    this.carrierPhase = Math.random();
    this.syncOffset = 0;
    this.baseHz = 5;
    this.targetBaseHz = 5;
    this.carrierHz = 175;
    this.targetCarrierHz = 175;
    this.amplitude = 0.55;
    this.targetAmplitude = 0.55;
    this.sync = false;
    this.she = false;
    this.pulses = 0;
    this.freqCoeff = 1 - Math.exp(-1 / (0.04 * sampleRate));
    this.ampCoeff = 1 - Math.exp(-1 / (0.03 * sampleRate));
    this.port.onmessage = (event) => this.handleMessage(event.data);
  }

  handleMessage(message) {
    if (!message) return;

    if (message.type === 'reset') {
      this.basePhase = 0;
      this.carrierPhase = Math.random();
      this.syncOffset = 0;
      this.baseHz = this.targetBaseHz = 5;
      this.carrierHz = this.targetCarrierHz = 175;
      this.amplitude = this.targetAmplitude = 0.55;
      this.sync = false;
      this.she = false;
      this.pulses = 0;
      return;
    }

    if (message.type !== 'params') return;

    const nextSync = message.sync === true;
    const nextShe = message.she === true;
    const nextPulses = nextSync ? Math.max(1, Math.round(message.pulses)) : 0;
    if (
      nextSync !== this.sync ||
      nextPulses !== this.pulses ||
      nextShe !== this.she
    ) {
      // 换段时保持三角载波相位连续，避免硬切换爆音。
      const phase = this.currentCarrierPhase();
      this.sync = nextSync;
      this.she = nextShe;
      this.pulses = nextPulses;
      if (nextSync) this.syncOffset = phase - this.basePhase * nextPulses;
      else this.carrierPhase = phase;
    }

    this.targetBaseHz = Math.max(0.5, message.baseHz);
    this.targetCarrierHz = Math.max(10, message.carrierHz);
    this.targetAmplitude = Math.min(1.5, Math.max(0, message.amplitude));
  }

  currentCarrierPhase() {
    return this.sync
      ? this.basePhase * this.pulses + this.syncOffset
      : this.carrierPhase;
  }

  process(_inputs, outputs) {
    const output = outputs[0] && outputs[0][0];
    if (!output) return true;

    let basePhase = this.basePhase;
    let carrierPhase = this.carrierPhase;
    let baseHz = this.baseHz;
    let carrierHz = this.carrierHz;
    let amplitude = this.amplitude;
    const freqCoeff = this.freqCoeff;
    const ampCoeff = this.ampCoeff;
    const sync = this.sync;
    const pulses = this.pulses;
    const offset = this.syncOffset;
    const sheTable = this.she ? SHE_TABLES[pulses] : null;
    const invRate = 1 / sampleRate;

    for (let i = 0; i < output.length; i += 1) {
      baseHz += (this.targetBaseHz - baseHz) * freqCoeff;
      carrierHz += (this.targetCarrierHz - carrierHz) * freqCoeff;
      amplitude += (this.targetAmplitude - amplitude) * ampCoeff;

      basePhase += baseHz * invRate;
      basePhase -= Math.floor(basePhase);

      if (sheTable) {
        output[i] = sheLevel(sheTable, TAU * basePhase);
      } else {
        let carrier;
        if (sync) {
          carrier = basePhase * pulses + offset;
        } else {
          carrierPhase += carrierHz * invRate;
          carrierPhase -= Math.floor(carrierPhase);
          carrier = carrierPhase;
        }

        const triangle = 1 - 4 * Math.abs(carrier - Math.floor(carrier) - 0.5);
        output[i] = Math.sin(TAU * basePhase) * amplitude > triangle ? 1 : -1;
      }
    }

    this.basePhase = basePhase;
    this.carrierPhase = carrierPhase;
    this.baseHz = baseHz;
    this.carrierHz = carrierHz;
    this.amplitude = amplitude;
    return true;
  }
}

registerProcessor('vvvf-processor', VvvfProcessor);
