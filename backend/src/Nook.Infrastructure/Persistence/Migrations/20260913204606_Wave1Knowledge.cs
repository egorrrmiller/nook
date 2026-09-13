using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;
using Nook.Domain.Enums;

#nullable disable

namespace Nook.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Wave1Knowledge : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "pk_node_tags",
                table: "node_tags");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:link_kind", "embed,mention,relation,synced,url,wikilink")
                .Annotation("Npgsql:Enum:node_kind", "collection_row,database,file,folder,page")
                .Annotation("Npgsql:Enum:snapshot_kind", "auto,manual,pre_restore")
                .Annotation("Npgsql:Enum:tag_source", "inline,manual")
                .Annotation("Npgsql:Enum:workspace_role", "editor,owner,viewer")
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,")
                .OldAnnotation("Npgsql:Enum:link_kind", "embed,mention,relation,synced,wikilink")
                .OldAnnotation("Npgsql:Enum:node_kind", "collection_row,database,file,folder,page")
                .OldAnnotation("Npgsql:Enum:workspace_role", "editor,owner,viewer")
                .OldAnnotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.AddColumn<int>(
                name: "block_count",
                table: "page_snapshots",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<SnapshotKind>(
                name: "kind",
                table: "page_snapshots",
                type: "snapshot_kind",
                nullable: false,
                defaultValue: SnapshotKind.Auto);

            migrationBuilder.AddColumn<TagSource>(
                name: "source",
                table: "node_tags",
                type: "tag_source",
                nullable: false,
                defaultValue: TagSource.Manual);

            migrationBuilder.AlterColumn<string>(
                name: "href",
                table: "links",
                type: "character varying(2000)",
                maxLength: 2000,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "text",
                oldNullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "pk_node_tags",
                table: "node_tags",
                columns: new[] { "node_id", "tag_id", "source" });

            migrationBuilder.CreateTable(
                name: "import_jobs",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    parent_node_id = table.Column<Guid>(type: "uuid", nullable: true),
                    file_name = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    file_path = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    status = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    result = table.Column<JsonElement>(type: "jsonb", nullable: true),
                    error = table.Column<string>(type: "text", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    finished_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_import_jobs", x => x.id);
                    table.ForeignKey(
                        name: "fk_import_jobs_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_page_snapshots_node_id_kind",
                table: "page_snapshots",
                columns: new[] { "node_id", "kind" });

            migrationBuilder.CreateIndex(
                name: "ix_node_tags_node_id_source",
                table: "node_tags",
                columns: new[] { "node_id", "source" });

            migrationBuilder.CreateIndex(
                name: "ix_links_source_node_id_kind",
                table: "links",
                columns: new[] { "source_node_id", "kind" });

            migrationBuilder.CreateIndex(
                name: "ix_links_target_block_id",
                table: "links",
                column: "target_block_id");

            migrationBuilder.CreateIndex(
                name: "ix_import_jobs_workspace_id_created_at",
                table: "import_jobs",
                columns: new[] { "workspace_id", "created_at" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "import_jobs");

            migrationBuilder.DropIndex(
                name: "ix_page_snapshots_node_id_kind",
                table: "page_snapshots");

            migrationBuilder.DropPrimaryKey(
                name: "pk_node_tags",
                table: "node_tags");

            migrationBuilder.DropIndex(
                name: "ix_node_tags_node_id_source",
                table: "node_tags");

            migrationBuilder.DropIndex(
                name: "ix_links_source_node_id_kind",
                table: "links");

            migrationBuilder.DropIndex(
                name: "ix_links_target_block_id",
                table: "links");

            migrationBuilder.DropColumn(
                name: "block_count",
                table: "page_snapshots");

            migrationBuilder.DropColumn(
                name: "kind",
                table: "page_snapshots");

            migrationBuilder.DropColumn(
                name: "source",
                table: "node_tags");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:Enum:link_kind", "embed,mention,relation,synced,wikilink")
                .Annotation("Npgsql:Enum:node_kind", "collection_row,database,file,folder,page")
                .Annotation("Npgsql:Enum:workspace_role", "editor,owner,viewer")
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,")
                .OldAnnotation("Npgsql:Enum:link_kind", "embed,mention,relation,synced,url,wikilink")
                .OldAnnotation("Npgsql:Enum:node_kind", "collection_row,database,file,folder,page")
                .OldAnnotation("Npgsql:Enum:snapshot_kind", "auto,manual,pre_restore")
                .OldAnnotation("Npgsql:Enum:tag_source", "inline,manual")
                .OldAnnotation("Npgsql:Enum:workspace_role", "editor,owner,viewer")
                .OldAnnotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.AlterColumn<string>(
                name: "href",
                table: "links",
                type: "text",
                nullable: true,
                oldClrType: typeof(string),
                oldType: "character varying(2000)",
                oldMaxLength: 2000,
                oldNullable: true);

            migrationBuilder.AddPrimaryKey(
                name: "pk_node_tags",
                table: "node_tags",
                columns: new[] { "node_id", "tag_id" });
        }
    }
}
