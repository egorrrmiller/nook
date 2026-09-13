using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Nook.Application.Common;

namespace Nook.Application.Knowledge;

/// <summary>
/// Minimal ADO.NET helper for the raw SQL the knowledge slices need (recursive CTEs, full-text search) where EF's
/// <c>SqlQuery</c> mapping is awkward. Shares the context's connection and ambient transaction; parameters are named
/// <c>@name</c> and typed by Npgsql from the CLR value (Guid[] → uuid[], string[] → text[], DateTimeOffset → timestamptz).
/// </summary>
public static class SqlReader
{
    public static async Task<List<T>> QueryAsync<T>(
        IAppDbContext db,
        string sql,
        IReadOnlyDictionary<string, object?> parameters,
        Func<DbDataReader, T> map,
        CancellationToken ct)
    {
        var connection = db.Database.GetDbConnection();
        var opened = false;
        if (connection.State != ConnectionState.Open)
        {
            await connection.OpenAsync(ct);
            opened = true;
        }
        try
        {
            await using var cmd = connection.CreateCommand();
            cmd.CommandText = sql;
            cmd.Transaction = db.Database.CurrentTransaction?.GetDbTransaction();
            foreach (var (name, value) in parameters)
            {
                var p = cmd.CreateParameter();
                p.ParameterName = name;
                p.Value = value ?? DBNull.Value;
                cmd.Parameters.Add(p);
            }
            var result = new List<T>();
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) result.Add(map(reader));
            return result;
        }
        finally
        {
            if (opened) await connection.CloseAsync();
        }
    }

    public static Guid? GetGuidOrNull(this DbDataReader r, int i) => r.IsDBNull(i) ? null : r.GetGuid(i);
    public static string? GetStringOrNull(this DbDataReader r, int i) => r.IsDBNull(i) ? null : r.GetString(i);
    public static DateTimeOffset GetInstant(this DbDataReader r, int i) => new(DateTime.SpecifyKind(r.GetFieldValue<DateTime>(i), DateTimeKind.Utc));
}
