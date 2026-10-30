import { clearCanvas, renderCell, renderMap } from './render/mapCanvas';
import { WFCSolver } from './wfc/solver';

/** Map dimensions in tiles and on-screen cell size in px. */
const MAP_WIDTH = 56;
const MAP_HEIGHT = 34;
const CELL_SIZE = 14;
/** Collapse steps executed per animation frame. */
const STEPS_PER_FRAME = 6;
/** Default seed when the URL has no ?seed= parameter. */
const DEFAULT_SEED = 1337;

function readSeed(): number {
  const raw = new URLSearchParams(window.location.search).get('seed');
  if (raw === null) return DEFAULT_SEED;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed >>> 0 : DEFAULT_SEED;
}

/** Generate a seeded map and animate the collapse tile by tile. */
function main(): void {
  const canvasEl = document.getElementById('map');
  if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('missing <canvas id="map">');
  const canvas: HTMLCanvasElement = canvasEl;
  const seed = readSeed();
  const seedLabel = document.getElementById('seed');
  if (seedLabel) seedLabel.textContent = String(seed);

  canvas.width = MAP_WIDTH * CELL_SIZE;
  canvas.height = MAP_HEIGHT * CELL_SIZE;
  clearCanvas(canvas);

  const solver = new WFCSolver({ width: MAP_WIDTH, height: MAP_HEIGHT, seed });

  function frame(): void {
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      const info = solver.step();
      if (info === null) {
        renderMap(canvas, solver.result(), { cellSize: CELL_SIZE });
        return;
      }
      if (info.restarted) {
        clearCanvas(canvas);
        continue;
      }
      renderCell(canvas, info.x, info.y, info.tile, CELL_SIZE);
    }
    if (solver.isDone()) {
      renderMap(canvas, solver.result(), { cellSize: CELL_SIZE });
      return;
    }
    window.requestAnimationFrame(frame);
  }
  window.requestAnimationFrame(frame);
}

main();
