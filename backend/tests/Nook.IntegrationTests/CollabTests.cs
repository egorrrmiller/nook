using System.Net;
using System.Text.Json;
using Nook.Application.Collab;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

public class CollabTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Collab_token_is_a_10_minute_hs256_jwt_with_contract_claims()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var node = await client.CreateNodeAsync("Doc");

        var res = await client.GetJsonAsync<CollabTokenResponse>($"/api/collab/token?nodeId={node.Id}");
        Assert.Equal("/collab", res.WsUrl);
        Assert.Equal(3, res.Token.Split('.').Length);

        var header = JsonSerializer.Deserialize<JsonElement>(Jwt.FromBase64Url(res.Token.Split('.')[0]));
        Assert.Equal("HS256", header.GetProperty("alg").GetString());

        var payload = Jwt.VerifyHs256(res.Token, NookApiFactory.CollabJwtSecret);
        Assert.NotNull(payload);
        var p = payload.Value;
        Assert.Equal(auth.User.Id.ToString(), p.GetProperty("sub").GetString());
        Assert.Equal(auth.User.DisplayName, p.GetProperty("name").GetString());
        Assert.StartsWith("#", p.GetProperty("color").GetString());
        Assert.Equal(node.Id.ToString(), p.GetProperty("node").GetString());
        Assert.Equal("editor", p.GetProperty("role").GetString());
        Assert.Equal(600, p.GetProperty("exp").GetInt64() - p.GetProperty("iat").GetInt64());

        Assert.Null(Jwt.VerifyHs256(res.Token, "wrong-secret"));

        // header-less call falls back to the node's workspace
        var bare = factory.CreateClient();
        await bare.LoginAsOwnerAsync();
        Assert.Equal(HttpStatusCode.OK, (await bare.GetAsync($"/api/collab/token?nodeId={node.Id}")).StatusCode);

        // strangers get nothing
        var (stranger, _) = await factory.RegisterUserAsync(client, "s@test.local");
        Assert.Equal(HttpStatusCode.Forbidden, (await stranger.GetAsync($"/api/collab/token?nodeId={node.Id}")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await bare.GetAsync($"/api/collab/token?nodeId={Guid.NewGuid()}")).StatusCode);
    }
}
