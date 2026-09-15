using Nook.Domain.Enums;

namespace Nook.Application.Integrations.Notion;

/// <summary>Immutable capability snapshot used by application services and endpoint adapters.</summary>
public sealed record NotionCapabilities(
    bool ReadContent,
    bool UpdateContent,
    bool InsertContent,
    bool ReadComments,
    bool InsertComments,
    bool ReadProperty,
    bool UpdateProperty,
    bool InsertProperty,
    NotionUserInfoLevel UserInfoLevel)
{
    public static NotionCapabilities FromDomain(Nook.Domain.Entities.IntegrationCapabilities capabilities)
    {
        ArgumentNullException.ThrowIfNull(capabilities);
        return new NotionCapabilities(
            capabilities.ReadContent,
            capabilities.UpdateContent,
            capabilities.InsertContent,
            capabilities.ReadComments,
            capabilities.InsertComments,
            capabilities.ReadProperty,
            capabilities.UpdateProperty,
            capabilities.InsertProperty,
            capabilities.UserInfoLevel);
    }

    public bool Allows(NotionCapability capability) => capability switch
    {
        NotionCapability.ReadContent => ReadContent,
        NotionCapability.UpdateContent => UpdateContent,
        NotionCapability.InsertContent => InsertContent,
        NotionCapability.ReadComments => ReadComments,
        NotionCapability.InsertComments => InsertComments,
        NotionCapability.ReadProperty => ReadProperty,
        NotionCapability.UpdateProperty => UpdateProperty,
        NotionCapability.InsertProperty => InsertProperty,
        _ => false,
    };
}

public interface INotionCapabilityPolicy
{
    NotionCapabilityDecision Evaluate(NotionPrincipal principal, NotionCapability capability);
}

/// <summary>Pure capability check. User/workspace permissions are intentionally evaluated by the grant policy.</summary>
public sealed class NotionCapabilityPolicy : INotionCapabilityPolicy
{
    public NotionCapabilityDecision Evaluate(NotionPrincipal principal, NotionCapability capability)
    {
        ArgumentNullException.ThrowIfNull(principal);
        return principal.Capabilities.Allows(capability)
            ? new NotionCapabilityDecision(true, capability)
            : new NotionCapabilityDecision(false, capability);
    }
}

public sealed record NotionCapabilityDecision(bool IsAllowed, NotionCapability Capability);
