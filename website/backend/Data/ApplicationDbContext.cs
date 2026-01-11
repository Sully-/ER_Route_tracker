using Microsoft.EntityFrameworkCore;
using RouteTracker.Models;

namespace RouteTracker.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<KeyPair> KeyPairs => Set<KeyPair>();
    public DbSet<RoutePoint> RoutePoints => Set<RoutePoint>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // KeyPair configuration
        modelBuilder.Entity<KeyPair>(entity =>
        {
            entity.HasKey(e => e.Id);
            
            entity.HasIndex(e => e.PushKey).IsUnique();
            entity.HasIndex(e => e.ViewKey).IsUnique();
            entity.HasIndex(e => e.LastActivityAt);
            entity.HasIndex(e => e.IsActive);
        });

        // RoutePoint configuration
        modelBuilder.Entity<RoutePoint>(entity =>
        {
            entity.HasKey(e => e.Id);
            
            // Configure ID as auto-generated (identity column)
            entity.Property(e => e.Id)
                  .ValueGeneratedOnAdd();
            
            entity.HasIndex(e => e.PushKey);
            entity.HasIndex(e => e.ReceivedAt);
            
            // Configure relationship
            entity.HasOne(e => e.KeyPair)
                  .WithMany(k => k.RoutePoints)
                  .HasForeignKey(e => e.PushKey)
                  .HasPrincipalKey(k => k.PushKey)
                  .OnDelete(DeleteBehavior.Cascade);
        });
    }
}

