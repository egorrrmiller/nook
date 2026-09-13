using System.Collections.Concurrent;
using System.Reflection;
using Nook.Plugins.Sdk.Events;

namespace Nook.Infrastructure.Jobs;

/// <summary>Maps outbox <c>type</c> names to CLR event types (core events + any plugin assembly).</summary>
public sealed class EventTypeRegistry
{
    private readonly ConcurrentDictionary<string, Type> _types = new(StringComparer.Ordinal);

    public EventTypeRegistry(IEnumerable<Assembly> assemblies)
    {
        foreach (var assembly in assemblies.Append(typeof(INookEvent).Assembly).Distinct())
        {
            Type[] types;
            try { types = assembly.GetTypes(); }
            catch (ReflectionTypeLoadException e) { types = e.Types.Where(t => t is not null).Cast<Type>().ToArray(); }
            foreach (var type in types)
            {
                if (type.IsAbstract || type.IsInterface || !typeof(INookEvent).IsAssignableFrom(type)) continue;
                _types.TryAdd(type.Name, type);
            }
        }
    }

    public Type? Resolve(string name) => _types.GetValueOrDefault(name);

    public void Register(Type type) => _types[type.Name] = type;
}
