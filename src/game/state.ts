import { Rng } from '../wfc/rng';
import { generateMap } from '../wfc/solver';
import { DELTAS, isWalkableTile } from '../wfc/tiles';
import type { WFCMap } from '../wfc/types';
import type { Direction, GameState, Player } from './types';

/** Default dungeon width in tiles, matching the dev page. */
export const DEFAULT_MAP_WIDTH = 56;
/** Default dungeon height in tiles, matching the dev page. */
export const DEFAULT_MAP_HEIGHT = 34;
/** Hit points a fresh player starts with. */
export const PLAYER_MAX_HP = 20;

/**
 * Salt mixed into the seed before picking the spawn point, so the spawn RNG
 * stream is independent of the solver's RNG stream for the same seed.
 */
const SPAWN_SALT = 0x9e3779b9;

/**
 * Create a new game for `seed`: collapse a deterministic WFC dungeon and spawn
 * the player on a seeded-random walkable tile. The same seed always yields the
 * same dungeon and the same spawn point.
 */
export function newGame(seed: number, width = DEFAULT_MAP_WIDTH, height = DEFAULT_MAP_HEIGHT): GameState {
  const normalizedSeed = seed >>> 0;
  const map = generateMap({ width, height, seed: normalizedSeed });
  const spawn = pickSpawn(map, normalizedSeed);
  const player: Player = { x: spawn.x, y: spawn.y, hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP };
  return { seed: normalizedSeed, map, player, turn: 0, status: 'playing' };
}

/** True when (x, y) is inside the map and the tile there is walkable. */
export function isWalkable(map: WFCMap, x: number, y: number): boolean {
  if (!Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;
  return isWalkableTile(map.tiles[y][x]);
}

/**
 * Attempt to move the player by (dx, dy). Only single cardinal steps are
 * legal; anything else (zero, diagonal, long-jump or fractional deltas) is a
 * no-op. Moves into walls, out of bounds, or after the game has ended return
 * the state unchanged (same reference) and do not advance the turn. A
 * successful move returns a new immutable state with the updated position and
 * turn + 1.
 */
export function movePlayer(state: GameState, dx: number, dy: number): GameState {
  if (state.status !== 'playing') return state;
  if (!isCardinalStep(dx, dy)) return state;
  const nx = state.player.x + dx;
  const ny = state.player.y + dy;
  if (!isWalkable(state.map, nx, ny)) return state;
  return {
    ...state,
    player: { ...state.player, x: nx, y: ny },
    turn: state.turn + 1,
  };
}

/** Move the player one tile in a cardinal `direction`. */
export function moveInDirection(state: GameState, direction: Direction): GameState {
  const { dx, dy } = DELTAS[direction];
  return movePlayer(state, dx, dy);
}

/** Pick a seeded-random walkable tile to spawn the player on. */
function pickSpawn(map: WFCMap, seed: number): { x: number; y: number } {
  const walkable: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkableTile(map.tiles[y][x])) walkable.push({ x, y });
    }
  }
  if (walkable.length === 0) {
    throw new Error(`seed ${seed} produced a dungeon with no walkable tiles`);
  }
  const rng = new Rng((seed ^ SPAWN_SALT) >>> 0);
  return rng.pick(walkable);
}

/** True for a single cardinal step: exactly one of dx/dy is ±1, the other 0. */
function isCardinalStep(dx: number, dy: number): boolean {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) return false;
  if (dx === 0 && dy === 0) return false;
  if (dx !== 0 && dy !== 0) return false;
  return Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
}
