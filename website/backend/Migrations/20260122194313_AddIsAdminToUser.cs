using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RouteTracker.Migrations
{
    /// <inheritdoc />
    public partial class AddIsAdminToUser : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotent: the column already exists in some environments where
            // it was added without recording this migration in
            // __EFMigrationsHistory. "IF NOT EXISTS" makes applying safe
            // regardless of schema state (no manual reconciliation needed).
            migrationBuilder.Sql(
                "ALTER TABLE \"Users\" ADD COLUMN IF NOT EXISTS \"IsAdmin\" boolean NOT NULL DEFAULT false;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER TABLE \"Users\" DROP COLUMN IF EXISTS \"IsAdmin\";");
        }
    }
}
