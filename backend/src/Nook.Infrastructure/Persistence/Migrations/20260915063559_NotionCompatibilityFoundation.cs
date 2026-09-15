using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nook.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class NotionCompatibilityFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "integrations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    client_id = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    client_secret_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    redirect_uris = table.Column<string[]>(type: "text[]", nullable: false),
                    enabled = table.Column<bool>(type: "boolean", nullable: false),
                    created_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    updated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_integrations", x => x.id);
                    table.ForeignKey(
                        name: "fk_integrations_users_created_by_user_id",
                        column: x => x.created_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "integration_installations",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    integration_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    bot_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    owner_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    token_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    token_kind = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    last_used_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_integration_installations", x => x.id);
                    table.ForeignKey(
                        name: "fk_integration_installations_integrations_integration_id",
                        column: x => x.integration_id,
                        principalTable: "integrations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_integration_installations_users_bot_user_id",
                        column: x => x.bot_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_integration_installations_users_owner_user_id",
                        column: x => x.owner_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "fk_integration_installations_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "oauth_authorization_codes",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    integration_id = table.Column<Guid>(type: "uuid", nullable: false),
                    user_id = table.Column<Guid>(type: "uuid", nullable: false),
                    workspace_id = table.Column<Guid>(type: "uuid", nullable: false),
                    code_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    redirect_uri = table.Column<string>(type: "character varying(2048)", maxLength: 2048, nullable: false),
                    scopes = table.Column<string[]>(type: "text[]", nullable: false),
                    code_challenge = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    code_challenge_method = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    consumed_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_oauth_authorization_codes", x => x.id);
                    table.ForeignKey(
                        name: "fk_oauth_authorization_codes_integrations_integration_id",
                        column: x => x.integration_id,
                        principalTable: "integrations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_oauth_authorization_codes_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "fk_oauth_authorization_codes_workspaces_workspace_id",
                        column: x => x.workspace_id,
                        principalTable: "workspaces",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "integration_capabilities",
                columns: table => new
                {
                    installation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    read_content = table.Column<bool>(type: "boolean", nullable: false),
                    update_content = table.Column<bool>(type: "boolean", nullable: false),
                    insert_content = table.Column<bool>(type: "boolean", nullable: false),
                    read_comments = table.Column<bool>(type: "boolean", nullable: false),
                    insert_comments = table.Column<bool>(type: "boolean", nullable: false),
                    read_property = table.Column<bool>(type: "boolean", nullable: false),
                    update_property = table.Column<bool>(type: "boolean", nullable: false),
                    insert_property = table.Column<bool>(type: "boolean", nullable: false),
                    user_info_level = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_integration_capabilities", x => x.installation_id);
                    table.ForeignKey(
                        name: "fk_integration_capabilities_integration_installations_installa",
                        column: x => x.installation_id,
                        principalTable: "integration_installations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "integration_grants",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    installation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    node_id = table.Column<Guid>(type: "uuid", nullable: false),
                    include_children = table.Column<bool>(type: "boolean", nullable: false),
                    granted_by_user_id = table.Column<Guid>(type: "uuid", nullable: true),
                    granted_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_integration_grants", x => x.id);
                    table.ForeignKey(
                        name: "fk_integration_grants_integration_installations_installation_id",
                        column: x => x.installation_id,
                        principalTable: "integration_installations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_integration_grants_nodes_node_id",
                        column: x => x.node_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "fk_integration_grants_users_granted_by_user_id",
                        column: x => x.granted_by_user_id,
                        principalTable: "users",
                        principalColumn: "id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "oauth_refresh_tokens",
                columns: table => new
                {
                    id = table.Column<Guid>(type: "uuid", nullable: false),
                    installation_id = table.Column<Guid>(type: "uuid", nullable: false),
                    token_hash = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    created_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    expires_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    rotated_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    revoked_at = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_oauth_refresh_tokens", x => x.id);
                    table.ForeignKey(
                        name: "fk_oauth_refresh_tokens_integration_installations_installation",
                        column: x => x.installation_id,
                        principalTable: "integration_installations",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "ix_integration_grants_granted_by_user_id",
                table: "integration_grants",
                column: "granted_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_integration_grants_installation_id_node_id",
                table: "integration_grants",
                columns: new[] { "installation_id", "node_id" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_integration_grants_installation_id_revoked_at",
                table: "integration_grants",
                columns: new[] { "installation_id", "revoked_at" });

            migrationBuilder.CreateIndex(
                name: "ix_integration_grants_node_id",
                table: "integration_grants",
                column: "node_id");

            migrationBuilder.CreateIndex(
                name: "ix_integration_installations_bot_user_id",
                table: "integration_installations",
                column: "bot_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_integration_installations_integration_id_workspace_id",
                table: "integration_installations",
                columns: new[] { "integration_id", "workspace_id" });

            migrationBuilder.CreateIndex(
                name: "ix_integration_installations_owner_user_id",
                table: "integration_installations",
                column: "owner_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_integration_installations_token_hash",
                table: "integration_installations",
                column: "token_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_integration_installations_workspace_id_revoked_at",
                table: "integration_installations",
                columns: new[] { "workspace_id", "revoked_at" });

            migrationBuilder.CreateIndex(
                name: "ix_integrations_client_id",
                table: "integrations",
                column: "client_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_integrations_created_by_user_id",
                table: "integrations",
                column: "created_by_user_id");

            migrationBuilder.CreateIndex(
                name: "ix_oauth_authorization_codes_code_hash",
                table: "oauth_authorization_codes",
                column: "code_hash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "ix_oauth_authorization_codes_integration_id_expires_at",
                table: "oauth_authorization_codes",
                columns: new[] { "integration_id", "expires_at" });

            migrationBuilder.CreateIndex(
                name: "ix_oauth_authorization_codes_user_id",
                table: "oauth_authorization_codes",
                column: "user_id");

            migrationBuilder.CreateIndex(
                name: "ix_oauth_authorization_codes_workspace_id",
                table: "oauth_authorization_codes",
                column: "workspace_id");

            migrationBuilder.CreateIndex(
                name: "ix_oauth_refresh_tokens_installation_id_revoked_at",
                table: "oauth_refresh_tokens",
                columns: new[] { "installation_id", "revoked_at" });

            migrationBuilder.CreateIndex(
                name: "ix_oauth_refresh_tokens_token_hash",
                table: "oauth_refresh_tokens",
                column: "token_hash",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "integration_capabilities");

            migrationBuilder.DropTable(
                name: "integration_grants");

            migrationBuilder.DropTable(
                name: "oauth_authorization_codes");

            migrationBuilder.DropTable(
                name: "oauth_refresh_tokens");

            migrationBuilder.DropTable(
                name: "integration_installations");

            migrationBuilder.DropTable(
                name: "integrations");
        }
    }
}
