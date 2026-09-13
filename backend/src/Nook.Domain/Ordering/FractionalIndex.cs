using System.Text;

namespace Nook.Domain.Ordering;

/// <summary>
/// Fractional indexing with base-62 keys, compatible with the <c>fractional-indexing</c> npm package
/// (same algorithm and output, so the frontend and backend can generate interchangeable keys).
/// Keys sort by ordinal string comparison. Smallest integer part is <c>A00000000000000000000000000</c>,
/// largest is <c>zzzzzzzzzzzzzzzzzzzzzzzzzzz</c>. A key never ends with '0' in its fractional part.
/// </summary>
public static class FractionalIndex
{
    public const string Base62Digits = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    private const string SmallestInteger = "A00000000000000000000000000";

    /// <summary>Key of the first item in an empty list.</summary>
    public static string First() => GenerateKeyBetween(null, null);

    /// <summary>
    /// Generates a key strictly between <paramref name="a"/> and <paramref name="b"/>.
    /// <c>null</c> for <paramref name="a"/> means "before everything", <c>null</c> for <paramref name="b"/> "after everything".
    /// </summary>
    public static string GenerateKeyBetween(string? a, string? b, string digits = Base62Digits)
    {
        if (a is not null) ValidateOrderKey(a, digits);
        if (b is not null) ValidateOrderKey(b, digits);
        if (a is not null && b is not null && string.CompareOrdinal(a, b) >= 0)
            throw new ArgumentException($"{a} >= {b}");

        if (a is null)
        {
            if (b is null) return "a" + digits[0];

            var ib = GetIntegerPart(b);
            var fb = b[ib.Length..];
            if (ib == SmallestInteger) return ib + Midpoint("", fb, digits);
            if (string.CompareOrdinal(ib, b) < 0) return ib;
            var res = DecrementInteger(ib, digits) ?? throw new InvalidOperationException("cannot decrement any more");
            return res;
        }

        if (b is null)
        {
            var ia = GetIntegerPart(a);
            var fa = a[ia.Length..];
            var i = IncrementInteger(ia, digits);
            return i ?? ia + Midpoint(fa, "", digits);
        }

        {
            var ia = GetIntegerPart(a);
            var fa = a[ia.Length..];
            var ib = GetIntegerPart(b);
            var fb = b[ib.Length..];
            if (ia == ib) return ia + Midpoint(fa, fb, digits);
            var i = IncrementInteger(ia, digits) ?? throw new InvalidOperationException("cannot increment any more");
            if (string.CompareOrdinal(i, b) < 0) return i;
            return ia + Midpoint(fa, "", digits);
        }
    }

    /// <summary>Generates <paramref name="n"/> keys strictly between <paramref name="a"/> and <paramref name="b"/>, evenly-ish spread.</summary>
    public static IReadOnlyList<string> GenerateNKeysBetween(string? a, string? b, int n, string digits = Base62Digits)
    {
        if (n < 0) throw new ArgumentOutOfRangeException(nameof(n));
        if (n == 0) return [];
        if (n == 1) return [GenerateKeyBetween(a, b, digits)];

        if (b is null)
        {
            var c = GenerateKeyBetween(a, b, digits);
            var result = new List<string>(n) { c };
            for (var i = 0; i < n - 1; i++)
            {
                c = GenerateKeyBetween(c, b, digits);
                result.Add(c);
            }
            return result;
        }

        if (a is null)
        {
            var c = GenerateKeyBetween(a, b, digits);
            var result = new List<string>(n) { c };
            for (var i = 0; i < n - 1; i++)
            {
                c = GenerateKeyBetween(a, c, digits);
                result.Add(c);
            }
            result.Reverse();
            return result;
        }

        var mid = n / 2;
        var midKey = GenerateKeyBetween(a, b, digits);
        var list = new List<string>(n);
        list.AddRange(GenerateNKeysBetween(a, midKey, mid, digits));
        list.Add(midKey);
        list.AddRange(GenerateNKeysBetween(midKey, b, n - mid - 1, digits));
        return list;
    }

    /// <summary>Returns true if <paramref name="key"/> is a well-formed order key.</summary>
    public static bool IsValid(string? key, string digits = Base62Digits)
    {
        if (string.IsNullOrEmpty(key)) return false;
        try
        {
            ValidateOrderKey(key, digits);
            return true;
        }
        catch (ArgumentException)
        {
            return false;
        }
    }

