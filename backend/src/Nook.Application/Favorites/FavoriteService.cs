using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Nodes;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Domain.Enums;
using Nook.Domain.Ordering;

namespace Nook.Application.Favorites;

/// <summary>Contracts §7.3: per-user, per-workspace pinned nodes ordered by a fractional index.</summary>
public sealed class FavoriteService(
    IAppDbContext db,
    IWorkspaceContextAccessor contextAccessor,
    NodeService nodes,
    TreeQueries tree,
    IClock clock,
    IRealtimeNotifier realtime)
{
    private WorkspaceContext Ctx => contextAccessor.Required;

    private IQueryable<Favorite> Mine => db.Favorites.Where(f => f.UserId == Ctx.UserId && f.WorkspaceId == Ctx.WorkspaceId);

    public async Task<IReadOnlyList<FavoriteDto>> ListAsync(CancellationToken ct)
    {
        var rows = await Mine.AsNoTracking()
            .Include(f => f.Node)
            .Where(f => f.Node!.DeletedAt == null)
            .OrderBy(f => f.Position).ThenBy(f => f.CreatedAt)
            .ToListAsync(ct);
        var dtos = await tree.ToDtosAsync(rows.Select(r => r.Node!).ToList(), ct);
        return rows.Where(r => dtos.ContainsKey(r.NodeId)).Select(r => new FavoriteDto(r.NodeId, r.Position, dtos[r.NodeId])).ToList();
    }

    /// <summary>Idempotent: re-putting an existing favorite only moves it when a position is given.</summary>
    public async Task<FavoriteDto> PutAsync(Guid nodeId, PutFavoriteRequest request, CancellationToken ct)
    {
        var ctx = Ctx;
        var (node, _) = await nodes.RequireAsync(nodeId, WorkspaceRole.Viewer, ct);
        var position = request.Position is not null
            ? (FractionalIndex.IsValid(request.Position) ? request.Position : throw new ValidationException("Invalid position key."))
            : null;

        var existing = await Mine.FirstOrDefaultAsync(f => f.NodeId == nodeId, ct);
        var changed = false;
        if (existing is null)
        {
            existing = new Favorite
            {
                UserId = ctx.UserId,
                WorkspaceId = ctx.WorkspaceId,
                NodeId = nodeId,
                Position = position ?? await NextPositionAsync(ct),
                CreatedAt = clock.UtcNow,
            };
            db.Favorites.Add(existing);
            changed = true;
        }
        else if (position is not null && position != existing.Position)
        {
            existing.Position = position;
            changed = true;
        }

        if (changed)
        {
            await db.SaveChangesAsync(ct);
            await realtime.FavoritesChangedAsync(ctx.UserId, ctx.WorkspaceId, ct);
        }
        var dto = await tree.ToDtoAsync(node, ct) ?? throw new ForbiddenException("No access to this node.");
        return new FavoriteDto(nodeId, existing.Position, dto);
    }

    public async Task DeleteAsync(Guid nodeId, CancellationToken ct)
    {
        var ctx = Ctx;
        var existing = await Mine.FirstOrDefaultAsync(f => f.NodeId == nodeId, ct) ?? throw new NotFoundException("Favorite not found.");
        db.Favorites.Remove(existing);
        await db.SaveChangesAsync(ct);
        await realtime.FavoritesChangedAsync(ctx.UserId, ctx.WorkspaceId, ct);
    }

    private async Task<string> NextPositionAsync(CancellationToken ct)
    {
        var last = await Mine.AsNoTracking().OrderByDescending(f => f.Position).Select(f => f.Position).FirstOrDefaultAsync(ct);
        return FractionalIndex.GenerateKeyBetween(FractionalIndex.IsValid(last) ? last : null, null);
    }
}
