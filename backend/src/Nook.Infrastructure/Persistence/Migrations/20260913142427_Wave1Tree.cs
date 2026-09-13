using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nook.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class Wave1Tree : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropPrimaryKey(
                name: "pk_settings",
                table: "settings");

            migrationBuilder.AddColumn<string>(
                name: "scope",
                table: "settings",
                type: "character varying(20)",
                maxLength: 20,
                nullable: false,
                defaultValue: "instance");

            migrationBuilder.AddColumn<Guid>(
                name: "scope_id",
                table: "settings",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddPrimaryKey(
                name: "pk_settings",
                table: "settings",
                columns: new[] { "scope", "scope_id", "key" });

            migrationBuilder.CreateTable(
                name: "favorites",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    position = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_favorites", x => new { x.user_id, x.workspace_id, x.node_id });
                    table.ForeignKey(
                        name: "fk_favorites_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_favorites_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_favorites_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "recents",
                columns: table => new
                {
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    visited_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_recents", x => new { x.user_id, x.workspace_id, x.node_id });
                    table.ForeignKey(
                        name: "fk_recents_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_recents_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_recents_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_aliases_alias_trgm",
                table: "aliases",
                column: "alias")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "ix_favorites_node_id",
                table: "favorites",
                column: "node_id");

            migrationBuilder.CreateIndex(
                name: "ix_favorites_user_id_workspace_id_position",
                table: "favorites",
                columns: new[] { "user_id", "workspace_id", "position" });

            migrationBuilder.CreateIndex(
                name: "ix_favorites_workspace_id",
                table: "favorites",
                column: "workspace_id");

            migrationBuilder.CreateIndex(
                name: "ix_recents_node_id",
                table: "recents",
                column: "node_id");

            migrationBuilder.CreateIndex(
                name: "ix_recents_user_id_workspace_id_visited_at",
                table: "recents",
                columns: new[] { "user_id", "workspace_id", "visited_at" },
                descending: new[] { false, false, true });

            migrationBuilder.CreateIndex(
                name: "ix_recents_workspace_id",
                table: "recents",
                column: "workspace_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "favorites");

            migrationBuilder.DropTable(
                name: "recents");

            migrationBuilder.DropPrimaryKey(
                name: "pk_settings",
                table: "settings");

            migrationBuilder.DropIndex(
                name: "ix_aliases_alias_trgm",
                table: "aliases");

            migrationBuilder.DropColumn(
                name: "scope",
                table: "settings");

            migrationBuilder.DropColumn(
                name: "scope_id",
                table: "settings");

            migrationBuilder.AddPrimaryKey(
                name: "pk_settings",
                table: "settings",
                column: "key");
        }
    }
}
