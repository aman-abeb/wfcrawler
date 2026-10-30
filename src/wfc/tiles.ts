import type { Direction, SocketId, TileDef } from './types';

/**
 * Socket used for the outside of the map. Only "wall" may touch it, which
 * keeps generated dungeons enclosed by solid rock at the border.
 */
export const EDGE_SOCKET: SocketId = 'edge';

/** All cardinal directions in clockwise order. */
export const DIRECTIONS: readonly Direction[] = ['n', 'e', 's', 'w'];

/** Grid delta and opposite direction for each direction. */
export const DELTAS: Record<
  Direction,
  { readonly dx: number; readonly dy: number; readonly opposite: Direction }
> = {
  n: { dx: 0, dy: -1, opposite: 's' },
  e: { dx: 1, dy: 0, opposite: 'w' },
  s: { dx: 0, dy: 1, opposite: 'n' },
  w: { dx: -1, dy: 0, opposite: 'e' },
};

function pairKey(a: SocketId, b: SocketId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Allowed touching-socket pairs. Equality is always allowed; these are the
 * additional mixed pairs:
 * - wall touches wall / floor / door / edge (rooms are walled in, borders are rock)
 * - floor touches floor / door (room interiors and door thresholds)
 * - open (corridor passage) touches open / door (corridors chain, doors cap them)
 */
const COMPATIBLE_PAIRS: ReadonlySet<string> = new Set([
  pairKey('wall', 'floor'),
  pairKey('wall', 'door'),
  pairKey('wall', 'edge'),
  pairKey('floor', 'door'),
  pairKey('open', 'door'),
]);

/** True when two touching sockets may be adjacent on the map. */
export function socketsCompatible(a: SocketId, b: SocketId): boolean {
  return a === b || COMPATIBLE_PAIRS.has(pairKey(a, b));
}

function allSockets(socket: SocketId): Record<Direction, SocketId> {
  return { n: socket, e: socket, s: socket, w: socket };
}

/** Built-in dungeon tile set. */
export const TILES: readonly TileDef[] = [
  { id: 'wall', sockets: allSockets('wall'), weight: 4, color: '#232a3a', walkable: false },
  { id: 'floor', sockets: allSockets('floor'), weight: 3, color: '#7d7461', walkable: true },
  { id: 'room', sockets: allSockets('floor'), weight: 2, color: '#9c8f6f', walkable: true },
  {
    id: 'corridorH',
    sockets: { n: 'wall', e: 'open', s: 'wall', w: 'open' },
    weight: 1.5,
    color: '#5d584a',
    walkable: true,
  },
  {
    id: 'corridorV',
    sockets: { n: 'open', e: 'wall', s: 'open', w: 'wall' },
    weight: 1.5,
    color: '#5d584a',
    walkable: true,
  },
  {
    id: 'doorH',
    sockets: { n: 'wall', e: 'door', s: 'wall', w: 'door' },
    weight: 0.6,
    color: '#d4a72c',
    walkable: true,
  },
  {
    id: 'doorV',
    sockets: { n: 'door', e: 'wall', s: 'door', w: 'wall' },
    weight: 0.6,
    color: '#d4a72c',
    walkable: true,
  },
];

const TILE_BY_ID: ReadonlyMap<string, TileDef> = new Map(TILES.map((t) => [t.id, t]));

/** Look up a tile definition by id. Throws for unknown ids. */
export function getTile(id: string): TileDef {
  const tile = TILE_BY_ID.get(id);
  if (!tile) throw new Error(`unknown tile id: ${id}`);
  return tile;
}

/**
 * True when actors can stand on / move through a tile. Every built-in tile is
 * walkable except wall; custom tiles default to walkable unless their
 * definition sets `walkable: false`.
 */
export function isWalkableTile(tileId: string): boolean {
  return getTile(tileId).walkable ?? true;
}
