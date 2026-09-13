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
    public DbSet<Node> Nodes => Set<Node>();
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
    public DbSet<OutboxEvent> EventsOutbox => Set<OutboxEvent>();
    public DbSet<Setting> Settings => Set<Setting>();
    public DbSet<PluginState> PluginStates => Set<PluginState>();

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
            b.HasKey(x => new { x.NodeId, x.TagId });
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
            b.HasOne<Tag>().WithMany().HasForeignKey(x => x.TagId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<Alias>(b =>
        {
            b.ToTable("aliases");
            b.Property(x => x.Value).HasColumnName("alias").HasMaxLength(500).IsRequired();
            b.HasKey(x => new { x.NodeId, x.Value });
            b.HasOne<Node>().WithMany().HasForeignKey(x => x.NodeId).OnDelete(DeleteBehavior.Cascade);
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

        modelBuilder.Entity<Setting>(b =>
        {
            b.ToTable("settings");
            b.HasKey(x => x.Key);
            b.Property(x => x.Key).HasMaxLength(200);
            b.Property(x => x.Value).HasColumnType("jsonb");
        });

        modelBuilder.Entity<PluginState>(b =>
        {
            b.ToTable("plugin_state");
            b.HasKey(x => new { x.PluginId, x.Key });
            b.Property(x => x.PluginId).HasMaxLength(100);
            b.Property(x => x.Key).HasMaxLength(200);
            b.Property(x => x.Value).HasColumnType("jsonb");
        });
    }

    private static ValueConverter<T?, string?> JsonConverter<T>() where T : class =>
        new(
            v => v == null ? null : JsonSerializer.Serialize(v, JsonOptions),
            s => s == null ? null : JsonSerializer.Deserialize<T>(s, JsonOptions));
}
