import { TOTAL_LEVELS, TOTAL_WAVES } from './config';
import type { TowerKind } from './config';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

/** DOM HUD: top bar, build bar, selection panel, overlays. */
export class UI {
  goldNum = el<HTMLSpanElement>('gold-num');
  livesNum = el<HTMLSpanElement>('lives-num');
  levelNum = el<HTMLSpanElement>('level-num');
  waveNum = el<HTMLSpanElement>('wave-num');
  leftNum = el<HTMLSpanElement>('left-num');
  toastEl = el<HTMLDivElement>('toast');
  btnWave = el<HTMLButtonElement>('btn-wave');
  btnSpeed = el<HTMLButtonElement>('btn-speed');
  overlayStart = el<HTMLDivElement>('overlay-start');
  overlayEnd = el<HTMLDivElement>('overlay-end');
  endTitle = el<HTMLHeadingElement>('end-title');
  endSub = el<HTMLParagraphElement>('end-sub');
  endWaves = el<HTMLSpanElement>('end-waves');
  endGold = el<HTMLSpanElement>('end-gold');
  selPanel = el<HTMLDivElement>('sel-panel');
  selTitle = el<HTMLDivElement>('sel-title');
  selDesc = el<HTMLDivElement>('sel-desc');
  btnUpgrade = el<HTMLButtonElement>('btn-upgrade');
  btnSell = el<HTMLButtonElement>('btn-sell');
  cards: HTMLButtonElement[] = [];

  onSelectBuild: (kind: TowerKind | null) => void = () => {};
  onStartWave: () => void = () => {};
  onSpeed: () => void = () => {};
  onStart: () => void = () => {};
  onAgain: () => void = () => {};
  onNext: () => void = () => {};
  onUpgrade: () => void = () => {};
  onSell: () => void = () => {};
  onCloseSel: () => void = () => {};

  selected: TowerKind | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.cards = Array.from(document.querySelectorAll<HTMLButtonElement>('#hud-build .card'));
    for (const card of this.cards) {
      card.addEventListener('click', () => {
        const kind = card.dataset.build as TowerKind;
        this.setSelected(this.selected === kind ? null : kind);
        this.onSelectBuild(this.selected);
      });
    }
    this.btnWave.addEventListener('click', () => this.onStartWave());
    this.btnSpeed.addEventListener('click', () => this.onSpeed());
    el<HTMLButtonElement>('btn-start').addEventListener('click', () => this.onStart());
    el<HTMLButtonElement>('btn-again').addEventListener('click', () => this.onAgain());
    el<HTMLButtonElement>('btn-next').addEventListener('click', () => this.onNext());
    this.btnUpgrade.addEventListener('click', () => this.onUpgrade());
    this.btnSell.addEventListener('click', () => this.onSell());
    el<HTMLButtonElement>('btn-close').addEventListener('click', () => this.onCloseSel());
  }

  setSelected(kind: TowerKind | null): void {
    this.selected = kind;
    for (const card of this.cards) {
      card.classList.toggle('selected', card.dataset.build === kind);
    }
  }

  refreshAfford(gold: number, costs: Record<string, number>): void {
    for (const card of this.cards) {
      const kind = card.dataset.build as string;
      card.classList.toggle('cant', (costs[kind] ?? 0) > gold);
    }
  }

  setGold(n: number): void {
    this.goldNum.textContent = String(Math.floor(n));
    this.goldNum.classList.remove('bump');
    void this.goldNum.offsetWidth;
    this.goldNum.classList.add('bump');
  }

  setLives(n: number): void {
    this.livesNum.textContent = String(Math.max(0, Math.ceil(n)));
  }

  setWave(wave: number, total: number = TOTAL_WAVES): void {
    this.waveNum.textContent = `${wave}/${total}`;
  }

  setLevel(level: number, total: number = TOTAL_LEVELS): void {
    this.levelNum.textContent = `${level}/${total}`;
  }

  setLeft(n: number | null, spawning: boolean): void {
    this.leftNum.textContent = n === null ? '–' : String(n);
    this.btnWave.disabled = spawning;
    this.btnWave.textContent = spawning ? 'Wave…' : waveLabel(n);
  }

  setSpeedLabel(label: string): void {
    this.btnSpeed.textContent = label;
  }

  setWaveButton(label: string, disabled: boolean): void {
    this.btnWave.textContent = label;
    this.btnWave.disabled = disabled;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), 1800);
  }

  showSelection(title: string, desc: string, upgradeLabel: string, canUpgrade: boolean): void {
    this.selPanel.classList.remove('hidden');
    this.selTitle.textContent = title;
    this.selDesc.textContent = desc;
    this.btnUpgrade.textContent = upgradeLabel;
    this.btnUpgrade.disabled = !canUpgrade;
  }

  hideSelection(): void {
    this.selPanel.classList.add('hidden');
  }

  showPlaying(): void {
    this.overlayStart.classList.add('hidden');
    this.overlayEnd.classList.add('hidden');
  }

  showStart(): void {
    this.overlayStart.classList.remove('hidden');
    this.overlayEnd.classList.add('hidden');
  }

  showEnd(win: boolean, waves: string, gold: number, sub: string, hasNext: boolean): void {
    this.endTitle.textContent = win ? (hasNext ? 'Lane Cleared!' : 'Victory!') : 'Keep Has Fallen';
    this.endSub.textContent = sub;
    this.endWaves.textContent = waves;
    this.endGold.textContent = String(Math.floor(gold));
    el<HTMLButtonElement>('btn-next').classList.toggle('hidden', !hasNext);
    el<HTMLButtonElement>('btn-again').textContent = hasNext ? 'Replay Lane' : win ? 'Play Again' : 'Retry Lane';
    this.overlayEnd.classList.remove('hidden');
  }
}

function waveLabel(left: number | null): string {
  if (left === null || left === 0) return 'Start wave';
  return `Start wave (+${25}g)`;
}
