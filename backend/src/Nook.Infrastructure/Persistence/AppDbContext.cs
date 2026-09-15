using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Nook.Application.Common;
using Nook.Domain.Entities;
using Nook.Domain.ValueObjects;
using NpgsqlTypes;

namespace Nook.Infrastructure.Persistence;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options), IAppDbContext
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Workspace> Workspaces => Set<Workspace>();
    public DbSet<WorkspaceMember> WorkspaceMembers => Set<WorkspaceMember>();
    public DbSet<Invite> Invites => Set<Invite>();
    public DbSet<ApiToken> ApiTokens => Set<ApiToken>();
    public DbSet<Integration> Integrations => Set<Integration>();
    public DbSet<IntegrationInstallation> IntegrationInstallations => Set<IntegrationInstallation>();
    public DbSet<IntegrationCapabilities> IntegrationCapabilities => Set<IntegrationCapabilities>();
    public DbSet<IntegrationGrant> IntegrationGrants => Set<IntegrationGrant>();
    public DbSet<OAuthAuthorizationCode> OAuthAuthorizationCodes => Set<OAuthAuthorizationCode>();
    public DbSet<OAuthRefreshToken> OAuthRefreshTokens => Set<OAuthRefreshToken>();
    public DbSet<Node> Nodes => Set<Node>();
    public DbSet<Collection> Collections => Set<Collection>();
    public DbSet<Database> Databases => Set<Database>();
    public DbSet<CollectionView> CollectionViews => Set<CollectionView>();
    public DbSet<NodeShare> NodeShares => Set<NodeShare>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentUpdate> DocumentUpdates => Set<DocumentUpdate>();
    public DbSet<PageSnapshot> PageSnapshots => Set<PageSnapshot>();
    public DbSet<Block> Blocks => Set<Block>();
    public DbSet<Link> Links => Set<Link>();
    public DbSet<Tag> Tags => Set<Tag>();
    public DbSet<NodeTag> NodeTags => Set<NodeTag>();
    public DbSet<Alias> Aliases => Set<Alias>();
    public DbSet<Attachment> Attachments => Set<Attachment>();
    public DbSet<Blob> Blobs => Set<Blob>();
    public DbSet<LinkPreview> LinkPreviews => Set<LinkPreview>();
    public DbSet<OutboxEvent> EventsOutbox => Set<OutboxEvent>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<Favorite> Favorites => Set<Favorite>();
    public DbSet<Recent> Recents => Set<Recent>();
    public DbSet<PluginState> PluginStates => Set<PluginState>();
    public DbSet<ImportJob> ImportJobs => Set<ImportJob>();

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("pg_trgm");

        modelBuilder.Entity<User>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Email).HasMaxLength(320).IsRequired();
            b.HasIndex(x => x.Email).IsUnique();
            b.Property(x => x.DisplayName).HasMaxLength(100).IsRequired();
            b.Property(x => x.PasswordHash).IsRequired();
        });

        modelBuilder.Entity<Workspace>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(200).IsRequired();
            b.Property(x => x.Icon).HasConversion(JsonConverter<NodeIcon>()).HasColumnType("jsonb");
            b.HasOne(x => x.Owner).WithMany().HasForeignKey(x => x.OwnerId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<WorkspaceMember>(b =>
        {
            b.HasKey(x => new { x.WorkspaceId, x.UserId });
            b.HasOne(x => x.Workspace).WithMany(w => w.Members).HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.User).WithMany(u => u.Memberships).HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => x.UserId);
        });

        modelBuilder.Entity<Invite>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Code).HasMaxLength(64).IsRequired();
            b.HasIndex(x => x.Code).IsUnique();
            b.Property(x => x.Email).HasMaxLength(320);
        });

        modelBuilder.Entity<ApiToken>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(100).IsRequired();
            b.Property(x => x.TokenHash).HasMaxLength(64).IsRequired();
            b.HasIndex(x => x.TokenHash).IsUnique();
            b.Property(x => x.Scopes).HasColumnType("text[]");
            b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        });

        // --- Notion compatibility foundation ---------------------------------------------------------------------
        // These tables are deliberately separate from ApiToken. Native /api tokens retain their existing semantics;
        // compatibility installations resolve workspace-scoped principals and grants without X-Workspace-Id.
        modelBuilder.Entity<Integration>(b =>
        {
            b.ToTable("integrations");
            b.HasKey(x => x.Id);
            b.Property(x => x.ClientId).HasMaxLength(200).IsRequired();
            b.Property(x => x.ClientSecretHash).HasMaxLength(256);
            b.Property(x => x.Name).HasMaxLength(200).IsRequired();
            b.Property(x => x.Kind).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.Property(x => x.RedirectUris).HasColumnType("text[]").IsRequired();
            b.HasIndex(x => x.ClientId).IsUnique();
            b.HasOne(x => x.CreatedByUser).WithMany().HasForeignKey(x => x.CreatedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<IntegrationInstallation>(b =>
        {
            b.ToTable("integration_installations");
            b.HasKey(x => x.Id);
            b.Property(x => x.TokenHash).HasMaxLength(256).IsRequired();
            b.Property(x => x.TokenKind).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.HasIndex(x => x.TokenHash).IsUnique();
            b.HasIndex(x => new { x.WorkspaceId, x.RevokedAt });
            b.HasIndex(x => new { x.IntegrationId, x.WorkspaceId });
            b.HasOne(x => x.Integration).WithMany(x => x.Installations).HasForeignKey(x => x.IntegrationId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.BotUser).WithMany().HasForeignKey(x => x.BotUserId).OnDelete(DeleteBehavior.SetNull);
            b.HasOne(x => x.OwnerUser).WithMany().HasForeignKey(x => x.OwnerUserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<IntegrationCapabilities>(b =>
        {
            b.ToTable("integration_capabilities");
            b.HasKey(x => x.InstallationId);
            b.Property(x => x.UserInfoLevel).HasConversion<string>().HasMaxLength(32).IsRequired();
            b.HasOne(x => x.Installation).WithOne(x => x.Capabilities).HasForeignKey<IntegrationCapabilities>(x => x.InstallationId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<IntegrationGrant>(b =>
        {
            b.ToTable("integration_grants");
            b.HasKey(x => x.Id);
            b.HasIndex(x => new { x.InstallationId, x.NodeId }).IsUnique();
            b.HasIndex(x => new { x.InstallationId, x.RevokedAt });
            b.HasIndex(x => x.NodeId);
            b.HasOne(x => x.Installation).WithMany(x => x.Grants).HasForeignKey(x => x.InstallationId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Node).WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.GrantedByUser).WithMany().HasForeignKey(x => x.GrantedByUserId).OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<OAuthAuthorizationCode>(b =>
        {
            b.ToTable("oauth_authorization_codes");
            b.HasKey(x => x.Id);
            b.Property(x => x.CodeHash).HasMaxLength(256).IsRequired();
            b.Property(x => x.RedirectUri).HasMaxLength(2048).IsRequired();
            b.Property(x => x.Scopes).HasColumnType("text[]").IsRequired();
            b.Property(x => x.CodeChallenge).HasMaxLength(256);
            b.Property(x => x.CodeChallengeMethod).HasMaxLength(32);
            b.HasIndex(x => x.CodeHash).IsUnique();
            b.HasIndex(x => new { x.IntegrationId, x.ExpiresAt });
            b.HasOne(x => x.Integration).WithMany(x => x.AuthorizationCodes).HasForeignKey(x => x.IntegrationId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
            b.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<OAuthRefreshToken>(b =>
        {
            b.ToTable("oauth_refresh_tokens");
            b.HasKey(x => x.Id);
            b.Property(x => x.TokenHash).HasMaxLength(256).IsRequired();
            b.HasIndex(x => x.TokenHash).IsUnique();
            b.HasIndex(x => new { x.InstallationId, x.RevokedAt });
            b.HasOne(x => x.Installation).WithMany(x => x.RefreshTokens).HasForeignKey(x => x.InstallationId).OnDelete(DeleteBehavior.Cascade);
        });
        // --- end Notion compatibility foundation -----------------------------------------------------------------

        modelBuilder.Entity<Node>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Title).HasMaxLength(1000).IsRequired();
            b.Property(x => x.Position).HasMaxLength(128).IsRequired();
            b.Property(x => x.Icon).HasConversion(JsonConverter<NodeIcon>()).HasColumnType("jsonb");
            b.Property(x => x.Cover).HasConversion(JsonConverter<NodeCover>()).HasColumnType("jsonb");
            b.Property(x => x.PageSettings).HasConversion(JsonConverter<PageSettings>()).HasColumnType("jsonb");
            b.Property(x => x.Properties).HasColumnType("jsonb");
            b.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Parent).WithMany(x => x.Children).HasForeignKey(x => x.ParentId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.WorkspaceId, x.ParentId, x.Position });
            b.HasIndex(x => new { x.WorkspaceId, x.DeletedAt });
            b.HasIndex(x => new { x.WorkspaceId, x.CollectionId });
            b.HasIndex(x => x.Title).HasMethod("gin").HasOperators("gin_trgm_ops").HasDatabaseName("ix_nodes_title_trgm");
            b.HasIndex(x => x.Properties).HasMethod("gin");
        });

        // --- wave2: collections/databases -------------------------------------------------------------------------
        // Collection schema, templates and row layout intentionally remain JSON contracts. Rows continue to be Nodes;
        // this keeps page identity, links, shares and attachments stable when a page becomes a database row.
        modelBuilder.Entity<Collection>(b =>
        {
            b.ToTable("collections");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(200).IsRequired();
            b.Property(x => x.PropertySchema).HasColumnType("jsonb").IsRequired();
            b.Property(x => x.Templates).HasColumnType("jsonb").IsRequired();
            b.Property(x => x.RowLayout).HasColumnType("jsonb").IsRequired();
            b.HasOne(x => x.Workspace).WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.WorkspaceId, x.Name });
        });

        modelBuilder.Entity<Database>(b =>
        {
            b.ToTable("databases");
            b.HasKey(x => x.NodeId);
            b.HasOne(x => x.Node).WithOne().HasForeignKey<Database>(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Collection).WithMany(x => x.Databases).HasForeignKey(x => x.CollectionId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => x.CollectionId);
        });

        modelBuilder.Entity<CollectionView>(b =>
        {
            b.ToTable("collection_views");
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(200).IsRequired();
            b.Property(x => x.Kind).HasMaxLength(32).IsRequired();
            b.Property(x => x.Config).HasColumnType("jsonb").IsRequired();
            b.Property(x => x.Position).HasMaxLength(128).IsRequired();
            b.HasOne(x => x.Database).WithMany(x => x.Views).HasForeignKey(x => x.DatabaseId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Collection).WithMany().HasForeignKey(x => x.CollectionId).OnDelete(DeleteBehavior.Restrict);
            b.HasIndex(x => new { x.DatabaseId, x.Position });
            b.HasIndex(x => new { x.CollectionId, x.Kind });
        });
        // --- end wave2: collections/databases ---------------------------------------------------------------------

        modelBuilder.Entity<NodeShare>(b =>
        {
            b.HasKey(x => new { x.NodeId, x.UserId });
            b.HasOne(x => x.Node).WithMany(n => n.Shares).HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.User).WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => x.UserId);
        });

        modelBuilder.Entity<Document>(b =>
        {
            b.HasKey(x => x.NodeId);
            b.HasOne(x => x.Node).WithOne().HasForeignKey<Document>(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<DocumentUpdate>(b =>
        {
            b.HasKey(x => new { x.NodeId, x.Seq });
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<PageSnapshot>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Blocks).HasColumnType("jsonb");
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.NodeId, x.TakenAt });
        });

        modelBuilder.Entity<Block>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Type).HasMaxLength(100).IsRequired();
            b.Property(x => x.Props).HasColumnType("jsonb");
            b.Property(x => x.Content).HasColumnType("jsonb");
            b.Property(x => x.PlainText).IsRequired();
            b.Property<NpgsqlTsVector>("text_ru").HasComputedColumnSql("to_tsvector('russian', coalesce(plain_text, ''))", stored: true);
            b.Property<NpgsqlTsVector>("text_en").HasComputedColumnSql("to_tsvector('english', coalesce(plain_text, ''))", stored: true);
            b.HasIndex("text_ru").HasMethod("gin").HasDatabaseName("ix_blocks_text_ru");
            b.HasIndex("text_en").HasMethod("gin").HasDatabaseName("ix_blocks_text_en");
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.NodeId, x.ParentBlockId, x.Position });
        });

        modelBuilder.Entity<Link>(b =>
        {
            b.HasKey(x => x.Id);
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.SourceNodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => x.SourceNodeId);
            b.HasIndex(x => x.TargetNodeId);
        });

        modelBuilder.Entity<Tag>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.Name).HasMaxLength(100).IsRequired();
            b.Property(x => x.Color).HasMaxLength(32);
            b.HasOne<Workspace>().WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.WorkspaceId, x.Name }).IsUnique();
        });

        modelBuilder.Entity<NodeTag>(b =>
        {
            // --- wave1: knowledge --- the same tag can be attached manually and inline, so `source` is part of the key.
            b.HasKey(x => new { x.NodeId, x.TagId, x.Source });
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Tag>().WithMany().HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Alias>(b =>
        {
            b.ToTable("aliases");
            b.Property(x => x.Value).HasColumnName("alias").HasMaxLength(500).IsRequired();
            b.HasKey(x => new { x.NodeId, x.Value });
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            // --- wave1: tree --- (quick find matches aliases with pg_trgm)
            b.HasIndex(x => x.Value).HasMethod("gin").HasOperators("gin_trgm_ops").HasDatabaseName("ix_aliases_alias_trgm");
        });

        modelBuilder.Entity<Blob>(b =>
        {
            b.HasKey(x => x.Sha256);
            b.Property(x => x.Sha256).HasMaxLength(64);
            b.Property(x => x.Mime).HasMaxLength(255).IsRequired();
        });

        modelBuilder.Entity<Attachment>(b =>
        {
            b.HasKey(x => x.Id);
            b.Property(x => x.BlobSha).HasMaxLength(64).IsRequired();
            b.Property(x => x.Filename).HasMaxLength(1000).IsRequired();
            b.Property(x => x.Mime).HasMaxLength(255).IsRequired();
            b.Property(x => x.PropertyId).HasMaxLength(100);
            b.Property(x => x.Meta).HasColumnType("jsonb");
            b.HasOne<Blob>().WithMany().HasForeignKey(x => x.BlobSha).OnDelete(DeleteBehavior.Restrict);
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Workspace>().WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => x.NodeId);
        });

        modelBuilder.Entity<OutboxEvent>(b =>
        {
            b.ToTable("events_outbox");
            b.HasKey(x => x.Id);
            b.Property(x => x.Type).HasMaxLength(200).IsRequired();
            b.Property(x => x.Payload).HasColumnType("jsonb");
            b.HasIndex(x => x.DispatchedAt).HasFilter("dispatched_at IS NULL").HasDatabaseName("ix_events_outbox_pending");
        });

        // --- wave1: tree ---
        modelBuilder.Entity<Setting>(b =>
        {
            b.ToTable("settings");
            b.HasKey(x => new { x.Scope, x.ScopeId, x.Key });
            b.Property(x => x.Scope).HasMaxLength(20).HasDefaultValue(SettingScopes.Instance);
            b.Property(x => x.ScopeId).HasDefaultValue(Guid.Empty);
            b.Property(x => x.Key).HasMaxLength(200);
            b.Property(x => x.Value).HasColumnType("jsonb");
        });

        modelBuilder.Entity<Favorite>(b =>
        {
            b.ToTable("favorites");
            b.HasKey(x => new { x.UserId, x.WorkspaceId, x.NodeId });
            b.Property(x => x.Position).HasMaxLength(128).IsRequired();
            b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Workspace>().WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Node).WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.UserId, x.WorkspaceId, x.Position });
            b.HasIndex(x => x.NodeId);
        });

        modelBuilder.Entity<Recent>(b =>
        {
            b.ToTable("recents");
            b.HasKey(x => new { x.UserId, x.WorkspaceId, x.NodeId });
            b.HasOne<User>().WithMany().HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Workspace>().WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne(x => x.Node).WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.UserId, x.WorkspaceId, x.VisitedAt }).IsDescending(false, false, true);
            b.HasIndex(x => x.NodeId);
        });
        // --- end wave1: tree ---

        modelBuilder.Entity<PluginState>(b =>
        {
            b.ToTable("plugin_state");
            b.HasKey(x => new { x.PluginId, x.Key });
            b.Property(x => x.PluginId).HasMaxLength(100);
            b.Property(x => x.Key).HasMaxLength(200);
            b.Property(x => x.Value).HasColumnType("jsonb");
        });

        // --- wave1: files ---
        modelBuilder.Entity<Attachment>(b =>
        {
            b.Property(x => x.Purpose).HasMaxLength(20).IsRequired().HasDefaultValue("content");
            b.Property(x => x.ExtractedText);
            b.Property<NpgsqlTsVector>("text_ru").HasComputedColumnSql("to_tsvector('russian', coalesce(extracted_text, ''))", stored: true);
            b.Property<NpgsqlTsVector>("text_en").HasComputedColumnSql("to_tsvector('english', coalesce(extracted_text, ''))", stored: true);
            b.HasIndex("text_ru").HasMethod("gin").HasDatabaseName("ix_attachments_text_ru");
            b.HasIndex("text_en").HasMethod("gin").HasDatabaseName("ix_attachments_text_en");
            b.HasIndex(x => new { x.WorkspaceId, x.NodeId });
        });

        modelBuilder.Entity<LinkPreview>(b =>
        {
            b.ToTable("link_previews");
            b.HasKey(x => x.UrlHash);
            b.Property(x => x.UrlHash).HasMaxLength(64);
            b.Property(x => x.Url).HasMaxLength(2048).IsRequired();
            b.Property(x => x.Data).HasColumnType("jsonb");
        });
        // --- end wave1: files ---
        // --- wave1: knowledge -------------------------------------------------------------------------------------
        // (contracts §9; entities themselves are configured above — this block adds the wave-1 columns and indexes.)
        modelBuilder.Entity<Link>(b =>
        {
            b.Property(x => x.Href).HasMaxLength(2000);
            b.HasIndex(x => new { x.SourceNodeId, x.Kind });
            b.HasIndex(x => x.TargetBlockId);
        });

        modelBuilder.Entity<PageSnapshot>(b =>
        {
            b.Property(x => x.Kind).HasDefaultValue(Domain.Enums.SnapshotKind.Auto);
            b.HasIndex(x => new { x.NodeId, x.Kind });
        });

        modelBuilder.Entity<NodeTag>(b =>
        {
            b.Property(x => x.Source).HasDefaultValue(Domain.Enums.TagSource.Manual);
            b.HasIndex(x => new { x.NodeId, x.Source });
        });

        modelBuilder.Entity<Alias>(b =>
        {
            // Aliases are unique case-insensitively per workspace; the workspace is reached through the node, so the
            // database guarantees global ci-uniqueness of (node, alias) and AliasService enforces the workspace rule.
            b.HasIndex(x => x.Value).HasMethod("gin").HasOperators("gin_trgm_ops").HasDatabaseName("ix_aliases_alias_trgm");
        });

        modelBuilder.Entity<ImportJob>(b =>
        {
            b.ToTable("import_jobs");
            b.HasKey(x => x.Id);
            b.Property(x => x.FileName).HasMaxLength(1000).IsRequired();
            b.Property(x => x.FilePath).HasMaxLength(2000).IsRequired();
            b.Property(x => x.Status).HasMaxLength(20).IsRequired();
            b.Property(x => x.Result).HasColumnType("jsonb");
            b.HasOne<Workspace>().WithMany().HasForeignKey(x => x.WorkspaceId).OnDelete(DeleteBehavior.Cascade);
            b.HasIndex(x => new { x.WorkspaceId, x.CreatedAt });
        });
    }

    private static ValueConverter<T?, string?> JsonConverter<T>() where T : class =>
        new(
            v => v == null ? null : JsonSerializer.Serialize(v, JsonOptions),
            s => s == null ? null : JsonSerializer.Deserialize<T>(s, JsonOptions));
}
