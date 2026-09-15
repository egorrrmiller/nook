using Nook.Plugins.Sdk;

namespace Nook.Plugins.Sdk.Hosting;

/// <summary>DI-backed action registry. Duplicate or malformed ids fail startup instead of failing at button click time.</summary>
public sealed class AutomationActionRegistry : IAutomationActionRegistry
{
    private static readonly System.Text.RegularExpressions.Regex IdPattern =
        new("^[a-z0-9][a-z0-9._-]{0,99}$", System.Text.RegularExpressions.RegexOptions.Compiled | System.Text.RegularExpressions.RegexOptions.CultureInvariant);

    private readonly IReadOnlyDictionary<string, IAutomationAction> _actions;

    public AutomationActionRegistry(IEnumerable<IAutomationAction> actions)
    {
        var map = new Dictionary<string, IAutomationAction>(StringComparer.OrdinalIgnoreCase);
        foreach (var action in actions)
        {
            if (action is null || !IdPattern.IsMatch(action.Id))
                throw new InvalidOperationException($"Automation action id '{action?.Id}' is invalid.");
            if (!map.TryAdd(action.Id, action))
                throw new InvalidOperationException($"Automation action '{action.Id}' registered twice.");
        }

        _actions = map;
        Descriptors = map.Values
            .OrderBy(a => a.Id, StringComparer.OrdinalIgnoreCase)
            .Select(a => new AutomationActionDescriptor(a.Id, a.DisplayName, a.ParametersSchema, a.Capabilities))
            .ToArray();
    }

    public IReadOnlyList<AutomationActionDescriptor> Descriptors { get; }

    public IAutomationAction? Find(string id) =>
        !string.IsNullOrWhiteSpace(id) && _actions.TryGetValue(id.Trim(), out var action) ? action : null;
}
