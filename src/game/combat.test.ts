import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../wfc/rng';
import {
  applyDamage,
  isDead,
  monsterStrikesPlayer,
  PLAYER_ATTACK,
  playerStrikesMonster,
  rollDamage,
  strike,
} from './combat';
import type { Monster, Player } from './types';

function makePlayer(hp = 10): Player {
  return { x: 1, y: 1, hp, maxHp: 20 };
}

function makeMonster(overrides: Partial<Monster> = {}): Monster {
  return { id: 0, x: 2, y: 1, hp: 8, maxHp: 8, attack: 4, aggroRange: 6, ...overrides };
}

/** First rngState in the stream from 0 whose roll deals at least `hp` damage. */
function findKillingState(attackPower: number, hp: number): number {
  let state = 0;
  for (let i = 0; i < 1000; i++) {
    const roll = rollDamage(attackPower, state);
    if (roll.damage >= hp) return state;
    state = roll.rngState;
  }
  throw new Error(`no roll of 1..${attackPower} reached ${hp} within 1000 steps`);
}

describe('rollDamage', () => {
  it('always rolls an integer within 1..attackPower', () => {
    for (let state = 0; state < 500; state++) {
      for (const attackPower of [1, 2, 3, 5, 8, 20]) {
        const { damage } = rollDamage(attackPower, state);
        expect(Number.isInteger(damage)).toBe(true);
        expect(damage).toBeGreaterThanOrEqual(1);
        expect(damage).toBeLessThanOrEqual(attackPower);
      }
    }
  });

  it('always rolls exactly 1 when attackPower is 1', () => {
    for (let state = 0; state < 100; state++) {
      expect(rollDamage(1, state).damage).toBe(1);
    }
  });

  it('is deterministic for the same (attackPower, rngState)', () => {
    for (let state = 0; state < 50; state++) {
      expect(rollDamage(6, state)).toEqual(rollDamage(6, state));
    }
  });

  it('advances rngState by exactly one mulberry32 step and continues the stream', () => {
    const state = 12345;
    const roll = rollDamage(7, state);
    expect(roll.rngState).toBe((state + 0x6d2b79f5) >>> 0);
    const stream = mulberry32(state);
    const first = stream();
    const second = stream();
    expect(roll.damage).toBe(1 + Math.floor(first * 7));
    expect(rollDamage(7, roll.rngState).damage).toBe(1 + Math.floor(second * 7));
  });

  it('keeps rngState a uint32 across the wrap-around', () => {
    const roll = rollDamage(3, 0xffffffff);
    expect(roll.rngState).toBe((0xffffffff + 0x6d2b79f5) >>> 0);
    expect(roll.rngState).toBeGreaterThanOrEqual(0);
    expect(roll.rngState).toBeLessThanOrEqual(0xffffffff);
  });

  it('normalizes out-of-range rngState with >>> 0', () => {
    expect(rollDamage(5, 4294967296 + 7)).toEqual(rollDamage(5, 7));
    expect(rollDamage(5, -1)).toEqual(rollDamage(5, 0xffffffff));
  });

  it('produces varied damage along a chained stream of states', () => {
    const damages = new Set<number>();
    let state = 42;
    for (let i = 0; i < 200; i++) {
      const roll = rollDamage(6, state);
      damages.add(roll.damage);
      state = roll.rngState;
    }
    expect(damages.size).toBeGreaterThan(3);
  });

  it('rejects non-positive or non-integer attack power', () => {
    expect(() => rollDamage(0, 1)).toThrow();
    expect(() => rollDamage(-3, 1)).toThrow();
    expect(() => rollDamage(2.5, 1)).toThrow();
    expect(() => rollDamage(Number.NaN, 1)).toThrow();
  });
});

