namespace Nook.Domain.Enums;

/// <summary>Identifies the bearer-token flow used by a compatibility installation.</summary>
public enum InstallationTokenKind
{
    InternalConnection = 0,
    PersonalAccessToken = 1,
    OAuthAccessToken = 2,
}
