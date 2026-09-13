using System.Net;
using System.Net.Http.Json;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

public class InviteTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Invite_registration_creates_user_with_personal_workspace()
    {
        var owner = factory.CreateClient();
        await owner.LoginAsOwnerAsync();

        var inviteRes = await owner.PostAsJsonAsync("/api/invites", new { email = "alice@test.local", expiresInHours = 2 });
        Assert.Equal(HttpStatusCode.Created, inviteRes.StatusCode);
        var invite = (await inviteRes.Content.ReadFromJsonAsync<InviteCreatedResponse>(TestClient.Json))!;
        Assert.Contains(invite.Code, invite.Url);

        var anon = factory.CreateClient();
        var check = await anon.GetJsonAsync<InviteCheckResponse>($"/api/auth/invite/{invite.Code}");
        Assert.True(check.Valid);
        Assert.Equal("alice@test.local", check.Email);

        // bound to alice's email
        var wrong = await anon.PostAsJsonAsync("/api/auth/register", new { inviteCode = invite.Code, email = "bob@test.local", password = "password-123", displayName = "Bob" });
        Assert.Equal(HttpStatusCode.BadRequest, wrong.StatusCode);

        var reg = await anon.PostAsJsonAsync("/api/auth/register", new { inviteCode = invite.Code, email = "Alice@Test.local", password = "password-123", displayName = "Alice" });
        Assert.Equal(HttpStatusCode.OK, reg.StatusCode);
        var auth = (await reg.Content.ReadFromJsonAsync<AuthResponse>(TestClient.Json))!;
        Assert.Equal("alice@test.local", auth.User.Email);
        Assert.False(auth.User.IsInstanceOwner);
        var ws = Assert.Single(auth.Workspaces);
        Assert.True(ws.IsPersonal);
        Assert.Equal("owner", ws.Role);

        // registered client is signed in
        var me = await anon.GetJsonAsync<AuthResponse>("/api/me");
        Assert.Equal(auth.User.Id, me.User.Id);

        // invite is single-use
        var again = await factory.CreateClient().PostAsJsonAsync("/api/auth/register", new { inviteCode = invite.Code, email = "alice2@test.local", password = "password-123", displayName = "A2" });
        Assert.Equal(HttpStatusCode.Gone, again.StatusCode);
        Assert.False((await factory.CreateClient().GetJsonAsync<InviteCheckResponse>($"/api/auth/invite/{invite.Code}")).Valid);
    }

    [Fact]
    public async Task Unknown_invite_is_400_and_non_owner_cannot_invite()
    {
        var anon = factory.CreateClient();
        var res = await anon.PostAsJsonAsync("/api/auth/register", new { inviteCode = "nope", email = "x@test.local", password = "password-123", displayName = "X" });
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.False((await anon.GetJsonAsync<InviteCheckResponse>("/api/auth/invite/nope")).Valid);

        var owner = factory.CreateClient();
        await owner.LoginAsOwnerAsync();
        var (member, _) = await factory.RegisterUserAsync(owner, "member@test.local");
        var forbidden = await member.PostAsJsonAsync("/api/invites", new { });
        Assert.Equal(HttpStatusCode.Forbidden, forbidden.StatusCode);
    }
}
