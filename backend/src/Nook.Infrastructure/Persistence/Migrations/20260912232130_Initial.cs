using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;
using Nook.Domain.Enums;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;
using NpgsqlTypes;

#nullable disable

namespace Nook.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:link_kind", "embed,mention,relation,synced,wikilink")
                .Annotation("Npgsql:Enum:node_kind", "collection_row,database,file,folder,page")
                .Annotation("Npgsql:Enum:workspace_role", "editor,owner,viewer")
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.CreateTable(
                name: "blobs",
                columns: table => new
                {
                    sha256 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    size = table.Column<long>(type: "bigint", nullable: false),
                    mime = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    stored_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blobs", x => x.sha256);
                });

            migrationBuilder.CreateTable(
                name: "events_outbox",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    type = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    payload = table.Column<JsonElement>(type: "jsonb", nullable: false),
                    occurred_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    dispatched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    attempts = table.Column<int>(type: "integer", nullable: false),
                    last_error = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_events_outbox", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "invites",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    code = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: true),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    used_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_invites", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "plugin_state",
                columns: table => new
                {
                    plugin_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    value = table.Column<JsonElement>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_plugin_state", x => new { x.plugin_id, x.key });
                });

            migrationBuilder.CreateTable(
                name: "settings",
                columns: table => new
                {
                    key = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    value = table.Column<JsonElement>(type: "jsonb", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_settings", x => x.key);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    email = table.Column<string>(type: "character varying(320)", maxLength: 320, nullable: false),
                    password_hash = table.Column<string>(type: "text", nullable: false),
                    display_name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    avatar_url = table.Column<string>(type: "text", nullable: true),
                    is_instance_owner = table.Column<bool>(type: "boolean", nullable: false),
                    totp_secret = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_users", x => x.id);
                });

            migrationBuilder.CreateTable(
                name: "api_tokens",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    token_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    scopes = table.Column<string[]>(type: "text[]", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_api_tokens", x => x.id);
                    table.ForeignKey(
                        name: "fk_api_tokens_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workspaces",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    owner_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    icon = table.Column<string>(type: "jsonb", nullable: true),
                    is_personal = table.Column<bool>(type: "boolean", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_workspaces", x => x.id);
                    table.ForeignKey(
                        name: "fk_workspaces_users_owner_id",
                        column: x => x.owner_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "nodes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_id = table.Column<Guid>(type: "uuid", nullable: true),
                    kind = table.Column<NodeKind>(type: "node_kind", nullable: false),
                    title = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    icon = table.Column<string>(type: "jsonb", nullable: true),
                    cover = table.Column<string>(type: "jsonb", nullable: true),
                    position = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    page_settings = table.Column<string>(type: "jsonb", nullable: true),
                    collection_id = table.Column<Guid>(type: "uuid", nullable: true),
                    properties = table.Column<JsonElement>(type: "jsonb", nullable: true),
                    archived_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    deleted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_nodes", x => x.id);
                    table.ForeignKey(
                        name: "fk_nodes_nodes_parent_id",
                        column: x => x.parent_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_nodes_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "tags",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    color = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_tags", x => x.id);
                    table.ForeignKey(
                        name: "fk_tags_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "workspace_members",
                columns: table => new
                {
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<WorkspaceRole>(type: "workspace_role", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_workspace_members", x => new { x.workspace_id, x.user_id });
                    table.ForeignKey(
                        name: "fk_workspace_members_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_workspace_members_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "aliases",
                columns: table => new
                {
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    alias = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_aliases", x => new { x.node_id, x.alias });
                    table.ForeignKey(
                        name: "fk_aliases_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "attachments",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    blob_sha = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    block_id = table.Column<Guid>(type: "uuid", nullable: true),
                    property_id = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    filename = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    mime = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    size = table.Column<long>(type: "bigint", nullable: false),
                    meta = table.Column<JsonElement>(type: "jsonb", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_attachments", x => x.id);
                    table.ForeignKey(
                        name: "fk_attachments_blobs_blob_sha",
                        column: x => x.blob_sha,
                        principalTable: "blobs",
                        principalColumn: "sha256",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_attachments_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_attachments_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "blocks",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_block_id = table.Column<Guid>(type: "uuid", nullable: true),
                    position = table.Column<int>(type: "integer", nullable: false),
                    type = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    props = table.Column<JsonElement>(type: "jsonb", nullable: false),
                    content = table.Column<JsonElement>(type: "jsonb", nullable: true),
                    schema_version = table.Column<int>(type: "integer", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    plain_text = table.Column<string>(type: "text", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    text_en = table.Column<NpgsqlTsVector>(type: "tsvector", nullable: true, computedColumnSql: "to_tsvector('english', coalesce(plain_text, ''))", stored: true),
                    text_ru = table.Column<NpgsqlTsVector>(type: "tsvector", nullable: true, computedColumnSql: "to_tsvector('russian', coalesce(plain_text, ''))", stored: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_blocks", x => x.id);
                    table.ForeignKey(
                        name: "fk_blocks_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "document_updates",
                columns: table => new
                {
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    seq = table.Column<long>(type: "bigint", nullable: false),
                    update = table.Column<byte[]>(type: "bytea", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_document_updates", x => new { x.node_id, x.seq });
                    table.ForeignKey(
                        name: "fk_document_updates_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "documents",
                columns: table => new
                {
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    ydoc = table.Column<byte[]>(type: "bytea", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_documents", x => x.node_id);
                    table.ForeignKey(
                        name: "fk_documents_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "links",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    source_block_id = table.Column<Guid>(type: "uuid", nullable: true),
                    target_node_id = table.Column<Guid>(type: "uuid", nullable: true),
                    target_block_id = table.Column<Guid>(type: "uuid", nullable: true),
                    kind = table.Column<LinkKind>(type: "link_kind", nullable: false),
                    href = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_links", x => x.id);
                    table.ForeignKey(
                        name: "fk_links_nodes_source_node_id",
                        column: x => x.source_node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "node_shares",
                columns: table => new
                {
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    role = table.Column<WorkspaceRole>(type: "workspace_role", nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_node_shares", x => new { x.node_id, x.user_id });
                    table.ForeignKey(
                        name: "fk_node_shares_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_node_shares_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "page_snapshots",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    taken_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    version = table.Column<int>(type: "integer", nullable: false),
                    title = table.Column<string>(type: "text", nullable: false),
                    blocks = table.Column<JsonElement>(type: "jsonb", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_page_snapshots", x => x.id);
                    table.ForeignKey(
                        name: "fk_page_snapshots_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "node_tags",
                columns: table => new
                {
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    tag_id = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_node_tags", x => new { x.node_id, x.tag_id });
                    table.ForeignKey(
                        name: "fk_node_tags_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_node_tags_tags_tag_id",
                        column: x => x.tag_id,
                        principalTable: "tags",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_api_tokens_token_hash",
                table: "api_tokens",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_api_tokens_user_id",
                table: "api_tokens",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_attachments_blob_sha",
                table: "attachments",
                column: "blob_sha");

            migrationBuilder.CreateIndex(
                name: "ix_attachments_node_id",
                table: "attachments",
                column: "node_id");

            migrationBuilder.CreateIndex(
                name: "ix_attachments_workspace_id",
                table: "attachments",
                column: "workspace_id");

            migrationBuilder.CreateIndex(
                name: "ix_blocks_node_id_parent_block_id_position",
                table: "blocks",
                columns: new[] { "node_id", "parent_block_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_blocks_text_en",
                table: "blocks",
                column: "text_en")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_blocks_text_ru",
                table: "blocks",
                column: "text_ru")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_events_outbox_pending",
                table: "events_outbox",
                column: "dispatched_at",
                filter: "dispatched_at IS NULL");

            migrationBuilder.CreateIndex(
                name: "ix_invites_code",
                table: "invites",
                column: "code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_links_source_node_id",
                table: "links",
                column: "source_node_id");

            migrationBuilder.CreateIndex(
                name: "ix_links_target_node_id",
                table: "links",
                column: "target_node_id");

            migrationBuilder.CreateIndex(
                name: "ix_node_shares_user_id",
                table: "node_shares",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_node_tags_tag_id",
                table: "node_tags",
                column: "tag_id");

            migrationBuilder.CreateIndex(
                name: "ix_nodes_parent_id",
                table: "nodes",
                column: "parent_id");

            migrationBuilder.CreateIndex(
                name: "ix_nodes_properties",
                table: "nodes",
                column: "properties")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_nodes_title_trgm",
                table: "nodes",
                column: "title")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "ix_nodes_workspace_id_collection_id",
                table: "nodes",
                columns: new[] { "workspace_id", "collection_id" });

            migrationBuilder.CreateIndex(
                name: "ix_nodes_workspace_id_deleted_at",
                table: "nodes",
                columns: new[] { "workspace_id", "deleted_at" });

            migrationBuilder.CreateIndex(
                name: "ix_nodes_workspace_id_parent_id_position",
                table: "nodes",
                columns: new[] { "workspace_id", "parent_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_page_snapshots_node_id_taken_at",
                table: "page_snapshots",
                columns: new[] { "node_id", "taken_at" });

            migrationBuilder.CreateIndex(
                name: "ix_tags_workspace_id_name",
                table: "tags",
                columns: new[] { "workspace_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_workspace_members_user_id",
                table: "workspace_members",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_workspaces_owner_id",
                table: "workspaces",
                column: "owner_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "aliases");

            migrationBuilder.DropTable(
                name: "api_tokens");

            migrationBuilder.DropTable(
                name: "attachments");

            migrationBuilder.DropTable(
                name: "blocks");

            migrationBuilder.DropTable(
                name: "document_updates");

            migrationBuilder.DropTable(
                name: "documents");

            migrationBuilder.DropTable(
                name: "events_outbox");

            migrationBuilder.DropTable(
                name: "invites");

            migrationBuilder.DropTable(
                name: "links");

            migrationBuilder.DropTable(
                name: "node_shares");

            migrationBuilder.DropTable(
                name: "node_tags");

            migrationBuilder.DropTable(
                name: "page_snapshots");

            migrationBuilder.DropTable(
                name: "plugin_state");

            migrationBuilder.DropTable(
                name: "settings");

            migrationBuilder.DropTable(
                name: "workspace_members");

            migrationBuilder.DropTable(
                name: "blobs");

            migrationBuilder.DropTable(
                name: "tags");

            migrationBuilder.DropTable(
                name: "nodes");

            migrationBuilder.DropTable(
                name: "workspaces");

            migrationBuilder.DropTable(
                name: "users");
        }
    }
}
