using System.Text.Json;
using System.Text.Json.Serialization;

namespace Nook.Application.Integrations.Notion;

/// <summary>Stable error envelope for the Notion-compatible wire API.</summary>
public sealed record NotionErrorResponse
{
    [JsonPropertyName("object")]
    public string Object { get; init; } = "error";

    [JsonPropertyName("status")]
    public int Status { get; init; }

    [JsonPropertyName("code")]
    public required string Code { get; init; }

    [JsonPropertyName("message")]
    public required string Message { get; init; }

    [JsonPropertyName("request_id")]
    public string? RequestId { get; init; }

    [JsonPropertyName("additional_data")]
    public JsonElement? AdditionalData { get; init; }
}

/// <summary>Opaque cursor pagination request shared by compatibility endpoint adapters.</summary>
public sealed record NotionPaginationRequest
{
    [JsonPropertyName("start_cursor")]
    public string? StartCursor { get; init; }

    [JsonPropertyName("page_size")]
    public int? PageSize { get; init; }
}

/// <summary>Standard Notion list envelope; cursors must remain opaque to callers.</summary>
public sealed record NotionListResponse<T>
{
    [JsonPropertyName("object")]
    public string Object { get; init; } = "list";

    [JsonPropertyName("type")]
    public string? Type { get; init; }

    [JsonPropertyName("results")]
    public IReadOnlyList<T> Results { get; init; } = Array.Empty<T>();

    [JsonPropertyName("next_cursor")]
    public string? NextCursor { get; init; }

    [JsonPropertyName("has_more")]
    public bool HasMore { get; init; }
}
