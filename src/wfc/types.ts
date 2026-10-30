/**
 * Shared types for the Wave Function Collapse solver.
 */

/** Cardinal directions used for tile sockets and grid traversal. */
export type Direction = 'n' | 'e' | 's' | 'w';

/**
 * A socket label on one side of a tile. Two orthogonally adjacent tiles are
 * compatible when the sockets that touch form an allowed pair (see tiles.ts).
 */
export type SocketId = string;

/** Static definition of a WFC tile. */
export interface TileDef {
  /** Unique tile identifier, e.g. "floor". */
  readonly id: string;
  /** Socket label on each side of the tile. */
  readonly sockets: Record<Direction, SocketId>;
  /** Relative sampling weight used when collapsing a cell. */
  readonly weight: number;
  /** Fill color used by the canvas renderer. */
  readonly color: string;
}

/** A single grid cell while the solver is running. */
export interface WFCCell {
  readonly x: number;
  readonly y: number;
  /** Tile ids still possible for this cell. */
  options: Set<string>;
  /** Tile id once the cell has been observed, otherwise null. */
  collapsed: string | null;
}

/** Immutable result of a finished WFC run. */
export interface WFCMap {
  readonly width: number;
  readonly height: number;
  /** Row-major grid: tiles[y][x] is the tile id at (x, y). */
  readonly tiles: string[][];
  readonly seed: number;
  /** How many times the solver restarted after a contradiction. */
  readonly restarts: number;
}

/** Options accepted by the solver and by generateMap. */
export interface WFCOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  /** Maximum contradiction restarts before giving up. Defaults to 500. */
  readonly maxRestarts?: number;
  /** Custom tile set. Defaults to the built-in dungeon tiles. */
  readonly tiles?: readonly TileDef[];
}
