import { describe, expect, it } from 'vitest';
import { Rng } from '../wfc/rng';
import { generateMap } from '../wfc/solver';
import { isWalkableTile } from '../wfc/tiles';
import type { WFCMap } from '../wfc/types';
import { isWalkable, moveInDirection, movePlayer, newGame, PLAYER_MAX_HP } from './state';
import type { GameState } from './types';

const SEED = 42;
const WIDTH = 32;
const HEIGHT = 20;

/** 5x5 hand-made map: solid wall border, 3x3 open floor interior. */
const OPEN_ROWS: string[][] = [
  ['wall', 'wall', 'wall', 'wall', 'wall'],
  ['wall', 'floor', 'floor', 'floor', 'wall'],
  ['wall', 'floor', 'floor', 'floor', 'wall'],
  ['wall', 'floor', 'floor', 'floor', 'wall'],
  ['wall', 'wall', 'wall', 'wall', 'wall'],
];

function openMap(): WFCMap {
  return {
    width: OPEN_ROWS[0].length,
    height: OPEN_ROWS.length,
    tiles: OPEN_ROWS.map((row) => [...row]),
    seed: 0,
    restarts: 0,
  };
}

/** Build a hand-made game state with the player at (x, y). */
function handState(x: number, y: number, overrides: Partial<GameState> = {}): GameState {
  return {
    seed: 0,
    map: openMap(),
    player: { x, y, hp: 10, maxHp: 10 },
    turn: 0,
    status: 'playing',
    ...overrides,
  };
}

describe('newGame', () => {
  it('produces the identical state for the same seed', () => {
    const a = newGame(SEED, WIDTH, HEIGHT);
    const b = newGame(SEED, WIDTH, HEIGHT);
    expect(a).toEqual(b);
    expect(a.map.tiles).toEqual(b.map.tiles);
    expect(a.player).toEqual(b.player);
  });

  it('builds its dungeon with the batch WFC generator for the seed', () => {
    const state = newGame(SEED, WIDTH, HEIGHT);
    const batch = generateMap({ width: WIDTH, height: HEIGHT, seed: SEED });
    expect(state.map.tiles).toEqual(batch.tiles);
    expect(state.map.restarts).toBe(batch.restarts);
    expect(state.seed).toBe(SEED);
  });

  it('normalizes seeds to uint32', () => {
    const wrapped = newGame(4294967296 + 1, WIDTH, HEIGHT);
    expect(wrapped.seed).toBe(1);
    expect(wrapped).toEqual(newGame(1, WIDTH, HEIGHT));
  });

  it('starts playing at turn 0 with full HP', () => {
    const state = newGame(SEED, WIDTH, HEIGHT);
    expect(state.status).toBe('playing');
    expect(state.turn).toBe(0);
    expect(state.player.hp).toBe(PLAYER_MAX_HP);
    expect(state.player.maxHp).toBe(PLAYER_MAX_HP);
  });

  it('spawns on a walkable, in-bounds tile for many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const state = newGame(seed, WIDTH, HEIGHT);
      const { x, y } = state.player;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(HEIGHT);
      expect(isWalkable(state.map, x, y)).toBe(true);
      expect(isWalkableTile(state.map.tiles[y][x])).toBe(true);
    }
  });

  it('produces different dungeons for different seeds', () => {
    expect(newGame(1, WIDTH, HEIGHT).map.tiles).not.toEqual(newGame(2, WIDTH, HEIGHT).map.tiles);
  });

  it('rejects invalid dimensions', () => {
    expect(() => newGame(1, 1, 5)).toThrow();
    expect(() => newGame(1, 5, 0)).toThrow();
    expect(() => newGame(1, 2.5, 5)).toThrow();
  });
});

describe('isWalkableTile', () => {
  it('treats wall as solid and every other built-in tile as walkable', () => {
    expect(isWalkableTile('wall')).toBe(false);
    for (const id of ['floor', 'room', 'corridorH', 'corridorV', 'doorH', 'doorV']) {
      expect(isWalkableTile(id)).toBe(true);
    }
  });
});

describe('isWalkable', () => {
  it('is true only for in-bounds walkable tiles', () => {
    const map = openMap();
    expect(isWalkable(map, 2, 2)).toBe(true);
    expect(isWalkable(map, 0, 0)).toBe(false); // wall
    expect(isWalkable(map, -1, 2)).toBe(false);
    expect(isWalkable(map, 2, -1)).toBe(false);
    expect(isWalkable(map, 5, 2)).toBe(false);
    expect(isWalkable(map, 2, 5)).toBe(false);
    expect(isWalkable(map, 2.5, 2)).toBe(false);
  });
});

