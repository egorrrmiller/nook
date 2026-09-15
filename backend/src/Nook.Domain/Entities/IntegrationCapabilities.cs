using Nook.Domain.Enums;

namespace Nook.Domain.Entities;

/// <summary>Fine-grained permissions for one integration installation.</summary>
public class IntegrationCapabilities
{
    public Guid InstallationId { get; set; }
    public bool ReadContent { get; set; }
    public bool UpdateContent { get; set; }
    public bool InsertContent { get; set; }
    public bool ReadComments { get; set; }
    public bool InsertComments { get; set; }
    public bool ReadProperty { get; set; }
    public bool UpdateProperty { get; set; }
    public bool InsertProperty { get; set; }
    public NotionUserInfoLevel UserInfoLevel { get; set; } = NotionUserInfoLevel.None;

    public IntegrationInstallation? Installation { get; set; }
}
