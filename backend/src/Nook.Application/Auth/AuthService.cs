using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Nook.Application.Common;
using Nook.Application.Contracts;
using Nook.Application.Workspaces;
using Nook.Domain.Entities;
using Nook.Plugins.Sdk.Events;

namespace Nook.Application.Auth;

public sealed class AuthService(
    IAppDbContext db,
    IPasswordHasher hasher,
    IClock clock,
    WorkspaceService workspaces,
    IOutbox outbox,
    ICurrentUser currentUser)
{
    public const int MinPasswordLength = 8;

    public async Task<(User User, AuthResponse Response)?> LoginAsync(LoginRequest request, CancellationToken ct)
    {
        var email = WorkspaceService.NormalizeEmail(request.Email);
        if (email.Length == 0 || string.IsNullOrEmpty(request.Password)) return null;

        var user = await db.Users.FirstOrDefaultAsync(u => u.Email == email, ct);
        if (user is null) return null;

        var verified = hasher.Verify(user, user.PasswordHash, request.Password);
        if (verified is null) return null;
        if (verified == true)
        {
            user.PasswordHash = hasher.Hash(user, request.Password);
            await db.SaveChangesAsync(ct);
        }

        return (user, await BuildAuthResponseAsync(user, ct));
    }

    public async Task<AuthResponse> MeAsync(CancellationToken ct)
    {
        var user = await db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == currentUser.UserId, ct)
                   ?? throw new UnauthorizedException();
        return await BuildAuthResponseAsync(user, ct);
    }

    public async Task<AuthResponse> BuildAuthResponseAsync(User user, CancellationToken ct) =>
        new(UserDto.From(user), await workspaces.ListForUserAsync(user.Id, ct));

    // --- invites --------------------------------------------------------------------------------------------------

    public async Task<InviteCheckResponse> CheckInviteAsync(string code, CancellationToken ct)
    {
        var invite = await db.Invites.AsNoTracking().FirstOrDefaultAsync(i => i.Code == code, ct);
        if (invite is null || !invite.IsUsable(clock.UtcNow)) return new InviteCheckResponse(false, null);
        return new InviteCheckResponse(true, invite.Email);
    }

    public async Task<InviteCreatedResponse> CreateInviteAsync(CreateInviteRequest request, string publicBaseUrl, CancellationToken ct)
    {
        if (!currentUser.IsInstanceOwner) throw new ForbiddenException("Only the instance owner can create invites.");
        var hours = request.ExpiresInHours ?? 72;
        if (hours is < 1 or > 24 * 30) throw new ValidationException("expiresInHours must be between 1 and 720.");

        var email = string.IsNullOrWhiteSpace(request.Email) ? null : WorkspaceService.NormalizeEmail(request.Email);
        var invite = new Invite
        {
            Code = RandomToken(24),
            Email = email,
            CreatedByUserId = currentUser.UserId,
            ExpiresAt = clock.UtcNow.AddHours(hours),
            CreatedAt = clock.UtcNow,
        };
        db.Invites.Add(invite);
        await db.SaveChangesAsync(ct);
        var url = $"{publicBaseUrl.TrimEnd('/')}/register?invite={invite.Code}";
        return new InviteCreatedResponse(invite.Code, url, invite.ExpiresAt);
    }

    public async Task<(User User, AuthResponse Response)> RegisterAsync(RegisterRequest request, CancellationToken ct)
    {
        var errors = new Dictionary<string, string[]>();
        var email = WorkspaceService.NormalizeEmail(request.Email);
        var displayName = (request.DisplayName ?? "").Trim();
        if (email.Length == 0 || !email.Contains('@')) errors["email"] = ["A valid email is required."];
        if ((request.Password ?? "").Length < MinPasswordLength) errors["password"] = [$"Password must be at least {MinPasswordLength} characters."];
        if (displayName.Length is 0 or > 100) errors["displayName"] = ["Display name is required (max 100 chars)."];
        if (string.IsNullOrWhiteSpace(request.InviteCode)) errors["inviteCode"] = ["Invite code is required."];
        if (errors.Count > 0) throw new ValidationException("Invalid registration request.", errors);

        var invite = await db.Invites.FirstOrDefaultAsync(i => i.Code == request.InviteCode, ct)
                     ?? throw new ValidationException("Invalid invite code.", new Dictionary<string, string[]> { ["inviteCode"] = ["Unknown invite code."] });
        if (!invite.IsUsable(clock.UtcNow)) throw new GoneException("This invite has expired or was already used.");
        if (invite.Email is not null && invite.Email != email)
            throw new ValidationException("This invite is bound to a different email.", new Dictionary<string, string[]> { ["email"] = ["Invite is for another email."] });
        if (await db.Users.AnyAsync(u => u.Email == email, ct))
            throw new ValidationException("Email already registered.", new Dictionary<string, string[]> { ["email"] = ["Already registered."] });

        var user = await CreateUserWithPersonalWorkspaceAsync(email, request.Password!, displayName, isInstanceOwner: false, ct);
        invite.UsedAt = clock.UtcNow;
        invite.UsedByUserId = user.Id;
        await db.SaveChangesAsync(ct);
        return (user, await BuildAuthResponseAsync(user, ct));
    }

    /// <summary>Creates a user and their personal workspace inside the current unit of work (does not save).</summary>
    public async Task<User> CreateUserWithPersonalWorkspaceAsync(string email, string password, string displayName, bool isInstanceOwner, CancellationToken ct)
    {
        var user = new User
        {
            Email = WorkspaceService.NormalizeEmail(email),
            PasswordHash = "",
            DisplayName = displayName,
            IsInstanceOwner = isInstanceOwner,
            CreatedAt = clock.UtcNow,
        };
        user.PasswordHash = hasher.Hash(user, password);
        db.Users.Add(user);
        var ws = await workspaces.CreateWorkspaceCoreAsync(user.Id, displayName, null, isPersonal: true, ct);
        outbox.Enqueue(new UserRegistered(ws.Id, user.Id, user.Email));
        return user;
    }

    // --- api tokens -----------------------------------------------------------------------------------------------

    public async Task<IReadOnlyList<ApiTokenDto>> ListApiTokensAsync(CancellationToken ct) =>
        await db.ApiTokens.AsNoTracking()
            .Where(t => t.UserId == currentUser.UserId && t.RevokedAt == null)
            .OrderBy(t => t.CreatedAt)
            .Select(t => new ApiTokenDto(t.Id, t.Name, t.Scopes, t.CreatedAt, t.LastUsedAt))
            .ToListAsync(ct);

    public async Task<ApiTokenCreatedResponse> CreateApiTokenAsync(CreateApiTokenRequest request, CancellationToken ct)
    {
        var name = (request.Name ?? "").Trim();
        if (name.Length is 0 or > 100) throw new ValidationException("name is required (max 100 chars).");
        var scopes = (request.Scopes ?? []).Select(s => s.Trim().ToLowerInvariant()).Distinct().ToArray();
        if (scopes.Length == 0 || scopes.Any(s => !ApiTokenScopes.All.Contains(s)))
            throw new ValidationException("scopes must be a non-empty subset of read|write|admin.");
        if (scopes.Contains(ApiTokenScopes.Admin) && !currentUser.IsInstanceOwner)
            throw new ForbiddenException("Only the instance owner can issue admin tokens.");

        var raw = "nook_" + RandomToken(32);
        var token = new ApiToken
        {
            UserId = currentUser.UserId,
            Name = name,
            TokenHash = HashToken(raw),
            Scopes = scopes,
            CreatedAt = clock.UtcNow,
        };
        db.ApiTokens.Add(token);
        await db.SaveChangesAsync(ct);
        return new ApiTokenCreatedResponse(token.Id, token.Name, raw, token.Scopes, token.CreatedAt);
    }

    public async Task RevokeApiTokenAsync(Guid id, CancellationToken ct)
    {
        var token = await db.ApiTokens.FirstOrDefaultAsync(t => t.Id == id && t.UserId == currentUser.UserId && t.RevokedAt == null, ct)
                    ?? throw new NotFoundException("Token not found.");
        token.RevokedAt = clock.UtcNow;
        await db.SaveChangesAsync(ct);
    }

    public static string HashToken(string raw) => Convert.ToHexStringLower(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(raw)));

    private static string RandomToken(int bytes)
    {
        Span<byte> buffer = stackalloc byte[bytes];
        RandomNumberGenerator.Fill(buffer);
        return Convert.ToBase64String(buffer).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }
}
