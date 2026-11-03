/**
 * CLI entry point for the headless balance simulator.
 *
 * Usage:
 *   npm run simulate                          # 100 games, seeds 1..100, max 1000 turns
 *   npm run simulate -- 200 42 2000           # 200 games, seeds 42..241, max 2000 turns
 *   npm run simulate -- 50 1 1000 --json      # also print the full stats as JSON
 */
import { DEFAULT_MAX_TURNS, formatBalanceReport, runSimulations } from '../src/game/simulate';

const USAGE = 'Usage: npm run simulate -- [count=100] [baseSeed=1] [maxTurns=1000] [--json]';

/** Parse a CLI argument as a non-negative safe integer, wrapped to uint32. */
function parseSeedArg(raw: string, name: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${name} is out of range: "${raw}"`);
  }
  return value >>> 0;
}

function main(argv: readonly string[]): number {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(USAGE);
    return 0;
  }
  const json = argv.includes('--json');
  const positional = argv.filter((arg) => arg !== '--json');
  if (positional.length > 3) {
    console.error(USAGE);
    return 1;
  }
  const count = positional[0] === undefined ? 100 : parseSeedArg(positional[0], 'count');
  const baseSeed = positional[1] === undefined ? 1 : parseSeedArg(positional[1], 'baseSeed');
  const maxTurns = positional[2] === undefined ? DEFAULT_MAX_TURNS : parseSeedArg(positional[2], 'maxTurns');
  if (count < 1) {
    console.error('count must be at least 1');
    return 1;
  }
  if (maxTurns < 1) {
    console.error('maxTurns must be at least 1');
    return 1;
  }
  const stats = runSimulations(count, baseSeed, maxTurns);
  console.log(formatBalanceReport(stats));
  if (json) console.log(JSON.stringify(stats, null, 2));
  return 0;
}

try {
  process.exitCode = main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
