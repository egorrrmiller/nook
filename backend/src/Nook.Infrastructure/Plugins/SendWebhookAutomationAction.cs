using System.Net.Http.Json;
using System.Text.Json;
using Nook.Application.Common;
using Nook.Infrastructure.Http;
using Nook.Plugins.Sdk;

namespace Nook.Infrastructure.Plugins;

/// <summary>POSTs JSON through the existing SSRF-guarded client. Network actions remain opt-in at automation level.</summary>
public sealed class SendWebhookAutomationAction(IHttpClientFactory factory, UrlFetchGuard guard) : IAutomationAction
{
    public string Id => "core.send_webhook";
    public string DisplayName => "Send webhook";
    public AutomationActionCapabilities Capabilities => AutomationActionCapabilities.Network;
    public string ParametersSchema => """{"type":"object","required":["url"],"properties":{"url":{"type":"string","format":"uri"},"body":{"type":"object"},"headers":{"type":"object"}}}""";

    public async Task ExecuteAsync(AutomationContext context, JsonElement parameters, CancellationToken cancellationToken)
    {
        if (parameters.ValueKind != JsonValueKind.Object || !parameters.TryGetProperty("url", out var rawUrl) || rawUrl.ValueKind != JsonValueKind.String)
            throw new ValidationException("url must be a string.");
        if (!Uri.TryCreate(rawUrl.GetString(), UriKind.Absolute, out var uri) || uri.Scheme is not ("http" or "https") || !string.IsNullOrEmpty(uri.UserInfo))
            throw new ValidationException("url must be an http(s) URL without credentials.");
        await guard.ResolveAsync(uri.DnsSafeHost, uri.Port, cancellationToken);

        var body = parameters.TryGetProperty("body", out var rawBody) ? rawBody.Clone() : context.Input;
        if (body.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) body = JsonSerializer.SerializeToElement(new { });
        if (body.GetRawText().Length > 256 * 1024) throw new ValidationException("Webhook body is too large.");

        using var request = new HttpRequestMessage(HttpMethod.Post, uri)
        {
            Content = JsonContent.Create(body),
        };
        if (parameters.TryGetProperty("headers", out var headers) && headers.ValueKind == JsonValueKind.Object)
        {
            foreach (var header in headers.EnumerateObject())
            {
                if (header.Name.Equals("Host", StringComparison.OrdinalIgnoreCase) || header.Name.Equals("Content-Length", StringComparison.OrdinalIgnoreCase)
                    || header.Name.Equals("Authorization", StringComparison.OrdinalIgnoreCase) || header.Value.ValueKind != JsonValueKind.String)
                    throw new ValidationException($"Header '{header.Name}' is not allowed.");
                if (!request.Headers.TryAddWithoutValidation(header.Name, header.Value.GetString()))
                    throw new ValidationException($"Invalid webhook header '{header.Name}'.");
            }
        }

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(TimeSpan.FromSeconds(10));
        using var response = await factory.CreateClient(SafeHttp.ClientName).SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token);
        if (!response.IsSuccessStatusCode)
            throw new WebhookDeliveryException((int)response.StatusCode, $"Webhook returned HTTP {(int)response.StatusCode}.");
    }
}

public sealed class WebhookDeliveryException(int status, string message)
    : NookException(status is >= 400 and < 500 ? 400 : 502, message);
