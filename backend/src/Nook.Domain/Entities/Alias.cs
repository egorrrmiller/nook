namespace Nook.Domain.Entities;

public class Alias
{
    public Guid NodeId { get; set; }
    public required string Value { get; set; }
}
