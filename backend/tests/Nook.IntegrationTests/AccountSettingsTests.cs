using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Nook.Application.Auth;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

/// <summary>Contracts §7.5: account, user/workspace settings, workspace patch/delete, invites.</summary>
public class AccountSettingsTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Me_patch_and_password_change()
    {
        var (client, auth) = await factory.RegisterUserAsync(await OwnerAsync(), "acct@test.local", "Acct");
        var patch = await client.PatchAsJsonAsync("/api/me", new { displayName = "  Renamed  ", avatarUrl = "https://example.com/a.png" });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var user = (await patch.Content.ReadFromJsonAsync<UserDto>(TestClient.Json))!;
        Assert.Equal("Renamed", user.DisplayName);
        Assert.Equal("https://example.com/a.png", user.AvatarUrl);
        Assert.Equal(auth.User.Id, user.Id);

        // clear avatar with explicit null; invalid values are 400
        patch = await client.PatchAsync("/api/me", JsonContent.Create(new Dictionary<string, object?> { ["avatarUrl"] = null }));
        Assert.Null((await patch.Content.ReadFromJsonAsync<UserDto>(TestClient.Json))!.AvatarUrl);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PatchAsJsonAsync("/api/me", new { displayName = "" })).StatusCode);
        Assert.Equal("Renamed", (await client.GetJsonAsync<AuthResponse>("/api/me")).User.DisplayName);

        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/me/password", new { currentPassword = "wrong", newPassword = "new-password-1" })).StatusCode);
        Assert.Equal(HttpStatusCode.BadRequest, (await client.PostAsJsonAsync("/api/me/password", new { currentPassword = "password-123", newPassword = "short" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await client.PostAsJsonAsync("/api/me/password", new { currentPassword = "password-123", newPassword = "new-password-1" })).StatusCode);

        var fresh = factory.CreateClient();
        Assert.Equal(HttpStatusCode.Unauthorized, (await fresh.PostAsJsonAsync("/api/auth/login", new { email = "acct@test.local", password = "password-123" })).StatusCode);
        await fresh.LoginAsync("acct@test.local", "new-password-1");
    }

    [Fact]
    public async Task Settings_are_scoped_per_user_and_per_workspace()
    {
        var owner = await OwnerAsync();
        var (other, otherAuth) = await factory.RegisterUserAsync(owner, "settings@test.local", "Settings");
        var wsRes = await owner.PostAsJsonAsync("/api/workspaces", new { name = "Settings WS" });
        var ws = (await wsRes.Content.ReadFromJsonAsync<WorkspaceSummary>(TestClient.Json))!.Id;

        Assert.Empty(await owner.GetJsonAsync<Dictionary<string, JsonElement>>("/api/me/settings"));
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync("/api/me/settings/theme", new { value = "dark" })).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync("/api/me/settings/sidebar", new { value = new { width = 280, collapsed = false } })).StatusCode);
        var mine = await owner.GetJsonAsync<Dictionary<string, JsonElement>>("/api/me/settings");
        Assert.Equal("dark", mine["theme"].GetString());
        Assert.Equal(280, mine["sidebar"].GetProperty("width").GetInt32());
        // overwrite
        await owner.PutAsJsonAsync("/api/me/settings/theme", new { value = "light" });
        Assert.Equal("light", (await owner.GetJsonAsync<Dictionary<string, JsonElement>>("/api/me/settings"))["theme"].GetString());
        // other user has their own scope
        Assert.Empty(await other.GetJsonAsync<Dictionary<string, JsonElement>>("/api/me/settings"));
        // 16 KB limit
        Assert.Equal(HttpStatusCode.BadRequest, (await owner.PutAsJsonAsync("/api/me/settings/big", new { value = new string('x', 17_000) })).StatusCode);

        // workspace scope: members read, owner writes
        Assert.Equal(HttpStatusCode.NoContent, (await owner.PutAsJsonAsync($"/api/workspaces/{ws}/settings/trash.retentionDays", new { value = 14 })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await other.GetAsync($"/api/workspaces/{ws}/settings")).StatusCode);
        Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync($"/api/workspaces/{ws}/members", new { email = "settings@test.local", role = "editor" })).StatusCode);
        var wsSettings = await other.GetJsonAsync<Dictionary<string, JsonElement>>($"/api/workspaces/{ws}/settings");
        Assert.Equal(14, wsSettings["trash.retentionDays"].GetInt32());
        Assert.Equal(HttpStatusCode.Forbidden, (await other.PutAsJsonAsync($"/api/workspaces/{ws}/settings/x", new { value = 1 })).StatusCode);
        // the same key in the user scope does not leak into the workspace scope
        Assert.Equal(HttpStatusCode.NoContent, (await other.PutAsJsonAsync("/api/me/settings/trash.retentionDays", new { value = 1 })).StatusCode);
        Assert.Equal(14, (await other.GetJsonAsync<Dictionary<string, JsonElement>>($"/api/workspaces/{ws}/settings"))["trash.retentionDays"].GetInt32());
        Assert.NotEqual(Guid.Empty, otherAuth.User.Id);
    }

    [Fact]
    public async Task Workspace_patch_and_delete_refuses_personal()
    {
        var owner = await OwnerAsync();
        var me = await owner.GetJsonAsync<AuthResponse>("/api/me");
        var personal = me.Workspaces.Single(w => w.IsPersonal);
        var wsRes = await owner.PostAsJsonAsync("/api/workspaces", new { name = "Temp" });
        var ws = (await wsRes.Content.ReadFromJsonAsync<WorkspaceSummary>(TestClient.Json))!;

        var patch = await owner.PatchAsJsonAsync($"/api/workspaces/{ws.Id}", new { name = "Renamed", icon = new { type = "emoji", value = "🏠" } });
        Assert.Equal(HttpStatusCode.OK, patch.StatusCode);
        var patched = (await patch.Content.ReadFromJsonAsync<WorkspaceSummary>(TestClient.Json))!;
        Assert.Equal("Renamed", patched.Name);
        Assert.Equal("🏠", patched.Icon?.Value);
        Assert.Equal("owner", patched.Role);

        // non-owner member cannot patch/delete
        var (member, _) = await factory.RegisterUserAsync(owner, "member@test.local", "Member");
        await owner.PostAsJsonAsync($"/api/workspaces/{ws.Id}/members", new { email = "member@test.local", role = "editor" });
        Assert.Equal(HttpStatusCode.Forbidden, (await member.PatchAsJsonAsync($"/api/workspaces/{ws.Id}", new { name = "nope" })).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await member.DeleteAsync($"/api/workspaces/{ws.Id}")).StatusCode);

        // content inside the workspace, then delete
        owner.WithWorkspace(ws.Id);
        var root = await owner.CreateNodeAsync("Root");
        await owner.CreateNodeAsync("Child", root.Id);
        await owner.PutAsJsonAsync($"/api/favorites/{root.Id}", new { });
        await owner.PutAsJsonAsync($"/api/workspaces/{ws.Id}/settings/k", new { value = 1 });

        Assert.Equal(HttpStatusCode.BadRequest, (await owner.DeleteAsync($"/api/workspaces/{personal.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/workspaces/{ws.Id}")).StatusCode);
        Assert.DoesNotContain((await owner.GetJsonAsync<List<WorkspaceSummary>>("/api/workspaces")), w => w.Id == ws.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.GetAsync("/api/nodes")).StatusCode); // workspace gone → no access
        Assert.Equal(HttpStatusCode.Forbidden, (await owner.DeleteAsync($"/api/workspaces/{ws.Id}")).StatusCode); // no membership left
        using var scope = factory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<Nook.Infrastructure.Persistence.AppDbContext>();
        Assert.Empty(db.Nodes.Where(n => n.WorkspaceId == ws.Id));
        Assert.Empty(db.Settings.Where(s => s.ScopeId == ws.Id));
        Assert.Empty(db.Favorites.Where(f => f.WorkspaceId == ws.Id));
    }

    [Fact]
    public async Task Invites_list_and_delete()
    {
        var owner = await OwnerAsync();
        var created = await owner.PostAsJsonAsync("/api/invites", new { email = "someone@test.local", expiresInHours = 2 });
        var invite = (await created.Content.ReadFromJsonAsync<InviteCreatedResponse>(TestClient.Json))!;

        var list = await owner.GetJsonAsync<List<InviteDto>>("/api/invites");
        var row = Assert.Single(list, i => i.Code == invite.Code);
        Assert.Equal("someone@test.local", row.Email);
        Assert.Null(row.UsedAt);
        Assert.Equal(invite.ExpiresAt, row.ExpiresAt);

        Assert.Equal(HttpStatusCode.NoContent, (await owner.DeleteAsync($"/api/invites/{invite.Code}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.DeleteAsync($"/api/invites/{invite.Code}")).StatusCode);
        Assert.False((await owner.GetJsonAsync<InviteCheckResponse>($"/api/auth/invite/{invite.Code}")).Valid);
        Assert.DoesNotContain(await owner.GetJsonAsync<List<InviteDto>>("/api/invites"), i => i.Code == invite.Code);

        // used invites show usedAt; non-owners are refused
        var (user, _) = await factory.RegisterUserAsync(owner, "invitee@test.local", "Invitee");
        Assert.Contains(await owner.GetJsonAsync<List<InviteDto>>("/api/invites"), i => i.UsedAt is not null);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.GetAsync("/api/invites")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await user.DeleteAsync("/api/invites/whatever")).StatusCode);
    }

    private async Task<HttpClient> OwnerAsync()
    {
        var client = factory.CreateClient();
        await client.LoginAsOwnerAsync();
        return client;
    }
}
