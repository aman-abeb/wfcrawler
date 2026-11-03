import { mulberry32, Rng } from '../wfc/rng';
import { DELTAS, DIRECTIONS } from '../wfc/tiles';
import type { WFCMap } from '../wfc/types';
import { isDead, monsterStrikesPlayer, playerStrikesMonster } from './combat';
import type { RngState } from './combat';
import { DEFAULT_MAP_HEIGHT, DEFAULT_MAP_WIDTH, isWalkable, movePlayer, newGame } from './state';
import type { GameState, Monster } from './types';

/** Default turn cap for one simulated game. */
export const DEFAULT_MAX_TURNS = 1000;
/** Default number of monsters spawned per dungeon. */
export const DEFAULT_MONSTER_COUNT = 12;
/** Monster hit points at spawn. */
export const MONSTER_MAX_HP = 8;
/** Monster melee damage rolls uniformly in 1..MONSTER_ATTACK. */
export const MONSTER_ATTACK = 3;
/** Distance in tiles at which a monster notices and chases the player. */
export const MONSTER_AGGRO_RANGE = 8;
/** Minimum Chebyshev distance between the player spawn and any monster spawn. */
export const MIN_SPAWN_DISTANCE = 4;

/** Salt for the monster-spawn RNG stream, independent of the solver stream. */
const MONSTER_SPAWN_SALT = 0x51f15eed;
/** Salt for the bot's fallback random-walk stream, derived from the game seed. */
const BOT_SALT = 0x2545f491;
/** mulberry32 advances its internal state by this constant on every call. */
const MULBERRY32_STEP = 0x6d2b79f5;

/** How a simulated game ended: won, lost, or cut off at the turn cap. */
export type SimStatus = 'won' | 'lost' | 'capped';

/** Outcome of one simulated game. */
export interface GameResult {
  /** Normalized uint32 seed the game was generated from. */
  readonly seed: number;
  readonly status: SimStatus;
  /** Player turns played (successful moves and attacks both count). */
  readonly turns: number;
  /** Monsters slain by the player. */
  readonly kills: number;
  /** Living monsters at the start of the run. */
  readonly monstersTotal: number;
  /** Living monsters at the end of the run. */
  readonly monstersRemaining: number;
  readonly playerHp: number;
  readonly playerX: number;
  readonly playerY: number;
}

/** Optional overrides accepted by runSeededGame / runSimulations. */
export interface SimConfig {
  readonly width?: number;
  readonly height?: number;
  readonly monsterCount?: number;
}

/** Aggregated balance statistics over N seeded games. */
export interface SimulationStats {
  readonly games: number;
  readonly baseSeed: number;
  readonly maxTurns: number;
  readonly wins: number;
  readonly losses: number;
  readonly capped: number;
  readonly winRate: number;
  readonly lossRate: number;
  readonly cappedRate: number;
  readonly averageTurns: number;
  readonly averageKills: number;
  readonly totalKills: number;
  readonly results: readonly GameResult[];
}

/** Mutable working copy of a run: the immutable game state plus the bot's side tables. */
interface BotWorld {
  state: GameState;
  monsters: Monster[];
  rngState: RngState;
  kills: number;
}

/**
 * Breadth-first distances in tiles from (sx, sy) over walkable tiles only.
 * Walls, out-of-bounds cells and unreachable walkable cells are -1. The
 * traversal order is fixed (n, e, s, w), so the result is deterministic.
 */
export function bfsDistances(map: WFCMap, sx: number, sy: number): Int32Array {
  const dist = new Int32Array(map.width * map.height).fill(-1);
  if (!isWalkable(map, sx, sy)) return dist;
  const queue: number[] = [sy * map.width + sx];
  dist[queue[0]] = 0;
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head];
    head += 1;
    const x = idx % map.width;
    const y = Math.floor(idx / map.width);
    for (const dir of DIRECTIONS) {
      const nx = x + DELTAS[dir].dx;
      const ny = y + DELTAS[dir].dy;
      if (!isWalkable(map, nx, ny)) continue;
      const nidx = ny * map.width + nx;
      if (dist[nidx] !== -1) continue;
      dist[nidx] = dist[idx] + 1;
      queue.push(nidx);
    }
  }
  return dist;
}

