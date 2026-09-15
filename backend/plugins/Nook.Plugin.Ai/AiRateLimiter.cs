using System.Collections.Concurrent;

namespace Nook.Plugin.Ai;

public sealed class AiRateLimiter
{
    public const int MaxRequestsPerWindow = 20;
    public static readonly TimeSpan Window = TimeSpan.FromMinutes(1);
    private readonly ConcurrentDictionary<Guid, WindowState> _windows = new();

    public void EnsureAllowed(Guid userId)
    {
        var now = DateTimeOffset.UtcNow;
        var state = _windows.GetOrAdd(userId, _ => new WindowState(now));
        lock (state)
        {
            if (now - state.Start >= Window)
            {
                state.Start = now;
                state.Count = 0;
            }
            if (++state.Count > MaxRequestsPerWindow)
            {
                state.Count--;
                var retry = Math.Max(1, (int)Math.Ceiling((Window - (now - state.Start)).TotalSeconds));
                throw new AiRateLimitException(retry);
            }
        }
    }

    private sealed class WindowState(DateTimeOffset start)
    {
        public DateTimeOffset Start { get; set; } = start;
        public int Count { get; set; }
    }
}
