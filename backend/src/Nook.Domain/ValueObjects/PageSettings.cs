namespace Nook.Domain.ValueObjects;

public sealed record PageSettings(
    string Font = "default",
    bool SmallText = false,
    bool FullWidth = false,
    bool Locked = false)
{
    public static readonly PageSettings Default = new();
}