/**
 * Spawn up to `count` monsters on seeded-random walkable tiles at least
 * MIN_SPAWN_DISTANCE (Chebyshev) away from the player. The spawn order is a
 * seeded Fisher–Yates shuffle, so the same (map, seed, count, player) always
 * yields the same monsters with ids 0..n-1.
 */
export function spawnMonsters(
  map: WFCMap,
  seed: number,
  count: number,
  player: { readonly x: number; readonly y: number },
): Monster[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`count must be a non-negative integer, got ${count}`);
  }
  const rng = new Rng((seed ^ MONSTER_SPAWN_SALT) >>> 0);
  const candidates: { x: number; y: number }[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!isWalkable(map, x, y)) continue;
      if (x === player.x && y === player.y) continue;
      if (Math.max(Math.abs(x - player.x), Math.abs(y - player.y)) < MIN_SPAWN_DISTANCE) continue;
      candidates.push({ x, y });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }
  const n = Math.min(count, candidates.length);
  const monsters: Monster[] = [];
  for (let i = 0; i < n; i++) {
    monsters.push({
      id: i,
      x: candidates[i].x,
      y: candidates[i].y,
      hp: MONSTER_MAX_HP,
      maxHp: MONSTER_MAX_HP,
      attack: MONSTER_ATTACK,
      aggroRange: MONSTER_AGGRO_RANGE,
    });
  }
  return monsters;
}

/**
 * Play one game to completion with the greedy bot and return the result.
 *
 * Each turn the bot BFS-searches from the player over walkable tiles and steps
 * one tile toward the nearest living monster; when that monster is adjacent it
 * bump-attacks in place instead. When no monster is reachable it falls back to
 * a seeded random walk driven by `rngState` (default: derived from the game
 * seed). After the player acts, every monster within its aggro range chases
 * (one BFS step toward the player) or strikes when adjacent. The loop stops at
 * the first won/lost status or when `maxTurns` is reached ('capped').
 *
 * The inputs are never mutated; identical inputs always produce the same result.
 */
export function simulateRun(
  state: GameState,
  monsters: readonly Monster[],
  maxTurns: number,
  rngState?: RngState,
): GameResult {
  if (!Number.isInteger(maxTurns) || maxTurns < 1) {
    throw new Error(`maxTurns must be a positive integer, got ${maxTurns}`);
  }
  const living = monsters.filter((m) => !isDead(m)).map((m) => ({ ...m }));
  const total = living.length;
  if (state.status !== 'playing') {
    return {
      seed: state.seed,
      status: state.status,
      turns: state.turn,
      kills: 0,
      monstersTotal: total,
      monstersRemaining: total,
      playerHp: state.player.hp,
      playerX: state.player.x,
      playerY: state.player.y,
    };
  }
  let world: BotWorld = {
    state,
    monsters: living,
    rngState: (rngState ?? ((state.seed ^ BOT_SALT) >>> 0)) >>> 0,
    kills: 0,
  };
  let status: 'playing' | 'won' | 'lost' = 'playing';
  while (status === 'playing' && world.state.turn < maxTurns) {
    if (world.monsters.length === 0) {
      status = 'won';
      break;
    }
    world = botAct(world);
    if (world.monsters.length === 0) status = 'won';
    else if (isDead(world.state.player)) status = 'lost';
  }
  const finalStatus: SimStatus = status === 'playing' ? 'capped' : status;
  return {
    seed: world.state.seed,
    status: finalStatus,
    turns: world.state.turn,
    kills: world.kills,
    monstersTotal: total,
    monstersRemaining: world.monsters.length,
    playerHp: world.state.player.hp,
    playerX: world.state.player.x,
    playerY: world.state.player.y,
  };
}

/**
 * Run one fully seeded game: collapse a dungeon for `seed`, spawn monsters on
 * it, and play it with the bot up to `maxTurns`. The same seed always
 * reproduces the identical game and the identical result.
 */
