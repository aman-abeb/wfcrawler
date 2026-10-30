/**
 * Seeded deterministic random number generation.
 *
 * mulberry32 is a small, fast 32-bit PRNG. Given the same seed it always
 * produces the same sequence, which is what makes WFCrawler reproducible.
 */

/** Function returning the next float in [0, 1). */
export type RngFn = () => number;

/**
 * Create a mulberry32 PRNG for `seed`.
 * @param seed unsigned 32-bit seed
 */
export function mulberry32(seed: number): RngFn {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Convenience wrapper adding integer, pick and weighted-pick helpers. */
export class Rng {
  private readonly nextFloat: RngFn;

  constructor(seed: number) {
    this.nextFloat = mulberry32(seed);
  }

  /** Next float in [0, 1). */
  next(): number {
    return this.nextFloat();
  }

  /** Uniform integer in [0, n). */
  int(n: number): number {
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`int() expects a positive integer, got ${n}`);
    }
    return Math.floor(this.next() * n);
  }

  /** Uniformly pick one element of `items` (must be non-empty). */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick() expects a non-empty array');
    return items[this.int(items.length)];
  }

  /**
   * Pick an element with probability proportional to its weight.
   * @param items non-empty list of candidates
   * @param weightOf non-negative weight accessor; weights must sum > 0
   */
  weighted<T>(items: readonly T[], weightOf: (item: T) => number): T {
    if (items.length === 0) throw new Error('weighted() expects a non-empty array');
    let total = 0;
    for (const item of items) {
      const w = weightOf(item);
      if (w < 0) throw new Error('weighted() weights must be non-negative');
      total += w;
    }
    if (total <= 0) throw new Error('weighted() requires a positive total weight');
    let r = this.next() * total;
    for (const item of items) {
      r -= weightOf(item);
      if (r < 0) return item;
    }
    return items[items.length - 1];
  }
}
