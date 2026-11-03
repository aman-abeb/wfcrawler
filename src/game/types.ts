import type { Direction as GridDirection, WFCMap } from '../wfc/types';

/** Lifecycle status of a run: 'playing' until the player wins or dies. */
export type GameStatus = 'playing' | 'won' | 'lost';

/** Cardinal movement input, matching the WFC socket directions. */
export type Direction = GridDirection;

/** Anything with hit points that can take damage in melee combat. */
export interface Combatant {
  /** Current hit points; the combatant is dead at 0. */
  readonly hp: number;
  /** Maximum hit points. */
  readonly maxHp: number;
}

/** The player actor. */
export interface Player extends Combatant {
  readonly x: number;
  readonly y: number;
}

/**
 * A monster actor spawned on a walkable dungeon tile. Monsters are headless:
 * all of their behaviour lives in monsters.ts and is driven by the seeded
 * rngState stored on the game state, so a run replays identically from its seed.
 */
export interface Monster extends Combatant {
  /** Unique id within one game, assigned in spawn order. */
  readonly id: number;
  readonly x: number;
  readonly y: number;
  /** Maximum damage of one hit; damage rolls uniformly in 1..attack. */
  readonly attack: number;
  /** Distance in tiles at which the monster notices and chases the player. */
  readonly aggroRange: number;
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
