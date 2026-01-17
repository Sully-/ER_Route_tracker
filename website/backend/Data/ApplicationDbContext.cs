using Microsoft.EntityFrameworkCore;
using RouteTracker.Models;

namespace RouteTracker.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<LinkedProvider> LinkedProviders => Set<LinkedProvider>();
    public DbSet<KeyPair> KeyPairs => Set<KeyPair>();
    public DbSet<RoutePoint> RoutePoints => Set<RoutePoint>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // User configuration
        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id);
            entity.HasIndex(e => e.LastLoginAt);
            entity.HasIndex(e => e.Email);
        });

        // LinkedProvider configuration
        modelBuilder.Entity<LinkedProvider>(entity =>
        {
            entity.HasKey(e => e.Id);
            
            // Unique index on Provider + ProviderId (a provider account can only be linked once)
            entity.HasIndex(e => new { e.Provider, e.ProviderId }).IsUnique();
            
            // Index for finding all providers for a user
            entity.HasIndex(e => e.UserId);
            
            // Unique index to prevent same provider type being linked twice to same user
            entity.HasIndex(e => new { e.UserId, e.Provider }).IsUnique();
            
            // Relationship with User
            entity.HasOne(e => e.User)
                  .WithMany(u => u.LinkedProviders)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.Cascade);
        });

        // KeyPair configuration
        modelBuilder.Entity<KeyPair>(entity =>
        {
            entity.HasKey(e => e.Id);
            
            entity.HasIndex(e => e.PushKey).IsUnique();
            entity.HasIndex(e => e.ViewKey).IsUnique();
            entity.HasIndex(e => e.LastActivityAt);
            entity.HasIndex(e => e.IsActive);
            entity.HasIndex(e => e.UserId);
            
            // Configure relationship with User (optional)
            entity.HasOne(e => e.User)
                  .WithMany(u => u.KeyPairs)
                  .HasForeignKey(e => e.UserId)
                  .OnDelete(DeleteBehavior.SetNull);
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
