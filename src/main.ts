import { CollapseAnimator, formatHud } from './render/animator';
import type { HighlightCell } from './render/animator';
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

function readSeed(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return DEFAULT_SEED;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed >>> 0 : DEFAULT_SEED;
}

/** Animate a seeded collapse tile by tile, then freeze on the finished map. */
function main(): void {
  const canvasEl = document.getElementById('map');
  if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('missing <canvas id="map">');
  const canvas: HTMLCanvasElement = canvasEl;
  const seed = readSeed();
  const seedLabel = document.getElementById('seed');
  if (seedLabel) seedLabel.textContent = String(seed);

  canvas.width = MAP_WIDTH * CELL_SIZE;
  canvas.height = MAP_HEIGHT * CELL_SIZE + HUD_HEIGHT;
  clearCanvas(canvas);

  const animator = new CollapseAnimator({ width: MAP_WIDTH, height: MAP_HEIGHT, seed });
  let prevHighlight: HighlightCell | null = null;

  function drawHud(): void {
    renderHud(canvas, formatHud(animator.snapshot()), {
      x: 0,
      y: MAP_HEIGHT * CELL_SIZE,
      width: canvas.width,
      height: HUD_HEIGHT,
    });
  }

  function frame(): void {
    let snap = animator.snapshot();
    for (let i = 0; i < STEPS_PER_FRAME && !animator.isDone(); i++) {
      snap = animator.step();
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
        const tile = animator.tileAt(prevHighlight.x, prevHighlight.y) ?? prevHighlight.tile;
        renderCell(canvas, prevHighlight.x, prevHighlight.y, tile, CELL_SIZE);
      }
    }
    if (snap.highlight !== null) {
      renderHighlight(canvas, snap.highlight.x, snap.highlight.y, CELL_SIZE);
      prevHighlight = snap.highlight;
    }
    drawHud();
    if (animator.isDone()) {
      renderMap(canvas, animator.result(), { cellSize: CELL_SIZE, fitCanvas: false });
      drawHud();
      return; // stop the requestAnimationFrame loop
    }
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}

main();
