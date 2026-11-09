import {
  formatDuration,
  renderResultImage,
  type ResultShareData,
} from './hud';
import {
  getToy,
  getToyQrCode,
  isToyPage,
  saveToyImage,
  shareToyPage,
  supportsToyAbility,
} from './toy';

export interface ShareOptions {
  shareButton: HTMLButtonElement;
  saveButton: HTMLButtonElement;
  getPoster: () => ResultShareData;
  getTime: () => number;
}

export interface ShareController {
  close(): void;
  isOpen(): boolean;
  reset(): void;
}

function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}

function downloadDataUrl(dataUrl: string, fileName: string): boolean {
  try {
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = fileName;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the selection-based fallback.
  }
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}

export function createShareController(options: ShareOptions): ShareController {
  const overlay = getElement('share-overlay');
  const closeButton = getElement<HTMLButtonElement>('share-close');
  const closeBottomButton = getElement<HTMLButtonElement>('share-close-bottom');
  const copyButton = getElement<HTMLButtonElement>('share-copy');
  const linkInput = getElement<HTMLInputElement>('share-link');
  const qrBlock = getElement('share-qr-block');
  const qrImage = getElement<HTMLImageElement>('share-qr');
  const qrNote = getElement('share-qr-note');
  const hintElement = getElement('share-hint');
  const modalSaveButton = getElement<HTMLButtonElement>('share-save');

  const labels = new Map<HTMLButtonElement, string>();
  const timers = new Set<number>();
  let sharing = false;
  let saving = false;
  let qrToken = 0;
  let epoch = 0;

  function labelOf(button: HTMLButtonElement): string {
    const cached = labels.get(button);
    if (cached !== undefined) {
      return cached;
    }
    const label = button.textContent ?? '';
    labels.set(button, label);
    return label;
  }

  function flash(button: HTMLButtonElement, text: string): void {
    const label = labelOf(button);
    button.textContent = text;
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      if (button.textContent === text) {
        button.textContent = label;
      }
    }, 1800);
    timers.add(timer);
  }

  function isOpen(): boolean {
    return !overlay.classList.contains('hidden');
  }

  function closeOverlay(): void {
    overlay.classList.add('hidden');
    qrToken += 1;
  }

  function shareTarget(): { path: string; url: string; tenths: number } {
    const tenths = Math.max(1, Math.floor(options.getTime() * 10));
    const path = `index.html?c=${tenths}`;
    return {
      path,
      url: new URL(path, window.location.href).href,
      tenths,
    };
  }

  async function openOverlay(
    target: { url: string; tenths: number },
  ): Promise<void> {
    overlay.classList.remove('hidden');
    linkInput.value = target.url;
    hintElement.textContent = '好友打开后可直接挑战你的纪录。';
    qrImage.removeAttribute('src');
    qrBlock.classList.add('hidden');
    qrNote.textContent = '';

    const token = ++qrToken;
    const api = getToy();
    if (!api?.getQrCode || !isToyPage()) {
      hintElement.textContent = '复制链接发给好友，打开后即可挑战。';
      return;
    }

    qrBlock.classList.remove('hidden');
    qrNote.textContent = '正在生成二维码…';
    const base64 = await getToyQrCode(`index.html?c=${target.tenths}`);
    if (token !== qrToken || !isOpen()) {
      return;
    }
    if (!base64) {
      qrBlock.classList.add('hidden');
      hintElement.textContent = '二维码暂不可用，复制链接发给好友即可。';
      return;
    }
    qrImage.src = base64;
    qrNote.textContent = '扫码打开游戏，挑战这个成绩。';
  }

  async function share(): Promise<void> {
    if (sharing) {
      return;
    }
    const target = shareTarget();
    const currentEpoch = epoch;
    const api = getToy();

    if (api?.share && isToyPage()) {
      sharing = true;
      options.shareButton.disabled = true;
      const shared = await shareToyPage(target.path);
      sharing = false;
      options.shareButton.disabled = false;
      if (currentEpoch !== epoch) {
        return;
      }
      if (shared) {
        flash(options.shareButton, '已分享');
      } else {
        void openOverlay(target);
      }
      return;
    }

    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: '京沪神车 1462',
          text: `我在《京沪神车 1462》跑了 ${formatDuration(
            target.tenths / 10,
          )}，来挑战！`,
          url: target.url,
        });
        if (currentEpoch === epoch) {
          flash(options.shareButton, '已分享');
        }
      } catch (error) {
        const aborted =
          error instanceof Error && error.name === 'AbortError';
        if (!aborted && currentEpoch === epoch) {
          void openOverlay(target);
        }
      }
      return;
    }

    void openOverlay(target);
  }

  async function savePoster(button: HTMLButtonElement): Promise<void> {
    if (saving) {
      return;
    }
    saving = true;
    const currentEpoch = epoch;
    button.disabled = true;
    try {
      const dataUrl = renderResultImage(options.getPoster());
      if (!dataUrl) {
        if (currentEpoch === epoch) {
          flash(button, '生成失败');
        }
        return;
      }
      const totalSeconds = Math.floor(options.getTime());
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const fileName = `jinghu-1462-${minutes}m${String(seconds).padStart(
        2,
        '0',
      )}s.png`;

      const api = getToy();
      if (api?.saveImageToAlbum) {
        const canSave = api.isSupport
          ? await supportsToyAbility('saveImageToAlbum')
          : true;
        if (canSave) {
          const saved = await saveToyImage(dataUrl);
          if (currentEpoch === epoch) {
            flash(button, saved ? '已保存到相册' : '保存失败');
          }
          return;
        }
      }

      const downloaded = downloadDataUrl(dataUrl, fileName);
      if (currentEpoch === epoch) {
        flash(button, downloaded ? '已下载' : '保存失败');
      }
    } catch (error) {
      console.warn('[share] save failed', error);
      if (currentEpoch === epoch) {
        flash(button, '保存失败');
      }
    } finally {
      saving = false;
      button.disabled = false;
    }
  }

  options.shareButton.addEventListener('click', (event) => {
    event.stopPropagation();
    void share();
    options.shareButton.blur();
  });

  options.saveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    void savePoster(options.saveButton);
    options.saveButton.blur();
  });

  modalSaveButton.addEventListener('click', (event) => {
    event.stopPropagation();
    void savePoster(modalSaveButton);
    modalSaveButton.blur();
  });

  copyButton.addEventListener('click', (event) => {
    event.stopPropagation();
    void copyText(linkInput.value).then((copied) => {
      flash(copyButton, copied ? '已复制' : '复制失败');
    });
    copyButton.blur();
  });

  for (const button of [closeButton, closeBottomButton]) {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      closeOverlay();
      button.blur();
    });
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeOverlay();
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape' && isOpen()) {
      closeOverlay();
    }
  });

  function reset(): void {
    epoch += 1;
    sharing = false;
    saving = false;
    for (const timer of timers) {
      window.clearTimeout(timer);
    }
    timers.clear();
    for (const [button, label] of labels) {
      button.textContent = label;
    }
    for (const button of [
      options.shareButton,
      options.saveButton,
      modalSaveButton,
      copyButton,
      closeButton,
      closeBottomButton,
    ]) {
      button.disabled = false;
    }
    closeOverlay();
  }

  return { close: closeOverlay, isOpen, reset };
}
