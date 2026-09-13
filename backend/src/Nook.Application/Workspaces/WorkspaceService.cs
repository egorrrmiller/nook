using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Workspaces;

public sealed class WorkspaceService(IAppDbContext db, ICurrentUser currentUser, IClock clock)
{
    public async Task<IReadOnlyList<WorkspaceSummary>> ListForUserAsync(Guid userId, CancellationToken ct)
    {
        var rows = await db.WorkspaceMembers.AsNoTracking()
            .Where(m => m.UserId == userId)
            .OrderByDescending(m => m.Workspace!.IsPersonal).ThenBy(m => m.Workspace!.CreatedAt)
            .Select(m => new { m.Workspace, m.Role })
            .ToListAsync(ct);
        return rows.Select(r => WorkspaceSummary.From(r.Workspace!, r.Role)).ToList();
    }

    public async Task<WorkspaceSummary> CreateAsync(CreateWorkspaceRequest request, CancellationToken ct)
    {
        var name = (request.Name ?? "").Trim();
        if (name.Length is 0 or > 200) throw new ValidationException("Name is required (max 200 chars).");

        var ws = await CreateWorkspaceCoreAsync(currentUser.UserId, name, request.Icon, isPersonal: false, ct);
        await db.SaveChangesAsync(ct);
        return WorkspaceSummary.From(ws, WorkspaceRole.Owner);
    }

    /// <summary>Adds a workspace + owner membership to the unit of work without saving.</summary>
    public Task<Workspace> CreateWorkspaceCoreAsync(Guid ownerId, string name, Domain.ValueObjects.NodeIcon? icon, bool isPersonal, CancellationToken ct)
    {
        var ws = new Workspace { OwnerId = ownerId, Name = name, Icon = icon, IsPersonal = isPersonal, CreatedAt = clock.UtcNow };
        db.Workspaces.Add(ws);
        db.WorkspaceMembers.Add(new WorkspaceMember { WorkspaceId = ws.Id, UserId = ownerId, Role = WorkspaceRole.Owner, CreatedAt = clock.UtcNow });
        return Task.FromResult(ws);
    }

    public async Task<IReadOnlyList<WorkspaceMemberDto>> ListMembersAsync(Guid workspaceId, CancellationToken ct)
    {
        await RequireRoleAsync(workspaceId, WorkspaceRole.Viewer, ct);
        return await db.WorkspaceMembers.AsNoTracking()
            .Where(m => m.WorkspaceId == workspaceId)
            .OrderBy(m => m.CreatedAt)
            .Select(m => new WorkspaceMemberDto(m.UserId, m.User!.Email, m.User.DisplayName, m.Role.ToWire()))
            .ToListAsync(ct);
    }

    public async Task<WorkspaceMemberDto> AddMemberAsync(Guid workspaceId, AddWorkspaceMemberRequest request, CancellationToken ct)
    {
        await RequireRoleAsync(workspaceId, WorkspaceRole.Owner, ct);
        var role = WorkspaceRoleExtensions.ParseWire(request.Role) ?? throw new ValidationException("role must be owner|editor|viewer.");
        var email = NormalizeEmail(request.Email);
        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct) ?? throw new NotFoundException("No user with that email.");

        var existing = await db.WorkspaceMembers.FirstOrDefaultAsync(m => m.WorkspaceId == workspaceId && m.UserId == user.Id, ct);
        if (existing is not null) throw new ConflictException("User is already a member.");

        db.WorkspaceMembers.Add(new WorkspaceMember { WorkspaceId = workspaceId, UserId = user.Id, Role = role, CreatedAt = clock.UtcNow });
        await db.SaveChangesAsync(ct);
        return new WorkspaceMemberDto(user.Id, user.Email, user.DisplayName, role.ToWire());
    }

    public async Task RemoveMemberAsync(Guid workspaceId, Guid userId, CancellationToken ct)
    {
        await RequireRoleAsync(workspaceId, WorkspaceRole.Owner, ct);
        var ws = await db.Workspaces.FirstAsync(w => w.Id == workspaceId, ct);
        if (ws.OwnerId == userId) throw new ValidationException("The workspace owner cannot be removed.");
        var member = await db.WorkspaceMembers.FirstOrDefaultAsync(m => m.WorkspaceId == workspaceId && m.UserId == userId, ct)
                     ?? throw new NotFoundException("Member not found.");
        db.WorkspaceMembers.Remove(member);
        await db.SaveChangesAsync(ct);
    }

    private async Task RequireRoleAsync(Guid workspaceId, WorkspaceRole minimum, CancellationToken ct)
    {
        var role = await db.WorkspaceMembers.AsNoTracking()
            .Where(m => m.WorkspaceId == workspaceId && m.UserId == currentUser.UserId)
            .Select(m => (WorkspaceRole?)m.Role)
            .FirstOrDefaultAsync(ct);
        if (role is null) throw new ForbiddenException("You are not a member of this workspace.");
        if (role < minimum) throw new ForbiddenException("Insufficient workspace role.");
    }

    public static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();
}
