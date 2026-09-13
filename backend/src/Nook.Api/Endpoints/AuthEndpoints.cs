using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.HttpResults;
using Nook.Api.Auth;
using Nook.Api.Infrastructure;
using Nook.Application.Auth;
using Nook.Application.Contracts;
using Nook.Infrastructure.Auth;

namespace Nook.Api.Endpoints;

public static class AuthEndpoints
{
    public static RouteGroupBuilder MapAuthEndpoints(this RouteGroupBuilder api)
    {
        var auth = api.MapGroup("/auth").WithTags("Auth");

        auth.MapPost("/login", async Task<Results<Ok<AuthResponse>, UnauthorizedHttpResult>> (LoginRequest request, HttpContext http, AuthService service, CancellationToken ct) =>
            {
                var result = await service.LoginAsync(request, ct);
                if (result is null) return TypedResults.Unauthorized();
                await SignInAsync(http, result.Value.User);
                return TypedResults.Ok(result.Value.Response);
            })
            .AllowAnonymous()
            .RequireRateLimiting("login")
            .WithName("Login");

        auth.MapPost("/logout", async Task<NoContent> (HttpContext http) =>
            {
                await http.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                return TypedResults.NoContent();
            })
            .WithName("Logout");

        auth.MapPost("/register", async Task<Ok<AuthResponse>> (RegisterRequest request, HttpContext http, AuthService service, CancellationToken ct) =>
            {
                var (user, response) = await service.RegisterAsync(request, ct);
                await SignInAsync(http, user);
                return TypedResults.Ok(response);
            })
            .AllowAnonymous()
            .RequireRateLimiting("login")
            .WithName("Register")
            .ProducesValidationProblem()
            .ProducesProblem(StatusCodes.Status410Gone);

        auth.MapGet("/invite/{code}", async Task<Ok<InviteCheckResponse>> (string code, AuthService service, CancellationToken ct) =>
                TypedResults.Ok(await service.CheckInviteAsync(code, ct)))
            .AllowAnonymous()
            .WithName("CheckInvite");

        api.MapGet("/me", async Task<Ok<AuthResponse>> (AuthService service, CancellationToken ct) => TypedResults.Ok(await service.MeAsync(ct)))
            .WithTags("Auth")
            .WithName("Me");

        // --- wave1: tree (contracts §7.5) ---
        api.MapPatch("/me", async Task<Ok<UserDto>> (PatchMeRequest request, AuthService service, CancellationToken ct) =>
                TypedResults.Ok(await service.PatchMeAsync(request, ct)))
            .WithTags("Auth")
            .WithName("PatchMe");

        api.MapPost("/me/password", async Task<NoContent> (ChangePasswordRequest request, AuthService service, CancellationToken ct) =>
            {
                await service.ChangePasswordAsync(request, ct);
                return TypedResults.NoContent();
            })
            .WithTags("Auth")
            .WithName("ChangePassword")
            .ProducesValidationProblem();

        api.MapGet("/invites", async Task<Ok<IReadOnlyList<InviteDto>>> (AuthService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListInvitesAsync(ct)))
            .WithTags("Auth")
            .WithMetadata(new RequireAdminScopeAttribute())
            .WithName("ListInvites");

        api.MapDelete("/invites/{code}", async Task<NoContent> (string code, AuthService service, CancellationToken ct) =>
            {
                await service.DeleteInviteAsync(code, ct);
                return TypedResults.NoContent();
            })
            .WithTags("Auth")
            .WithMetadata(new RequireAdminScopeAttribute())
            .WithName("DeleteInvite");

        api.MapPost("/invites", async Task<Created<InviteCreatedResponse>> (CreateInviteRequest request, HttpContext http, AuthService service, NookOptions options, CancellationToken ct) =>
            {
                var baseUrl = options.PublicUrl ?? $"{http.Request.Scheme}://{http.Request.Host}";
                var result = await service.CreateInviteAsync(request, baseUrl, ct);
                return TypedResults.Created(result.Url, result);
            })
            .WithTags("Auth")
            .WithMetadata(new RequireAdminScopeAttribute())
            .WithName("CreateInvite");

        var tokens = api.MapGroup("/api-tokens").WithTags("ApiTokens").WithMetadata(new RequireAdminScopeAttribute());
        tokens.MapGet("/", async Task<Ok<IReadOnlyList<ApiTokenDto>>> (AuthService service, CancellationToken ct) =>
                TypedResults.Ok(await service.ListApiTokensAsync(ct)))
            .WithName("ListApiTokens");
        tokens.MapPost("/", async Task<Created<ApiTokenCreatedResponse>> (CreateApiTokenRequest request, AuthService service, CancellationToken ct) =>
            {
                var created = await service.CreateApiTokenAsync(request, ct);
                return TypedResults.Created($"/api/api-tokens/{created.Id}", created);
            })
            .WithName("CreateApiToken");
        tokens.MapDelete("/{id:guid}", async Task<NoContent> (Guid id, AuthService service, CancellationToken ct) =>
            {
                await service.RevokeApiTokenAsync(id, ct);
                return TypedResults.NoContent();
            })
            .WithName("RevokeApiToken");

        return api;
    }

    private static Task SignInAsync(HttpContext http, Domain.Entities.User user)
    {
        var identity = NookClaims.Build(user, NookClaims.AuthTypeCookie, CookieAuthenticationDefaults.AuthenticationScheme);
        return http.SignInAsync(
            CookieAuthenticationDefaults.AuthenticationScheme,
            new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true, AllowRefresh = true });
    }
}
