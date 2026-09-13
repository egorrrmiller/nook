namespace Nook.Infrastructure.Persistence;

/// <summary>Tiny <c>.env</c> loader (KEY=VALUE, quotes optional, # comments). Never overrides variables already set.</summary>
public static class EnvFile
{
    public static string? LoadFromAncestors(string startDirectory, int maxLevels = 6)
    {
        var dir = new DirectoryInfo(startDirectory);
        for (var i = 0; i < maxLevels && dir is not null; i++, dir = dir.Parent)
        {
            var path = Path.Combine(dir.FullName, ".env");
            if (File.Exists(path))
            {
                Load(path);
                return path;
            }
        }
        return null;
    }

    public static void Load(string path)
    {
        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith("export ", StringComparison.Ordinal)) line = line[7..].TrimStart();
            var eq = line.IndexOf('=');
            if (eq <= 0) continue;
            var key = line[..eq].Trim();
            var value = line[(eq + 1)..].Trim();
            if (value.Length >= 2 && ((value[0] == '"' && value[^1] == '"') || (value[0] == '\'' && value[^1] == '\'')))
                value = value[1..^1];
            if (Environment.GetEnvironmentVariable(key) is null) Environment.SetEnvironmentVariable(key, value);
        }
    }
}
