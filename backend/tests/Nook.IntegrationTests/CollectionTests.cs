using System.Net;
using System.Net.Http.Json;
using Nook.Application.Collections;
using Nook.Application.Contracts;

namespace Nook.IntegrationTests;

public sealed class CollectionTests(NookApiFactory factory) : IClassFixture<NookApiFactory>
{
    [Fact]
    public async Task Collection_database_rows_and_query_view_work_end_to_end()
    {
        var client = factory.CreateClient();
        await client.LoginAsOwnerAsync();
        var workspace = (await client.PostAsJsonAsync("/api/workspaces", new { name = "Collections" })).EnsureCreated<WorkspaceSummary>();
        client.WithWorkspace(workspace.Id);

        var collectionResponse = await client.PostAsJsonAsync("/api/collections", new
        {
            name = "Tasks",
            properties = new object[]
            {
                new { id = "status", name = "Status", type = "status", config = new { options = new[] { new { id = "todo", name = "To do" }, new { id = "done", name = "Done" } } } },
                new { id = "priority", name = "Priority", type = "number" },
                new { id = "tags", name = "Tags", type = "multi_select" },
                new { id = "due", name = "Due", type = "date" },
                new { id = "done", name = "Done", type = "checkbox" },
                new { id = "email", name = "Email", type = "email" },
                new { id = "phone", name = "Phone", type = "phone" },
                new { id = "url", name = "URL", type = "url" },
                new { id = "files", name = "Files", type = "files" },
            },
            templates = new[] { new { name = "Default" } },
            rowLayout = new { pinnedPropertyIds = new[] { "title", "status" } },
        });
        Assert.Equal(HttpStatusCode.Created, collectionResponse.StatusCode);
        var collection = (await collectionResponse.Content.ReadFromJsonAsync<CollectionDto>(TestClient.Json))!;
        Assert.Equal("title", collection.Properties[0].Id);
        Assert.Equal(10, collection.Properties.Count);

        var databaseResponse = await client.PostAsJsonAsync($"/api/collections/{collection.Id}/databases", new { title = "Task database" });
        Assert.Equal(HttpStatusCode.Created, databaseResponse.StatusCode);
        var database = (await databaseResponse.Content.ReadFromJsonAsync<DatabaseDto>(TestClient.Json))!;
        var view = Assert.Single(database.Views);
        Assert.Equal("table", view.Kind);

        var first = await CreateRowAsync(client, database.Id, "First", new
        {
            status = "todo", priority = 2, tags = new[] { "backend" }, due = "2026-01-02", done = false,
            email = "first@example.com", phone = "+10000000000", url = "https://example.com", files = Array.Empty<string>(),
        });
        var second = await CreateRowAsync(client, database.Id, "Second", new
        {
            status = "done", priority = 5, tags = new[] { "release" }, due = "2026-02-02", done = true,
            email = "second@example.com", phone = "+10000000001", url = "https://example.org", files = Array.Empty<string>(),
        });

        var query = await client.PostAsJsonAsync($"/api/views/{view.Id}/query", new
        {
            filters = new
            {
                @operator = "or",
                conditions = new object[]
                {
                    new { propertyId = "status", @operator = "equals", value = "done" },
                    new { propertyId = "priority", @operator = "greater_than", value = 10 },
                },
            },
            sorts = new[] { new { propertyId = "priority", direction = "desc" } },
            groups = new[] { new { propertyId = "status", direction = "asc" } },
        });
        Assert.Equal(HttpStatusCode.OK, query.StatusCode);
        var result = (await query.Content.ReadFromJsonAsync<CollectionQueryResponse>(TestClient.Json))!;
        Assert.Equal(1, result.Total);
        Assert.Equal(second.Node.Id, result.Rows[0].Node.Id);
        Assert.Single(result.Groups);
        Assert.Equal("done", result.Groups[0].Key);

        var invalid = await client.PostAsJsonAsync($"/api/databases/{database.Id}/rows", new
        {
            properties = new { title = "bad", no_such_property = "must fail" },
        });
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var patched = await client.PatchAsJsonAsync($"/api/views/{view.Id}", new
        {
            config = new
            {
                filters = new { @operator = "and", conditions = new[] { new { propertyId = "done", @operator = "is_checked" } } },
                sorts = new[] { new { propertyId = "priority", direction = "asc" } },
                groups = Array.Empty<object>(),
                visiblePropertyIds = new[] { "title", "priority", "done" },
                layout = new { table = new { compact = true } },
            },
        });
        Assert.Equal(HttpStatusCode.OK, patched.StatusCode);
        var savedQuery = await client.PostAsJsonAsync($"/api/views/{view.Id}/query", new { });
        var savedResult = (await savedQuery.Content.ReadFromJsonAsync<CollectionQueryResponse>(TestClient.Json))!;
        Assert.Equal([second.Node.Id], savedResult.Rows.Select(x => x.Node.Id));
        Assert.DoesNotContain(first.Node.Id, savedResult.Rows.Select(x => x.Node.Id));
    }

    [Fact]
    public async Task Collections_are_workspace_isolated_and_viewers_cannot_write()
    {
        var owner = factory.CreateClient();
        await owner.LoginAsOwnerAsync();
        var firstWorkspace = (await owner.PostAsJsonAsync("/api/workspaces", new { name = "Collection owner" })).EnsureCreated<WorkspaceSummary>();
        owner.WithWorkspace(firstWorkspace.Id);
        var first = (await (await owner.PostAsJsonAsync("/api/collections", new { name = "Private" })).Content.ReadFromJsonAsync<CollectionDto>(TestClient.Json))!;

        var secondWorkspace = (await owner.PostAsJsonAsync("/api/workspaces", new { name = "Other workspace" })).EnsureCreated<WorkspaceSummary>();
        owner.WithWorkspace(secondWorkspace.Id);
        var second = (await (await owner.PostAsJsonAsync("/api/collections", new { name = "Other" })).Content.ReadFromJsonAsync<CollectionDto>(TestClient.Json))!;

        owner.WithWorkspace(firstWorkspace.Id);
        Assert.Equal(HttpStatusCode.NotFound, (await owner.GetAsync($"/api/collections/{second.Id}")).StatusCode);

        var (viewer, _) = await factory.RegisterUserAsync(owner, "collections-viewer@test.local", "Collections Viewer");
        Assert.Equal(HttpStatusCode.Created, (await owner.PostAsJsonAsync($"/api/workspaces/{firstWorkspace.Id}/members", new { email = "collections-viewer@test.local", role = "viewer" })).StatusCode);
        viewer.WithWorkspace(firstWorkspace.Id);
        Assert.Equal(HttpStatusCode.Forbidden, (await viewer.PostAsJsonAsync("/api/collections", new { name = "Nope" })).StatusCode);
        Assert.Equal(HttpStatusCode.OK, (await viewer.GetAsync($"/api/collections/{first.Id}")).StatusCode);
    }

    private static async Task<CollectionRowDto> CreateRowAsync(HttpClient client, Guid databaseId, string title, object properties)
    {
        var response = await client.PostAsJsonAsync($"/api/databases/{databaseId}/rows", new { title, properties });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return (await response.Content.ReadFromJsonAsync<CollectionRowDto>(TestClient.Json))!;
    }
}

internal static class CollectionTestHttpExtensions
{
    public static T EnsureCreated<T>(this HttpResponseMessage response)
    {
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return response.Content.ReadFromJsonAsync<T>(TestClient.Json).GetAwaiter().GetResult()!;
    }
}
