using System.Text.Json;

namespace Nook.Plugins.Sdk;

/// <summary>Server-side definition of a custom BlockNote block type.</summary>
public interface IBlockTypeDefinition
{
    /// <summary>The BlockNote <c>type</c> string.</summary>
    string TypeName { get; }

    /// <summary>Extract searchable plain text from a block JSON (<c>{id,type,props,content,children}</c>). Children are handled by the host.</summary>
    string ExtractText(JsonElement block);

    /// <summary>Optional Markdown rendering for export. Return <c>null</c> to fall back to the default renderer.</summary>
    string? RenderMarkdown(JsonElement block) => null;

    /// <summary>Optional HTML rendering for export. Return <c>null</c> to fall back to the default renderer.</summary>
    string? RenderHtml(JsonElement block) => null;
}
