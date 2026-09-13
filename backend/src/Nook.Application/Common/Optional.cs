using System.Text.Json;
using System.Text.Json.Serialization;

namespace Nook.Application.Common;

/// <summary>
/// Distinguishes "property absent from the JSON body" (<see cref="HasValue"/> == false) from "property present, possibly null"
/// — needed by PATCH endpoints (e.g. <c>parentId: null</c> moves a node to the root).
/// </summary>
[JsonConverter(typeof(OptionalJsonConverterFactory))]
public readonly struct Optional<T>
{
    public Optional(T? value)
    {
        HasValue = true;
        Value = value;
    }

    public bool HasValue { get; }
    public T? Value { get; }

    public static Optional<T> Absent => default;

    public static implicit operator Optional<T>(T? value) => new(value);
}

public sealed class OptionalJsonConverterFactory : JsonConverterFactory
{
    public override bool CanConvert(Type typeToConvert) =>
        typeToConvert.IsGenericType && typeToConvert.GetGenericTypeDefinition() == typeof(Optional<>);

    public override JsonConverter CreateConverter(Type typeToConvert, JsonSerializerOptions options)
    {
        var inner = typeToConvert.GetGenericArguments()[0];
        return (JsonConverter)Activator.CreateInstance(typeof(OptionalJsonConverter<>).MakeGenericType(inner))!;
    }

    private sealed class OptionalJsonConverter<T> : JsonConverter<Optional<T>>
    {
        public override bool HandleNull => true;

        public override Optional<T> Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            if (reader.TokenType == JsonTokenType.Null) return new Optional<T>(default);
            return new Optional<T>(JsonSerializer.Deserialize<T>(ref reader, options));
        }

        public override void Write(Utf8JsonWriter writer, Optional<T> value, JsonSerializerOptions options)
        {
            if (!value.HasValue || value.Value is null) writer.WriteNullValue();
            else JsonSerializer.Serialize(writer, value.Value, options);
        }
    }
}
