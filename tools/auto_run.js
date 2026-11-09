/**
 * 《京沪神车 1462》全局自动跑脚本（浏览器控制台用）
 *
 * 打开游戏页面后，把本文件粘贴到 DevTools Console 回车：脚本会立即从上海站
 * 重新开跑，自动加速、提前制动、通过全部弯道，直到北京站停表。
 *
 *   __autoRun.stop()                  停止并松手
 *   __autoRun.status()                当前状态（目标速度、倾角、脱线次数等）
 *   __autoRun.start({ reset: false }) 从当前位置继续自动跑（当前速度若已高于
 *                                     安全剖面，脚本会尽力制动，可能来不及）
 *   __autoRun.start({ tiltLimitDeg: 50 }) 调快（更接近 60° 脱线角）
 *   window.__autoRunManual = true     先加载脚本但不自动开跑
 *
 * 原理：用 __game.path.curvature 反推每米允许的过弯速度，再按最重载重下
 * 的可用制动力向后积分成速度剖面；每个控制周期按回差决定油门或制动。
 * 制动缸有 0.9 s 建立时间，所以控制速度再取前瞻距离内的剖面最小值，
 * 提前收油，避免给油后再刹车时速度超调（济南发卡弯曾因此脱线）。
 * 另有一道实际倾角保护，防止 S 弯反向甩动等瞬态超限。脚本只派发空格键
 * 事件，不修改游戏内部状态。
 *
 * 依赖 __game 调试接口；TUNING 中的数值与 src/game/config.ts 保持一致，
 * 改游戏参数后需同步这里。
 */
