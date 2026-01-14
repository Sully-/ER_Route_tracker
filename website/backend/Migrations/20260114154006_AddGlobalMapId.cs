using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace RouteTracker.Migrations
{
    /// <inheritdoc />
    public partial class AddGlobalMapId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<byte>(
                name: "GlobalMapId",
                table: "RoutePoints",
                type: "smallint",
                nullable: false,
                defaultValue: (byte)60);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "GlobalMapId",
                table: "RoutePoints");
        }
    }
}
