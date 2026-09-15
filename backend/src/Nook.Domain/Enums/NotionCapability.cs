namespace Nook.Domain.Enums;

/// <summary>Fine-grained capabilities exposed by the Notion-compatible API.</summary>
public enum NotionCapability
{
    ReadContent = 0,
    UpdateContent = 1,
    InsertContent = 2,
    ReadComments = 3,
    InsertComments = 4,
    ReadProperty = 5,
    UpdateProperty = 6,
    InsertProperty = 7,
}
