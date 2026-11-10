export type RankPeriod = 'all' | 'month' | 'week' | 'day';

export interface ToyRankItem {
  rank: number;
  score: number;
  nickname: string;
  avatar: string;
}

export interface ToyMyRank {
  ranked: boolean;
  rank: number;
  score: number;
}

export interface ToyAuthorProfile {
  nickname: string;
  avatar: string;
  sign: string;
  follower: number;
  archiveCount: number;
}

export interface ToyUserProfile {
  nickname: string;
  avatar: string;
}

export interface ToyApi {
  isSupport?(ability: string): Promise<boolean>;
  share?(req: { path: string }): Promise<void>;
  getQrCode?(req?: {
    path?: string;
    size?: number;
  }): Promise<{ base64: string; url: string }>;
  saveImageToAlbum?(req: {
    url?: string;
    base64Data?: string;
    hintMsg?: string;
  }): Promise<{ localPath: string }>;
  submitScore?(req: { board?: number; score: number }): Promise<{ score: number }>;
  getRankList?(req?: {
    board?: number;
    period?: RankPeriod;
    limit?: number;
  }): Promise<ToyRankItem[]>;
  getMyRank?(req?: { board?: number; period?: RankPeriod }): Promise<ToyMyRank>;
  getUserProfile?(): Promise<{
    avatar?: string;
    nickname?: string;
    toyOpenId?: string;
  }>;
  getAuthorProfile?(): Promise<{
    status: string;
    data?: {
      nickname?: string;
      avatar?: string;
      sign?: string;
      follower?: number;
      archiveCount?: number;
    };
  }>;
}

declare global {
  interface Window {
    toy?: ToyApi;
  }
}

export type ToyFailureReason =
  | 'missing'
  | 'unauthorized'
  | 'denied'
  | 'unsupported'
  | 'busy'
  | 'error';

export interface ToySubmitResult {
  ok: boolean;
  bestScore: number | null;
  myRank: ToyMyRank | null;
  reason: ToyFailureReason | null;
}

export interface ToyRankSnapshot {
  items: ToyRankItem[];
  mine: ToyMyRank | null;
  mineReason: ToyFailureReason | null;
}

/** 榜位 1：按完赛用时排序；分数取负的十分之一秒，越快越高。 */
export const TIME_BOARD = 1;
const MAX_SCORE = 16_777_215;
const DATA_TIMEOUT = 8000;
/** 首次调用会弹出 B 站资料授权确认框，等待用户操作需要更长时间。 */
const PROFILE_TIMEOUT = 20000;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  action: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`[ToySDK] ${action} timed out`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function getToy(): ToyApi | null {
  const api = window.toy;
  return api && typeof api === 'object' ? api : null;
}

export function isToyPage(): boolean {
  return /\/toy\/[^/]+(?:\/|$)/.test(window.location.pathname);
}

export function scoreFromTime(time: number): number {
  const tenths = Math.max(1, Math.floor(time * 10));
  return -Math.min(tenths, MAX_SCORE);
}

export function timeFromScore(score: number): number {
  return score < 0 ? -score / 10 : 0;
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const value = error as {
      message?: unknown;
      type?: unknown;
      code?: unknown;
    };
    return [value.type, value.code, value.message]
      .filter((part) => part !== undefined && part !== null)
      .join(' ');
  }
  return String(error ?? '');
}

export function classifyToyError(error: unknown): ToyFailureReason {
  if (
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === 307044
  ) {
    return 'busy';
  }
  const text = errorText(error);
  if (/denied|拒绝|授权/i.test(text)) {
    return 'denied';
  }
  if (/unauthor|未登录|登录|login/i.test(text)) {
    return 'unauthorized';
  }
  if (/unsupported|not support|不支持|toy_context|环境/i.test(text)) {
    return 'unsupported';
  }
  if (/频繁|307044|too many/i.test(text)) {
    return 'busy';
  }
  return 'error';
}

export async function submitToyTime(time: number): Promise<ToySubmitResult> {
  const api = getToy();
  if (!api?.submitScore) {
    return { ok: false, bestScore: null, myRank: null, reason: 'missing' };
  }
  if (!isToyPage()) {
    return { ok: false, bestScore: null, myRank: null, reason: 'unsupported' };
  }
  const score = scoreFromTime(time);
  try {
    const result = await api.submitScore({ board: TIME_BOARD, score });
    let myRank: ToyMyRank | null = null;
    if (api.getMyRank) {
      try {
        myRank = await withTimeout(
          api.getMyRank({ board: TIME_BOARD, period: 'all' }),
          DATA_TIMEOUT,
          'getMyRank',
        );
      } catch (error) {
        console.warn('[toy] getMyRank failed', error);
      }
    }
    return {
      ok: true,
      bestScore:
        typeof result?.score === 'number' && Number.isFinite(result.score)
          ? result.score
          : score,
      myRank,
      reason: null,
    };
  } catch (error) {
    console.warn('[toy] submitScore failed', error);
    return {
      ok: false,
      bestScore: null,
      myRank: null,
      reason: classifyToyError(error),
    };
  }
}

