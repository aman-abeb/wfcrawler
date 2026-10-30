import { describe, expect, it } from 'vitest';
import { CollapseAnimator, formatHud } from './animator';
import type { AnimatorSnapshot } from './animator';
import { generateMap, validateAdjacency } from '../wfc/solver';
import { getTile, TILES } from '../wfc/tiles';

const BASE = { width: 32, height: 20, seed: 42 } as const;

interface RunOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
}

/** Run an animator to completion and return every snapshot it produced. */
function runToCompletion(options: RunOptions): AnimatorSnapshot[] {
  const animator = new CollapseAnimator(options);
  const snapshots: AnimatorSnapshot[] = [animator.snapshot()];
  while (!animator.isDone()) snapshots.push(animator.step());
  return snapshots;
}

describe('CollapseAnimator', () => {
  it('starts uncollapsed, with no highlight and all cells remaining', () => {
    const animator = new CollapseAnimator(BASE);
    const snap = animator.snapshot();
    expect(animator.isDone()).toBe(false);
    expect(snap.done).toBe(false);
    expect(snap.highlight).toBeNull();
    expect(snap.steps).toBe(0);
    expect(snap.totalCells).toBe(BASE.width * BASE.height);
    expect(snap.cellsRemaining).toBe(BASE.width * BASE.height);
    expect(snap.remainingEntropy).toBeGreaterThanOrEqual(snap.totalCells);
    expect(snap.remainingEntropy).toBeLessThanOrEqual(snap.totalCells * TILES.length);
  });

  it('produces a final grid identical to batch generateMap for the same seed', () => {
    const animator = new CollapseAnimator(BASE);
    while (!animator.isDone()) animator.step();
    const batch = generateMap(BASE);
    const map = animator.result();
    expect(map.tiles).toEqual(batch.tiles);
    expect(map.restarts).toBe(batch.restarts);
    expect(validateAdjacency(map)).toEqual([]);
  });

  it('matches the batch result across several seeds', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const options: RunOptions = { ...BASE, seed };
      const animator = new CollapseAnimator(options);
      while (!animator.isDone()) animator.step();
      expect(animator.result().tiles).toEqual(generateMap(options).tiles);
    }
  });

  it('replays the identical collapse sequence for the same seed', () => {
    const sequence = (): string[] => {
      const animator = new CollapseAnimator(BASE);
      const seq: string[] = [];
      while (!animator.isDone()) {
        const snap = animator.step();
        seq.push(
          snap.lastStepRestarted
            ? 'restart'
            : `${snap.highlight?.x},${snap.highlight?.y}:${snap.highlight?.tile}`,
        );
      }
      return seq;
    };
    expect(sequence()).toEqual(sequence());
  });

  it('keeps the highlight in bounds and on a known tile at every step', () => {
    for (const snap of runToCompletion(BASE)) {
      if (snap.lastStepRestarted) {
        expect(snap.highlight).toBeNull();
        continue;
      }
      const h = snap.highlight;
      if (h === null) continue; // initial snapshot before the first step
      expect(h.x).toBeGreaterThanOrEqual(0);
      expect(h.x).toBeLessThan(BASE.width);
      expect(h.y).toBeGreaterThanOrEqual(0);
      expect(h.y).toBeLessThan(BASE.height);
      expect(() => getTile(h.tile)).not.toThrow();
    }
  });

  it('never increases remaining entropy between restarts and ends fully collapsed', () => {
    const snapshots = runToCompletion(BASE);
    let prevEntropy = snapshots[0].remainingEntropy;
    let prevCells = snapshots[0].cellsRemaining;
    for (const snap of snapshots.slice(1)) {
      if (snap.lastStepRestarted) {
        // A contradiction restart resets the grid, so entropy jumps back up.
        prevEntropy = snap.remainingEntropy;
        prevCells = snap.cellsRemaining;
        continue;
      }
      expect(snap.remainingEntropy).toBeLessThanOrEqual(prevEntropy);
      expect(snap.cellsRemaining).toBe(prevCells - 1);
      prevEntropy = snap.remainingEntropy;
      prevCells = snap.cellsRemaining;
    }
    const last = snapshots[snapshots.length - 1];
    expect(last.done).toBe(true);
    expect(last.cellsRemaining).toBe(0);
    expect(last.remainingEntropy).toBe(last.totalCells);
  });

  it('reports done and stays stable when stepped after completion', () => {
    const options: RunOptions = { width: 8, height: 6, seed: 7 };
    const animator = new CollapseAnimator(options);
    while (!animator.isDone()) animator.step();
    const snap = animator.step();
    expect(snap.done).toBe(true);
    expect(animator.isDone()).toBe(true);
    expect(animator.result().tiles).toEqual(generateMap(options).tiles);
  });

  it('tileAt mirrors the observed tiles and, once done, the final map', () => {
    const animator = new CollapseAnimator(BASE);
    expect(animator.tileAt(0, 0)).toBeNull();
    expect(animator.tileAt(-1, 0)).toBeNull();
    expect(animator.tileAt(0, BASE.height)).toBeNull();
    while (!animator.isDone()) animator.step();
    const map = animator.result();
    for (let y = 0; y < BASE.height; y++) {
      for (let x = 0; x < BASE.width; x++) {
        expect(animator.tileAt(x, y)).toBe(map.tiles[y][x]);
      }
    }
  });

  it('returns an independent highlight copy from every snapshot', () => {
    const animator = new CollapseAnimator(BASE);
    const snap = animator.step();
    const again = animator.snapshot();
    if (snap.highlight !== null && again.highlight !== null) {
      expect(snap.highlight).not.toBe(again.highlight);
      expect(snap.highlight).toEqual(again.highlight);
    }
  });

  it('formatHud summarises seed, entropy, progress and restarts', () => {
    const animator = new CollapseAnimator(BASE);
    animator.step();
    const lines = formatHud(animator.snapshot());
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(`seed ${BASE.seed}`);
    expect(lines[0]).toContain('entropy');
    expect(lines[0]).toContain(`${BASE.width * BASE.height}`);
    expect(lines[0]).toContain('restarts');
    const snapshots = runToCompletion(BASE);
    const last = snapshots[snapshots.length - 1];
    expect(formatHud(last)[0]).toContain('done');
  });
});