export function runSeededGame(seed: number, maxTurns: number = DEFAULT_MAX_TURNS, config: SimConfig = {}): GameResult {
  const normalizedSeed = seed >>> 0;
  const state = newGame(normalizedSeed, config.width ?? DEFAULT_MAP_WIDTH, config.height ?? DEFAULT_MAP_HEIGHT);
  const monsters = spawnMonsters(state.map, normalizedSeed, config.monsterCount ?? DEFAULT_MONSTER_COUNT, state.player);
  return simulateRun(state, monsters, maxTurns);
}

/**
 * Run `count` seeded games with consecutive seeds baseSeed, baseSeed+1, ... and
 * aggregate the balance statistics: wins/losses/turn-caps, their rates, the
 * average number of turns and the average/total number of kills.
 */
export function runSimulations(
  count: number,
  baseSeed: number = 1,
  maxTurns: number = DEFAULT_MAX_TURNS,
  config: SimConfig = {},
): SimulationStats {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`count must be a positive integer, got ${count}`);
  }
  const normalizedBase = baseSeed >>> 0;
  const results: GameResult[] = [];
  for (let i = 0; i < count; i++) {
    results.push(runSeededGame((normalizedBase + i) >>> 0, maxTurns, config));
  }
  const wins = results.filter((r) => r.status === 'won').length;
  const losses = results.filter((r) => r.status === 'lost').length;
  const capped = results.filter((r) => r.status === 'capped').length;
  const totalTurns = results.reduce((sum, r) => sum + r.turns, 0);
  const totalKills = results.reduce((sum, r) => sum + r.kills, 0);
  return {
    games: count,
    baseSeed: normalizedBase,
    maxTurns,
    wins,
    losses,
    capped,
    winRate: wins / count,
    lossRate: losses / count,
    cappedRate: capped / count,
    averageTurns: totalTurns / count,
    averageKills: totalKills / count,
    totalKills,
    results,
  };
}

/** Render aggregated simulation stats as a short human-readable report. */
export function formatBalanceReport(stats: SimulationStats): string {
  const pct = (rate: number): string => `${(rate * 100).toFixed(1)}%`;
  const lastSeed = (stats.baseSeed + stats.games - 1) >>> 0;
  return [
    `WFCrawler balance simulation: ${stats.games} game(s), seeds ${stats.baseSeed}..${lastSeed}, max ${stats.maxTurns} turns each`,
    `wins ${stats.wins} (${pct(stats.winRate)}) · losses ${stats.losses} (${pct(stats.lossRate)}) · turn-capped ${stats.capped} (${pct(stats.cappedRate)})`,
    `avg turns ${stats.averageTurns.toFixed(1)} · avg kills ${stats.averageKills.toFixed(2)} · total kills ${stats.totalKills}`,
  ].join('\n');
}

/** Advance a mulberry32 state by one step (same constant as combat.ts). */
function advanceRng(rngState: RngState): RngState {
  return (rngState + MULBERRY32_STEP) >>> 0;
}

/** Uniform integer in [0, n) drawn from one mulberry32 step on `rngState`. */
function randBelow(rngState: RngState, n: number): { value: number; rngState: RngState } {
  const value = Math.floor(mulberry32(rngState)() * n);
  return { value, rngState: advanceRng(rngState) };
}

/**
 * Play exactly one turn: the bot acts (move toward / bump-attack the nearest
 * reachable monster, else a seeded random step), the turn counter always
 * advances by exactly one, then every monster takes its action.
 */
function botAct(world: BotWorld): BotWorld {
  const { state, monsters } = world;
  const width = state.map.width;
  const dist = bfsDistances(state.map, state.player.x, state.player.y);
  let target: Monster | null = null;
  let targetDist = Number.POSITIVE_INFINITY;
  for (const m of monsters) {
    const d = dist[m.y * width + m.x];
    if (d >= 0 && d < targetDist) {
      target = m;
      targetDist = d;
    }
  }
  let next: BotWorld;
  if (target !== null && targetDist === 1) {
    next = attackMonster(world, target);
  } else if (target !== null) {
    next = stepToward(world, dist, targetDist);
  } else {
    next = randomStep(world);
  }
  if (next.state.turn === state.turn) {
    // Attack turns and fully boxed-in turns still consume a turn.
    next = { ...next, state: { ...next.state, turn: state.turn + 1 } };
  }
  return monsterPhase(next);
}

