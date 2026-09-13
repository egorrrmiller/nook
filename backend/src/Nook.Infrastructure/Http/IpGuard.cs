using System.Net;
using System.Net.Sockets;

namespace Nook.Infrastructure.Http;

/// <summary>Classifies IP addresses for the SSRF guard: only globally routable unicast addresses are allowed.</summary>
public static class IpGuard
{
    public static bool IsPublic(IPAddress address)
    {
        if (address.IsIPv4MappedToIPv6) address = address.MapToIPv4();

        if (address.AddressFamily == AddressFamily.InterNetwork)
        {
            var b = address.GetAddressBytes();
            return !(
                b[0] == 0                                          // 0.0.0.0/8 "this network"
                || b[0] == 10                                      // 10/8
                || b[0] == 127                                     // loopback
                || (b[0] == 100 && (b[1] & 0xC0) == 64)            // 100.64/10 CGNAT
                || (b[0] == 169 && b[1] == 254)                    // link-local
                || (b[0] == 172 && (b[1] & 0xF0) == 16)            // 172.16/12
                || (b[0] == 192 && b[1] == 0 && b[2] == 0)         // 192.0.0/24 IETF protocol assignments
                || (b[0] == 192 && b[1] == 0 && b[2] == 2)         // TEST-NET-1
                || (b[0] == 192 && b[1] == 168)                    // 192.168/16
                || (b[0] == 198 && (b[1] & 0xFE) == 18)            // 198.18/15 benchmarking
                || (b[0] == 198 && b[1] == 51 && b[2] == 100)      // TEST-NET-2
                || (b[0] == 203 && b[1] == 0 && b[2] == 113)       // TEST-NET-3
                || b[0] >= 224);                                   // multicast + reserved + broadcast
        }

        if (address.AddressFamily == AddressFamily.InterNetworkV6)
        {
            if (IPAddress.IPv6Loopback.Equals(address) || IPAddress.IPv6Any.Equals(address)) return false;
            if (address.IsIPv6LinkLocal || address.IsIPv6SiteLocal || address.IsIPv6Multicast || address.IsIPv6Teredo || address.IsIPv6UniqueLocal) return false;
            var b = address.GetAddressBytes();
            if ((b[0] & 0xFE) == 0xFC) return false;                                            // fc00::/7 unique local
            if (b[0] == 0xFE && (b[1] & 0xC0) == 0x80) return false;                            // fe80::/10
            if (b[0] == 0xFF) return false;                                                     // multicast
            if (b[0] == 0x20 && b[1] == 0x01 && b[2] == 0x0D && b[3] == 0xB8) return false;     // 2001:db8::/32 documentation
            if (b[0] == 0 && b[1] == 0x64 && b[2] == 0xFF && b[3] == 0x9B)                      // 64:ff9b::/96 NAT64 → check embedded v4
                return IsPublic(new IPAddress(b[12..16]));
            if (b[0] == 0x20 && b[1] == 0x02)                                                   // 2002::/16 6to4 → embedded v4
                return IsPublic(new IPAddress(b[2..6]));
            if (b[..10].All(x => x == 0) && b[10] == 0xFF && b[11] == 0xFF)                     // ::ffff:0:0/96 mapped (defensive)
                return IsPublic(new IPAddress(b[12..16]));
            if (b[..12].All(x => x == 0)) return false;                                         // ::/96 IPv4-compatible (deprecated)
            return true;
        }

        return false;
    }
}