export async function loadToyRank(period: RankPeriod): Promise<ToyRankSnapshot> {
  const api = getToy();
  if (!api?.getRankList) {
    throw new Error('[ToySDK] missing');
  }
  if (!isToyPage()) {
    throw new Error('[ToySDK] toy_context_unavailable');
  }
  const [listResult, mineResult] = await Promise.allSettled([
    withTimeout(
      api.getRankList({ board: TIME_BOARD, period, limit: 20 }),
      DATA_TIMEOUT,
      'getRankList',
    ),
    api.getMyRank
      ? withTimeout(
          api.getMyRank({ board: TIME_BOARD, period }),
          DATA_TIMEOUT,
          'getMyRank',
        )
      : Promise.reject(new Error('[ToySDK] missing')),
  ]);
  if (listResult.status === 'rejected') {
    throw listResult.reason;
  }
  if (mineResult.status === 'fulfilled') {
    return { items: listResult.value, mine: mineResult.value, mineReason: null };
  }
  return {
    items: listResult.value,
    mine: null,
    mineReason: classifyToyError(mineResult.reason),
  };
}

export async function shareToyPage(path: string): Promise<boolean> {
  const api = getToy();
  if (!api?.share || !isToyPage()) {
    return false;
  }
  try {
    await api.share({ path });
    return true;
  } catch (error) {
    console.warn('[toy] share failed', error);
    return false;
  }
}

export async function supportsToyAbility(ability: string): Promise<boolean> {
  const api = getToy();
  if (!api?.isSupport || !isToyPage()) {
    return false;
  }
  try {
    return await withTimeout(
      api.isSupport(ability),
      4000,
      'isSupport',
    );
  } catch (error) {
    console.warn('[toy] isSupport failed', error);
    return false;
  }
}

export async function getToyQrCode(path: string): Promise<string | null> {
  const api = getToy();
  if (!api?.getQrCode || !isToyPage()) {
    return null;
  }
  try {
    const result = await withTimeout(
      api.getQrCode({ path, size: 240 }),
      DATA_TIMEOUT,
      'getQrCode',
    );
    return result.base64;
  } catch (error) {
    console.warn('[toy] getQrCode failed', error);
    return null;
  }
}

export async function loadToyUserProfile(): Promise<ToyUserProfile | null> {
  const api = getToy();
  if (!api?.getUserProfile || !isToyPage()) {
    return null;
  }
  try {
    const result = await withTimeout(
      api.getUserProfile(),
      PROFILE_TIMEOUT,
      'getUserProfile',
    );
    const nickname =
      typeof result?.nickname === 'string' ? result.nickname.trim() : '';
    if (!nickname) {
      return null;
    }
    return {
      nickname,
      avatar: typeof result.avatar === 'string' ? result.avatar : '',
    };
  } catch (error) {
    console.warn('[toy] getUserProfile failed', error);
    return null;
  }
}

export async function loadToyAuthorProfile(): Promise<ToyAuthorProfile | null> {
  const api = getToy();
  if (!api?.getAuthorProfile || !isToyPage()) {
    return null;
  }
  try {
    const result = await withTimeout(
      api.getAuthorProfile(),
      DATA_TIMEOUT,
      'getAuthorProfile',
    );
    if (result?.status !== 'ok' || !result.data) {
      return null;
    }
    const data = result.data;
    const nickname =
      typeof data.nickname === 'string' ? data.nickname.trim() : '';
    if (!nickname) {
      return null;
    }
    return {
      nickname,
      avatar: typeof data.avatar === 'string' ? data.avatar : '',
      sign: typeof data.sign === 'string' ? data.sign.trim() : '',
      follower:
        typeof data.follower === 'number' && Number.isFinite(data.follower)
          ? data.follower
          : 0,
      archiveCount:
        typeof data.archiveCount === 'number' &&
        Number.isFinite(data.archiveCount)
          ? data.archiveCount
          : 0,
    };
  } catch (error) {
    console.warn('[toy] getAuthorProfile failed', error);
    return null;
  }
}

export async function saveToyImage(dataUrl: string): Promise<boolean> {
  const api = getToy();
  if (!api?.saveImageToAlbum || !isToyPage()) {
    return false;
  }
  try {
    await api.saveImageToAlbum({
      base64Data: dataUrl,
      hintMsg: '保存成绩图到相册',
    });
    return true;
  } catch (error) {
    console.warn('[toy] saveImageToAlbum failed', error);
    return false;
  }
}
