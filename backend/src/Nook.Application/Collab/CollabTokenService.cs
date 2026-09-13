using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Nodes;
using Nook.Application.Users;
using Nook.Domain.Enums;

namespace Nook.Application.Collab;

public sealed class CollabOptions
{
    public const string SectionName = "Collab";
    public string JwtSecret { get; set; } = "";
    public string WsUrl { get; set; } = "/collab";
    public int TokenLifetimeMinutes { get; set; } = 10;
}

/// <summary>Issues short-lived HS256 JWTs for the Hocuspocus collab service (see contracts §3).</summary>
public sealed class CollabTokenService(NodeService nodes, ICurrentUser currentUser, IClock clock, CollabOptions options)
{
    public async Task<CollabTokenResponse> IssueAsync(Guid nodeId, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(options.JwtSecret))
            throw new InvalidOperationException("NOOK_COLLAB_JWT_SECRET is not configured.");

        var (_, role) = await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var now = clock.UtcNow;
        var payload = new Dictionary<string, object?>
        {
            ["sub"] = currentUser.UserId.ToString(),
            ["name"] = currentUser.DisplayName ?? currentUser.Email ?? "user",
            ["color"] = UserColor.For(currentUser.UserId),
            ["node"] = nodeId.ToString(),
            ["role"] = role.CanEdit() ? "editor" : "viewer",
            ["iat"] = now.ToUnixTimeSeconds(),
            ["exp"] = now.AddMinutes(options.TokenLifetimeMinutes).ToUnixTimeSeconds(),
        };
        return new CollabTokenResponse(Jwt.SignHs256(payload, options.JwtSecret), options.WsUrl);
    }
}

/// <summary>Minimal HS256 JWT encoder/decoder (no external dependency).</summary>
public static class Jwt
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static string SignHs256(IDictionary<string, object?> payload, string secret)
    {
        var header = Base64Url(JsonSerializer.SerializeToUtf8Bytes(new { alg = "HS256", typ = "JWT" }, Json));
        var body = Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload, Json));
        var signingInput = $"{header}.{body}";
        var signature = Base64Url(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(signingInput)));
        return $"{signingInput}.{signature}";
    }

    /// <summary>Verifies the signature and returns the payload, or <c>null</c> if invalid. Does not check expiry.</summary>
    public static JsonElement? VerifyHs256(string token, string secret)
    {
        var parts = token.Split('.');
        if (parts.Length != 3) return null;
        var expected = Base64Url(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{parts[0]}.{parts[1]}")));
        if (!CryptographicOperations.FixedTimeEquals(Encoding.UTF8.GetBytes(expected), Encoding.UTF8.GetBytes(parts[2]))) return null;
        return JsonSerializer.Deserialize<JsonElement>(FromBase64Url(parts[1]));
    }

    public static string Base64Url(byte[] bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    public static byte[] FromBase64Url(string s)
    {
        var padded = s.Replace('-', '+').Replace('_', '/');
        padded = padded.PadRight(padded.Length + (4 - padded.Length % 4) % 4, '=');
        return Convert.FromBase64String(padded);
    }
}
