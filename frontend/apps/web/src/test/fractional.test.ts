import { describe, expect, it } from 'vitest';
import { generateKeyBetween, generateNKeysBetween, isValidOrderKey, positionAt } from '../lib/fractional';

describe('fractional indexing (base-62, fractional-indexing compatible)', () => {
  it('matches the reference vectors', () => {
    expect(generateKeyBetween(null, null)).toBe('a0');
    expect(generateKeyBetween(null, 'a0')).toBe('Zz');
    expect(generateKeyBetween('a0', null)).toBe('a1');
    expect(generateKeyBetween('a0', 'a1')).toBe('a0V');
    expect(generateKeyBetween('a1', 'a2')).toBe('a1V');
    expect(generateKeyBetween('a0V', 'a1')).toBe('a0l');
    expect(generateKeyBetween('Zz', 'a0')).toBe('ZzV');
    expect(generateKeyBetween('Zz', 'a1')).toBe('a0');
    expect(generateKeyBetween(null, 'Y00')).toBe('Xzzz');
    expect(generateKeyBetween('bzz', null)).toBe('c000');
    expect(generateKeyBetween('a0', 'a0V')).toBe('a0G');
    expect(generateKeyBetween('b125', 'b129')).toBe('b127');
    expect(generateKeyBetween('a0', 'a1V')).toBe('a1');
    expect(generateKeyBetween('Zz', 'a01')).toBe('a0');
    expect(generateKeyBetween(null, 'b999')).toBe('b99');
    expect(generateKeyBetween('a0', 'a0G')).toBe('a08');
    expect(generateKeyBetween('zzzzzzzzzzzzzzzzzzzzzzzzzzz', null)).toBe('zzzzzzzzzzzzzzzzzzzzzzzzzzzV');
  });

  it('always yields a key strictly between its neighbours', () => {
    let a: string | null = null;
    const keys: string[] = [];
    for (let i = 0; i < 200; i++) {
      a = generateKeyBetween(a, null);
      keys.push(a);
    }
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1]! < keys[i]!).toBe(true);
    let lo = 'a0';
    const hi = 'a1';
    for (let i = 0; i < 50; i++) {
      const mid = generateKeyBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      lo = mid;
    }
  });

  it('rejects malformed keys and inverted ranges', () => {
    expect(() => generateKeyBetween('a1', 'a0')).toThrow();
    expect(() => generateKeyBetween('a00', null)).toThrow();
    expect(isValidOrderKey('a0')).toBe(true);
    expect(isValidOrderKey('a00')).toBe(false);
    expect(isValidOrderKey('')).toBe(false);
  });

  it('spreads n keys', () => {
    const keys = generateNKeysBetween('a0', 'a1', 5);
    expect(keys).toHaveLength(5);
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1]! < keys[i]!).toBe(true);
    expect(keys[0]! > 'a0' && keys[4]! < 'a1').toBe(true);
  });

  it('positionAt inserts first / middle / last', () => {
    const list = ['a0', 'a1', 'a2'];
    expect(positionAt(list, 0) < 'a0').toBe(true);
    const mid = positionAt(list, 1);
    expect(mid > 'a0' && mid < 'a1').toBe(true);
    expect(positionAt(list, 3) > 'a2').toBe(true);
    expect(positionAt([], 0)).toBe('a0');
  });
});
