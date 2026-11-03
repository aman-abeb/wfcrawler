import { describe, expect, it } from 'vitest';
import { isWalkableTile } from '../wfc/tiles';
import type { WFCMap } from '../wfc/types';
import { newGame } from './state';
import type { GameState, Monster } from './types';
import {
  bfsDistances,
  DEFAULT_MONSTER_COUNT,
  DEFAULT_MAX_TURNS,
  formatBalanceReport,
  MIN_SPAWN_DISTANCE,
  MONSTER_AGGRO_RANGE,
  MONSTER_ATTACK,
  MONSTER_MAX_HP,
  runSeededGame,
  runSimulations,
  simulateRun,
  spawnMonsters,
} from './simulate';

/** 5x5 hand-made map: solid wall border, 3x3 open floor interior. */
const OPEN_ROWS: string[][] = [
  ['wall', 'wall', 'wall', 'wall', 'wall'],
  ['wall', 'floor', 'floor', 'floor', 'wall'],
  ['wall', 'floor', 'floor', 'floor', 'wall'],
  ['wall', 'floor', 'floor', 'floor', 'wall'],
  ['wall', 'wall', 'wall', 'wall', 'wall'],
];

function openMap(): WFCMap {
  return { width: 5, height: 5, tiles: OPEN_ROWS.map((row) => [...row]), seed: 0, restarts: 0 };
}

/** 7x5 map split by a solid wall column at x=3: left and right never connect. */
function splitMap(): WFCMap {
  const row = ['floor', 'floor', 'floor', 'wall', 'floor', 'floor', 'floor'];
  return { width: 7, height: 5, tiles: Array.from({ length: 5 }, () => [...row]), seed: 0, restarts: 0 };
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

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return { id: 0, x: 3, y: 1, hp: 8, maxHp: 8, attack: 1, aggroRange: 8, ...overrides };
}

