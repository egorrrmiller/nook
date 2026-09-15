using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Nook.Application.Auth;
using Nook.Application.Contracts;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.IntegrationTests;

public sealed class NotionCompatibilityTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Missing_version_uses_the_notion_error_envelope_without_native_problem_details()
    {
        var response = await factory.CreateClient().GetAsync("/v1/users/me");
        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("error", json.RootElement.GetProperty("object").GetString());
        Assert.Equal("missing_version", json.RootElement.GetProperty("code").GetString());
        Assert.True(json.RootElement.TryGetProperty("request_id", out _));
        Assert.False(json.RootElement.TryGetProperty("type", out _));
    }

    [Fact]
    public async Task Compatibility_api_requires_bearer_token_and_does_not_use_cookie_session()
    {
        var client = factory.CreateClient();
        client.DefaultRequestHeaders.Add("Notion-Version", "2026-03-11");
        var response = await client.GetAsync("/v1/users/me");
        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        using var json = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        Assert.Equal("unauthorized", json.RootElement.GetProperty("code").GetString());
        Assert.Equal("error", json.RootElement.GetProperty("object").GetString());
    }

    [Fact]
    public async Task Internal_installation_reads_only_granted_pages_without_workspace_header()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var allowed = await client.CreateNodeAsync("Allowed from Notion");
        var hidden = await client.CreateNodeAsync("Hidden from Notion");
        const string rawToken = "nook-notion-integration-test-token";

        using (var scope = factory.CreateScope())
        {
            var db = scope.ServiceProvider.GetRequiredService<Nook.Infrastructure.Persistence.AppDbContext>();
            var integration = new Integration
            {
                ClientId = "notion-test-client",
                Name = "Notion test connection",
                Kind = IntegrationKind.Internal,
            };
            var installation = new IntegrationInstallation
            {
                Integration = integration,
                WorkspaceId = auth.Workspaces[0].Id,
                TokenHash = AuthService.HashToken(rawToken),
                TokenKind = InstallationTokenKind.InternalConnection,
            };
            db.Integrations.Add(integration);
            db.IntegrationInstallations.Add(installation);
            db.IntegrationCapabilities.Add(new IntegrationCapabilities
            {
                Installation = installation,
                ReadContent = true,
                UserInfoLevel = NotionUserInfoLevel.Basic,
            });
            db.IntegrationGrants.Add(new IntegrationGrant { Installation = installation, NodeId = allowed.Id });
            await db.SaveChangesAsync();
        }

        var notion = factory.CreateClient();
        notion.DefaultRequestHeaders.Add("Authorization", $"Bearer {rawToken}");
        notion.DefaultRequestHeaders.Add("Notion-Version", "2026-03-11");

        var page = await notion.GetAsync($"/v1/pages/{allowed.Id}");
        Assert.Equal(HttpStatusCode.OK, page.StatusCode);
        using (var pageJson = JsonDocument.Parse(await page.Content.ReadAsStringAsync()))
        {
            Assert.Equal("page", pageJson.RootElement.GetProperty("object").GetString());
            Assert.Equal("Allowed from Notion", pageJson.RootElement.GetProperty("properties").GetProperty("title").GetProperty("title")[0].GetProperty("plain_text").GetString());
        }

        Assert.Equal(HttpStatusCode.NotFound, (await notion.GetAsync($"/v1/pages/{hidden.Id}")).StatusCode);
        var search = await notion.PostAsJsonAsync("/v1/search", new { query = "Notion" });
        Assert.Equal(HttpStatusCode.OK, search.StatusCode);
        using var searchJson = JsonDocument.Parse(await search.Content.ReadAsStringAsync());
        Assert.Single(searchJson.RootElement.GetProperty("results").EnumerateArray());
    }
}
