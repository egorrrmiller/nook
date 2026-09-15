using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;

namespace Nook.Application.Integrations.Notion;

public sealed record NotionCursorState(int Offset, string Fingerprint);

public interface INotionCursorCodec
{
    string Encode(Guid workspaceId, Guid installationId, string fingerprint, int offset);
    NotionCursorState Decode(Guid workspaceId, Guid installationId, string fingerprint, string value);
}

public sealed class NotionCursorCodec(IConfiguration configuration) : INotionCursorCodec
{
    private readonly byte[] secret = Encoding.UTF8.GetBytes(
        configuration["NOOK_NOTION_CURSOR_SECRET"] ?? configuration["NOOK_INTERNAL_TOKEN"] ?? "nook-development-notion-cursor-secret");

    public string Encode(Guid workspaceId, Guid installationId, string fingerprint, int offset)
    {
        var payload = JsonSerializer.Serialize(new CursorPayload(workspaceId, installationId, fingerprint, offset));
        var body = Base64Url(Encoding.UTF8.GetBytes(payload));
        var signature = Base64Url(Hmac(body));
        return $"{body}.{signature}";
    }

    public NotionCursorState Decode(Guid workspaceId, Guid installationId, string fingerprint, string value)
    {
        var parts = value.Split('.', 2);
        if (parts.Length != 2) throw new NotionApiException(400, "invalid_request", "Invalid start_cursor.");
        var expected = Hmac(parts[0]);
        byte[] supplied;
        try { supplied = FromBase64Url(parts[1]); }
        catch (FormatException) { throw new NotionApiException(400, "invalid_request", "Invalid start_cursor."); }
        if (!CryptographicOperations.FixedTimeEquals(expected, supplied))
            throw new NotionApiException(400, "invalid_request", "Invalid start_cursor.");

        CursorPayload? payload;
        try { payload = JsonSerializer.Deserialize<CursorPayload>(FromBase64Url(parts[0])); }
        catch (JsonException) { payload = null; }
        if (payload is null || payload.WorkspaceId != workspaceId || payload.InstallationId != installationId
            || !string.Equals(payload.Fingerprint, fingerprint, StringComparison.Ordinal) || payload.Offset < 0)
            throw new NotionApiException(400, "invalid_request", "Invalid start_cursor.");
        return new NotionCursorState(payload.Offset, payload.Fingerprint);
    }

    private byte[] Hmac(string body) => HMACSHA256.HashData(secret, Encoding.UTF8.GetBytes(body));

    private static string Base64Url(ReadOnlySpan<byte> bytes) => Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] FromBase64Url(string value)
    {
        var padded = value.Replace('-', '+').Replace('_', '/');
        padded += new string('=', (4 - padded.Length % 4) % 4);
        return Convert.FromBase64String(padded);
    }

    private sealed record CursorPayload(Guid WorkspaceId, Guid InstallationId, string Fingerprint, int Offset);
}
