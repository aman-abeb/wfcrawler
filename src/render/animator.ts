import { WFCSolver } from '../wfc/solver';
import type { WFCMap, WFCOptions } from '../wfc/types';

/** A cell observed by the most recent animator step. */
export interface HighlightCell {
  readonly x: number;
  readonly y: number;
  readonly tile: string;
}

/** Immutable point-in-time view of a CollapseAnimator, used for rendering. */
export interface AnimatorSnapshot {
  readonly seed: number;
  readonly width: number;
  readonly height: number;
  /** Total number of cells in the grid. */
  readonly totalCells: number;
  /** Cells that have not been observed yet. */
  readonly cellsRemaining: number;
  /** Sum of remaining tile options over all cells — the WFC entropy. */
  readonly remainingEntropy: number;
  /** Cell observed by the most recent step; null before the first step and right after a restart. */
  readonly highlight: HighlightCell | null;
  /** True when the most recent step hit a contradiction and restarted the grid. */
  readonly lastStepRestarted: boolean;
  /** Contradiction restarts so far. */
  readonly restarts: number;
  /** Steps executed so far, including restarts. */
  readonly steps: number;
  /** True once every cell has been observed. */
  readonly done: boolean;
}

/**
 * Drives a WFCSolver one observation at a time and remembers enough state to
 * render the collapse frame by frame: which cell was just observed (the
 * highlight), how much entropy is left and whether the run is finished.
 *
 * The class is deliberately DOM-free so the whole animation state machine can
 * be unit-tested in Node and reused by a headless renderer.
 */
export class CollapseAnimator {
  private readonly solver: WFCSolver;
  private readonly observed: (string | null)[][];
  private highlight: HighlightCell | null = null;
  private cellsRemaining: number;
  private steps = 0;
  private lastStepRestarted = false;

  constructor(options: WFCOptions) {
    this.solver = new WFCSolver(options);
    this.cellsRemaining = this.solver.width * this.solver.height;
    this.observed = [];
    for (let y = 0; y < this.solver.height; y++) {
      this.observed.push(new Array<string | null>(this.solver.width).fill(null));
    }
  }

  get width(): number {
    return this.solver.width;
  }

  get height(): number {
    return this.solver.height;
  }

  get seed(): number {
    return this.solver.seed;
  }

  /** True once every cell has been observed. */
  isDone(): boolean {
    return this.solver.isDone();
  }

  /**
   * Advance the collapse by exactly one solver step and return the new
   * snapshot. Safe to call after completion: it just returns a done snapshot.
   */
  step(): AnimatorSnapshot {
    const info = this.solver.step();
    this.steps += 1;
    if (info === null) {
      this.lastStepRestarted = false;
      return this.snapshot();
    }
    this.lastStepRestarted = info.restarted;
    if (info.restarted) {
      this.highlight = null;
      this.cellsRemaining = this.solver.width * this.solver.height;
      for (const row of this.observed) row.fill(null);
    } else {
      this.highlight = { x: info.x, y: info.y, tile: info.tile };
      this.observed[info.y][info.x] = info.tile;
      this.cellsRemaining -= 1;
    }
    return this.snapshot();
  }

  /** Current state for rendering; does not advance the solver. */
  snapshot(): AnimatorSnapshot {
    return {
      seed: this.solver.seed,
      width: this.solver.width,
      height: this.solver.height,
      totalCells: this.solver.width * this.solver.height,
      cellsRemaining: this.cellsRemaining,
      remainingEntropy: this.totalEntropy(),
      highlight: this.highlight === null ? null : { ...this.highlight },
      lastStepRestarted: this.lastStepRestarted,
      restarts: this.solver.restartCount,
      steps: this.steps,
      done: this.solver.isDone(),
    };
  }

  /** Tile a cell was observed with, or null while it is still uncollapsed. */
  tileAt(x: number, y: number): string | null {
    if (x < 0 || x >= this.solver.width || y < 0 || y >= this.solver.height) return null;
    return this.observed[y][x];
  }

  /** The finished map. Throws if the grid is not fully collapsed yet. */
  result(): WFCMap {
    return this.solver.result();
  }

  /** Sum of the remaining option counts over every cell. */
  private totalEntropy(): number {
    let sum = 0;
    for (let y = 0; y < this.solver.height; y++) {
      for (let x = 0; x < this.solver.width; x++) {
        sum += this.solver.entropyAt(x, y);
      }
    }
    return sum;
  }
}

/** Render an animator snapshot as HUD lines (currently a single status line). */
export function formatHud(snapshot: AnimatorSnapshot): string[] {
  const collapsed = snapshot.totalCells - snapshot.cellsRemaining;
  const status = snapshot.done ? ' · done' : '';
  return [
    `seed ${snapshot.seed} · entropy ${snapshot.remainingEntropy} · ` +
      `cells ${collapsed}/${snapshot.totalCells} · restarts ${snapshot.restarts}${status}`,
  ];
}
