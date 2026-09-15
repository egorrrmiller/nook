using System.Text.Json;
using Xunit;

namespace Nook.Plugin.Ai.Tests;

public sealed class AiWritingTests
{
    [Fact]
    public void PromptBuilder_includes_action_type_text_and_order()
    {
        var blocks = AiBlockSelection.Select([
            Json("""{"id":"b-2","type":"custom-card","props":{"text":"Second"},"unknown":{"keep":true}}"""),
            Json("""{"id":"b-1","type":"paragraph","content":[{"type":"text","text":"First"}]}"""),
        ]);

        var prompt = AiPromptBuilder.Build(AiAction.Rewrite, blocks);

        Assert.Contains("Operation: rewrite", prompt);
        Assert.True(prompt.IndexOf("b-2", StringComparison.Ordinal) < prompt.IndexOf("b-1", StringComparison.Ordinal));
        Assert.Contains("custom-card", prompt);
        Assert.Contains("Second", prompt);
    }

    [Fact]
    public void Selection_rejects_duplicate_ids_and_keeps_unknown_json()
    {
        var unknown = Json("""{"id":"b-1","type":"future-block","props":{"answer":42},"children":[],"vendor":{"x":true}}""");
        var selected = AiBlockSelection.Select([unknown]);

        Assert.Equal("future-block", selected[0].Type);
        Assert.Equal(42, selected[0].Json.GetProperty("props").GetProperty("answer").GetInt32());
        Assert.Throws<ValidationException>(() => AiBlockSelection.Select([unknown, unknown]));
    }

    [Fact]
    public async Task MockProvider_is_local_and_deterministic()
    {
        var provider = new MockAiProvider();
        var result = await provider.GenerateAsync(new AiProviderRequest(
            AiAction.Shorten,
            "prompt",
            [new AiPromptBlock("b-1", "paragraph", "Some text")],
            null,
            [],
            new AiProviderSettings("mock", null, null),
            null), CancellationToken.None);

        Assert.Equal("Mock shortened: Some text", result.Blocks.Single().Text);
        Assert.Empty(result.PropertySuggestions ?? []);
    }

    [Fact]
    public async Task ProviderSelector_refuses_when_provider_is_not_configured()
    {
        var selector = new AiProviderSelector(new EmptyConfiguration(), new AiProviderRegistry([]));

        await Assert.ThrowsAsync<AiProviderNotConfiguredException>(() => selector.SelectAsync(CancellationToken.None));
    }

    [Fact]
    public void Transformer_changes_text_without_dropping_unknown_fields()
    {
        var original = Json("""{"id":"b-1","type":"future-block","content":[{"type":"text","text":"Old","styles":{"bold":true}}],"props":{"vendorFlag":"keep"},"children":[{"id":"child"}],"vendor":{"nested":[1,2]}}""");

        var (proposed, changed) = AiBlockTransformer.WithText(original, "New");

        Assert.True(changed);
        Assert.Equal("New", proposed.GetProperty("content")[0].GetProperty("text").GetString());
        Assert.Equal("keep", proposed.GetProperty("props").GetProperty("vendorFlag").GetString());
        Assert.Equal(2, proposed.GetProperty("vendor").GetProperty("nested")[1].GetInt32());
        Assert.Equal("child", proposed.GetProperty("children")[0].GetProperty("id").GetString());
    }

    private static JsonElement Json(string value) => JsonDocument.Parse(value).RootElement.Clone();

    private sealed class EmptyConfiguration : IAiConfigurationReader
    {
        public Task<(AiProviderSettings Settings, string? ApiKey)> ReadProviderAsync(CancellationToken cancellationToken) =>
            Task.FromResult<(AiProviderSettings Settings, string? ApiKey)>((new AiProviderSettings(null, null, null), null));
    }
}
