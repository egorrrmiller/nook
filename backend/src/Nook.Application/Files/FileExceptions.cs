using Nook.Application.Common;

namespace Nook.Application.Files;

public sealed class PayloadTooLargeException(string message = "Payload too large") : NookException(413, message);

public sealed class ServiceUnavailableException(string message = "Service unavailable") : NookException(503, message);

/// <summary>Raised by the SSRF guard when a URL resolves to a private, loopback, link-local or multicast address.</summary>
public sealed class BlockedAddressException(string message) : Exception(message);
