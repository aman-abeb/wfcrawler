# WFCrawler

<!-- builder:badges:start -->
[![CI](https://github.com/aman-abeb/wfcrawler/actions/workflows/ci.yml/badge.svg)](https://github.com/aman-abeb/wfcrawler/actions/workflows/ci.yml) ![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/vite-646CFF?logo=vite&logoColor=white) ![License: MIT](https://img.shields.io/badge/license-MIT-green)
<!-- builder:badges:end -->


Seeded Wave Function Collapse dungeon generator with a playable turn-based roguelike layer in the browser. Same seed → same dungeon, every time.

## Features

- Deterministic WFC solver (mulberry32-seeded) with socket/adjacency rules for wall, floor, room, corridor and door tiles
- Entropy-based cell selection, queue-based constraint propagation, restart-on-contradiction
- Step-wise solver API that drives a tile-by-tile collapse animation on a canvas
- Seed via URL (`?seed=42`); identical maps reproduced by tests
- Vitest suite covering solver invariants, adjacency validation and determinism-by-seed

## Quickstart

```bash
npm install
npm run dev     # open http://localhost:5173 (try http://localhost:5173/?seed=42)
npm test        # vitest run — all solver tests, once, no watch mode
npm run build   # type-check (tsc --noEmit) + vite build
npm start       # serve the production build via vite preview
```

## Example

```text
$ npm test

 ✓ src/wfc/solver.test.ts (19 tests) 38ms

 Test Files  1 passed (1)
      Tests  19 passed (19)
```

The dev page collapses a 56×34 dungeon tile by tile for the seed in the URL. Reloading with the same seed replays the exact same collapse and produces the identical map.

## How it works

- `src/wfc/rng.ts` — mulberry32 PRNG plus integer / pick / weighted-pick helpers. All randomness in the project flows through this one seeded stream.
- `src/wfc/tiles.ts` — the tile set. Each tile has four sockets (n/e/s/w); two adjacent tiles are legal when their touching sockets form an allowed pair. The map border uses an `edge` socket that only `wall` may touch.
- `src/wfc/solver.ts` — `WFCSolver` keeps a set of possible tiles per cell. `step()` observes the lowest-entropy cell (weighted-random among its options), then propagates constraints through a queue; a contradiction restarts the grid deterministically. `generateMap()` runs a solver to completion, and `validateAdjacency()` re-checks a finished map against the socket rules.
- `src/render/mapCanvas.ts` — canvas renderer used both by the collapse animation (`renderCell`) and the final map (`renderMap`).
- `src/main.ts` — wires it together: reads `?seed=`, steps the solver on `requestAnimationFrame`, and paints each observed cell.

## Running tests

```bash
npm test
```

Tests are pure Node (no browser, no network): determinism-by-seed, adjacency validity across 25 seeds, border enclosure, stepped-vs-batch equivalence, RNG behavior and tile-rule symmetry.

<!-- builder:roadmap:start -->
## Status

**In active development:** 0 of 4 milestones done.

## Roadmap

- [ ] **WFC core, seeded generator and tests**: Implement the Wave Function Collapse solver: a tile set with socket/adjacency rules (floor, wall, corridor, door, room), a seeded RNG, entropy-based cell selection, constraint propagation, and restart-on-contradiction. Add a minimal Vite page that renders one generated map to a canvas. Vitest suite covers solver invariants (no contradictions, every adjacency valid, same seed => same map). Runnable via npm run dev and npm test from day one.
- [ ] **Collapse animation and map rendering**: Expose a step-wise solver API and drive a tile-by-tile collapse animation with requestAnimationFrame, highlighting the observed cell and remaining entropy. Add canvas tile rendering, grid overlay, a seed input with regenerate button, and PNG export of the finished map. Tests assert the stepped collapse matches the batch result for a seed and that the adjacency validator passes over rendered output.
- [ ] **Playable turn-based roguelike layer**: Layer gameplay on a generated map through a headless game-state API: player movement (arrows/WASD), shadowcasting field-of-view, monsters with chase/attack AI, items (healing potion, sword), combat resolution, a stairs/amulet win condition, HP/lose overlay, and an HUD showing HP, seed and turn. Vitest covers FOV bounds/symmetry, combat math, AI decisions, item pickup and win/lose transitions without a browser.
- [ ] **Polish, balance simulation and README showcase**: Add a keyboard-help overlay, restart/new-seed flow, a combat/loot log, and a node script that runs N seeded headless games to sanity-check balance (win rate, average turns). Write the README with an animated GIF of collapse then exploration, controls, a static generated map, architecture notes and run instructions. Finish with npm run build and npm test green.
<!-- builder:roadmap:end -->
