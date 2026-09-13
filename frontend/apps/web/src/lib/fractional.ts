/**
 * Fractional indexing with base-62 keys — a port of the `fractional-indexing` npm package (CC0),
 * byte-for-byte compatible with `Nook.Domain.Ordering.FractionalIndex` on the backend, so keys
 * generated here and there interleave correctly. Keys sort by ordinal string comparison.
 */
export const BASE_62_DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SMALLEST_INTEGER = 'A00000000000000000000000000';

function getIntegerLength(head: string): number {
  if (head >= 'a' && head <= 'z') return head.charCodeAt(0) - 'a'.charCodeAt(0) + 2;
  if (head >= 'A' && head <= 'Z') return 'Z'.charCodeAt(0) - head.charCodeAt(0) + 2;
  throw new Error(`invalid order key head: ${head}`);
}

function getIntegerPart(key: string): string {
  const len = getIntegerLength(key[0]!);
  if (len > key.length) throw new Error(`invalid order key: ${key}`);
  return key.slice(0, len);
}

function validateInteger(int: string) {
  if (int.length !== getIntegerLength(int[0]!)) throw new Error(`invalid integer part of order key: ${int}`);
}

function validateOrderKey(key: string, digits: string) {
  if (key === SMALLEST_INTEGER) throw new Error(`invalid order key: ${key}`);
  const i = getIntegerPart(key);
  const f = key.slice(i.length);
  if (f.length > 0 && f[f.length - 1] === digits[0]) throw new Error(`invalid order key: ${key}`);
  for (const ch of key) if (!digits.includes(ch)) throw new Error(`invalid character in order key: ${ch}`);
}

function incrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const head = x[0]!;
  const digs = x.slice(1).split('');
  let carry = true;
  for (let i = digs.length - 1; carry && i >= 0; i--) {
    const d = digits.indexOf(digs[i]!) + 1;
    if (d === digits.length) digs[i] = digits[0]!;
    else {
      digs[i] = digits[d]!;
      carry = false;
    }
  }
  if (carry) {
    if (head === 'Z') return 'a' + digits[0];
    if (head === 'z') return null;
    const h = String.fromCharCode(head.charCodeAt(0) + 1);
    if (h > 'a') digs.push(digits[0]!);
    else digs.pop();
    return h + digs.join('');
  }
  return head + digs.join('');
}

function decrementInteger(x: string, digits: string): string | null {
  validateInteger(x);
  const head = x[0]!;
  const digs = x.slice(1).split('');
  let borrow = true;
  for (let i = digs.length - 1; borrow && i >= 0; i--) {
    const d = digits.indexOf(digs[i]!) - 1;
    if (d === -1) digs[i] = digits[digits.length - 1]!;
    else {
      digs[i] = digits[d]!;
      borrow = false;
    }
  }
  if (borrow) {
    if (head === 'a') return 'Z' + digits[digits.length - 1];
    if (head === 'A') return null;
    const h = String.fromCharCode(head.charCodeAt(0) - 1);
    if (h < 'Z') digs.push(digits[digits.length - 1]!);
    else digs.pop();
    return h + digs.join('');
  }
  return head + digs.join('');
}

/** Strictly between fractional parts `a` < `b` (either may be ''). */
function midpoint(a: string, b: string, digits: string): string {
  const zero = digits[0]!;
  if (b !== '' && a >= b) throw new Error(`${a} >= ${b}`);
  if (a.slice(-1) === zero || (b && b.slice(-1) === zero)) throw new Error('trailing zero');
  if (b) {
    let n = 0;
    while ((a[n] || zero) === b[n]) n++;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n), digits);
  }
  const digitA = a ? digits.indexOf(a[0]!) : 0;
  const digitB = b ? digits.indexOf(b[0]!) : digits.length;
  if (digitB - digitA > 1) {
    const midDigit = Math.round(0.5 * (digitA + digitB));
    return digits[midDigit]!;
  }
  if (b && b.length > 1) return b.slice(0, 1);
  return digits[digitA] + midpoint(a.slice(1), '', digits);
}

/**
 * A key strictly between `a` and `b`. `null` for `a` = before everything, `null` for `b` = after
 * everything; both `null` = the first key of an empty list (`"a0"`).
 */
export function generateKeyBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  digits = BASE_62_DIGITS,
): string {
  if (a != null) validateOrderKey(a, digits);
  if (b != null) validateOrderKey(b, digits);
  if (a != null && b != null && a >= b) throw new Error(`${a} >= ${b}`);
  if (a == null) {
    if (b == null) return 'a' + digits[0];
    const ib = getIntegerPart(b);
    const fb = b.slice(ib.length);
    if (ib === SMALLEST_INTEGER) return ib + midpoint('', fb, digits);
    if (ib < b) return ib;
    const res = decrementInteger(ib, digits);
    if (res == null) throw new Error('cannot decrement any more');
    return res;
  }
  if (b == null) {
    const ia = getIntegerPart(a);
    const fa = a.slice(ia.length);
    const i = incrementInteger(ia, digits);
    return i == null ? ia + midpoint(fa, '', digits) : i;
  }
  const ia = getIntegerPart(a);
  const fa = a.slice(ia.length);
  const ib = getIntegerPart(b);
  const fb = b.slice(ib.length);
  if (ia === ib) return ia + midpoint(fa, fb, digits);
  const i = incrementInteger(ia, digits);
  if (i == null) throw new Error('cannot increment any more');
  if (i < b) return i;
  return ia + midpoint(fa, '', digits);
}

/** `n` keys strictly between `a` and `b`, evenly-ish spread. */
export function generateNKeysBetween(
  a: string | null | undefined,
  b: string | null | undefined,
  n: number,
  digits = BASE_62_DIGITS,
): string[] {
  if (n === 0) return [];
  if (n === 1) return [generateKeyBetween(a, b, digits)];
  if (b == null) {
    let c = generateKeyBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(c, b, digits);
      result.push(c);
    }
    return result;
  }
  if (a == null) {
    let c = generateKeyBetween(a, b, digits);
    const result = [c];
    for (let i = 0; i < n - 1; i++) {
      c = generateKeyBetween(a, c, digits);
      result.push(c);
    }
    result.reverse();
    return result;
  }
  const mid = Math.floor(n / 2);
  const midKey = generateKeyBetween(a, b, digits);
  return [
    ...generateNKeysBetween(a, midKey, mid, digits),
    midKey,
    ...generateNKeysBetween(midKey, b, n - mid - 1, digits),
  ];
}

export function isValidOrderKey(key: string | null | undefined, digits = BASE_62_DIGITS): boolean {
  if (!key) return false;
  try {
    validateOrderKey(key, digits);
    return true;
  } catch {
    return false;
  }
}

/**
 * Position for inserting into an ordered sibling list at `index` (0 = first, `siblings.length` =
 * last). Tolerates legacy/invalid keys by falling back to append-after-last semantics.
 */
export function positionAt(siblingPositions: readonly string[], index: number): string {
  const valid = siblingPositions.map((p) => (isValidOrderKey(p) ? p : null));
  const before = index > 0 ? (valid[index - 1] ?? null) : null;
  const after = index < valid.length ? (valid[index] ?? null) : null;
  try {
    return generateKeyBetween(before, after);
  } catch {
    return generateKeyBetween(before, null);
  }
}
