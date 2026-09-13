using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.DependencyInjection;
using Nook.Application.Collab;
using Nook.Infrastructure;
using Nook.Infrastructure.Collab;

namespace Nook.IntegrationTests;

/// <summary>DI wiring of <see cref="ICollabClient"/>: the fake in the test host, the HTTP client elsewhere.</summary>
public class CollabClientTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Test_host_resolves_the_fake_collab_client()
    {
        using var scope = factory.CreateScope();
        var client = scope.ServiceProvider.GetRequiredService<ICollabClient>();
        var fake = Assert.IsType<FakeCollabClient>(client);
        Assert.Same(factory.CollabClient, fake);

        var nodeId = Guid.NewGuid();
        var blocks = FakeCollabClient.Paragraphs(["Hello", "World"]);
        await client.ImportAsync(nodeId, "Imported", blocks, userId: null, CancellationToken.None);
        var (title, stored) = await client.GetBlocksAsync(nodeId, CancellationToken.None);
        Assert.Equal("Imported", title);
        Assert.Equal(2, stored.GetArrayLength());

        var applied = await client.ApplyOpsAsync(nodeId, FakeCollabClient.Parse("""[{"op":"setTitle","title":"x"},{"op":"remove","blockIds":[]}]"""), Guid.NewGuid(), CancellationToken.None);
        Assert.Equal(2, applied);
        Assert.Equal(2, fake.OpsApplied);

        Assert.Equal("Hello\n\nWorld", await client.ConvertToMarkdownAsync(blocks, CancellationToken.None));
        var roundtrip = await client.ConvertFromMarkdownAsync("Hello\n\nWorld", CancellationToken.None);
        Assert.Equal(["Hello", "World"], FakeCollabClient.Texts(roundtrip));
    }

    [Fact]
    public void AddCollabClient_registers_the_http_implementation()
    {
        var services = new ServiceCollection();
        services.AddCollabClient(new CollabClientOptions("http://127.0.0.1:1235", "tok"));
        using var sp = services.BuildServiceProvider();
        using var scope = sp.CreateScope();
        Assert.IsType<CollabHttpClient>(scope.ServiceProvider.GetRequiredService<ICollabClient>());

        var http = sp.GetRequiredService<IHttpClientFactory>().CreateClient(CollabHttpClient.ClientName);
        Assert.Equal(new Uri("http://127.0.0.1:1235/"), http.BaseAddress);
        Assert.Equal(TimeSpan.FromSeconds(30), http.Timeout);
        Assert.Equal("tok", http.DefaultRequestHeaders.GetValues(CollabHttpClient.TokenHeader).Single());
    }

    [Fact]
    public async Task Http_client_sends_contract_routes_and_headers()
    {
        var handler = new StubHandler();
        var client = new CollabHttpClient(new StubFactory(handler, "tok"));
        var nodeId = Guid.NewGuid();
        var userId = Guid.NewGuid();

        handler.Next = Respond(HttpStatusCode.OK, """{"applied":3}""");
        var applied = await client.ApplyOpsAsync(nodeId, FakeCollabClient.Parse("[]"), userId, CancellationToken.None);
        Assert.Equal(3, applied);
        Assert.Equal(HttpMethod.Post, handler.Last!.Method);
        Assert.Equal($"http://collab.test/internal/docs/{nodeId}/ops", handler.Last.RequestUri!.ToString());
        Assert.Equal("tok", handler.Last.Headers.GetValues(CollabHttpClient.TokenHeader).Single());
        Assert.Equal(userId.ToString(), handler.Last.Headers.GetValues(CollabHttpClient.UserHeader).Single());

        handler.Next = Respond(HttpStatusCode.OK, """{"title":"T","blocks":[{"id":"b1","type":"paragraph","props":{},"content":[],"children":[]}]}""");
        var (title, blocks) = await client.GetBlocksAsync(nodeId, CancellationToken.None);
        Assert.Equal("T", title);
        Assert.Equal("b1", blocks[0].GetProperty("id").GetString());
        Assert.Equal(HttpMethod.Get, handler.Last!.Method);
        Assert.False(handler.Last.Headers.Contains(CollabHttpClient.UserHeader));

        handler.Next = Respond(HttpStatusCode.OK, """{"result":"# md"}""");
        Assert.Equal("# md", await client.ConvertToMarkdownAsync(blocks, CancellationToken.None));
        Assert.Equal("http://collab.test/internal/convert", handler.Last!.RequestUri!.ToString());
        using (var body = JsonDocument.Parse(handler.LastBody!))
        {
            Assert.Equal("blocks", body.RootElement.GetProperty("from").GetString());
            Assert.Equal("markdown", body.RootElement.GetProperty("to").GetString());
        }

        handler.Next = Respond(HttpStatusCode.OK, """{"result":"<p>x</p>"}""");
        await client.ConvertToHtmlAsync(blocks, "lossy", CancellationToken.None);
        using (var body = JsonDocument.Parse(handler.LastBody!))
            Assert.Equal("lossy", body.RootElement.GetProperty("htmlMode").GetString());

        handler.Next = Respond(HttpStatusCode.OK, """{"result":[{"id":"n1","type":"paragraph","props":{},"content":[],"children":[]}]}""");
        var fromMd = await client.ConvertFromMarkdownAsync("x", CancellationToken.None);
        Assert.Equal(1, fromMd.GetArrayLength());
        using (var body = JsonDocument.Parse(handler.LastBody!))
        {
            Assert.Equal("markdown", body.RootElement.GetProperty("from").GetString());
            Assert.Equal("x", body.RootElement.GetProperty("content").GetString());
        }
    }

    [Fact]
    public async Task Http_client_maps_failures_to_nook_exceptions()
    {
        var handler = new StubHandler();
        var client = new CollabHttpClient(new StubFactory(handler, "tok"));

        handler.Next = _ => throw new HttpRequestException("connection refused");
        var unavailable = await Assert.ThrowsAsync<CollabUnavailableException>(() => client.GetBlocksAsync(Guid.NewGuid(), CancellationToken.None));
        Assert.Equal(503, unavailable.Status);

        handler.Next = Respond(HttpStatusCode.BadRequest, """{"error":"blocks must be an array"}""");
        var rejected = await Assert.ThrowsAsync<CollabRequestException>(() => client.ImportAsync(Guid.NewGuid(), "t", FakeCollabClient.Parse("{}"), null, CancellationToken.None));
        Assert.Equal(502, rejected.Status);
        Assert.Equal(400, rejected.UpstreamStatus);
        Assert.Contains("blocks must be an array", rejected.Message);

        handler.Next = Respond(HttpStatusCode.BadGateway, """{"error":"backend: 500"}""");
        await Assert.ThrowsAsync<CollabUnavailableException>(() => client.ConvertToMarkdownAsync(FakeCollabClient.Parse("[]"), CancellationToken.None));
    }

    [Fact]
    public async Task Node_json_carries_hasChildren_and_omits_null_properties()
    {
        var client = factory.CreateClient();
        var auth = await client.LoginAsOwnerAsync();
        client.WithWorkspace(auth.Workspaces[0].Id);
        var node = await client.CreateNodeAsync("Wire shape");

        var raw = await client.GetStringAsync($"/api/nodes/{node.Id}");
        using var doc = JsonDocument.Parse(raw);
        Assert.True(doc.RootElement.TryGetProperty("hasChildren", out var hasChildren));
        Assert.Equal(JsonValueKind.False, hasChildren.ValueKind);
        Assert.False(doc.RootElement.TryGetProperty("properties", out _));
        Assert.False(node.HasChildren);
        Assert.Null(node.Properties);
    }

    // --- stubs ---------------------------------------------------------------------------------------------------------

    private static Func<HttpRequestMessage, HttpResponseMessage> Respond(HttpStatusCode status, string json) =>
        _ => new HttpResponseMessage(status) { Content = new StringContent(json, Encoding.UTF8, "application/json") };

    private sealed class StubHandler : HttpMessageHandler
    {
        public Func<HttpRequestMessage, HttpResponseMessage> Next { get; set; } = Respond(HttpStatusCode.OK, "{}");
        public HttpRequestMessage? Last { get; private set; }
        public string? LastBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Last = request;
            LastBody = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
            return Next(request);
        }
    }

    private sealed class StubFactory(HttpMessageHandler handler, string token) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name)
        {
            Assert.Equal(CollabHttpClient.ClientName, name);
            var client = new HttpClient(handler, disposeHandler: false) { BaseAddress = new Uri("http://collab.test/") };
            client.DefaultRequestHeaders.Add(CollabHttpClient.TokenHeader, token);
            return client;
        }
    }
}
