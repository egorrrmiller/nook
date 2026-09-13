using Nook.Domain.Entities;

namespace Nook.Application.Export;

/// <summary>One page in the export: its node, its zip path (<c>Dir/Title.ext</c>) and the folder its children live in.</summary>
public sealed record ExportItem(Node Node, string FilePath, string ChildDir, int Depth);

/// <summary>Builds the Notion-like layout: <c>&lt;Title&gt;.md</c> next to a folder <c>&lt;Title&gt;/</c> for children.</summary>
public static class ExportPlan
{
    public static List<ExportItem> Build(IReadOnlyList<Node> roots, IReadOnlyDictionary<Guid, List<Node>> childrenOf, bool includeChildren, string extension)
    {
        var items = new List<ExportItem>();
        var taken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var root in roots) Add(root, "", taken, 0);
        return items;

        void Add(Node node, string dir, HashSet<string> siblingsTaken, int depth)
        {
            var name = ExportPaths.Unique(ExportPaths.SafeName(node.Title), siblingsTaken);
            var file = (dir.Length == 0 ? "" : dir + "/") + name + extension;
            var childDir = (dir.Length == 0 ? "" : dir + "/") + name;
            items.Add(new ExportItem(node, file, childDir, depth));
            if (!includeChildren || !childrenOf.TryGetValue(node.Id, out var children) || children.Count == 0) return;
            var childTaken = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var child in children) Add(child, childDir, childTaken, depth + 1);
        }
    }
}
