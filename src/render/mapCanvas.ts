import { getTile } from '../wfc/tiles';
import type { WFCMap } from '../wfc/types';

/** Options for renderMap(). */
export interface MapRenderOptions {
  readonly cellSize?: number;
  readonly background?: string;
  readonly gridColor?: string;
  readonly showGrid?: boolean;
}

/** Fill color of a tile id. */
export function tileColor(tileId: string): string {
  return getTile(tileId).color;
}

/** Resize the canvas to fit the map and paint every tile plus the grid. */
export function renderMap(canvas: HTMLCanvasElement, map: WFCMap, options: MapRenderOptions = {}): void {
  const cellSize = options.cellSize ?? 16;
  canvas.width = map.width * cellSize;
  canvas.height = map.height * cellSize;
  const ctx = requireContext(canvas);
  paintBackground(ctx, canvas.width, canvas.height, options.background ?? '#0b0e14');
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      paintCell(ctx, x, y, cellSize, tileColor(map.tiles[y][x]));
    }
  }
  if (options.showGrid ?? true) {
    paintGrid(ctx, map.width, map.height, cellSize, options.gridColor ?? 'rgba(255,255,255,0.06)');
  }
}

/** Paint a single cell (used by the collapse animation). */
export function renderCell(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  tileId: string,
  cellSize = 16,
): void {
  const ctx = requireContext(canvas);
  paintCell(ctx, x, y, cellSize, tileColor(tileId));
}

/** Clear the canvas to the background color. */
export function clearCanvas(canvas: HTMLCanvasElement, background = '#0b0e14'): void {
  const ctx = requireContext(canvas);
  paintBackground(ctx, canvas.width, canvas.height, background);
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('could not acquire a 2d rendering context');
  return ctx;
}

function paintBackground(ctx: CanvasRenderingContext2D, width: number, height: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
}

function paintCell(ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
}

function paintGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cellSize: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x++) {
    ctx.moveTo(x * cellSize + 0.5, 0);
    ctx.lineTo(x * cellSize + 0.5, height * cellSize);
  }
  for (let y = 0; y <= height; y++) {
    ctx.moveTo(0, y * cellSize + 0.5);
    ctx.lineTo(width * cellSize, y * cellSize + 0.5);
  }
  ctx.stroke();
}
