using System.Text.Json;

namespace Nook.Domain.Entities;

/// <summary>
/// Flat projection of the Y.Doc content (one row per BlockNote block). Derived data — rebuilt on every store.
/// <c>text_ru</c>/<c>text_en</c> are generated tsvector columns defined in the EF model (shadow properties).
/// </summary>
public class Block
{
    public Guid Id { get; set; }
    public Guid NodeId { get; set; }
    public Guid? ParentBlockId { get; set; }
    public int Position { get; set; }
    public string Type { get; set; } = "paragraph";
    public JsonElement Props { get; set; }
    public JsonElement? Content { get; set; }
    public int SchemaVersion { get; set; } = 1;
    public int Version { get; set; } = 1;
    public string PlainText { get; set; } = "";
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;
}
