namespace Nook.Api.Infrastructure;

public static class ClientDisconnectMiddleware
{
    /// <summary>
    /// The client went away mid-request (tab closed, fetch aborted, React StrictMode re-running an effect).
    /// EF/Npgsql surface that as <see cref="OperationCanceledException"/>; answer 499 ("client closed request")
    /// instead of letting it bubble as a 500. Register this <b>inside</b> the request logger so the request is
    /// logged as an ordinary 499, not as an unhandled error.
    /// </summary>
    public static IApplicationBuilder UseClientDisconnectAs499(this IApplicationBuilder app) =>
        app.Use(async (ctx, next) =>
        {
            try
            {
                await next(ctx);
            }
            catch (OperationCanceledException) when (ctx.RequestAborted.IsCancellationRequested)
            {
                if (!ctx.Response.HasStarted) ctx.Response.StatusCode = 499;
            }
        });
}
