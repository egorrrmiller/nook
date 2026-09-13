using Nook.Domain.Ordering;

namespace Nook.UnitTests.Ordering;

public class FractionalIndexTests
{
    [Theory]
    [InlineData(null, null, "a0")]
    [InlineData(null, "a0", "Zz")]
    [InlineData("a0", null, "a1")]
    [InlineData("a0", "a1", "a0V")]
    [InlineData("a0V", "a1", "a0l")]
    [InlineData("Zz", "a0", "ZzV")]
    [InlineData("Zz", "a1", "a0")]
    [InlineData(null, "Y00", "Xzzz")]
    [InlineData("bzz", null, "c000")]
    [InlineData("a0", "a0V", "a0G")]
    [InlineData("a0", "a0G", "a08")]
    [InlineData("b125", "b129", "b127")]
    [InlineData("a0", "a1V", "a1")]
    [InlineData("Zz", "a01", "a0")]
    [InlineData(null, "a0V", "a0")]
    [InlineData(null, "b999", "b99")]
    [InlineData(null, "A000000000000000000000000001", "A000000000000000000000000000V")]
    [InlineData("zzzzzzzzzzzzzzzzzzzzzzzzzzy", null, "zzzzzzzzzzzzzzzzzzzzzzzzzzz")]
    [InlineData("zzzzzzzzzzzzzzzzzzzzzzzzzzz", null, "zzzzzzzzzzzzzzzzzzzzzzzzzzzV")]
    public void GenerateKeyBetween_matches_reference_vectors(string? a, string? b, string expected)
    {
        Assert.Equal(expected, FractionalIndex.GenerateKeyBetween(a, b));
    }

    [Theory]
    [InlineData(null, "A00000000000000000000000000")]
    [InlineData("a00", null)]
    [InlineData("a00", "a1")]
    [InlineData("0", "1")]
    [InlineData("a1", "a0")]
    [InlineData("a0", "a0")]
    public void GenerateKeyBetween_rejects_invalid_input(string? a, string? b)
    {
        Assert.ThrowsAny<ArgumentException>(() => FractionalIndex.GenerateKeyBetween(a, b));
    }

    [Fact]
    public void GenerateNKeysBetween_matches_reference_vectors()
    {
        Assert.Equal(["a0", "a1", "a2", "a3", "a4"], FractionalIndex.GenerateNKeysBetween(null, null, 5));
        Assert.Equal(["a5", "a6", "a7", "a8", "a9", "aA", "aB", "aC", "aD", "aE"], FractionalIndex.GenerateNKeysBetween("a4", null, 10));
        Assert.Equal(["Zv", "Zw", "Zx", "Zy", "Zz"], FractionalIndex.GenerateNKeysBetween(null, "a0", 5));
        Assert.Empty(FractionalIndex.GenerateNKeysBetween("a0", "a1", 0));
    }

    [Fact]
    public void Generated_keys_between_bounds_are_strictly_ordered_and_valid()
    {
        var keys = FractionalIndex.GenerateNKeysBetween("a0", "a2", 20);
        Assert.Equal(20, keys.Count);
        var all = new List<string> { "a0" };
        all.AddRange(keys);
        all.Add("a2");
        for (var i = 1; i < all.Count; i++)
        {
            Assert.True(string.CompareOrdinal(all[i - 1], all[i]) < 0, $"{all[i - 1]} !< {all[i]}");
            Assert.True(FractionalIndex.IsValid(all[i]));
        }
    }

    [Fact]
    public void Repeated_insertion_at_the_end_and_in_the_middle_keeps_order()
    {
        string? last = null;
        var keys = new List<string>();
        for (var i = 0; i < 500; i++)
        {
            last = FractionalIndex.GenerateKeyBetween(last, null);
            keys.Add(last);
        }
        for (var i = 1; i < keys.Count; i++) Assert.True(string.CompareOrdinal(keys[i - 1], keys[i]) < 0);

        var lo = "a0";
        var hi = "a1";
        for (var i = 0; i < 100; i++)
        {
            var mid = FractionalIndex.GenerateKeyBetween(lo, hi);
            Assert.True(string.CompareOrdinal(lo, mid) < 0 && string.CompareOrdinal(mid, hi) < 0);
            if (i % 2 == 0) lo = mid; else hi = mid;
        }
    }

    [Theory]
    [InlineData("a0", true)]
    [InlineData("Zz", true)]
    [InlineData("a0V", true)]
    [InlineData("a00", false)]
    [InlineData("", false)]
    [InlineData(null, false)]
    [InlineData("0", false)]
    [InlineData("a0!", false)]
    public void IsValid_detects_malformed_keys(string? key, bool expected) => Assert.Equal(expected, FractionalIndex.IsValid(key));
}
