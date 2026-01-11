using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace RouteTracker.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "KeyPairs",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PushKey = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: false),
                    ViewKey = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    LastActivityAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KeyPairs", x => x.Id);
                    table.UniqueConstraint("AK_KeyPairs_PushKey", x => x.PushKey);
                });

            migrationBuilder.CreateTable(
                name: "RoutePoints",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PushKey = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: false),
                    X = table.Column<float>(type: "real", nullable: false),
                    Y = table.Column<float>(type: "real", nullable: false),
                    Z = table.Column<float>(type: "real", nullable: false),
                    GlobalX = table.Column<float>(type: "real", nullable: false),
                    GlobalY = table.Column<float>(type: "real", nullable: false),
                    GlobalZ = table.Column<float>(type: "real", nullable: false),
                    MapId = table.Column<long>(type: "bigint", nullable: false),
                    MapIdStr = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    TimestampMs = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RoutePoints", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RoutePoints_KeyPairs_PushKey",
                        column: x => x.PushKey,
                        principalTable: "KeyPairs",
                        principalColumn: "PushKey",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_KeyPairs_IsActive",
                table: "KeyPairs",
                column: "IsActive");

            migrationBuilder.CreateIndex(
                name: "IX_KeyPairs_LastActivityAt",
                table: "KeyPairs",
                column: "LastActivityAt");

            migrationBuilder.CreateIndex(
                name: "IX_KeyPairs_PushKey",
                table: "KeyPairs",
                column: "PushKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KeyPairs_ViewKey",
                table: "KeyPairs",
                column: "ViewKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RoutePoints_PushKey",
                table: "RoutePoints",
                column: "PushKey");

            migrationBuilder.CreateIndex(
                name: "IX_RoutePoints_ReceivedAt",
                table: "RoutePoints",
                column: "ReceivedAt");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RoutePoints");

            migrationBuilder.DropTable(
                name: "KeyPairs");
        }
    }
}
