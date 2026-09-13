using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Hangfire;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.RateLimiting;
using Nook.Api.Auth;
using Nook.Api.Endpoints;
using Nook.Api.Infrastructure;
using Nook.Application;
using Nook.Application.Collab;
using Nook.Application.Common;
using Nook.Infrastructure;
using Nook.Infrastructure.Jobs;
using Nook.Infrastructure.Persistence;
using Nook.Infrastructure.Realtime;
using Nook.Infrastructure.Startup;
using Nook.Plugins.Sdk.Hosting;
using Scalar.AspNetCore;
using Serilog;

// In Development, read the repo-root .env (never overrides real environment variables).
var envName = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT") ?? Environment.GetEnvironmentVariable("DOTNET_ENVIRONMENT");
if (string.Equals(envName, "Development", StringComparison.OrdinalIgnoreCase))
{
    EnvFile.LoadFromAncestors(Directory.GetCurrentDirectory());
    EnvFile.LoadFromAncestors(AppContext.BaseDirectory, maxLevels: 8);
}

var builder = WebApplication.CreateBuilder(args);
var options = NookOptions.Load(builder.Configuration, builder.Environment);

builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console(outputTemplate: "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}"));

var pluginAssemblies = new[] { typeof(Nook.Plugin.Sample.SamplePlugin).Assembly };

// --- services -------------------------------------------------------------------------------------------------------
builder.Services.AddSingleton(options);
builder.Services.AddSingleton(new CollabOptions { JwtSecret = options.CollabJwtSecret, WsUrl = options.CollabWsUrl });
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddNookApplication();
builder.Services.AddNookInfrastructure(options.Db, options.BackgroundJobs, pluginAssemblies);
builder.Services.AddNookFiles(options.DataDir, options.MaxUploadBytes);
builder.Services.AddSingleton<CoverGallery>();
builder.Services.AddNookPlugins(builder.Configuration, pluginAssemblies);

builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
});
builder.Services.AddSignalR().AddJsonProtocol(o =>
{
    o.PayloadSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
    o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower));
});

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<NookExceptionHandler>();

builder.Services.AddAuthentication(AuthSchemes.Smart)
    .AddPolicyScheme(AuthSchemes.Smart, "Cookie or API token", o =>
    {
        o.ForwardDefaultSelector = ctx =>
            ctx.Request.Headers.Authorization.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                ? AuthSchemes.ApiToken
                : CookieAuthenticationDefaults.AuthenticationScheme;
    })
    .AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, o =>
    {
        o.Cookie.Name = options.CookieName;
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.Cookie.SecurePolicy = builder.Environment.IsProduction() ? CookieSecurePolicy.Always : CookieSecurePolicy.SameAsRequest;
        o.ExpireTimeSpan = TimeSpan.FromDays(30);
        o.SlidingExpiration = true;
        o.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = StatusCodes.Status401Unauthorized; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = StatusCodes.Status403Forbidden; return Task.CompletedTask; };
    })
    .AddScheme<AuthenticationSchemeOptions, ApiTokenAuthenticationHandler>(AuthSchemes.ApiToken, _ => { });
builder.Services.AddAuthorization();

builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("login", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 }));
});

builder.Services.AddOpenApi("v1", o =>
{
    o.AddSchemaTransformer(OpenApiTransformers.OptionalSchema);
    o.AddDocumentTransformer((doc, _, _) =>
    {
        doc.Info.Title = "Nook API";
        doc.Info.Version = "v1";
        return Task.CompletedTask;
    });
});

var app = builder.Build();

// --- startup ------------------------------------------------------------------------------------------------------
Directory.CreateDirectory(options.DataDir);
await DatabaseInitializer.InitializeAsync(app.Services, options.AutoMigrate, options.OwnerEmail, options.OwnerPassword);
if (options.BackgroundJobs) HangfireSetup.RegisterRecurringJobs(app.Services);

// --- pipeline -----------------------------------------------------------------------------------------------------
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseSerilogRequestLogging();
app.UseClientDisconnectAs499(); // must sit inside the request logger (see ClientDisconnectMiddleware)
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

app.MapOpenApi();               // /openapi/v1.json
app.MapScalarApiReference();    // /scalar

var api = app.MapGroup("/api").RequireAuthorization().AddEndpointFilter<ApiTokenScopeFilter>();
api.MapHealthEndpoints();
api.MapAuthEndpoints();
api.MapWorkspaceEndpoints();
api.MapNodeEndpoints();
api.MapCollabEndpoints();
api.MapFileEndpoints();
api.MapNookPlugins(app.Services);

app.MapInternalEndpoints();
app.MapHub<NookHub>("/hub");

if (options.BackgroundJobs)
{
    app.MapHangfireDashboard("/hangfire", new DashboardOptions
    {
        Authorization = [new OwnerOnlyDashboardFilter()],
        DashboardTitle = "Nook jobs",
    });
}

// Built-in cover gallery (wwwroot/covers) is served even when the SPA is not built.
var coversDir = CoverGallery.CoversDirectory(app.Environment);
if (Directory.Exists(coversDir))
{
    app.UseStaticFiles(new StaticFileOptions
    {
        RequestPath = "/covers",
        FileProvider = new Microsoft.Extensions.FileProviders.PhysicalFileProvider(coversDir),
        OnPrepareResponse = ctx => ctx.Context.Response.Headers.CacheControl = "public, max-age=604800",
    });
}

// Built SPA (frontend/apps/web → wwwroot) with history-API fallback for non-API routes.
if (File.Exists(Path.Combine(app.Environment.WebRootPath ?? Path.Combine(app.Environment.ContentRootPath, "wwwroot"), "index.html")))
{
    app.UseDefaultFiles();
    app.UseStaticFiles();
    app.MapFallbackToFile("{*path:regex(^(?!(api|hub|internal|openapi|scalar|hangfire)(/|$)).*$)}", "index.html");
}

app.Run();

/// <summary>Entry point marker for <c>WebApplicationFactory</c>.</summary>
public partial class Program;
