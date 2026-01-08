using Microsoft.EntityFrameworkCore;
using RouteTracker.Data;
using RouteTracker.Models;

namespace RouteTracker.Services;

public class KeyService : IKeyService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<KeyService> _logger;

    public KeyService(ApplicationDbContext context, ILogger<KeyService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<KeyPair> GenerateKeyPairAsync()
    {
        var keyPair = new KeyPair
        {
            Id = Guid.NewGuid(),
            PushKey = Guid.NewGuid().ToString(),
            ViewKey = Guid.NewGuid().ToString(),
            CreatedAt = DateTime.UtcNow,
            LastActivityAt = DateTime.UtcNow,
            IsActive = true
        };

        _context.KeyPairs.Add(keyPair);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Generated new key pair: PushKey={PushKey}, ViewKey={ViewKey}", 
            keyPair.PushKey, keyPair.ViewKey);

        return keyPair;
    }

    public async Task<KeyPair?> ValidatePushKeyAsync(string pushKey)
    {
        return await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.PushKey == pushKey && k.IsActive);
    }

    public async Task<KeyPair?> ValidateViewKeyAsync(string viewKey)
    {
        return await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.ViewKey == viewKey && k.IsActive);
    }

    public async Task<KeyStatusResponse?> GetKeyStatusAsync(string viewKey)
    {
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.ViewKey == viewKey);

        if (keyPair == null)
        {
            return null;
        }

        return new KeyStatusResponse(keyPair.IsActive, keyPair.LastActivityAt);
    }

    public async Task UpdateLastActivityAsync(string pushKey)
    {
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.PushKey == pushKey);

        if (keyPair != null)
        {
            keyPair.LastActivityAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }

    public async Task<int> DeleteExpiredKeysAsync(int expirationHours = 24)
    {
        var cutoff = DateTime.UtcNow.AddHours(-expirationHours);
        
        // Find expired keys
        var expiredKeys = await _context.KeyPairs
            .Where(k => k.LastActivityAt < cutoff)
            .ToListAsync();

        if (expiredKeys.Count == 0)
        {
            return 0;
        }

        // Delete associated route points first (cascade should handle this, but being explicit)
        var expiredPushKeys = expiredKeys.Select(k => k.PushKey).ToList();
        var routePointsToDelete = await _context.RoutePoints
            .Where(rp => expiredPushKeys.Contains(rp.PushKey))
            .ToListAsync();

        _context.RoutePoints.RemoveRange(routePointsToDelete);
        _context.KeyPairs.RemoveRange(expiredKeys);
        
        await _context.SaveChangesAsync();

        _logger.LogInformation("Deleted {KeyCount} expired keys and {PointCount} associated route points", 
            expiredKeys.Count, routePointsToDelete.Count);

        return expiredKeys.Count;
    }
}

