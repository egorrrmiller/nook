using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Knowledge;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Properties;

/// <summary>Contracts §9.4: page aliases, unique (case-insensitive) per workspace across nodes.</summary>
public sealed class AliasService(IAppDbContext db, IWorkspaceContextAccessor contextAccessor, NodeService nodes, IOutbox outbox, IClock clock)
{
    public const int MaxAliasLength = 500;
    public const int MaxAliases = 50;

    public async Task<IReadOnlyList<string>> GetAsync(Guid nodeId, CancellationToken ct)
    {
        await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        return await db.Aliases.AsNoTracking().Where(a => a.NodeId == nodeId).OrderBy(a => a.Value).Select(a => a.Value).ToListAsync(ct);
    }

    public async Task<IReadOnlyList<string>> SetAsync(Guid nodeId, SetAliasesRequest request, CancellationToken ct)
    {
        var ctx = contextAccessor.Required;
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Editor, ct, tracking: true);

        var wanted = new List<string>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var raw in request.Aliases ?? [])
        {
            var value = (raw ?? "").Trim();
            if (value.Length == 0) continue;
            if (value.Length > MaxAliasLength) throw new ValidationException($"Alias is too long (max {MaxAliasLength} chars).");
            if (seen.Add(value)) wanted.Add(value);
        }
        if (wanted.Count > MaxAliases) throw new ValidationException($"At most {MaxAliases} aliases per page.");

        var lowered = wanted.Select(w => w.ToLowerInvariant()).ToArray();
        if (lowered.Length > 0)
        {
            var ws = ctx.WorkspaceId;
            var clashes = await (from a in db.Aliases.AsNoTracking()
                                 join n in db.Nodes.AsNoTracking() on a.NodeId equals n.Id
                                 where n.WorkspaceId == ws && n.DeletedAt == null && a.NodeId != nodeId && lowered.Contains(a.Value.ToLower())
                                 orderby a.Value
                                 select new { Alias = a.Value, Node = n }).ToListAsync(ct);
            if (clashes.Count > 0)
            {
                // Contracts §9.4: the 409 lists every taken alias together with the node holding it.
                var conflicts = clashes.Select(c => new AliasConflict(c.Alias, NodeSummaryDto.From(c.Node))).ToList();
                var first = conflicts[0];
                throw new ConflictException($"Alias '{first.Alias}' is already used by '{first.Node.Title}'.")
                {
                    Extensions = new Dictionary<string, object?>
                    {
                        ["conflicts"] = conflicts,
                        ["alias"] = first.Alias,
                        ["conflictingNodeId"] = first.Node.Id,
                    },
                };
            }
        }

        var existing = await db.Aliases.Where(a => a.NodeId == nodeId).ToListAsync(ct);
        var changed = false;
        foreach (var row in existing)
        {
            if (wanted.Any(w => string.Equals(w, row.Value, StringComparison.Ordinal))) continue;
            db.Aliases.Remove(row);
            changed = true;
        }
        var present = existing.Select(e => e.Value).ToHashSet(StringComparer.Ordinal);
        foreach (var value in wanted)
        {
            if (present.Contains(value)) continue;
            db.Aliases.Add(new Alias { NodeId = nodeId, Value = value });
            changed = true;
        }
        if (changed)
        {
            node.UpdatedAt = clock.UtcNow;
            outbox.Enqueue(new NodeUpdated(ctx.WorkspaceId, nodeId, ["aliases"], ctx.UserId));
        }
        await db.SaveChangesAsync(ct);
        return wanted.OrderBy(w => w, StringComparer.Ordinal).ToList();
    }
}
