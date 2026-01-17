using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RouteTracker.Migrations
{
    /// <inheritdoc />
    public partial class AddLinkedProviders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Step 1: Create LinkedProviders table
            migrationBuilder.CreateTable(
                name: "LinkedProviders",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Provider = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ProviderId = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ProviderUsername = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ProviderEmail = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ProviderAvatarUrl = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LinkedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LinkedProviders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LinkedProviders_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            // Step 2: Migrate existing user data to LinkedProviders
            migrationBuilder.Sql(@"
                INSERT INTO ""LinkedProviders"" (""Id"", ""UserId"", ""Provider"", ""ProviderId"", ""ProviderUsername"", ""ProviderEmail"", ""ProviderAvatarUrl"", ""LinkedAt"")
                SELECT 
                    gen_random_uuid(),
                    ""Id"",
                    ""Provider"",
                    ""ProviderId"",
                    ""Username"",
                    ""Email"",
                    ""AvatarUrl"",
                    ""CreatedAt""
                FROM ""Users""
                WHERE ""Provider"" IS NOT NULL AND ""ProviderId"" IS NOT NULL;
            ");

            // Step 3: Rename Username to DisplayName
            migrationBuilder.RenameColumn(
                name: "Username",
                table: "Users",
                newName: "DisplayName");

            // Step 4: Drop the old indexes
            migrationBuilder.DropIndex(
                name: "IX_Users_Provider_ProviderId",
                table: "Users");

            // Step 5: Drop old columns
            migrationBuilder.DropColumn(
                name: "Provider",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "ProviderId",
                table: "Users");

            // Step 6: Create indexes on LinkedProviders
            migrationBuilder.CreateIndex(
                name: "IX_LinkedProviders_Provider_ProviderId",
                table: "LinkedProviders",
                columns: new[] { "Provider", "ProviderId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LinkedProviders_UserId",
                table: "LinkedProviders",
                column: "UserId");

            migrationBuilder.CreateIndex(
                name: "IX_LinkedProviders_UserId_Provider",
                table: "LinkedProviders",
                columns: new[] { "UserId", "Provider" },
                unique: true);

            // Step 7: Add index on Email for Users
            migrationBuilder.CreateIndex(
                name: "IX_Users_Email",
                table: "Users",
                column: "Email");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Drop new indexes
            migrationBuilder.DropIndex(
                name: "IX_Users_Email",
                table: "Users");

            migrationBuilder.DropIndex(
                name: "IX_LinkedProviders_UserId_Provider",
                table: "LinkedProviders");

            migrationBuilder.DropIndex(
                name: "IX_LinkedProviders_UserId",
                table: "LinkedProviders");

            migrationBuilder.DropIndex(
                name: "IX_LinkedProviders_Provider_ProviderId",
                table: "LinkedProviders");

            // Add back old columns
            migrationBuilder.AddColumn<string>(
                name: "Provider",
                table: "Users",
                type: "character varying(50)",
                maxLength: 50,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "ProviderId",
                table: "Users",
                type: "character varying(255)",
                maxLength: 255,
                nullable: false,
                defaultValue: "");

            // Migrate data back from LinkedProviders to Users
            migrationBuilder.Sql(@"
                UPDATE ""Users"" u
                SET ""Provider"" = lp.""Provider"",
                    ""ProviderId"" = lp.""ProviderId""
                FROM ""LinkedProviders"" lp
                WHERE lp.""UserId"" = u.""Id""
                AND lp.""LinkedAt"" = (
                    SELECT MIN(""LinkedAt"") FROM ""LinkedProviders"" WHERE ""UserId"" = u.""Id""
                );
            ");

            // Rename DisplayName back to Username
            migrationBuilder.RenameColumn(
                name: "DisplayName",
                table: "Users",
                newName: "Username");

            // Recreate old index
            migrationBuilder.CreateIndex(
                name: "IX_Users_Provider_ProviderId",
                table: "Users",
                columns: new[] { "Provider", "ProviderId" },
                unique: true);

            // Drop LinkedProviders table
            migrationBuilder.DropTable(
                name: "LinkedProviders");
        }
    }
}
