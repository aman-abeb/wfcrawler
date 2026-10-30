# WFCrawler

<!-- builder:badges:start -->
[![CI](https://github.com/aman-abeb/wfcrawler/actions/workflows/ci.yml/badge.svg)](https://github.com/aman-abeb/wfcrawler/actions/workflows/ci.yml) ![TypeScript](https://img.shields.io/badge/typescript-strict-3178C6?logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/vite-646CFF?logo=vite&logoColor=white) ![License: MIT](https://img.shields.io/badge/license-MIT-green)
<!-- builder:badges:end -->


Seeded Wave Function Collapse dungeon generator with a playable turn-based roguelike layer in the browser. Same seed → same dungeon, every time.

## Features

- Deterministic WFC solver (mulberry32-seeded) with socket/adjacency rules for wall, floor, room, corridor and door tiles
- Entropy-based cell selection, queue-based constraint propagation, restart-on-contradiction
- Tile-by-tile collapse animation on canvas: the freshly observed cell is highlighted and an entropy HUD strip counts down the remaining options
- Seed control in the page: a seed input + Regenerate button (keeps `?seed=` in the URL in sync) and an Export PNG button that downloads the finished map as `wfcrawler-<seed>.png`
- Step-wise solver API wrapped by a DOM-free `CollapseAnimator` (highlight, remaining entropy, completion state) that is unit-tested in Node
- Seed via URL (`?seed=42`); identical maps reproduced by tests
- Vitest suite covering solver invariants, adjacency validation, determinism-by-seed, the collapse animator and PNG export

## Quickstart

```bash
npm install
npm run dev     # open http://localhost:5173 (try http://localhost:5173/?seed=42)
npm test        # vitest run — all tests, once, no watch mode
npm run build   # type-check (tsc --noEmit) + vite build
npm start       # serve the production build via vite preview
```

## Controls

| Control | Action |
| --- | --- |
| Seed input + **Regenerate** (or press Enter) | Collapse a new dungeon for the typed seed; the `?seed=` URL parameter is updated via `history.replaceState`, so the link stays shareable and reloadable |
| **Export PNG** | Download the finished map as `wfcrawler-<seed>.png` (enabled once the collapse completes) |
| `?seed=42` in the URL | Open the page directly on a specific seed |

## Example

```text
$ npm test

 ✓ src/wfc/solver.test.ts (19 tests) 38ms
 ✓ src/render/animator.test.ts (10 tests) 11ms
 ✓ src/render/export.test.ts (8 tests) 6ms

 Test Files  3 passed (3)
      Tests  37 passed (37)
```

The dev page collapses a 56×34 dungeon tile by tile for the seed in the URL (or in the seed input). Each animation frame observes a few cells, outlines the newest one, and updates the HUD strip below the map with the seed, remaining entropy, collapsed-cell count and restarts. Type a new seed into the input and hit **Regenerate** (or Enter) to collapse a different dungeon — the URL's `?seed=` parameter follows along. Once the collapse is done, **Export PNG** downloads the finished map as `wfcrawler-<seed>.png`. Reloading with the same seed replays the exact same collapse and produces the identical map.

## How it works

- `src/wfc/rng.ts` — mulberry32 PRNG plus integer / pick / weighted-pick helpers. All randomness in the project flows through this one seeded stream.
- `src/wfc/tiles.ts` — the tile set. Each tile has four sockets (n/e/s/w); two adjacent tiles are legal when their touching sockets form an allowed pair. The map border uses an `edge` socket that only `wall` may touch.
- `src/wfc/solver.ts` — `WFCSolver` keeps a set of possible tiles per cell. `step()` observes the lowest-entropy cell (weighted-random among its options), then propagates constraints through a queue; a contradiction restarts the grid deterministically. `generateMap()` runs a solver to completion, and `validateAdjacency()` re-checks a finished map against the socket rules.
- `src/render/animator.ts` — `CollapseAnimator` drives `WFCSolver.step()` one observation at a time and exposes `step()` / `snapshot()`: the highlighted cell, remaining entropy (sum of remaining options), cells left, restarts and done state. `formatHud()` renders a snapshot as the HUD line. No DOM access, so the whole animation state machine is testable in Node.
- `src/render/mapCanvas.ts` — canvas renderer. `renderCell()` paints one tile plus its grid border during the animation, `renderHighlight()` outlines the observed cell, `renderHud()` draws the opaque entropy strip (repainted every frame so text never smears), and `renderMap()` paints the finished map with the full grid overlay.
- `src/render/export.ts` — `sanitizeSeed()` parses seed text (digits only, wrapped to uint32, null on invalid input) and `exportMapPng()` reads `canvas.toDataURL('image/png')` and triggers a `wfcrawler-<seed>.png` download through a temporary anchor. DOM access is guarded behind a `typeof document` check, so the helpers stay unit-testable in Node with a stub canvas.
- `src/main.ts` — wires it together: reads `?seed=`, advances the animator on `requestAnimationFrame` (a few steps per frame), repaints the previous highlight cell, draws the new highlight and the HUD, and stops the loop when the map is complete (enabling the Export PNG button). The Regenerate button re-reads the seed input, updates `?seed=` via `history.replaceState`, and restarts the animation from scratch with a fresh `CollapseAnimator`.

## Running tests

```bash
npm test
```

Tests are pure Node (no browser, no network): determinism-by-seed, adjacency validity across 25 seeds, border enclosure, stepped-vs-batch equivalence, animator invariants (final grid equals the batch map for a seed, remaining entropy never increases between restarts, highlight always in bounds), RNG behavior, tile-rule symmetry, seed sanitizing and PNG export (PNG data URL + `wfcrawler-<seed>.png` filename via a stub canvas).

<!-- builder:roadmap:start -->
## Status

**In active development:** 2 of 4 milestones done.

## Roadmap

- [x] **WFC core, seeded generator and tests**: Implement the Wave Function Collapse solver: a tile set with socket/adjacency rules (floor, wall, corridor, door, room), a seeded RNG, entropy-based cell selection, constraint propagation, and restart-on-contradiction. Add a minimal Vite page that renders one generated map to a canvas. Vitest suite covers solver invariants (no contradictions, every adjacency valid, same seed => same map). Runnable via npm run dev and npm test from day one.
- [x] **Collapse animation and map rendering**: Expose a step-wise solver API and drive a tile-by-tile collapse animation with requestAnimationFrame, highlighting the observed cell and remaining entropy. Add canvas tile rendering, grid overlay, a seed input with regenerate button, and PNG export of the finished map. Tests assert the stepped collapse matches the batch result for a seed and that the adjacency validator passes over rendered output.
- [ ] **Playable turn-based roguelike layer**: Layer gameplay on a generated map through a headless game-state API: player movement (arrows/WASD), shadowcasting field-of-view, monsters with chase/attack AI, items (healing potion, sword), combat resolution, a stairs/amulet win condition, HP/lose overlay, and an HUD showing HP, seed and turn. Vitest covers FOV bounds/symmetry, combat math, AI decisions, item pickup and win/lose transitions without a browser.
- [ ] **Polish, balance simulation and README showcase**: Add a keyboard-help overlay, restart/new-seed flow, a combat/loot log, and a node script that runs N seeded headless games to sanity-check balance (win rate, average turns). Write the README with an animated GIF of collapse then exploration, controls, a static generated map, architecture notes and run instructions. Finish with npm run build and npm test green.
<!-- builder:roadmap:end -->
