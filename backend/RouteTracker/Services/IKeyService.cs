using RouteTracker.Models;

namespace RouteTracker.Services;

public interface IKeyService
{
    /// <summary>
    /// Generate a new push/view key pair
    /// </summary>
    Task<KeyPair> GenerateKeyPairAsync();
    
    /// <summary>
    /// Validate a push key and return the associated key pair if valid
    /// </summary>
    Task<KeyPair?> ValidatePushKeyAsync(string pushKey);
    
    /// <summary>
    /// Validate a view key and return the associated key pair if valid
    /// </summary>
    Task<KeyPair?> ValidateViewKeyAsync(string viewKey);
    
    /// <summary>
    /// Get key status by view key
    /// </summary>
    Task<KeyStatusResponse?> GetKeyStatusAsync(string viewKey);
    
    /// <summary>
    /// Update last activity timestamp for a push key
    /// </summary>
    Task UpdateLastActivityAsync(string pushKey);
    
    /// <summary>
    /// Delete expired keys (inactive for more than 24h)
    /// </summary>
    Task<int> DeleteExpiredKeysAsync(int expirationHours = 24);
}

