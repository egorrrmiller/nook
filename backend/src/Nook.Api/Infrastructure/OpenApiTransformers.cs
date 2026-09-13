using Microsoft.AspNetCore.OpenApi;
using Microsoft.OpenApi;
using Nook.Application.Common;

namespace Nook.Api.Infrastructure;

public static class OpenApiTransformers
{
    /// <summary>Renders <see cref="Optional{T}"/> as the (nullable) schema of T so generated clients see plain optional fields.</summary>
    public static Task OptionalSchema(OpenApiSchema schema, OpenApiSchemaTransformerContext context, CancellationToken ct)
    {
        var type = context.JsonTypeInfo.Type;
        if (!type.IsGenericType || type.GetGenericTypeDefinition() != typeof(Optional<>)) return Task.CompletedTask;

        var inner = type.GetGenericArguments()[0];
        inner = Nullable.GetUnderlyingType(inner) ?? inner;
        schema.Properties?.Clear();
        schema.Required?.Clear();
        schema.AdditionalPropertiesAllowed = true;
        Describe(schema, inner);
        schema.Type |= JsonSchemaType.Null;
        return Task.CompletedTask;
    }

    private static void Describe(OpenApiSchema schema, Type t)
    {
        if (t == typeof(Guid)) { schema.Type = JsonSchemaType.String; schema.Format = "uuid"; return; }
        if (t == typeof(string)) { schema.Type = JsonSchemaType.String; return; }
        if (t == typeof(bool)) { schema.Type = JsonSchemaType.Boolean; return; }
        if (t == typeof(int) || t == typeof(long)) { schema.Type = JsonSchemaType.Integer; return; }
        if (t == typeof(double) || t == typeof(decimal) || t == typeof(float)) { schema.Type = JsonSchemaType.Number; return; }

        schema.Type = JsonSchemaType.Object;
        schema.Properties ??= new Dictionary<string, IOpenApiSchema>();
        foreach (var p in t.GetProperties(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance))
        {
            var ps = new OpenApiSchema();
            var pt = Nullable.GetUnderlyingType(p.PropertyType) ?? p.PropertyType;
            Describe(ps, pt);
            if (p.PropertyType != pt || !pt.IsValueType) ps.Type |= JsonSchemaType.Null;
            schema.Properties[System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(p.Name)] = ps;
        }
    }
}
