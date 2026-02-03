using RouteTracker.Models;

namespace RouteTracker.Services;

public interface IKeyService
{
    /// <summary>
    /// Generate a new push/view key pair.
    /// If userId is provided, the key pair is linked to the user (permanent).
    /// </summary>
    Task<KeyPair> GenerateKeyPairAsync(Guid? userId = null);
    
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
    /// Delete expired keys (inactive for more than 24h).
    /// Deletes anonymous keys (UserId == null) and deactivated keys (IsActive == false).
    /// </summary>
    Task<int> DeleteExpiredKeysAsync(int expirationHours = 24);
    
    /// <summary>
    /// Get all key pairs belonging to a user
    /// </summary>
    Task<List<KeyPair>> GetUserKeyPairsAsync(Guid userId);
    
    /// <summary>
    /// Add an existing key pair to a user's account.
    /// Requires both PushKey and ViewKey to match for verification.
    /// </summary>
    Task<AddKeyPairResult> AddExistingKeyPairToUserAsync(Guid userId, string pushKey, string viewKey);
    
    /// <summary>
    /// Deactivate a key pair. The key remains linked to the user but becomes inactive.
    /// It will be permanently deleted after 24h by the cleanup service.
    /// </summary>
    Task<bool> DeactivateKeyPairAsync(Guid userId, Guid keyPairId);
    
    /// <summary>
    /// Get a key pair by its ID
    /// </summary>
    Task<KeyPair?> GetKeyPairByIdAsync(Guid keyPairId);
}

/// <summary>
/// Result of adding a key pair to a user
/// </summary>
public class AddKeyPairResult
{
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public KeyPair? KeyPair { get; set; }
    
    public static AddKeyPairResult Succeeded(KeyPair keyPair) => new() { Success = true, KeyPair = keyPair };
    public static AddKeyPairResult Failed(string message) => new() { Success = false, ErrorMessage = message };
}

