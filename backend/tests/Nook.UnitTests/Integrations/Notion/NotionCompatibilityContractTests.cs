using System.Text.Json;
using Nook.Application.Integrations.Notion;
using Nook.Domain.Enums;

namespace Nook.UnitTests.Integrations.Notion;

public sealed class NotionCompatibilityContractTests
{
    [Fact]
    public void VersionResolver_RequiresHeaderByDefault_AndResolvesSupportedProfiles()
    {
        var resolver = new NotionVersionProfileResolver();

        Assert.False(resolver.Resolve(null).IsValid);
        Assert.Equal("missing_version", resolver.Resolve(null).ErrorCode);

        var latest = resolver.Resolve(NotionVersionProfileResolver.LatestVersion);

        Assert.True(latest.IsValid);
        Assert.NotNull(latest.Profile);
        Assert.True(latest.Profile!.UsesPositionForBlockAppend);
        Assert.True(latest.Profile.UsesInTrash);
        Assert.True(latest.Profile.UsesMeetingNotes);
        Assert.DoesNotContain("", resolver.SupportedVersions);
    }

    [Fact]
    public void VersionResolver_MigrationModeDefaultsToLatestOnlyWhenEnabled()
    {
        var resolver = new NotionVersionProfileResolver(allowMissingVersion: true);

        var result = resolver.Resolve(" ");

        Assert.True(result.IsValid);
        Assert.Equal(NotionVersionProfileResolver.LatestVersion, result.Profile!.Version);
    }

    [Fact]
    public void VersionResolver_RejectsUnknownVersionWithoutFallback()
    {
        var resolver = new NotionVersionProfileResolver();

        var result = resolver.Resolve("2099-01-01");

        Assert.False(result.IsValid);
        Assert.Equal("invalid_request", result.ErrorCode);
        Assert.Null(result.Profile);
    }

    [Fact]
    public void CapabilityPolicy_DoesNotCollapseInsertIntoUpdateOrRead()
    {
        var principal = new NotionPrincipal(
            Guid.NewGuid(),
            Guid.NewGuid(),
            InstallationTokenKind.InternalConnection,
            null,
            Guid.NewGuid(),
            new NotionCapabilities(
                ReadContent: false,
                UpdateContent: false,
                InsertContent: true,
                ReadComments: false,
                InsertComments: false,
                ReadProperty: false,
                UpdateProperty: false,
                InsertProperty: false,
                UserInfoLevel: NotionUserInfoLevel.Basic));

        var policy = new NotionCapabilityPolicy();

        Assert.True(policy.Evaluate(principal, NotionCapability.InsertContent).IsAllowed);
        Assert.False(policy.Evaluate(principal, NotionCapability.ReadContent).IsAllowed);
        Assert.False(policy.Evaluate(principal, NotionCapability.UpdateContent).IsAllowed);
    }

    [Fact]
    public void WireContracts_UseNotionPropertyNamesAndListEnvelope()
    {
        var error = new NotionErrorResponse
        {
            Status = 403,
            Code = "restricted_resource",
            Message = "The resource is not shared with this connection.",
            RequestId = "request-1",
        };
        var list = new NotionListResponse<string>
        {
            Results = ["page-1"],
            NextCursor = "opaque-cursor",
            HasMore = true,
        };

        var json = JsonSerializer.Serialize(new { error, list });

        Assert.Contains("\"request_id\":\"request-1\"", json);
        Assert.Contains("\"next_cursor\":\"opaque-cursor\"", json);
        Assert.Contains("\"has_more\":true", json);
        Assert.DoesNotContain("StartCursor", json);
    }
}
