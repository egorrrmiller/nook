using System.Net.Http.Json;
using System.Text.Json;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

/// <summary>Small helpers on top of <see cref="HttpClient"/> (each client keeps its own cookie jar == one user session).</summary>
public static class TestClient
{
    public static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public static async Task<AuthResponse> LoginAsync(this HttpClient client, string email, string password)
    {
        var res = await client.PostAsJsonAsync("/api/auth/login", new { email, password });
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<AuthResponse>(Json))!;
    }

    public static Task<AuthResponse> LoginAsOwnerAsync(this HttpClient client) => client.LoginAsync(NookApiFactory.OwnerEmail, NookApiFactory.OwnerPassword);

    /// <summary>Owner creates an invite; a new client registers with it. Returns the new user's session + auth response.</summary>
    public static async Task<(HttpClient Client, AuthResponse Auth)> RegisterUserAsync(this NookApiFactory factory, HttpClient ownerClient, string email, string displayName = "User")
    {
        var inviteRes = await ownerClient.PostAsJsonAsync("/api/invites", new { });
        inviteRes.EnsureSuccessStatusCode();
        var invite = (await inviteRes.Content.ReadFromJsonAsync<InviteCreatedResponse>(Json))!;

        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/register", new { inviteCode = invite.Code, email, password = "password-123", displayName });
        res.EnsureSuccessStatusCode();
        return (client, (await res.Content.ReadFromJsonAsync<AuthResponse>(Json))!);
    }

    public static HttpClient WithWorkspace(this HttpClient client, Guid workspaceId)
    {
        client.DefaultRequestHeaders.Remove("X-Workspace-Id");
        client.DefaultRequestHeaders.Add("X-Workspace-Id", workspaceId.ToString());
        return client;
    }

    public static async Task<NodeDto> CreateNodeAsync(this HttpClient client, string title, Guid? parentId = null, string kind = "page")
    {
        var res = await client.PostAsJsonAsync("/api/nodes", new { parentId, kind, title });
        Assert.Equal(System.Net.HttpStatusCode.Created, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<NodeDto>(Json))!;
    }

    public static async Task<T> GetJsonAsync<T>(this HttpClient client, string url)
    {
        var res = await client.GetAsync(url);
        res.EnsureSuccessStatusCode();
        return (await res.Content.ReadFromJsonAsync<T>(Json))!;
    }

    public static HttpRequestMessage Internal(HttpMethod method, string url, object? body = null)
    {
        var req = new HttpRequestMessage(method, url);
        req.Headers.Add("X-Internal-Token", NookApiFactory.InternalToken);
        if (body is not null) req.Content = JsonContent.Create(body, options: Json);
        return req;
    }
}