(() => {
  'use strict';

  if (!window.__game) {
    console.error('[auto-run] 找不到 window.__game，请等游戏加载完成后再粘贴。');
    return;
  }

  const TUNING = {
    vMax: 70000 / 360,
    tiltGravity: 48,
    tiltGain: 1.3,
    derailAngle: (60 * Math.PI) / 180,
    brake: 42,
    brakeRampTime: 0.9,
    massFactor: 1.24,
  };

  const DEFAULTS = {
    reset: true,
    tiltLimitDeg: 44,
    speedFactor: 0.99,
    planDecelFactor: 0.8,
    speedBand: 1.5,
    controlHz: 30,
    tiltGuardDeg: 0,
    rampLookahead: TUNING.brakeRampTime,
    log: true,
  };

  let options = { ...DEFAULTS };
  let profile = null;
  let timerId = 0;
  let active = false;
  let sentPress = false;
  let sentAt = 0;
  let maxV = 0;
  let maxTilt = 0;
  let lastDerails = 0;
  let guardAngle = 0;
  let guardRelease = 0;
  let guardLatched = false;
  let guardCount = 0;
  let lastResult = null;

  function clampIndex(index) {
    return Math.max(0, Math.min(profile.length - 1, index));
  }

  function formatTime(seconds) {
    const tenths = Math.max(0, Math.floor(seconds * 10));
    const minutes = Math.floor(tenths / 600);
    const rest = Math.floor((tenths % 600) / 10);
    return `${minutes}:${String(rest).padStart(2, '0')}.${tenths % 10}`;
  }

  function sendKey(type) {
    window.dispatchEvent(
      new KeyboardEvent(type, {
        code: 'Space',
        key: ' ',
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function releaseThrottle(force = false) {
    if (sentPress || force) {
      sendKey('keyup');
    }
    sentPress = false;
    sentAt = 0;
  }

  /**
   * 每米允许速度：按目标倾角反解 v²κ / g = tan(θ / gain)。
   * 再从线路末端向前积分 v² = v_next² + 2·a·ds，得到能安全减速的剖面。
   * 制动缸建立期间的实际减速度只有满制动的一半左右，因此控制速度取
   * 未来一个建立时间距离内的剖面最小值，提前收油补偿这段延迟。
   */
  function buildProfile() {
    const game = window.__game;
    const count = game.pathLength + 1;
    const curvature = game.path.curvature;
    const tiltLimit = (options.tiltLimitDeg * Math.PI) / 180;
    const ratio =
      Math.tan(tiltLimit / TUNING.tiltGain) * TUNING.tiltGravity;
    const curveLimit = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const kappa = Math.abs(curvature[i]);
      curveLimit[i] =
        kappa > 1e-6
          ? Math.min(TUNING.vMax, Math.sqrt(ratio / kappa))
          : TUNING.vMax;
    }

    const planDecel = (TUNING.brake / TUNING.massFactor) * options.planDecelFactor;
    const profile = new Float32Array(count);
    let next = curveLimit[count - 1];
    profile[count - 1] = next;
    for (let i = count - 2; i >= 0; i -= 1) {
      const feasible = Math.sqrt(next * next + 2 * planDecel);
      next = Math.min(curveLimit[i], feasible);
      profile[i] = next;
    }

    if (options.rampLookahead <= 0) {
      return profile;
    }
    const control = new Float32Array(count);
    for (let i = 0; i < count; i += 1) {
      const reach = Math.min(
        count - 1,
        i + Math.ceil(profile[i] * options.rampLookahead),
      );
      let limit = profile[i];
      for (let j = i + 1; j <= reach; j += 1) {
        if (profile[j] < limit) {
          limit = profile[j];
        }
      }
      control[i] = limit;
    }
    return control;
  }

  function closeHelp() {
    if (!window.__game.helpVisible) {
      return;
    }
    const button = document.getElementById('help-close');
    if (button instanceof HTMLElement) {
      button.click();
    }
  }

  function complete(game) {
    releaseThrottle(true);
    if (timerId) {
      clearInterval(timerId);
      timerId = 0;
    }
    active = false;
    lastResult = {
      time: game.time,
      maxSpeed: game.displaySpeed(maxV),
      maxTiltDeg: (maxTilt * 180) / Math.PI,
      derails: game.derails,
      guards: guardCount,
      bestTime: game.bestTime,
    };
    if (options.log) {
      console.log(
        `[auto-run] 完成 ${formatTime(game.time)} · 最高 ${Math.round(
          lastResult.maxSpeed,
        ).toLocaleString('en-US')} km/h · 脱线 ${lastResult.derails} 次 · 峰值倾角 ${lastResult.maxTiltDeg.toFixed(
          1,
        )}°`,
      );
      if (lastResult.maxTiltDeg >= (TUNING.derailAngle * 180) / Math.PI - 2) {
        console.warn(
          '[auto-run] 峰值倾角已接近 60° 脱线角，建议降低 tiltLimitDeg 或 speedFactor。',
        );
      }
    }
  }

  function tick() {
    if (!active) {
      return;
    }
    const game = window.__game;
    if (!game) {
      stop('页面已卸载', true);
      return;
    }
    if (game.finished) {
      complete(game);
      return;
    }
    if (game.helpVisible) {
      closeHelp();
      releaseThrottle();
      return;
    }
    if (game.derailing) {
      releaseThrottle();
      return;
    }

    if (game.derails !== lastDerails) {
      lastDerails = game.derails;
      if (options.log) {
        console.warn(
          `[auto-run] ${formatTime(game.time)} 脱线（第 ${game.derails} 次），回轨后继续`,
        );
      }
    }

    const now = performance.now();
    const speed = game.v;
    const tilt = Math.abs(game.tilt);
    maxV = Math.max(maxV, speed);
    maxTilt = Math.max(maxTilt, tilt);

    if (!guardLatched && tilt >= guardAngle) {
      guardLatched = true;
      guardCount += 1;
    } else if (guardLatched && tilt <= guardRelease) {
      guardLatched = false;
    }

    const limit =
      profile[clampIndex(Math.floor(game.s))] * options.speedFactor;
    const band = options.speedBand;
    const wantPress = guardLatched
      ? false
      : sentPress
        ? speed <= limit + band
        : speed < limit - band;

    if (wantPress) {
      if (!sentPress || now - sentAt > 700) {
        sendKey('keydown');
        sentPress = true;
        sentAt = now;
      }
    } else if (sentPress) {
      sendKey('keyup');
      sentPress = false;
      sentAt = 0;
    }
  }

  function start(overrides = {}) {
    const game = window.__game;
    if (!game) {
      console.error('[auto-run] 找不到 window.__game。');
      return null;
    }

    stop('重新开始', true);
    options = { ...DEFAULTS, ...overrides };
    options.tiltLimitDeg = Math.max(
      20,
      Math.min(52, Number(options.tiltLimitDeg) || DEFAULTS.tiltLimitDeg),
    );
    options.speedFactor = Math.max(
      0.5,
      Math.min(1, Number(options.speedFactor) || DEFAULTS.speedFactor),
    );
    options.planDecelFactor = Math.max(
      0.3,
      Math.min(1, Number(options.planDecelFactor) || DEFAULTS.planDecelFactor),
    );
    options.speedBand = Math.max(
      0.2,
      Math.min(6, Number(options.speedBand) || DEFAULTS.speedBand),
    );
    options.controlHz = Math.max(
      4,
      Math.min(60, Number(options.controlHz) || DEFAULTS.controlHz),
    );
    const rampLookahead = Number(options.rampLookahead);
    options.rampLookahead = Math.max(
      0,
      Math.min(
        2,
        Number.isFinite(rampLookahead)
          ? rampLookahead
          : DEFAULTS.rampLookahead,
      ),
    );

    const guard = Number(options.tiltGuardDeg) || options.tiltLimitDeg + 8;
    const guardDeg = Math.min(
      56,
      Math.max(options.tiltLimitDeg + 4, guard),
    );
    guardAngle = (guardDeg * Math.PI) / 180;
    guardRelease =
      (Math.min(guardDeg - 1, options.tiltLimitDeg + 3) * Math.PI) / 180;

    profile = buildProfile();
    maxV = 0;
    maxTilt = 0;
    guardLatched = false;
    guardCount = 0;
    lastDerails = game.derails;
    lastResult = null;

    if (options.reset || game.finished) {
      game.reset();
    }
    closeHelp();

    active = true;
    sentPress = false;
    sentAt = 0;
    timerId = window.setInterval(tick, 1000 / options.controlHz);
    tick();

    if (options.log) {
      console.log(
        `[auto-run] 开始：过弯目标倾角 ${options.tiltLimitDeg}° · 速度系数 ${options.speedFactor} · 倾角保护 ${((guardAngle * 180) / Math.PI).toFixed(0)}° · 制动预瞄 ${options.rampLookahead.toFixed(2)} s`,
      );
    }
    return api.status();
  }

  function stop(reason = '手动停止', silent = false) {
    if (timerId) {
      clearInterval(timerId);
      timerId = 0;
    }
    const wasActive = active;
    active = false;
    guardLatched = false;
    releaseThrottle(true);
    if (wasActive && !silent && options.log) {
      console.log(`[auto-run] ${reason}`);
    }
  }

  function status() {
    const game = window.__game;
    if (!game) {
      return { active: false, error: '找不到 __game' };
    }
    const limit = profile
      ? profile[clampIndex(Math.floor(game.s))] * options.speedFactor
      : null;
    return {
      active,
      time: game.time,
      km: Number(game.km.toFixed(3)),
      speed: Number(game.v.toFixed(2)),
      displaySpeed: Math.round(game.displaySpeed(game.v)),
      limit: limit === null ? null : Number(limit.toFixed(2)),
      guardDeg: Number(((guardAngle * 180) / Math.PI).toFixed(0)),
      throttle: sentPress,
      tiltDeg: Number(((game.tilt * 180) / Math.PI).toFixed(1)),
      maxTiltDeg: Number(((maxTilt * 180) / Math.PI).toFixed(1)),
      derails: game.derails,
      guards: guardCount,
      pax: game.pax,
      finished: game.finished,
      bestTime: game.bestTime,
      lastResult,
    };
  }

  const api = {
    start,
    stop,
    status,
    get active() {
      return active;
    },
    get lastResult() {
      return lastResult;
    },
    get options() {
      return { ...options };
    },
  };

  if (window.__autoRun && typeof window.__autoRun.stop === 'function') {
    window.__autoRun.stop('被新脚本替换', true);
  }
  window.__autoRun = api;

  if (window.__autoRunManual !== true) {
    api.start();
  } else if (options.log) {
    console.log('[auto-run] 已加载（__autoRunManual = true），调用 __autoRun.start() 开始。');
  }
})();
