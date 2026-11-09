import { formatDuration } from './hud';
import {
  classifyToyError,
  getToy,
  isToyPage,
  loadToyRank,
  scoreFromTime,
  submitToyTime,
  timeFromScore,
  type RankPeriod,
  type ToyFailureReason,
  type ToyRankSnapshot,
} from './toy';

export interface LeaderboardOptions {
  isResultVisible: () => boolean;
  onOpen?: () => void;
}

export interface LeaderboardController {
  submit(time: number): Promise<void>;
  open(): void;
  close(): void;
  hideResult(): void;
  isOpen(): boolean;
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

export function createLeaderboard(
  options: LeaderboardOptions,
): LeaderboardController {
  const overlay = getElement('rank-overlay');
  const closeButton = getElement<HTMLButtonElement>('rank-close');
  const refreshButton = getElement<HTMLButtonElement>('rank-refresh');
  const listElement = getElement('rank-list');
  const meElement = getElement('rank-me');
  const rankButton = getElement<HTMLButtonElement>('rank');
  const hintRankButton = getElement<HTMLButtonElement>('rank-hint');
  const resultRank = getElement<HTMLButtonElement>('result-rank');
  const resultRankText = getElement('result-rank-text');
  const tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.rank-tab'),
  );

  const cache = new Map<RankPeriod, ToyRankSnapshot>();
  let activePeriod: RankPeriod = 'all';
  let loadToken = 0;
  let submitToken = 0;

  function isOpen(): boolean {
    return !overlay.classList.contains('hidden');
  }

  function setActiveTab(period: RankPeriod): void {
    for (const tab of tabs) {
      const active = tab.dataset.period === period;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }

  function setResultState(state: string, text: string): void {
    resultRank.classList.remove('hidden');
    resultRank.dataset.state = state;
    resultRankText.textContent = text;
  }

  function stateBlock(title: string, detail?: string): HTMLElement {
    const block = createElement('div', 'rank-state');
    block.append(createElement('b', undefined, title));
    if (detail) {
      block.append(document.createTextNode(detail));
    }
    return block;
  }

  function renderRows(snapshot: ToyRankSnapshot): void {
    listElement.replaceChildren();
    listElement.removeAttribute('aria-busy');
    const mine = snapshot.mine;
    if (snapshot.items.length === 0) {
      listElement.append(
        stateBlock('榜单还是空的', '跑完一局京沪线，就能拿下第一个名次。'),
      );
      return;
    }
    const fragment = document.createDocumentFragment();
    for (const item of snapshot.items) {
      const row = createElement('div', 'rank-row');
      if (
        mine?.ranked &&
        item.rank === mine.rank &&
        item.score === mine.score
      ) {
        row.classList.add('is-me');
      }

      const position = createElement('span', 'rank-pos', String(item.rank));
      if (item.rank <= 3) {
        position.classList.add(`top-${item.rank}`);
      }

      const avatar = createElement('span', 'rank-avatar');
      const initial = Array.from(item.nickname.trim())[0] ?? '?';
      avatar.append(createElement('span', 'rank-avatar-fallback', initial));
      if (item.avatar) {
        const image = new Image();
        image.className = 'rank-avatar-img';
        image.alt = '';
        image.loading = 'lazy';
        image.decoding = 'async';
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.remove(), { once: true });
        image.src = item.avatar;
        avatar.append(image);
      }

      row.append(
        position,
        avatar,
        createElement('span', 'rank-name', item.nickname || '匿名旅客'),
        createElement(
          'span',
          'rank-time',
          formatDuration(timeFromScore(item.score)),
        ),
      );
      fragment.append(row);
    }
    listElement.append(fragment);
  }

  function renderMine(snapshot: ToyRankSnapshot): void {
    meElement.classList.remove('is-warn');
    if (snapshot.mine) {
      if (snapshot.mine.ranked) {
        meElement.textContent = `我的成绩 ${formatDuration(
          timeFromScore(snapshot.mine.score),
        )} · 第 ${snapshot.mine.rank} 名`;
      } else {
        meElement.textContent = '你还没有上榜，跑一局试试。';
      }
      return;
    }
    meElement.classList.add('is-warn');
    switch (snapshot.mineReason) {
      case 'unauthorized':
      case 'denied':
        meElement.textContent = '登录 B 站账号后可查看自己的排名。';
        break;
      case 'unsupported':
        meElement.textContent = '当前环境无法读取我的排名。';
        break;
      default:
        meElement.textContent = '我的排名暂时不可用，稍后再试。';
        break;
    }
  }

  function render(period: RankPeriod, snapshot: ToyRankSnapshot): void {
    setActiveTab(period);
    renderRows(snapshot);
    renderMine(snapshot);
  }

  function renderLoading(): void {
    listElement.replaceChildren(stateBlock('正在加载榜单…'));
    listElement.setAttribute('aria-busy', 'true');
    meElement.classList.remove('is-warn');
    meElement.textContent = '正在查询我的排名…';
  }

