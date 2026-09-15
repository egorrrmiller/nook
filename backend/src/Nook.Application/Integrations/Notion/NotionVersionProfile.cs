namespace Nook.Application.Integrations.Notion;

/// <summary>Behavior switches that are allowed to vary with the Notion API date version.</summary>
public sealed record NotionVersionProfile(
    string Version,
    bool SupportsDatabaseDataSourceSplit,
    bool SupportsViews,
    bool UsesPositionForBlockAppend,
    bool UsesInTrash,
    bool UsesMeetingNotes,
    bool UsesLegacyDatabaseQuery);

public interface INotionVersionProfileResolver
{
    IReadOnlyList<string> SupportedVersions { get; }
    bool AllowMissingVersion { get; }
    NotionVersionResolution Resolve(string? requestedVersion);
}

public sealed record NotionVersionResolution(
    bool IsValid,
    NotionVersionProfile? Profile,
    string? ErrorCode)
{
    public static NotionVersionResolution MissingVersion { get; } = new(false, null, "missing_version");
    public static NotionVersionResolution InvalidVersion { get; } = new(false, null, "invalid_request");
}

/// <summary>Central version catalog used by the future compatibility middleware and serializers.</summary>
public sealed class NotionVersionProfileResolver : INotionVersionProfileResolver
{
    public const string LatestVersion = "2026-03-11";
    public const string DataSourceVersion = "2025-09-03";
    public const string LegacyVersion = "2022-06-28";

    private static readonly IReadOnlyDictionary<string, NotionVersionProfile> Profiles =
        new Dictionary<string, NotionVersionProfile>(StringComparer.Ordinal)
        {
            [LatestVersion] = new(
                LatestVersion,
                SupportsDatabaseDataSourceSplit: true,
                SupportsViews: true,
                UsesPositionForBlockAppend: true,
                UsesInTrash: true,
                UsesMeetingNotes: true,
                UsesLegacyDatabaseQuery: false),
            [DataSourceVersion] = new(
                DataSourceVersion,
                SupportsDatabaseDataSourceSplit: true,
                SupportsViews: true,
                UsesPositionForBlockAppend: false,
                UsesInTrash: false,
                UsesMeetingNotes: false,
                UsesLegacyDatabaseQuery: false),
            [LegacyVersion] = new(
                LegacyVersion,
                SupportsDatabaseDataSourceSplit: false,
                SupportsViews: false,
                UsesPositionForBlockAppend: false,
                UsesInTrash: false,
                UsesMeetingNotes: false,
                UsesLegacyDatabaseQuery: true),
        };

    public NotionVersionProfileResolver(bool allowMissingVersion = false)
    {
        AllowMissingVersion = allowMissingVersion;
        SupportedVersions = Profiles.Keys.ToArray();
    }

    public IReadOnlyList<string> SupportedVersions { get; }
    public bool AllowMissingVersion { get; }

    public NotionVersionResolution Resolve(string? requestedVersion)
    {
        if (string.IsNullOrWhiteSpace(requestedVersion))
        {
            return AllowMissingVersion
                ? new NotionVersionResolution(true, Profiles[LatestVersion], null)
                : NotionVersionResolution.MissingVersion;
        }

        return Profiles.TryGetValue(requestedVersion.Trim(), out var profile)
            ? new NotionVersionResolution(true, profile, null)
            : NotionVersionResolution.InvalidVersion;
    }
}
