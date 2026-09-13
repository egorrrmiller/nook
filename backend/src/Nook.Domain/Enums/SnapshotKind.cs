namespace Nook.Domain.Enums;

/// <summary>Why a page snapshot was taken (contracts §9.7).</summary>
public enum SnapshotKind
{
    Auto,
    Manual,
    PreRestore,
}

public static class SnapshotKindExtensions
{
    public static string ToWire(this SnapshotKind kind) => kind switch
    {
        SnapshotKind.Manual => "manual",
        SnapshotKind.PreRestore => "pre-restore",
        _ => "auto",
    };

    public static SnapshotKind ParseWire(string? value) => value?.ToLowerInvariant() switch
    {
        "manual" => SnapshotKind.Manual,
        "pre-restore" => SnapshotKind.PreRestore,
        _ => SnapshotKind.Auto,
    };
}