  function renderUnavailable(): void {
    listElement.replaceChildren(
      stateBlock(
        '排行榜需在 B 站 Toy 内使用',
        '当前页面不在 B 站 Toy 内，不连接线上榜单。',
      ),
    );
    listElement.removeAttribute('aria-busy');
    meElement.classList.add('is-warn');
    meElement.textContent = '当前页面不在 B 站 Toy 内。';
    refreshButton.disabled = true;
  }

  function renderError(reason: ToyFailureReason): void {
    const detail =
      reason === 'busy'
        ? '请求过于频繁，点下方「刷新」重试。'
        : reason === 'unauthorized'
          ? '登录 B 站账号后再试。'
          : reason === 'unsupported'
            ? '当前环境未接入 B 站排行榜。'
            : '点下方「刷新」重试。';
    listElement.replaceChildren(stateBlock('排行榜暂时不可用', detail));
    listElement.removeAttribute('aria-busy');
    meElement.classList.add('is-warn');
    meElement.textContent = '我的排名暂时不可用。';
  }

  async function load(period: RankPeriod, force: boolean): Promise<void> {
    refreshButton.disabled = false;
    const cached = cache.get(period);
    if (cached && !force) {
      render(period, cached);
      return;
    }

    const token = ++loadToken;
    renderLoading();
    refreshButton.disabled = true;

    if (!getToy()?.getRankList || !isToyPage()) {
      if (token === loadToken) {
        renderUnavailable();
      }
      return;
    }

    try {
      const snapshot = await loadToyRank(period);
      if (token !== loadToken) {
        return;
      }
      cache.set(period, snapshot);
      render(period, snapshot);
    } catch (error) {
      if (token !== loadToken) {
        return;
      }
      console.warn('[rank] load failed', error);
      renderError(classifyToyError(error));
    } finally {
      if (token === loadToken) {
        refreshButton.disabled = false;
      }
    }
  }

  function open(): void {
    options.onOpen?.();
    overlay.classList.remove('hidden');
    setActiveTab(activePeriod);
    void load(activePeriod, false);
  }

  function close(): void {
    overlay.classList.add('hidden');
    loadToken += 1;
    refreshButton.disabled = false;
  }

  function hideResult(): void {
    submitToken += 1;
    resultRank.classList.add('hidden');
    resultRank.dataset.state = '';
    resultRankText.textContent = '';
  }

  async function submit(time: number): Promise<void> {
    if (!options.isResultVisible()) {
      return;
    }
    const token = ++submitToken;
    setResultState('pending', '正在上传成绩…');
    const result = await submitToyTime(time);
    if (result.ok) {
      cache.clear();
    }
    if (token !== submitToken || !options.isResultVisible()) {
      return;
    }
    if (result.ok) {
      const bestTime = timeFromScore(result.bestScore ?? scoreFromTime(time));
      if (result.myRank?.ranked) {
        setResultState(
          'ok',
          `全站第 ${result.myRank.rank} 名 · 最快 ${formatDuration(bestTime)}`,
        );
      } else {
        setResultState('ok', `成绩已上传 · 最快 ${formatDuration(bestTime)}`);
      }
      return;
    }
    switch (result.reason) {
      case 'missing':
      case 'unsupported':
        setResultState('warn', '排行榜需在 B 站 Toy 内使用');
        break;
      case 'unauthorized':
        setResultState('warn', '登录 B 站账号后可上榜');
        break;
      case 'denied':
        setResultState('warn', '授权昵称头像后可上榜');
        break;
      case 'busy':
        setResultState('warn', '排行榜繁忙，稍后再试');
        break;
      default:
        setResultState('error', '成绩上传失败 · 点此查看排行榜');
        break;
    }
  }

  rankButton.addEventListener('click', (event) => {
    event.stopPropagation();
    open();
    rankButton.blur();
  });

  hintRankButton.addEventListener('click', (event) => {
    event.stopPropagation();
    open();
    hintRankButton.blur();
  });

  resultRank.addEventListener('click', (event) => {
    event.stopPropagation();
    open();
    resultRank.blur();
  });

  closeButton.addEventListener('click', (event) => {
    event.stopPropagation();
    close();
    closeButton.blur();
  });

  refreshButton.addEventListener('click', (event) => {
    event.stopPropagation();
    void load(activePeriod, true);
    refreshButton.blur();
  });

  for (const tab of tabs) {
    tab.addEventListener('click', (event) => {
      event.stopPropagation();
      const period = tab.dataset.period as RankPeriod | undefined;
      if (!period || period === activePeriod) {
        return;
      }
      activePeriod = period;
      setActiveTab(period);
      void load(period, false);
      tab.blur();
    });
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      close();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && isOpen()) {
      close();
    }
  });

  return {
    submit,
    open,
    close,
    hideResult,
    isOpen,
  };
}
