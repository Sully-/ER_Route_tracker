using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RouteTracker.Migrations
{
    /// <inheritdoc />
    public partial class AddAngle : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent on purpose: the column may already exist in some
            // environments where a previous AddAngle attempt added it without
            // recording the migration in __EFMigrationsHistory. Using
            // "IF NOT EXISTS" makes applying this migration safe regardless of
            // the actual schema state, so no manual reconciliation is needed.
            migrationBuilder.Sql(
                "ALTER TABLE \"RoutePoints\" ADD COLUMN IF NOT EXISTS \"Angle\" real NOT NULL DEFAULT 0;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER TABLE \"RoutePoints\" DROP COLUMN IF EXISTS \"Angle\";");
        }
    }
}