describe('applyDamage', () => {
  it('reduces hp on a new object and never mutates the input', () => {
    const player = makePlayer(10);
    const damaged = applyDamage(player, 3);
    expect(damaged).not.toBe(player);
    expect(damaged.hp).toBe(7);
    expect(damaged.maxHp).toBe(20);
    expect(damaged.x).toBe(1);
    expect(player.hp).toBe(10);
  });

  it('clamps hp at 0 instead of going negative', () => {
    const damaged = applyDamage(makePlayer(2), 99);
    expect(damaged.hp).toBe(0);
    expect(isDead(damaged)).toBe(true);
  });

  it('treats zero damage as a value-wise no-op', () => {
    expect(applyDamage(makePlayer(10), 0).hp).toBe(10);
  });

  it('rejects negative or fractional damage', () => {
    expect(() => applyDamage(makePlayer(), -1)).toThrow();
    expect(() => applyDamage(makePlayer(), 1.5)).toThrow();
  });
});

describe('isDead', () => {
  it('is true only at 0 hp', () => {
    expect(isDead(makePlayer(0))).toBe(true);
    expect(isDead(makePlayer(1))).toBe(false);
  });
});

describe('strike', () => {
  it('applies exactly the rolled damage to a copy of the target', () => {
    const monster = makeMonster({ hp: 8 });
    const result = strike(5, monster, 123);
    expect(result.target).not.toBe(monster);
    expect(monster.hp).toBe(8);
    expect(result.target.hp).toBe(8 - result.roll.damage);
    expect(result.killed).toBe(result.roll.damage >= 8);
  });

  it('reports killed exactly when the roll meets or exceeds the target hp', () => {
    const state = findKillingState(5, 3);
    const result = strike(5, makeMonster({ hp: 3 }), state);
    expect(result.roll.damage).toBeGreaterThanOrEqual(3);
    expect(result.target.hp).toBe(0);
    expect(result.killed).toBe(true);
  });

  it('is deterministic: identical inputs produce an identical strike', () => {
    expect(strike(6, makeMonster(), 777)).toEqual(strike(6, makeMonster(), 777));
  });
});

describe('playerStrikesMonster / monsterStrikesPlayer', () => {
  it('player strike rolls in 1..PLAYER_ATTACK by default and damages the monster', () => {
    const monster = makeMonster({ hp: 20 });
    const result = playerStrikesMonster(monster, 99);
    expect(result.roll.damage).toBeGreaterThanOrEqual(1);
    expect(result.roll.damage).toBeLessThanOrEqual(PLAYER_ATTACK);
    expect(result.target.hp).toBe(20 - result.roll.damage);
    expect(monster.hp).toBe(20);
  });

  it('player strike honours an explicit attack power (e.g. a sword bonus)', () => {
    const result = playerStrikesMonster(makeMonster({ hp: 30 }), 99, PLAYER_ATTACK + 4);
    expect(result.roll.damage).toBeGreaterThanOrEqual(1);
    expect(result.roll.damage).toBeLessThanOrEqual(PLAYER_ATTACK + 4);
  });

  it('monster strike rolls in 1..monster.attack against the player', () => {
    const player = makePlayer(10);
    const monster = makeMonster({ attack: 4 });
    const result = monsterStrikesPlayer(player, monster, 55);
    expect(result.roll.damage).toBeGreaterThanOrEqual(1);
    expect(result.roll.damage).toBeLessThanOrEqual(4);
    expect(result.target.hp).toBe(10 - result.roll.damage);
    expect(player.hp).toBe(10);
  });

  it('a killing monster blow zeroes player hp and flags killed', () => {
    const player = makePlayer(2);
    const monster = makeMonster({ attack: 20 });
    const state = findKillingState(monster.attack, 2);
    const result = monsterStrikesPlayer(player, monster, state);
    expect(result.target.hp).toBe(0);
    expect(result.killed).toBe(true);
    expect(isDead(result.target)).toBe(true);
  });

  it('a chained fight to the death replays identically from the same rngState', () => {
    const run = (): number[] => {
      const damages: number[] = [];
      let state = 2024;
      let monster = makeMonster({ hp: 30 });
      while (!isDead(monster)) {
        const result = playerStrikesMonster(monster, state);
        damages.push(result.roll.damage);
        monster = result.target;
        state = result.roll.rngState;
      }
      return damages;
    };
    const first = run();
    expect(first).toEqual(run());
    expect(first.length).toBeGreaterThanOrEqual(Math.ceil(30 / PLAYER_ATTACK));
  });
});
