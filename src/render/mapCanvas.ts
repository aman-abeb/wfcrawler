import { getTile } from '../wfc/tiles';
import type { WFCMap } from '../wfc/types';

/** Default background color behind the map and the HUD strip. */
export const DEFAULT_BACKGROUND = '#0b0e14';
/**
 * Default grid line color. Opaque on purpose: the collapse animation strokes
 * each cell's border as the cell is painted, and an opaque color makes the
 * overlapping strokes invisible instead of accumulating alpha.
 */
export const DEFAULT_GRID_COLOR = '#1a2030';
/** Default outline color for the cell observed in the current step. */
export const DEFAULT_HIGHLIGHT_COLOR = '#ffd166';
/** Default HUD text color. */
export const DEFAULT_HUD_COLOR = '#8b93a7';
/** Default HUD font. */
export const DEFAULT_HUD_FONT = '12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/** Options shared by every per-cell drawing helper. */
export interface CellRenderOptions {
  /** Pixel offset of the grid's left edge on the canvas. */
  readonly originX?: number;
  /** Pixel offset of the grid's top edge on the canvas. */
  readonly originY?: number;
  /** Grid line color drawn around painted cells. */
  readonly gridColor?: string;
}

/** Options for renderMap(). */
export interface MapRenderOptions extends CellRenderOptions {
  readonly cellSize?: number;
  readonly background?: string;
  readonly showGrid?: boolean;
  /** When true (default) the canvas is resized to fit the map exactly. */
  readonly fitCanvas?: boolean;
}

/** Options for renderHighlight(). */
export interface HighlightOptions extends CellRenderOptions {
  readonly color?: string;
  readonly lineWidth?: number;
  /** Gap in px between the cell edge and the highlight outline. */
  readonly inset?: number;
}

/** Options for renderHud(). */
export interface HudOptions {
  readonly x?: number;
  readonly y?: number;
  /** Defaults to the canvas width minus x. */
  readonly width?: number;
  /** Defaults to the height needed for all lines. */
  readonly height?: number;
  /** Opaque background that erases the previous frame's text. */
  readonly background?: string;
  readonly color?: string;
  readonly font?: string;
  readonly padding?: number;
  readonly lineHeight?: number;
}

/** Fill color of a tile id. */
export function tileColor(tileId: string): string {
  return getTile(tileId).color;
}

/**
 * Paint every tile of a finished map plus the grid overlay. Resizes the canvas
 * to fit the map exactly unless `fitCanvas` is false (used when a HUD strip
 * lives below the map on the same canvas).
 */
export function renderMap(canvas: HTMLCanvasElement, map: WFCMap, options: MapRenderOptions = {}): void {
  const cellSize = options.cellSize ?? 16;
  const originX = options.originX ?? 0;
  const originY = options.originY ?? 0;
  if (options.fitCanvas ?? true) {
    canvas.width = originX + map.width * cellSize;
    canvas.height = originY + map.height * cellSize;
  }
  const ctx = requireContext(canvas);
  paintBackground(ctx, canvas.width, canvas.height, options.background ?? DEFAULT_BACKGROUND);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      paintCell(ctx, originX + x * cellSize, originY + y * cellSize, cellSize, tileColor(map.tiles[y][x]));
    }
  }
  if (options.showGrid ?? true) {
    paintGrid(ctx, originX, originY, map.width, map.height, cellSize, options.gridColor ?? DEFAULT_GRID_COLOR);
  }
}

/** Paint a single cell plus its grid border (used by the collapse animation). */
export function renderCell(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  tileId: string,
  cellSize = 16,
  options: CellRenderOptions = {},
): void {
  const ctx = requireContext(canvas);
  const px = (options.originX ?? 0) + x * cellSize;
  const py = (options.originY ?? 0) + y * cellSize;
  paintCell(ctx, px, py, cellSize, tileColor(tileId));
  paintCellBorder(ctx, px, py, cellSize, options.gridColor ?? DEFAULT_GRID_COLOR);
}

/** Clear the whole canvas to the background color. */
export function clearCanvas(canvas: HTMLCanvasElement, background = DEFAULT_BACKGROUND): void {
  const ctx = requireContext(canvas);
  paintBackground(ctx, canvas.width, canvas.height, background);
}

/** Draw the highlight outline and tint on the cell observed in the current step. */
export function renderHighlight(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  cellSize: number,
  options: HighlightOptions = {},
): void {
  const ctx = requireContext(canvas);
  const px = (options.originX ?? 0) + x * cellSize;
  const py = (options.originY ?? 0) + y * cellSize;
  const inset = options.inset ?? 1;
  const color = options.color ?? DEFAULT_HIGHLIGHT_COLOR;
  const lineWidth = options.lineWidth ?? 2;
  const inner = cellSize - inset * 2;
  ctx.fillStyle = withAlpha(color, 0.22);
  ctx.fillRect(px + inset, py + inset, inner, inner);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(px + inset + lineWidth / 2, py + inset + lineWidth / 2, inner - lineWidth, inner - lineWidth);
}

/**
 * Draw a text overlay (the entropy HUD). The background box is opaque and is
 * repainted on every call, so successive animation frames never smear old text.
 */
export function renderHud(canvas: HTMLCanvasElement, lines: readonly string[], options: HudOptions = {}): void {
  const ctx = requireContext(canvas);
  const x = options.x ?? 0;
  const y = options.y ?? 0;
  const padding = options.padding ?? 6;
  const lineHeight = options.lineHeight ?? 14;
  const width = options.width ?? canvas.width - x;
  const height = options.height ?? lines.length * lineHeight + padding * 2;
  ctx.fillStyle = options.background ?? DEFAULT_BACKGROUND;
  ctx.fillRect(x, y, width, height);
  ctx.font = options.font ?? DEFAULT_HUD_FONT;
  ctx.fillStyle = options.color ?? DEFAULT_HUD_COLOR;
  ctx.textBaseline = 'top';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + padding, y + padding + i * lineHeight);
  }
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

function paintCell(ctx: CanvasRenderingContext2D, px: number, py: number, cellSize: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(px, py, cellSize, cellSize);
}

function paintCellBorder(ctx: CanvasRenderingContext2D, px: number, py: number, cellSize: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, cellSize - 1, cellSize - 1);
}

function paintGrid(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  width: number,
  height: number,
  cellSize: number,
  color: string,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= width; x++) {
    const px = originX + x * cellSize + 0.5;
    ctx.moveTo(px, originY);
    ctx.lineTo(px, originY + height * cellSize);
  }
  for (let y = 0; y <= height; y++) {
    const py = originY + y * cellSize + 0.5;
    ctx.moveTo(originX, py);
    ctx.lineTo(originX + width * cellSize, py);
  }
  ctx.stroke();
}

/** Convert a #rrggbb color to an rgba() string with the given alpha. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (match === null) return color;
  const value = Number.parseInt(match[1], 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
