import { CollapseAnimator, formatHud } from './render/animator';
import type { HighlightCell } from './render/animator';
import { exportMapPng, sanitizeSeed } from './render/export';
import {
  clearCanvas,
  renderCell,
  renderHighlight,
  renderHud,
  renderMap,
} from './render/mapCanvas';

/** Map dimensions in tiles and on-screen cell size in px. */
const MAP_WIDTH = 56;
const MAP_HEIGHT = 34;
const CELL_SIZE = 14;
/** Collapse steps executed per animation frame. */
const STEPS_PER_FRAME = 6;
/** Default seed when the URL has no ?seed= parameter. */
const DEFAULT_SEED = 1337;
/** Height in px of the entropy HUD strip drawn below the map. */
const HUD_HEIGHT = 26;

/** Read the seed from the ?seed= URL parameter, falling back to the default. */
function readSeed(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return DEFAULT_SEED;
  return sanitizeSeed(raw) ?? DEFAULT_SEED;
}

/** Look up a required element by id, throwing when it is missing. */
function requireElement<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing element #${id}`);
  return el as T;
}

/** Wire the control bar to a restartable tile-by-tile collapse animation. */
function main(): void {
  const canvas = requireElement<HTMLCanvasElement>('map');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('#map is not a <canvas>');
  const seedLabel = document.getElementById('seed');
  const seedInput = requireElement<HTMLInputElement>('seed-input');
  const regenerateButton = requireElement<HTMLButtonElement>('regenerate');
  const exportButton = requireElement<HTMLButtonElement>('export-png');

  canvas.width = MAP_WIDTH * CELL_SIZE;
  canvas.height = MAP_HEIGHT * CELL_SIZE + HUD_HEIGHT;

  let rafId = 0;
  let animator: CollapseAnimator | null = null;
  let currentSeed = 0;
  let prevHighlight: HighlightCell | null = null;

  function drawHud(anim: CollapseAnimator): void {
    renderHud(canvas, formatHud(anim.snapshot()), {
      x: 0,
      y: MAP_HEIGHT * CELL_SIZE,
      width: canvas.width,
      height: HUD_HEIGHT,
    });
  }

  function frame(): void {
    const anim = animator;
    if (anim === null) return;
    let snap = anim.snapshot();
    for (let i = 0; i < STEPS_PER_FRAME && !anim.isDone(); i++) {
      snap = anim.step();
      if (snap.lastStepRestarted) {
        // Contradiction: wipe the canvas and start the fresh grid from scratch.
        clearCanvas(canvas);
        prevHighlight = null;
        continue;
      }
      const h = snap.highlight;
      if (h !== null) renderCell(canvas, h.x, h.y, h.tile, CELL_SIZE);
    }
    // Repaint last frame's highlighted cell so only the newest one stays outlined.
    if (prevHighlight !== null) {
      const cur = snap.highlight;
      const moved = cur === null || cur.x !== prevHighlight.x || cur.y !== prevHighlight.y;
      if (moved) {
        const tile = anim.tileAt(prevHighlight.x, prevHighlight.y) ?? prevHighlight.tile;
        renderCell(canvas, prevHighlight.x, prevHighlight.y, tile, CELL_SIZE);
      }
    }
    if (snap.highlight !== null) {
      renderHighlight(canvas, snap.highlight.x, snap.highlight.y, CELL_SIZE);
      prevHighlight = snap.highlight;
    }
    drawHud(anim);
    if (anim.isDone()) {
      renderMap(canvas, anim.result(), { cellSize: CELL_SIZE, fitCanvas: false });
      drawHud(anim);
      exportButton.disabled = false;
      return; // stop the requestAnimationFrame loop
    }
    rafId = window.requestAnimationFrame(frame);
  }

  /** Cancel any running animation and collapse a fresh map for `seed`. */
  function startCollapse(seed: number): void {
    window.cancelAnimationFrame(rafId);
    currentSeed = seed >>> 0;
    if (seedLabel) seedLabel.textContent = String(currentSeed);
    seedInput.value = String(currentSeed);
    seedInput.classList.remove('invalid');
    exportButton.disabled = true;
    clearCanvas(canvas);
    animator = new CollapseAnimator({ width: MAP_WIDTH, height: MAP_HEIGHT, seed: currentSeed });
    prevHighlight = null;
    rafId = window.requestAnimationFrame(frame);
  }

  /** Read the seed input, sync the ?seed= URL param and restart the collapse. */
  function regenerate(): void {
    const parsed = sanitizeSeed(seedInput.value);
    if (parsed === null) {
      seedInput.classList.add('invalid');
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(parsed));
    window.history.replaceState(null, '', url.toString());
    startCollapse(parsed);
  }

  regenerateButton.addEventListener('click', regenerate);
  seedInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') regenerate();
  });
  exportButton.addEventListener('click', () => {
    if (animator === null || !animator.isDone()) return;
    exportMapPng(canvas, currentSeed);
  });

  startCollapse(readSeed());
}

main();
