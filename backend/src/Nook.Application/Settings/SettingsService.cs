using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Domain.Entities;
using Nook.Domain.Enums;

namespace Nook.Application.Settings;

/// <summary>Contracts §7.5: per-user and per-workspace JSON settings stored in <c>settings(scope, scope_id, key, value)</c>.</summary>
public sealed class SettingsService(IAppDbContext db, ICurrentUser currentUser)
{
    public const int MaxValueBytes = 16 * 1024;
    public const int MaxKeyLength = 200;

    /// <summary>Workspace setting that drives the retention job (§7.2).</summary>
    public const string TrashRetentionDaysKey = "trash.retentionDays";
    public const int DefaultTrashRetentionDays = 30;

    public Task<Dictionary<string, JsonElement>> GetUserSettingsAsync(CancellationToken ct) =>
        ReadAsync(SettingScopes.User, currentUser.UserId, ct);

    public Task PutUserSettingAsync(string key, JsonElement value, CancellationToken ct) =>
        WriteAsync(SettingScopes.User, currentUser.UserId, key, value, ct);

    public async Task<Dictionary<string, JsonElement>> GetWorkspaceSettingsAsync(Guid workspaceId, CancellationToken ct)
    {
        await RequireWorkspaceRoleAsync(workspaceId, WorkspaceRole.Viewer, ct);
        return await ReadAsync(SettingScopes.Workspace, workspaceId, ct);
    }

    public async Task PutWorkspaceSettingAsync(Guid workspaceId, string key, JsonElement value, CancellationToken ct)
    {
        await RequireWorkspaceRoleAsync(workspaceId, WorkspaceRole.Owner, ct);
        if (key == TrashRetentionDaysKey && (value.ValueKind != JsonValueKind.Number || !value.TryGetInt32(out var days) || days < 1 || days > 3650))
            throw new ValidationException($"{TrashRetentionDaysKey} must be an integer between 1 and 3650.");
        await WriteAsync(SettingScopes.Workspace, workspaceId, key, value, ct);
    }

    /// <summary>Reads one workspace setting without an access check (used by background jobs).</summary>
    public static async Task<int> GetTrashRetentionDaysAsync(IAppDbContext db, Guid workspaceId, CancellationToken ct)
    {
        var row = await db.Settings.AsNoTracking()
            .FirstOrDefaultAsync(s => s.Scope == SettingScopes.Workspace && s.ScopeId == workspaceId && s.Key == TrashRetentionDaysKey, ct);
        if (row is not null && row.Value.ValueKind == JsonValueKind.Number && row.Value.TryGetInt32(out var days) && days >= 1) return days;
        return DefaultTrashRetentionDays;
    }

    // --- helpers ----------------------------------------------------------------------------------------------------

    private async Task<Dictionary<string, JsonElement>> ReadAsync(string scope, Guid scopeId, CancellationToken ct)
    {
        var rows = await db.Settings.AsNoTracking()
            .Where(s => s.Scope == scope && s.ScopeId == scopeId)
            .OrderBy(s => s.Key)
            .ToListAsync(ct);
        return rows.ToDictionary(r => r.Key, r => r.Value, StringComparer.Ordinal);
    }

    private async Task WriteAsync(string scope, Guid scopeId, string key, JsonElement value, CancellationToken ct)
    {
        key = (key ?? "").Trim();
        if (key.Length is 0 or > MaxKeyLength) throw new ValidationException($"key is required (max {MaxKeyLength} chars).");
        if (value.ValueKind == JsonValueKind.Undefined) throw new ValidationException("value is required.");
        if (value.GetRawText().Length > MaxValueBytes) throw new ValidationException("value is too large (max 16 KB).");

        var row = await db.Settings.FirstOrDefaultAsync(s => s.Scope == scope && s.ScopeId == scopeId && s.Key == key, ct);
        if (row is null)
        {
            db.Settings.Add(new Setting { Scope = scope, ScopeId = scopeId, Key = key, Value = value.Clone() });
        }
        else
        {
            row.Value = value.Clone();
        }
        await db.SaveChangesAsync(ct);
    }

    private async Task RequireWorkspaceRoleAsync(Guid workspaceId, WorkspaceRole minimum, CancellationToken ct)
    {
        var role = await db.WorkspaceMembers.AsNoTracking()
            .Where(m => m.WorkspaceId == workspaceId && m.UserId == currentUser.UserId)
            .Select(m => (WorkspaceRole?)m.Role)
            .FirstOrDefaultAsync(ct);
        if (role is null) throw new ForbiddenException("You are not a member of this workspace.");
        if (role < minimum) throw new ForbiddenException("Insufficient workspace role.");
    }
}
