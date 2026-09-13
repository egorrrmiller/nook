using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Nook.Domain.Entities;

namespace Nook.Application.Common;

/// <summary>The unit of work. Implemented by the EF Core <c>AppDbContext</c> in Infrastructure. No repository layer.</summary>
public interface IAppDbContext
{
    DbSet<User> Users { get; }
    DbSet<Workspace> Workspaces { get; }
    DbSet<WorkspaceMember> WorkspaceMembers { get; }
    DbSet<Invite> Invites { get; }
    DbSet<ApiToken> ApiTokens { get; }
    DbSet<Node> Nodes { get; }
    DbSet<NodeShare> NodeShares { get; }
    DbSet<Document> Documents { get; }
    DbSet<DocumentUpdate> DocumentUpdates { get; }
    DbSet<PageSnapshot> PageSnapshots { get; }
    DbSet<Block> Blocks { get; }
    DbSet<Link> Links { get; }
    DbSet<Tag> Tags { get; }
    DbSet<NodeTag> NodeTags { get; }
    DbSet<Alias> Aliases { get; }
    DbSet<Attachment> Attachments { get; }
    DbSet<Blob> Blobs { get; }
    DbSet<LinkPreview> LinkPreviews { get; }
    DbSet<OutboxEvent> EventsOutbox { get; }
    DbSet<Setting> Settings { get; }
    DbSet<Favorite> Favorites { get; }
    DbSet<Recent> Recents { get; }
    DbSet<PluginState> PluginStates { get; }

    DatabaseFacade Database { get; }

    Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
}
