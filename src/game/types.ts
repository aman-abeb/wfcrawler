import type { Direction as GridDirection, WFCMap } from '../wfc/types';

/** Lifecycle status of a run: 'playing' until the player wins or dies. */
export type GameStatus = 'playing' | 'won' | 'lost';

/** Cardinal movement input, matching the WFC socket directions. */
export type Direction = GridDirection;

/** The player actor. */
export interface Player {
  readonly x: number;
  readonly y: number;
  /** Current hit points; the run is lost at 0. */
  readonly hp: number;
  /** Maximum hit points. */
  readonly maxHp: number;
}

/**
 * Immutable snapshot of a whole game: the collapsed dungeon, the player, the
 * turn counter and the win/lose status. State transitions return a new object;
 * no-op moves return the same reference unchanged.
 */
export interface GameState {
  /** Normalized uint32 seed the dungeon was generated from. */
  readonly seed: number;
  /** The collapsed WFC dungeon (tiles[y][x] is the tile id at (x, y)). */
  readonly map: WFCMap;
  readonly player: Player;
  /** Number of successful player moves so far. */
  readonly turn: number;
  readonly status: GameStatus;
}