    // --- internals -------------------------------------------------------------------------------------------------

    private static int GetIntegerLength(char head)
    {
        if (head is >= 'a' and <= 'z') return head - 'a' + 2;
        if (head is >= 'A' and <= 'Z') return 'Z' - head + 2;
        throw new ArgumentException($"invalid order key head: {head}");
    }

    private static string GetIntegerPart(string key)
    {
        var integerPartLength = GetIntegerLength(key[0]);
        if (integerPartLength > key.Length) throw new ArgumentException($"invalid order key: {key}");
        return key[..integerPartLength];
    }

    private static void ValidateInteger(string integer)
    {
        if (integer.Length != GetIntegerLength(integer[0]))
            throw new ArgumentException($"invalid integer part of order key: {integer}");
    }

    private static void ValidateOrderKey(string key, string digits)
    {
        if (key == SmallestInteger) throw new ArgumentException($"invalid order key: {key}");
        var i = GetIntegerPart(key);
        var f = key[i.Length..];
        if (f.Length > 0 && f[^1] == digits[0]) throw new ArgumentException($"invalid order key: {key}");
        foreach (var ch in key)
        {
            if (digits.IndexOf(ch) < 0) throw new ArgumentException($"invalid character in order key: {ch}");
        }
    }

    private static string? IncrementInteger(string x, string digits)
    {
        ValidateInteger(x);
        var head = x[0];
        var digs = x[1..].ToCharArray();
        var carry = true;
        for (var i = digs.Length - 1; carry && i >= 0; i--)
        {
            var d = digits.IndexOf(digs[i]) + 1;
            if (d == digits.Length)
            {
                digs[i] = digits[0];
            }
            else
            {
                digs[i] = digits[d];
                carry = false;
            }
        }

        if (carry)
        {
            if (head == 'Z') return "a" + digits[0];
            if (head == 'z') return null;
            var h = (char)(head + 1);
            var sb = new StringBuilder().Append(h).Append(digs);
            if (h > 'a') sb.Append(digits[0]);
            else sb.Length -= 1;
            return sb.ToString();
        }

        return head + new string(digs);
    }

    private static string? DecrementInteger(string x, string digits)
    {
        ValidateInteger(x);
        var head = x[0];
        var digs = x[1..].ToCharArray();
        var borrow = true;
        for (var i = digs.Length - 1; borrow && i >= 0; i--)
        {
            var d = digits.IndexOf(digs[i]) - 1;
            if (d == -1)
            {
                digs[i] = digits[^1];
            }
            else
            {
                digs[i] = digits[d];
                borrow = false;
            }
        }

        if (borrow)
        {
            if (head == 'a') return "Z" + digits[^1];
            if (head == 'A') return null;
            var h = (char)(head - 1);
            var sb = new StringBuilder().Append(h).Append(digs);
            if (h < 'Z') sb.Append(digits[^1]); // upper-case heads: smaller letter == longer integer part
            else sb.Length -= 1;
            return sb.ToString();
        }

        return head + new string(digs);
    }

    /// <summary>Midpoint between fractional parts a and b; b == "" means +infinity.</summary>
    private static string Midpoint(string a, string b, string digits)
    {
        if (b.Length > 0 && string.CompareOrdinal(a, b) >= 0) throw new ArgumentException($"{a} >= {b}");
        if ((a.Length > 0 && a[^1] == digits[0]) || (b.Length > 0 && b[^1] == digits[0]))
            throw new ArgumentException("trailing zero");

        if (b.Length > 0)
        {
            var n = 0;
            while (n < b.Length && (n < a.Length ? a[n] : digits[0]) == b[n]) n++;
            if (n > 0) return b[..n] + Midpoint(n < a.Length ? a[n..] : "", b[n..], digits);
        }

        var digitA = a.Length > 0 ? digits.IndexOf(a[0]) : 0;
        var digitB = b.Length > 0 ? digits.IndexOf(b[0]) : digits.Length;
        if (digitB - digitA > 1)
        {
            var midDigit = (int)Math.Round(0.5 * (digitA + digitB), MidpointRounding.AwayFromZero);
            return digits[midDigit].ToString();
        }

        if (b.Length > 1) return b[..1];
        return digits[digitA] + Midpoint(a.Length > 0 ? a[1..] : "", "", digits);
    }
}
