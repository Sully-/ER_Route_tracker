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

    public async Task<KeyPair> GenerateKeyPairAsync(Guid? userId = null)
    {
        var keyPair = new KeyPair
        {
            Id = Guid.NewGuid(),
            PushKey = Guid.NewGuid().ToString(),
            ViewKey = Guid.NewGuid().ToString(),
            CreatedAt = DateTime.UtcNow,
            LastActivityAt = DateTime.UtcNow,
            IsActive = true,
            UserId = userId
        };

        _context.KeyPairs.Add(keyPair);
        await _context.SaveChangesAsync();

        if (userId.HasValue)
        {
            _logger.LogInformation("Generated new key pair for user {UserId}: PushKey={PushKey}, ViewKey={ViewKey}", 
                userId, keyPair.PushKey, keyPair.ViewKey);
        }
        else
        {
            _logger.LogInformation("Generated new anonymous key pair: PushKey={PushKey}, ViewKey={ViewKey}", 
                keyPair.PushKey, keyPair.ViewKey);
        }

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
        
        // Find expired keys - ONLY anonymous keys (UserId == null)
        var expiredKeys = await _context.KeyPairs
            .Where(k => k.LastActivityAt < cutoff && k.UserId == null)
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

        _logger.LogInformation("Deleted {KeyCount} expired anonymous keys and {PointCount} associated route points", 
            expiredKeys.Count, routePointsToDelete.Count);

        return expiredKeys.Count;
    }

    public async Task<List<KeyPair>> GetUserKeyPairsAsync(Guid userId)
    {
        return await _context.KeyPairs
            .Where(k => k.UserId == userId && k.IsActive)
            .OrderByDescending(k => k.CreatedAt)
            .ToListAsync();
    }

    public async Task<AddKeyPairResult> AddExistingKeyPairToUserAsync(Guid userId, string pushKey, string viewKey)
    {
        // Find the key pair by push key
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.PushKey == pushKey);

        if (keyPair == null)
        {
            return AddKeyPairResult.Failed("Key pair not found");
        }

        // Verify the view key matches
        if (keyPair.ViewKey != viewKey)
        {
            _logger.LogWarning("Failed to add key pair: ViewKey mismatch for PushKey {PushKey}", pushKey);
            return AddKeyPairResult.Failed("Push key and view key do not match");
        }

        // Check if already linked to a user
        if (keyPair.UserId.HasValue)
        {
            if (keyPair.UserId == userId)
            {
                return AddKeyPairResult.Failed("Key pair already belongs to your account");
            }
            return AddKeyPairResult.Failed("Key pair is already linked to another account");
        }

        // Check if the key pair is active
        if (!keyPair.IsActive)
        {
            return AddKeyPairResult.Failed("Key pair is no longer active");
        }

        // Link to user
        keyPair.UserId = userId;
        await _context.SaveChangesAsync();

        _logger.LogInformation("Key pair {KeyPairId} linked to user {UserId}", keyPair.Id, userId);

        return AddKeyPairResult.Succeeded(keyPair);
    }

    public async Task<bool> RemoveKeyPairFromUserAsync(Guid userId, Guid keyPairId)
    {
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.Id == keyPairId && k.UserId == userId);

        if (keyPair == null)
        {
            return false;
        }

        // Remove user association (makes it anonymous again)
        keyPair.UserId = null;
        keyPair.LastActivityAt = DateTime.UtcNow; // Reset expiration timer
        await _context.SaveChangesAsync();

        _logger.LogInformation("Key pair {KeyPairId} removed from user {UserId} (now anonymous)", keyPairId, userId);

        return true;
    }
}

