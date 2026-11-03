import { mulberry32 } from '../wfc/rng';
import type { Combatant, Monster, Player } from './types';

/**
 * Serializable PRNG state for combat: the current uint32 state of a
 * mulberry32 stream. Storing it on the game state keeps every damage roll
 * deterministic, so a run replays identically from its seed.
 */
export type RngState = number;

/** mulberry32 advances its internal state by this constant on every call. */
const MULBERRY32_STEP = 0x6d2b79f5;

/** Base melee attack power of the player (before weapon bonuses). */
export const PLAYER_ATTACK = 5;

/** Result of a single seeded damage roll. */
export interface DamageRoll {
  /** Rolled damage, always in 1..attackPower. */
  readonly damage: number;
  /** Advanced PRNG state to store for the next roll. */
  readonly rngState: RngState;
}

/** Outcome of one attack: the damaged target plus the roll that caused it. */
export interface StrikeResult<T extends Combatant> {
  /** The target after damage (a new object; the input is never mutated). */
  readonly target: T;
  readonly roll: DamageRoll;
  /** True when the target's hp reached 0. */
  readonly killed: boolean;
}

/**
 * Roll damage for one attack: a single mulberry32 step on `rngState`, mapped
 * uniformly onto 1..attackPower. Pure and deterministic — the same
 * (attackPower, rngState) always rolls the same damage, and the returned
 * rngState continues the exact mulberry32 stream.
 */
export function rollDamage(attackPower: number, rngState: RngState): DamageRoll {
  if (!Number.isInteger(attackPower) || attackPower < 1) {
    throw new Error(`attackPower must be a positive integer, got ${attackPower}`);
  }
  const state = rngState >>> 0;
  const value = mulberry32(state)();
  const damage = 1 + Math.floor(value * attackPower);
  return { damage, rngState: (state + MULBERRY32_STEP) >>> 0 };
}

/**
 * Apply `damage` to a combatant. Returns a new object with hp reduced and
 * clamped at 0; the input is never mutated.
 */
export function applyDamage<T extends Combatant>(target: T, damage: number): T {
  if (!Number.isInteger(damage) || damage < 0) {
    throw new Error(`damage must be a non-negative integer, got ${damage}`);
  }
  return { ...target, hp: Math.max(0, target.hp - damage) };
}

/** True when the combatant has no hit points left. */
export function isDead(combatant: Combatant): boolean {
  return combatant.hp <= 0;
}

/**
 * Resolve one attack of `attackPower` against `target`: roll seeded damage
 * from `rngState`, apply it to a copy of the target, and report whether the
 * target died.
 */
export function strike<T extends Combatant>(
  attackPower: number,
  target: T,
  rngState: RngState,
): StrikeResult<T> {
  const roll = rollDamage(attackPower, rngState);
  const damaged = applyDamage(target, roll.damage);
  return { target: damaged, roll, killed: isDead(damaged) };
}

/** Player melee attack against a monster (base attack power unless overridden). */
export function playerStrikesMonster(
  monster: Monster,
  rngState: RngState,
  attackPower: number = PLAYER_ATTACK,
): StrikeResult<Monster> {
  return strike(attackPower, monster, rngState);
}

/** Monster melee attack against the player; damage rolls in 1..monster.attack. */
export function monsterStrikesPlayer(
  player: Player,
  monster: Monster,
  rngState: RngState,
): StrikeResult<Player> {
  return strike(monster.attack, player, rngState);
}
