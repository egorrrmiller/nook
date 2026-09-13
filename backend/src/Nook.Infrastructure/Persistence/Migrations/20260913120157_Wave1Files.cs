using System;
using System.Text.Json;
using Microsoft.EntityFrameworkCore.Migrations;
using NpgsqlTypes;

#nullable disable

namespace Nook.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Wave1Files : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "ix_attachments_workspace_id",
                table: "attachments");

            migrationBuilder.AddColumn<string>(
                name: "extracted_text",
                table: "attachments",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "purpose",
                table: "attachments",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "content");

            migrationBuilder.AddColumn<NpgsqlTsVector>(
                name: "text_en",
                table: "attachments",
                type: "tsvector",
                nullable: true,
                computedColumnSql: "to_tsvector('english', coalesce(extracted_text, ''))",
                stored: true);

            migrationBuilder.AddColumn<NpgsqlTsVector>(
                name: "text_ru",
                table: "attachments",
                type: "tsvector",
                nullable: true,
                computedColumnSql: "to_tsvector('russian', coalesce(extracted_text, ''))",
                stored: true);

            migrationBuilder.CreateTable(
                name: "link_previews",
                columns: table => new
                {
                    url_hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    url = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    data = table.Column<JsonElement>(type: "jsonb", nullable: false),
                    fetched_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_link_previews", x => x.url_hash);
                });

            migrationBuilder.CreateIndex(
                name: "ix_attachments_text_en",
                table: "attachments",
                column: "text_en")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_attachments_text_ru",
                table: "attachments",
                column: "text_ru")
                .Annotation("Npgsql:IndexMethod", "gin");

            migrationBuilder.CreateIndex(
                name: "ix_attachments_workspace_id_node_id",
                table: "attachments",
                columns: new[] { "workspace_id", "node_id" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "link_previews");

            migrationBuilder.DropIndex(
                name: "ix_attachments_text_en",
                table: "attachments");

            migrationBuilder.DropIndex(
                name: "ix_attachments_text_ru",
                table: "attachments");

            migrationBuilder.DropIndex(
                name: "ix_attachments_workspace_id_node_id",
                table: "attachments");

            migrationBuilder.DropColumn(
                name: "text_en",
                table: "attachments");

            migrationBuilder.DropColumn(
                name: "text_ru",
                table: "attachments");

            migrationBuilder.DropColumn(
                name: "extracted_text",
                table: "attachments");

            migrationBuilder.DropColumn(
                name: "purpose",
                table: "attachments");

            migrationBuilder.CreateIndex(
                name: "ix_attachments_workspace_id",
                table: "attachments",
                column: "workspace_id");
        }
    }
}