/** Move the player one BFS step closer to a monster at `targetDist` >= 2. */
function stepToward(world: BotWorld, dist: Int32Array, targetDist: number): BotWorld {
  const { state } = world;
  const width = state.map.width;
  for (const dir of DIRECTIONS) {
    const dx = DELTAS[dir].dx;
    const dy = DELTAS[dir].dy;
    const nx = state.player.x + dx;
    const ny = state.player.y + dy;
    if (!isWalkable(state.map, nx, ny)) continue;
    if (dist[ny * width + nx] === targetDist - 1) {
      const after = movePlayer(state, dx, dy);
      if (after !== state) return { ...world, state: after };
    }
  }
  return randomStep(world);
}

/** Seeded random walk: try the four cardinal directions in a shuffled order. */
function randomStep(world: BotWorld): BotWorld {
  const { state, rngState } = world;
  const order = [0, 1, 2, 3];
  let rs = rngState;
  for (let i = order.length - 1; i > 0; i--) {
    const roll = randBelow(rs, i + 1);
    rs = roll.rngState;
    const j = roll.value;
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  for (const i of order) {
    const dir = DIRECTIONS[i];
    const after = movePlayer(state, DELTAS[dir].dx, DELTAS[dir].dy);
    if (after !== state) return { ...world, rngState: rs, state: after };
  }
  return { ...world, rngState: rs };
}

/** Player bump-attacks an adjacent monster with a seeded damage roll. */
function attackMonster(world: BotWorld, victim: Monster): BotWorld {
  const result = playerStrikesMonster(victim, world.rngState);
  const rngState = result.roll.rngState;
  if (result.killed) {
    return {
      ...world,
      rngState,
      kills: world.kills + 1,
      monsters: world.monsters.filter((m) => m.id !== victim.id),
    };
  }
  return {
    ...world,
    rngState,
    monsters: world.monsters.map((m) => (m.id === victim.id ? result.target : m)),
  };
}

/**
 * Monster phase: each living monster in id order either strikes the player
 * (BFS distance <= 1 and within aggro range) or chases one BFS step toward the
 * player onto a free walkable tile. Monsters never stack and never enter the
 * player's tile.
 */
function monsterPhase(world: BotWorld): BotWorld {
  const { state, monsters } = world;
  if (monsters.length === 0) return world;
  const width = state.map.width;
  const dist = bfsDistances(state.map, state.player.x, state.player.y);
  const occupied = new Set<number>();
  occupied.add(state.player.y * width + state.player.x);
  for (const m of monsters) occupied.add(m.y * width + m.x);
  let nextState = state;
  let rngState = world.rngState;
  const nextMonsters: Monster[] = [];
  for (let i = 0; i < monsters.length; i++) {
    const m = monsters[i];
    const d = dist[m.y * width + m.x];
    if (d < 0 || d > m.aggroRange) {
      nextMonsters.push(m);
      continue;
    }
    if (d <= 1) {
      const result = monsterStrikesPlayer(nextState.player, m, rngState);
      rngState = result.roll.rngState;
      nextState = { ...nextState, player: result.target };
      nextMonsters.push(m);
      if (isDead(result.target)) {
        nextMonsters.push(...monsters.slice(i + 1));
        break;
      }
    } else {
      let best = m;
      let bestD = d;
      for (const dir of DIRECTIONS) {
        const nx = m.x + DELTAS[dir].dx;
        const ny = m.y + DELTAS[dir].dy;
        if (!isWalkable(state.map, nx, ny)) continue;
        const idx = ny * width + nx;
        if (occupied.has(idx)) continue;
        const nd = dist[idx];
        if (nd >= 0 && nd < bestD) {
          bestD = nd;
          best = { ...m, x: nx, y: ny };
        }
      }
      occupied.delete(m.y * width + m.x);
      occupied.add(best.y * width + best.x);
      nextMonsters.push(best);
    }
  }
  return { state: nextState, monsters: nextMonsters, rngState, kills: world.kills };
}
