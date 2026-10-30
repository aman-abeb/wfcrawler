import { Rng } from './rng';
import { DELTAS, DIRECTIONS, EDGE_SOCKET, socketsCompatible, TILES } from './tiles';
import type { SocketId, TileDef, WFCCell, WFCMap, WFCOptions } from './types';

/** Information about a single WFCSolver.step() call. */
export interface StepInfo {
  /** X of the observed cell, or -1 when the step triggered a restart. */
  readonly x: number;
  /** Y of the observed cell, or -1 when the step triggered a restart. */
  readonly y: number;
  /** Tile the cell collapsed to, or '' when the step triggered a restart. */
  readonly tile: string;
  /** True when the solver hit a contradiction and restarted from scratch. */
  readonly restarted: boolean;
  /** Number of restarts so far. */
  readonly restarts: number;
  /** True when every cell is now collapsed. */
  readonly done: boolean;
}

/**
 * Step-wise Wave Function Collapse solver.
 *
 * The grid starts with every cell holding all tile options. Each step picks
 * the uncollapsed cell with the lowest entropy (fewest options, ties broken
 * by the seeded RNG), collapses it to a weighted-random tile, and propagates
 * constraints to neighbours through a queue. A contradiction (a cell with an
 * empty option set) restarts the whole grid; because the RNG is seeded, the
 * restarts are deterministic too, so a seed always reproduces the same map.
 */
export class WFCSolver {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly maxRestarts: number;

  private readonly tileDefs: readonly TileDef[];
  private readonly tileMap: ReadonlyMap<string, TileDef>;
  private readonly rng: Rng;
  private cells: WFCCell[] = [];
  private queue: number[] = [];
  private queued = new Set<number>();
  private restarts = 0;
  private finished = false;

  constructor(options: WFCOptions) {
    if (!Number.isInteger(options.width) || options.width < 2) {
      throw new Error(`width must be an integer >= 2, got ${options.width}`);
    }
    if (!Number.isInteger(options.height) || options.height < 2) {
      throw new Error(`height must be an integer >= 2, got ${options.height}`);
    }
    this.width = options.width;
    this.height = options.height;
    this.seed = options.seed >>> 0;
    this.maxRestarts = options.maxRestarts ?? 500;
    this.tileDefs = options.tiles ?? TILES;
    if (this.tileDefs.length === 0) throw new Error('tile set must not be empty');
    this.tileMap = new Map(this.tileDefs.map((t) => [t.id, t]));
    this.rng = new Rng(this.seed);
    this.rebuild();
  }

  /** Number of contradiction restarts so far. */
  get restartCount(): number {
    return this.restarts;
  }

  /** True once every cell has been collapsed. */
  isDone(): boolean {
    return this.finished;
  }

  /** Remaining option count of a cell (its entropy proxy). */
  entropyAt(x: number, y: number): number {
    return this.cells[this.index(x, y)].options.size;
  }

