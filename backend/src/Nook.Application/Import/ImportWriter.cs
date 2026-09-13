using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Application.Documents;
using Nook.Application.Files;
using Nook.Application.Knowledge;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.Ordering;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Import;

/// <summary>
/// Page creation shared by the built-in importers: makes the node, pushes the blocks into the live document through
/// <see cref="ICollabClient.ImportAsync"/> and rebuilds the derived projections. Attachments are written into the §8 blob
/// store through <see cref="IBlobStore"/> (§8).
/// </summary>
public sealed class ImportWriter(
    IAppDbContext db,
    ICollabClient collab,
    DocumentStoreService documents,
    IBlobStore blobs,
    IOutbox outbox,
    IClock clock)
{
    /// <summary>Creates an empty page; blocks are filled in later by <see cref="FillAsync"/>.</summary>
    public async Task<Node> CreatePageAsync(Guid workspaceId, Guid? parentId, string title, Guid userId, CancellationToken ct)
    {
        var now = clock.UtcNow;
        var node = new Node
        {
            WorkspaceId = workspaceId,
            ParentId = parentId,
            Kind = NodeKind.Page,
            Title = NormalizeTitle(title),
            Position = await NextPositionAsync(workspaceId, parentId, ct),
            PageSettings = Domain.ValueObjects.PageSettings.Default,
            CreatedAt = now,
            UpdatedAt = now,
        };
        db.Nodes.Add(node);
        outbox.Enqueue(new NodeCreated(workspaceId, node.Id, parentId, node.Kind.ToWire(), userId));
        await db.SaveChangesAsync(ct);
        return node;
    }

    /// <summary>Writes the document content of an already created page.</summary>
    public async Task FillAsync(Node node, string title, JsonElement blocks, Guid userId, CancellationToken ct)
    {
        await collab.ImportAsync(node.Id, title, blocks, userId, ct);
        await documents.ProjectServerSideAsync(node, title, blocks, userId, ct);
    }

    /// <summary>Stores bytes in the blob store and links them to <paramref name="node"/>; returns the attachment.</summary>
    public async Task<Attachment> AddAttachmentAsync(Node node, string fileName, string mime, byte[] bytes, CancellationToken ct)
    {
        using var source = new MemoryStream(bytes, writable: false);
        var stored = await blobs.StoreAsync(source, bytes.LongLength, ct);
        var sha = stored.Sha256;

        if (!await db.Blobs.AnyAsync(b => b.Sha256 == sha, ct))
            db.Blobs.Add(new Blob { Sha256 = sha, Size = stored.Size, Mime = mime, StoredAt = clock.UtcNow });

        var attachment = new Attachment
        {
            WorkspaceId = node.WorkspaceId, NodeId = node.Id, BlobSha = sha,
            Filename = fileName.Length > 1000 ? fileName[..1000] : fileName,
            Mime = mime, Size = bytes.LongLength, CreatedAt = clock.UtcNow,
        };
        db.Attachments.Add(attachment);
        await db.SaveChangesAsync(ct);
        return attachment;
    }

    public static string NormalizeTitle(string? title)
    {
        var t = (title ?? "").Trim();
        if (t.Length == 0) return "Untitled";
        return t.Length > 1000 ? t[..1000] : t;
    }

    private async Task<string> NextPositionAsync(Guid workspaceId, Guid? parentId, CancellationToken ct)
    {
        var last = await db.Nodes.AsNoTracking()
            .Where(n => n.WorkspaceId == workspaceId && n.ParentId == parentId && n.DeletedAt == null)
            .OrderByDescending(n => n.Position)
            .Select(n => n.Position)
            .FirstOrDefaultAsync(ct);
        return FractionalIndex.GenerateKeyBetween(FractionalIndex.IsValid(last) ? last : null, null);
    }

    public static string MimeFor(string fileName) => Path.GetExtension(fileName).ToLowerInvariant() switch
    {
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".webp" => "image/webp",
        ".svg" => "image/svg+xml",
        ".avif" => "image/avif",
        ".bmp" => "image/bmp",
        ".pdf" => "application/pdf",
        ".mp4" => "video/mp4",
        ".webm" => "video/webm",
        ".mp3" => "audio/mpeg",
        ".wav" => "audio/wav",
        _ => "application/octet-stream",
    };

    public static bool IsImage(string fileName) => MimeFor(fileName).StartsWith("image/", StringComparison.Ordinal);
}
