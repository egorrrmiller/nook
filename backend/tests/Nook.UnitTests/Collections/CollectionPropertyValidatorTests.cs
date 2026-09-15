using System.Text.Json;
using Nook.Application.Collections;
using Nook.Application.Common;

namespace Nook.UnitTests.Collections;

public sealed class CollectionPropertyValidatorTests
{
    [Fact]
    public void Schema_adds_title_and_preserves_future_facing_config()
    {
        var (json, properties) = CollectionPropertyValidator.NormalizeSchema(
        [
            new CollectionPropertyRequest("status", "Status", "status", Json("{'options':[{'id':'todo','name':'To do'}]}")),
            new CollectionPropertyRequest("amount", "Amount", "number"),
        ]);

        Assert.Equal(["title", "status", "amount"], properties.Select(x => x.Id));
        Assert.Equal("title", properties[0].Type);
        Assert.Equal(JsonValueKind.Array, json.ValueKind);
        Assert.Equal("todo", properties[1].Config.GetProperty("options")[0].GetProperty("id").GetString());
    }

    [Fact]
    public void Values_are_normalized_for_all_mvp_types()
    {
        var schema = CollectionPropertyValidator.NormalizeSchema(
        [
            new CollectionPropertyRequest("title", "Name", "title"),
            new CollectionPropertyRequest("tags", "Tags", "multi_select"),
            new CollectionPropertyRequest("due", "Due", "date"),
            new CollectionPropertyRequest("files", "Files", "files"),
            new CollectionPropertyRequest("done", "Done", "checkbox"),
            new CollectionPropertyRequest("email", "Email", "email"),
        ]).Properties;

        var values = CollectionPropertyValidator.ValidateValues(Json("""
            {"title":" Task ","tags":["one","one","two"],"due":"2026-01-02","files":["11111111-1111-1111-1111-111111111111"],"done":true,"email":"user@example.com"}
            """), schema);

        Assert.Equal("Task", values.GetProperty("title").GetString());
        Assert.Equal(2, values.GetProperty("tags").GetArrayLength());
        Assert.Equal("2026-01-02", values.GetProperty("due").GetProperty("start").GetString());
        Assert.True(values.GetProperty("done").GetBoolean());
    }

    [Theory]
    [InlineData("unknown")]
    [InlineData("bad property")]
    public void Invalid_schema_is_rejected(string type)
    {
        Assert.Throws<ValidationException>(() => CollectionPropertyValidator.NormalizeSchema(
            [new CollectionPropertyRequest("bad", "Bad", type)]));
    }

    [Fact]
    public void Unknown_row_property_is_rejected_instead_of_being_dropped()
    {
        var schema = CollectionPropertyValidator.NormalizeSchema(
            [new CollectionPropertyRequest("title", "Name", "title")]).Properties;

        var error = Assert.Throws<ValidationException>(() => CollectionPropertyValidator.ValidateValues(
            Json("{'title':'ok','future':'kept'}"), schema));

        Assert.Contains("future", error.Errors!.Keys);
    }

    private static JsonElement Json(string value)
    {
        using var document = JsonDocument.Parse(value.Replace('\'', '"'));
        return document.RootElement.Clone();
    }
}