function chebyshev(ax: number, ay: number, bx: number, by: number): number {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

describe('bfsDistances', () => {
  it('computes walkable distances from the source and marks walls as -1', () => {
    const map = openMap();
    const dist = bfsDistances(map, 1, 1);
    expect(dist[1 * 5 + 1]).toBe(0);
    expect(dist[2 * 5 + 2]).toBe(2);
    expect(dist[3 * 5 + 3]).toBe(4);
    expect(dist[0]).toBe(-1); // wall
  });

  it('is symmetric on an open grid', () => {
    const map = openMap();
    expect(bfsDistances(map, 1, 1)[3 * 5 + 3]).toBe(bfsDistances(map, 3, 3)[1 * 5 + 1]);
  });

  it('marks unreachable regions and wall sources as -1', () => {
    const map = splitMap();
    const dist = bfsDistances(map, 0, 2);
    expect(dist[2 * 7 + 2]).toBe(2);
    expect(dist[2 * 7 + 6]).toBe(-1); // walled off
    const fromWall = bfsDistances(openMap(), 0, 0);
    expect(fromWall.every((d) => d === -1)).toBe(true);
  });
});

describe('spawnMonsters', () => {
  it('spawns the requested number of monsters on valid tiles, deterministically', () => {
    const state = newGame(42, 32, 20);
    const a = spawnMonsters(state.map, 42, 12, state.player);
    const b = spawnMonsters(state.map, 42, 12, state.player);
    expect(a).toEqual(b);
    expect(a).toHaveLength(12);
    const seen = new Set<string>();
    a.forEach((m, i) => {
      expect(m.id).toBe(i);
      expect(m.hp).toBe(MONSTER_MAX_HP);
      expect(m.maxHp).toBe(MONSTER_MAX_HP);
      expect(m.attack).toBe(MONSTER_ATTACK);
      expect(m.aggroRange).toBe(MONSTER_AGGRO_RANGE);
      expect(isWalkableTile(state.map.tiles[m.y][m.x])).toBe(true);
      expect(chebyshev(m.x, m.y, state.player.x, state.player.y)).toBeGreaterThanOrEqual(MIN_SPAWN_DISTANCE);
      const key = `${m.x},${m.y}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    });
  });

  it('spawns nothing when no tile is far enough from the player', () => {
    expect(spawnMonsters(openMap(), 1, 5, { x: 2, y: 2 })).toHaveLength(0);
  });

  it('rejects a negative count', () => {
    expect(() => spawnMonsters(openMap(), 1, -1, { x: 2, y: 2 })).toThrow();
  });
});

describe('simulateRun', () => {
  it('wins by hunting the only monster (greedy BFS step + bump attack)', () => {
    const state = handState(1, 1, { player: { x: 1, y: 1, hp: 20, maxHp: 20 } });
    const result = simulateRun(state, [makeMonster({ x: 3, y: 1 })], 200);
    expect(result.status).toBe('won');
    expect(result.kills).toBe(1);
    expect(result.monstersTotal).toBe(1);
    expect(result.monstersRemaining).toBe(0);
    expect(result.playerHp).toBeGreaterThan(0);
    // One approach step, then at least 2 and at most 8 attack turns (dmg 1..5 vs 8 hp).
    expect(result.turns).toBeGreaterThanOrEqual(3);
    expect(result.turns).toBeLessThanOrEqual(9);
  });

  it('loses when an adjacent monster kills the player', () => {
    const state = handState(2, 2, { player: { x: 2, y: 2, hp: 1, maxHp: 1 } });
    const monster = makeMonster({ x: 3, y: 2, attack: 20, hp: 100, maxHp: 100 });
    const result = simulateRun(state, [monster], 200);
    expect(result.status).toBe('lost');
    expect(result.turns).toBe(1);
    expect(result.kills).toBe(0);
    expect(result.monstersRemaining).toBe(1);
    expect(result.playerHp).toBe(0);
  });

  it('steps one tile toward a reachable monster on the first turn', () => {
    const result = simulateRun(handState(1, 1), [makeMonster({ x: 3, y: 3 })], 1);
    expect(result.status).toBe('capped');
    expect(result.turns).toBe(1);
    expect(result.playerX).toBe(2);
    expect(result.playerY).toBe(1);
  });

  it('falls back to a seeded random walk and hits the turn cap when no monster is reachable', () => {
    const state: GameState = {
      seed: 0,
      map: splitMap(),
      player: { x: 0, y: 2, hp: 10, maxHp: 10 },
      turn: 0,
      status: 'playing',
    };
    const result = simulateRun(state, [makeMonster({ x: 6, y: 2 })], 25);
    expect(result.status).toBe('capped');
    expect(result.turns).toBe(25);
    expect(result.kills).toBe(0);
    expect(result.monstersRemaining).toBe(1);
    expect(result.playerX).toBeLessThanOrEqual(2); // never crosses the wall column
  });

  it('is deterministic and does not mutate its inputs', () => {
    const state = newGame(42, 24, 16);
    const monsters = spawnMonsters(state.map, 42, 8, state.player);
    const stateClone = structuredClone(state);
    const monstersClone = structuredClone(monsters);
    const a = simulateRun(state, monsters, 300);
    const b = simulateRun(state, monsters, 300);
    expect(a).toEqual(b);
    expect(state).toEqual(stateClone);
    expect(monsters).toEqual(monstersClone);
  });

  it('returns immediately for an already finished game', () => {
    const result = simulateRun(handState(2, 2, { status: 'won' }), [], 100);
    expect(result.status).toBe('won');
    expect(result.turns).toBe(0);
  });

  it('rejects a non-positive maxTurns', () => {
    expect(() => simulateRun(handState(1, 1), [], 0)).toThrow();
    expect(() => simulateRun(handState(1, 1), [], -5)).toThrow();
  });
});

describe('runSeededGame', () => {
  it('is deterministic for the same seed and turn cap', () => {
    expect(runSeededGame(42, 500)).toEqual(runSeededGame(42, 500));
  });

  it('normalizes seeds to uint32', () => {
    expect(runSeededGame(4294967296 + 7, 50)).toEqual(runSeededGame(7, 50));
  });

  it('wins immediately when no monsters are spawned', () => {
    const result = runSeededGame(9, 100, { monsterCount: 0 });
    expect(result.status).toBe('won');
    expect(result.turns).toBe(0);
    expect(result.kills).toBe(0);
    expect(result.monstersTotal).toBe(0);
    expect(result.monstersRemaining).toBe(0);
  });

  it('respects the default turn cap', () => {
    expect(runSeededGame(42).turns).toBeLessThanOrEqual(DEFAULT_MAX_TURNS);
  });

  it('keeps kill accounting and status bounds across seeds', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const result = runSeededGame(seed, 400);
      expect(result.seed).toBe(seed);
      expect(result.turns).toBeLessThanOrEqual(400);
      expect(['won', 'lost', 'capped']).toContain(result.status);
      expect(result.monstersTotal).toBe(DEFAULT_MONSTER_COUNT);
      expect(result.kills + result.monstersRemaining).toBe(result.monstersTotal);
      expect(result.kills).toBeGreaterThanOrEqual(0);
      if (result.status === 'won') expect(result.monstersRemaining).toBe(0);
      if (result.status === 'lost') expect(result.playerHp).toBe(0);
      if (result.status === 'capped') expect(result.turns).toBe(400);
    }
  });

  it('rejects invalid turn caps', () => {
    expect(() => runSeededGame(1, 0)).toThrow();
    expect(() => runSeededGame(1, 2.5)).toThrow();
  });
});

describe('runSimulations', () => {
  it('aggregates games, rates, average turns and kills correctly', () => {
    const stats = runSimulations(5, 1000, 120);
    expect(stats.games).toBe(5);
    expect(stats.baseSeed).toBe(1000);
    expect(stats.maxTurns).toBe(120);
    expect(stats.results).toHaveLength(5);
    stats.results.forEach((r, i) => expect(r.seed).toBe(1000 + i));
    expect(stats.wins + stats.losses + stats.capped).toBe(5);
    expect(stats.winRate).toBe(stats.wins / 5);
    expect(stats.lossRate).toBe(stats.losses / 5);
    expect(stats.cappedRate).toBe(stats.capped / 5);
    const totalTurns = stats.results.reduce((sum, r) => sum + r.turns, 0);
    const totalKills = stats.results.reduce((sum, r) => sum + r.kills, 0);
    expect(stats.averageTurns).toBe(totalTurns / 5);
    expect(stats.totalKills).toBe(totalKills);
    expect(stats.averageKills).toBe(totalKills / 5);
  });

  it('is deterministic: the same seeds always produce identical stats', () => {
    expect(runSimulations(6, 77, 300)).toEqual(runSimulations(6, 77, 300));
  });

  it('produces varied results across different seeds', () => {
    const stats = runSimulations(8, 1, 300);
    const distinct = new Set(stats.results.map((r) => JSON.stringify(r)));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('rejects invalid counts', () => {
    expect(() => runSimulations(0, 1, 100)).toThrow();
    expect(() => runSimulations(-1, 1, 100)).toThrow();
    expect(() => runSimulations(2.5, 1, 100)).toThrow();
  });
});

describe('formatBalanceReport', () => {
  it('summarizes games, seed range, rates, turns and kills', () => {
    const report = formatBalanceReport(runSimulations(3, 5, 50));
    expect(report).toContain('balance simulation');
    expect(report).toContain('3 game(s)');
    expect(report).toContain('seeds 5..7');
    expect(report).toContain('max 50 turns');
    expect(report).toContain('wins');
    expect(report).toContain('losses');
    expect(report).toContain('turn-capped');
    expect(report).toContain('avg turns');
    expect(report).toContain('avg kills');
    expect(report).toContain('total kills');
  });
});