describe('movePlayer', () => {
  it('applies a valid move: new position, turn + 1, new state object', () => {
    const state = handState(2, 2);
    const next = movePlayer(state, 1, 0);
    expect(next).not.toBe(state);
    expect(next.player).toEqual({ x: 3, y: 2, hp: 10, maxHp: 10 });
    expect(next.turn).toBe(1);
    expect(next.status).toBe('playing');
    expect(next.map).toBe(state.map);
    expect(next.seed).toBe(state.seed);
  });

  it('does not mutate the original state', () => {
    const state = handState(2, 2);
    const before = structuredClone(state);
    movePlayer(state, 1, 0);
    movePlayer(state, 0, 1);
    movePlayer(state, -1, 0);
    expect(state).toEqual(before);
  });

  it('counts exactly one turn per successful move over a chain', () => {
    let state = handState(1, 1);
    const path: ReadonlyArray<readonly [number, number]> = [
      [1, 0],
      [1, 0],
      [0, 1],
      [-1, 0],
      [-1, 0],
      [0, -1],
    ];
    for (const [dx, dy] of path) state = movePlayer(state, dx, dy);
    expect(state.turn).toBe(path.length);
    expect(state.player.x).toBe(1);
    expect(state.player.y).toBe(1);
  });

  it('treats moves into walls as no-ops that keep the same reference and turn', () => {
    const state = handState(1, 1); // west and north neighbours are walls
    for (const [dx, dy] of [[-1, 0], [0, -1]] as const) {
      const next = movePlayer(state, dx, dy);
      expect(next).toBe(state);
      expect(next.turn).toBe(0);
      expect(next.player).toEqual({ x: 1, y: 1, hp: 10, maxHp: 10 });
    }
  });

  it('treats out-of-bounds moves as no-ops', () => {
    const state = handState(0, 0);
    for (const [dx, dy] of [[-1, 0], [0, -1]] as const) {
      expect(movePlayer(state, dx, dy)).toBe(state);
    }
  });

  it('ignores zero, diagonal, long-jump and non-integer deltas', () => {
    const state = handState(2, 2);
    expect(movePlayer(state, 0, 0)).toBe(state);
    expect(movePlayer(state, 1, 1)).toBe(state);
    expect(movePlayer(state, -1, -1)).toBe(state);
    expect(movePlayer(state, 2, 0)).toBe(state);
    expect(movePlayer(state, 0, -3)).toBe(state);
    expect(movePlayer(state, 0.5, 0)).toBe(state);
    expect(movePlayer(state, Number.NaN, 0)).toBe(state);
  });

  it('ignores moves once the game is won or lost', () => {
    for (const status of ['won', 'lost'] as const) {
      const state = handState(2, 2, { status });
      expect(movePlayer(state, 1, 0)).toBe(state);
      expect(movePlayer(state, 0, 1)).toBe(state);
    }
  });

  it('keeps a seeded random walk on walkable tiles and counts only successful moves', () => {
    let state = newGame(SEED, WIDTH, HEIGHT);
    const rng = new Rng(999);
    const deltas: ReadonlyArray<readonly [number, number]> = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    let successful = 0;
    for (let i = 0; i < 500; i++) {
      const [dx, dy] = deltas[rng.int(deltas.length)];
      const next = movePlayer(state, dx, dy);
      if (next !== state) {
        successful += 1;
        expect(isWalkable(state.map, next.player.x, next.player.y)).toBe(true);
      }
      state = next;
    }
    expect(state.turn).toBe(successful);
    expect(successful).toBeGreaterThan(0);
    expect(state.map.tiles).toEqual(newGame(SEED, WIDTH, HEIGHT).map.tiles);
  });
});

describe('moveInDirection', () => {
  it('moves one tile in each cardinal direction', () => {
    const base = handState(2, 2);
    expect(moveInDirection(base, 'e').player).toMatchObject({ x: 3, y: 2 });
    expect(moveInDirection(base, 'w').player).toMatchObject({ x: 1, y: 2 });
    expect(moveInDirection(base, 'n').player).toMatchObject({ x: 2, y: 1 });
    expect(moveInDirection(base, 's').player).toMatchObject({ x: 2, y: 3 });
  });

  it('is equivalent to movePlayer with the matching delta', () => {
    const base = handState(2, 2);
    expect(moveInDirection(base, 'e')).toEqual(movePlayer(base, 1, 0));
    expect(moveInDirection(base, 'w')).toEqual(movePlayer(base, -1, 0));
    expect(moveInDirection(base, 'n')).toEqual(movePlayer(base, 0, -1));
    expect(moveInDirection(base, 's')).toEqual(movePlayer(base, 0, 1));
  });

  it('is a no-op against walls and advances the turn on open floor', () => {
    const corner = handState(1, 1);
    expect(moveInDirection(corner, 'n')).toBe(corner);
    expect(moveInDirection(corner, 'w')).toBe(corner);
    const next = moveInDirection(corner, 'e');
    expect(next).not.toBe(corner);
    expect(next.turn).toBe(1);
  });
});