  /**
   * Collapse exactly one cell and propagate constraints.
   * Returns null when the solver is already finished.
   */
  step(): StepInfo | null {
    if (this.finished) return null;
    const cell = this.lowestEntropyCell();
    if (cell === null) {
      this.finished = true;
      return null;
    }
    const options = [...cell.options];
    const tile = this.rng.weighted(options, (id) => this.tile(id).weight);
    cell.options = new Set([tile]);
    cell.collapsed = tile;
    this.enqueue(this.index(cell.x, cell.y));
    for (const dir of DIRECTIONS) {
      const { dx, dy } = DELTAS[dir];
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        this.enqueue(this.index(nx, ny));
      }
    }
    if (!this.propagate()) {
      this.restarts += 1;
      this.rebuild();
      return { x: -1, y: -1, tile: '', restarted: true, restarts: this.restarts, done: false };
    }
    if (this.cells.every((c) => c.collapsed !== null)) this.finished = true;
    return {
      x: cell.x,
      y: cell.y,
      tile,
      restarted: false,
      restarts: this.restarts,
      done: this.finished,
    };
  }

  /** The finished map. Throws if any cell is still uncollapsed. */
  result(): WFCMap {
    const tiles: string[][] = [];
    for (let y = 0; y < this.height; y++) {
      const row: string[] = [];
      for (let x = 0; x < this.width; x++) {
        const collapsed = this.cells[this.index(x, y)].collapsed;
        if (collapsed === null) throw new Error(`cell (${x},${y}) is not collapsed yet`);
        row.push(collapsed);
      }
      tiles.push(row);
    }
    return { width: this.width, height: this.height, tiles, seed: this.seed, restarts: this.restarts };
  }

  private tile(id: string): TileDef {
    const t = this.tileMap.get(id);
    if (!t) throw new Error(`unknown tile id: ${id}`);
    return t;
  }

  private index(x: number, y: number): number {
    return y * this.width + x;
  }

  private enqueue(idx: number): void {
    if (this.queued.has(idx)) return;
    this.queued.add(idx);
    this.queue.push(idx);
  }

  /** Reset every cell to the full option set and run initial propagation. */
  private rebuild(): void {
    if (this.restarts > this.maxRestarts) {
      throw new Error(`WFC exceeded ${this.maxRestarts} restarts for seed ${this.seed}`);
    }
    this.cells = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.cells.push({ x, y, options: new Set(this.tileDefs.map((t) => t.id)), collapsed: null });
      }
    }
    this.finished = false;
    this.queue = [];
    this.queued = new Set();
    for (let i = 0; i < this.cells.length; i++) this.enqueue(i);
    if (!this.propagate()) {
      this.restarts += 1;
      this.rebuild();
    }
  }

  /** Pick the uncollapsed cell with the fewest options (RNG breaks ties). */
  private lowestEntropyCell(): WFCCell | null {
    let best: WFCCell[] = [];
    let bestSize = Number.POSITIVE_INFINITY;
    for (const cell of this.cells) {
      if (cell.collapsed !== null) continue;
      const size = cell.options.size;
      if (size < bestSize) {
        bestSize = size;
        best = [cell];
      } else if (size === bestSize) {
        best.push(cell);
      }
    }
    return best.length === 0 ? null : this.rng.pick(best);
  }

  /**
   * Constraint propagation over the queue. Returns false on contradiction
   * (a cell with zero remaining options).
   */
  private propagate(): boolean {
    while (this.queue.length > 0) {
      const idx = this.queue.pop();
      if (idx === undefined) break;
      this.queued.delete(idx);
      const cell = this.cells[idx];
      for (const dir of DIRECTIONS) {
        const { dx, dy, opposite } = DELTAS[dir];
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        const allowed = new Set<SocketId>();
        if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
          for (const opt of this.cells[this.index(nx, ny)].options) {
            allowed.add(this.tile(opt).sockets[opposite]);
          }
        } else {
          allowed.add(EDGE_SOCKET);
        }
        const kept: string[] = [];
        for (const opt of cell.options) {
          const socket = this.tile(opt).sockets[dir];
          let ok = false;
          for (const a of allowed) {
            if (socketsCompatible(socket, a)) {
              ok = true;
              break;
            }
          }
          if (ok) kept.push(opt);
        }
        if (kept.length === 0) return false;
        if (kept.length !== cell.options.size) {
          cell.options = new Set(kept);
          for (const d2 of DIRECTIONS) {
            const dd = DELTAS[d2];
            const mx = cell.x + dd.dx;
            const my = cell.y + dd.dy;
            if (mx >= 0 && mx < this.width && my >= 0 && my < this.height) {
              this.enqueue(this.index(mx, my));
            }
          }
        }
      }
    }
    return true;
  }
}

/**
 * Run the solver to completion in one call.
 * Equivalent to stepping a WFCSolver until it reports isDone().
 */
export function generateMap(options: WFCOptions): WFCMap {
  const solver = new WFCSolver(options);
  while (!solver.isDone()) {
    solver.step();
  }
  return solver.result();
}

/**
 * Validate a finished map against the socket rules. Out-of-bounds neighbours
 * are treated as the edge socket. Returns a list of human-readable violations;
 * an empty list means the map is fully consistent.
 */
export function validateAdjacency(map: WFCMap, tiles: readonly TileDef[] = TILES): string[] {
  const tileMap = new Map(tiles.map((t) => [t.id, t]));
  const violations: string[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const id = map.tiles[y][x];
      const tile = tileMap.get(id);
      if (!tile) {
        violations.push(`(${x},${y}): unknown tile id "${id}"`);
        continue;
      }
      for (const dir of DIRECTIONS) {
        const { dx, dy, opposite } = DELTAS[dir];
        const nx = x + dx;
        const ny = y + dy;
        const inBounds = nx >= 0 && nx < map.width && ny >= 0 && ny < map.height;
        const neighborSocket: SocketId = inBounds
          ? (tileMap.get(map.tiles[ny][nx])?.sockets[opposite] ?? 'unknown')
          : EDGE_SOCKET;
        const neighborLabel = inBounds ? `(${nx},${ny}) ${opposite} "${neighborSocket}"` : 'map edge';
        if (!socketsCompatible(tile.sockets[dir], neighborSocket)) {
          violations.push(`(${x},${y}) ${dir} "${tile.sockets[dir]}" incompatible with ${neighborLabel}`);
        }
      }
    }
  }
  return violations;
}
