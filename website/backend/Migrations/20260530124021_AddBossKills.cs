using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace RouteTracker.Migrations
{
    /// <inheritdoc />
    public partial class AddBossKills : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BossKills",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    PushKey = table.Column<string>(type: "character varying(36)", maxLength: 36, nullable: false),
                    FlagId = table.Column<long>(type: "bigint", nullable: false),
                    TimestampMs = table.Column<decimal>(type: "numeric(20,0)", nullable: false),
                    ReceivedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BossKills", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BossKills_KeyPairs_PushKey",
                        column: x => x.PushKey,
                        principalTable: "KeyPairs",
                        principalColumn: "PushKey",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BossKills_PushKey",
                table: "BossKills",
                column: "PushKey");

            migrationBuilder.CreateIndex(
                name: "IX_BossKills_PushKey_FlagId",
                table: "BossKills",
                columns: new[] { "PushKey", "FlagId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BossKills");
        }
    }
}
