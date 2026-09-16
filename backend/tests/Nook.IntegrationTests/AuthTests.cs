using System.Net;
using System.Net.Http.Json;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

public class AuthTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Owner_is_seeded_and_can_login_logout()
    {
        var client = factory.CreateClient();

        var me = await client.GetAsync("/api/me");
        Assert.Equal(HttpStatusCode.Unauthorized, me.StatusCode);

        var auth = await client.LoginAsOwnerAsync();
        Assert.Equal(NookApiFactory.OwnerEmail, auth.User.Email);
        Assert.True(auth.User.IsInstanceOwner);
        var personal = Assert.Single(auth.Workspaces);
        Assert.True(personal.IsPersonal);
        Assert.Equal("owner", personal.Role);

        var meOk = await client.GetJsonAsync<AuthResponse>("/api/me");
        Assert.Equal(auth.User.Id, meOk.User.Id);

        var logout = await client.PostAsync("/api/auth/logout", null);
        Assert.Equal(HttpStatusCode.NoContent, logout.StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Wrong_password_is_401_and_sets_no_cookie()
    {
        var client = factory.CreateClient();
        var res = await client.PostAsJsonAsync("/api/auth/login", new { email = NookApiFactory.OwnerEmail, password = "nope-nope" });
        Assert.Equal(HttpStatusCode.Unauthorized, res.StatusCode);
        Assert.False(res.Headers.Contains("Set-Cookie"));
    }

    [Fact]
    public async Task Session_cookie_is_named_nook_session_and_http_only()
    {
        var client = factory.CreateClient(new() { HandleCookies = false });
        var res = await client.PostAsJsonAsync("/api/auth/login", new { email = NookApiFactory.OwnerEmail, password = NookApiFactory.OwnerPassword });
        res.EnsureSuccessStatusCode();
        var cookie = Assert.Single(res.Headers.GetValues("Set-Cookie"));
        Assert.StartsWith("nook_session=", cookie);
        Assert.Contains("httponly", cookie, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("samesite=lax", cookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Session_cookie_security_follows_forwarded_request_scheme()
    {
        var http = factory.CreateClient(new() { HandleCookies = false });
        var httpResponse = await http.PostAsJsonAsync("/api/auth/login", new { email = NookApiFactory.OwnerEmail, password = NookApiFactory.OwnerPassword });
        httpResponse.EnsureSuccessStatusCode();
        var httpCookie = Assert.Single(httpResponse.Headers.GetValues("Set-Cookie"));
        Assert.DoesNotContain("; secure", httpCookie, StringComparison.OrdinalIgnoreCase);

        var https = factory.CreateClient(new() { HandleCookies = false });
        https.DefaultRequestHeaders.Add("X-Forwarded-Proto", "https");
        var httpsResponse = await https.PostAsJsonAsync("/api/auth/login", new { email = NookApiFactory.OwnerEmail, password = NookApiFactory.OwnerPassword });
        httpsResponse.EnsureSuccessStatusCode();
        var httpsCookie = Assert.Single(httpsResponse.Headers.GetValues("Set-Cookie"));
        Assert.Contains("; secure", httpsCookie, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Api_tokens_authenticate_with_bearer_and_respect_scopes()
    {
        var client = factory.CreateClient();
        await client.LoginAsOwnerAsync();

        var created = await client.PostAsJsonAsync("/api/api-tokens", new { name = "ci", scopes = new[] { "read" } });
        Assert.Equal(HttpStatusCode.Created, created.StatusCode);
        var token = (await created.Content.ReadFromJsonAsync<ApiTokenCreatedResponse>(TestClient.Json))!;
        Assert.StartsWith("nook_", token.Token);

        var bearer = factory.CreateClient();
        bearer.DefaultRequestHeaders.Authorization = new("Bearer", token.Token);
        var me = await bearer.GetJsonAsync<AuthResponse>("/api/me");
        Assert.Equal(NookApiFactory.OwnerEmail, me.User.Email);

        // read scope cannot mutate
        var create = await bearer.PostAsJsonAsync("/api/workspaces", new { name = "nope" });
        Assert.Equal(HttpStatusCode.Forbidden, create.StatusCode);

        var list = await client.GetJsonAsync<List<ApiTokenDto>>("/api/api-tokens");
        Assert.Contains(list, t => t.Id == token.Id);

        Assert.Equal(HttpStatusCode.NoContent, (await client.DeleteAsync($"/api/api-tokens/{token.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await bearer.GetAsync("/api/me")).StatusCode);
    }

    [Fact]
    public async Task Health_and_openapi_are_public()
    {
        var client = factory.CreateClient();
        var health = await client.GetAsync("/api/health");
        Assert.Equal(HttpStatusCode.OK, health.StatusCode);
        Assert.Contains("\"ok\"", await health.Content.ReadAsStringAsync());

        var openapi = await client.GetAsync("/openapi/v1.json");
        Assert.Equal(HttpStatusCode.OK, openapi.StatusCode);
        var text = await openapi.Content.ReadAsStringAsync();
        Assert.Contains("/api/nodes/{id}", text);
        Assert.Contains("/api/collab/token", text);
    }
}
