import { describe, expect, it } from 'vitest';
import { mulberry32, Rng } from './rng';
import { generateMap, validateAdjacency, WFCSolver } from './solver';
import { DIRECTIONS, EDGE_SOCKET, getTile, socketsCompatible, TILES } from './tiles';
import type { SocketId } from './types';

const BASE = { width: 32, height: 20, seed: 42 } as const;

describe('rng', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 256; i++) expect(a()).toBe(b());
  });

  it('produces floats in [0, 1)', () => {
    const rng = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int() stays within [0, n)', () => {
    const rng = new Rng(99);
    for (let i = 0; i < 500; i++) {
      const v = rng.int(7);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(7);
    }
  });

  it('weighted() only returns listed items', () => {
    const rng = new Rng(5);
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 200; i++) {
      expect(items).toContain(rng.weighted(items, (s) => (s === 'a' ? 1 : 3)));
    }
  });

  it('weighted() rejects a zero total weight', () => {
    const rng = new Rng(5);
    expect(() => rng.weighted(['a'], () => 0)).toThrow();
  });
});

describe('tiles', () => {
  it('has unique ids and a socket on every side', () => {
    const ids = new Set<string>();
    for (const tile of TILES) {
      expect(ids.has(tile.id)).toBe(false);
      ids.add(tile.id);
      for (const dir of DIRECTIONS) expect(tile.sockets[dir]).toBeTruthy();
      expect(tile.weight).toBeGreaterThan(0);
    }
  });

  it('socket compatibility is symmetric for every socket pair in use', () => {
    const sockets = new Set<SocketId>([EDGE_SOCKET]);
    for (const tile of TILES) {
      for (const dir of DIRECTIONS) sockets.add(tile.sockets[dir]);
    }
    const all = [...sockets];
    for (const a of all) {
      for (const b of all) {
        expect(socketsCompatible(a, b)).toBe(socketsCompatible(b, a));
      }
    }
  });

  it('only wall may touch the map edge', () => {
    expect(socketsCompatible(EDGE_SOCKET, 'wall')).toBe(true);
    for (const tile of TILES) {
      for (const dir of DIRECTIONS) {
        if (tile.sockets[dir] !== 'wall') {
          expect(socketsCompatible(EDGE_SOCKET, tile.sockets[dir])).toBe(false);
        }
      }
    }
  });

  it('getTile throws for unknown ids', () => {
    expect(() => getTile('nope')).toThrow();
  });
});

describe('wfc solver', () => {
  it('same seed always produces the identical map', () => {
    const a = generateMap(BASE);
    const b = generateMap(BASE);
    expect(a.tiles).toEqual(b.tiles);
    expect(a.restarts).toBe(b.restarts);
  });

  it('different seeds produce different maps', () => {
    const a = generateMap({ ...BASE, seed: 1 });
    const b = generateMap({ ...BASE, seed: 2 });
    expect(a.tiles).not.toEqual(b.tiles);
  });

  it('collapses every cell to a known tile (no contradictions left)', () => {
    const map = generateMap(BASE);
    expect(map.tiles).toHaveLength(BASE.height);
    for (const row of map.tiles) {
      expect(row).toHaveLength(BASE.width);
      for (const id of row) expect(() => getTile(id)).not.toThrow();
    }
  });

  it('produces maps with zero adjacency violations across many seeds', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const map = generateMap({ ...BASE, seed });
      expect(validateAdjacency(map)).toEqual([]);
    }
  });

  it('keeps border cells walled against the map edge', () => {
    const map = generateMap(BASE);
    for (let x = 0; x < map.width; x++) {
      expect(socketsCompatible(getTile(map.tiles[0][x]).sockets.n, EDGE_SOCKET)).toBe(true);
      expect(socketsCompatible(getTile(map.tiles[map.height - 1][x]).sockets.s, EDGE_SOCKET)).toBe(true);
    }
    for (let y = 0; y < map.height; y++) {
      expect(socketsCompatible(getTile(map.tiles[y][0]).sockets.w, EDGE_SOCKET)).toBe(true);
      expect(socketsCompatible(getTile(map.tiles[y][map.width - 1]).sockets.e, EDGE_SOCKET)).toBe(true);
    }
  });

  it('stepped collapse matches the batch result for the same seed', () => {
    const solver = new WFCSolver(BASE);
    let collapses = 0;
    while (!solver.isDone()) {
      const info = solver.step();
      expect(info).not.toBeNull();
      if (info && !info.restarted) collapses++;
    }
    expect(collapses).toBe(BASE.width * BASE.height);
    expect(solver.result().tiles).toEqual(generateMap(BASE).tiles);
  });

  it('ends with exactly one option per cell', () => {
    const solver = new WFCSolver(BASE);
    while (!solver.isDone()) solver.step();
    for (let y = 0; y < BASE.height; y++) {
      for (let x = 0; x < BASE.width; x++) {
        expect(solver.entropyAt(x, y)).toBe(1);
      }
    }
  });

  it('rejects invalid dimensions', () => {
    expect(() => new WFCSolver({ ...BASE, width: 1 })).toThrow();
    expect(() => new WFCSolver({ ...BASE, height: 0 })).toThrow();
    expect(() => new WFCSolver({ ...BASE, width: 2.5 })).toThrow();
  });

  it('result() throws before the grid is fully collapsed', () => {
    const solver = new WFCSolver(BASE);
    expect(() => solver.result()).toThrow();
  });

  it('validateAdjacency flags broken adjacencies', () => {
    const broken = {
      width: 2,
      height: 1,
      seed: 0,
      restarts: 0,
      tiles: [['floor', 'corridorH']],
    };
    expect(validateAdjacency(broken).length).toBeGreaterThan(0);
  });
});
