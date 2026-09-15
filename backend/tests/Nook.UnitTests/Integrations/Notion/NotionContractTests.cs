using Nook.Application.Integrations.Notion;
using Nook.Domain.Enums;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Primitives;

namespace Nook.UnitTests.Integrations.Notion;

public sealed class NotionContractTests
{
    [Fact]
    public void Only_the_documented_profiles_are_supported_and_version_is_required()
    {
        var resolver = new NotionVersionProfileResolver();

        Assert.Equal(["2026-03-11", "2025-09-03", "2022-06-28"], resolver.SupportedVersions);
        Assert.True(resolver.Resolve("2026-03-11").IsValid);
        Assert.True(resolver.Resolve("2025-09-03").Profile!.SupportsDatabaseDataSourceSplit);
        Assert.True(resolver.Resolve("2022-06-28").Profile!.UsesLegacyDatabaseQuery);
        Assert.Equal("missing_version", resolver.Resolve(null).ErrorCode);
        Assert.Equal("invalid_request", resolver.Resolve("2024-01-01").ErrorCode);
    }

    [Fact]
    public void Capabilities_do_not_collapse_insert_into_update_or_read()
    {
        var principal = new NotionPrincipal(
            Guid.NewGuid(), Guid.NewGuid(), InstallationTokenKind.InternalConnection, null, null,
            new NotionCapabilities(ReadContent: false, UpdateContent: false, InsertContent: true,
                ReadComments: false, InsertComments: false, ReadProperty: false, UpdateProperty: false,
                InsertProperty: false, UserInfoLevel: NotionUserInfoLevel.None));
        var policy = new NotionCapabilityPolicy();

        Assert.True(policy.Evaluate(principal, NotionCapability.InsertContent).IsAllowed);
        Assert.False(policy.Evaluate(principal, NotionCapability.ReadContent).IsAllowed);
        Assert.False(policy.Evaluate(principal, NotionCapability.UpdateContent).IsAllowed);
    }

    [Fact]
    public void Cursors_are_opaque_signed_and_bound_to_scope_and_filter()
    {
        var codec = new NotionCursorCodec(new TestConfiguration("cursor-secret"));
        var workspace = Guid.NewGuid();
        var installation = Guid.NewGuid();
        var cursor = codec.Encode(workspace, installation, "filter-a", 100);

        Assert.Equal(100, codec.Decode(workspace, installation, "filter-a", cursor).Offset);
        Assert.Throws<NotionApiException>(() => codec.Decode(workspace, installation, "filter-b", cursor));
        Assert.Throws<NotionApiException>(() => codec.Decode(Guid.NewGuid(), installation, "filter-a", cursor));
        Assert.Throws<NotionApiException>(() => codec.Decode(workspace, installation, "filter-a", cursor + "x"));
    }

    private sealed class TestConfiguration(string secret) : IConfiguration
    {
        public string? this[string key]
        {
            get => key == "NOOK_NOTION_CURSOR_SECRET" ? secret : null;
            set { }
        }

        public IEnumerable<IConfigurationSection> GetChildren() => [];
        public IChangeToken GetReloadToken() => NoopChangeToken.Instance;
        public IConfigurationSection GetSection(string key) => new TestSection(key, this);
    }

    private sealed class TestSection(string key, IConfiguration root) : IConfigurationSection
    {
        public string? this[string key]
        {
            get => root[$"{Key}:{key}"];
            set => root[$"{Key}:{key}"] = value;
        }

        public string Key { get; } = key;
        public string Path => Key;
        public string? Value { get => root[Key]; set => root[Key] = value; }
        public IEnumerable<IConfigurationSection> GetChildren() => [];
        public IChangeToken GetReloadToken() => NoopChangeToken.Instance;
        public IConfigurationSection GetSection(string childKey) => new TestSection($"{Key}:{childKey}", root);
    }

    private sealed class NoopChangeToken : IChangeToken
    {
        public static readonly NoopChangeToken Instance = new();
        public bool HasChanged => false;
        public bool ActiveChangeCallbacks => false;
        public IDisposable RegisterChangeCallback(Action<object?> callback, object? state) => EmptyDisposable.Instance;
    }

    private sealed class EmptyDisposable : IDisposable
    {
        public static readonly EmptyDisposable Instance = new();
        public void Dispose() { }
    }
}
