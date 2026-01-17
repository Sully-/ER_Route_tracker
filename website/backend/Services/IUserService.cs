using RouteTracker.Models;

namespace RouteTracker.Services;

public interface IUserService
{
    /// <summary>
    /// Find or create a user based on OAuth provider info.
    /// If the provider is already linked to a user, returns that user.
    /// Otherwise creates a new user and links the provider.
    /// </summary>
    Task<User> FindOrCreateUserAsync(string provider, string providerId, string username, string? email, string? avatarUrl);
    
    /// <summary>
    /// Get a user by their ID
    /// </summary>
    Task<User?> GetUserByIdAsync(Guid userId);
    
    /// <summary>
    /// Get a user by their ID with all linked providers loaded
    /// </summary>
    Task<User?> GetUserWithProvidersAsync(Guid userId);
    
    /// <summary>
    /// Get a user by their OAuth provider and provider ID
    /// </summary>
    Task<User?> GetUserByProviderAsync(string provider, string providerId);
    
    /// <summary>
    /// Update user's last login timestamp
    /// </summary>
    Task UpdateLastLoginAsync(Guid userId);
    
    /// <summary>
    /// Get all key pairs belonging to a user
    /// </summary>
    Task<List<KeyPair>> GetUserKeyPairsAsync(Guid userId);
    
    /// <summary>
    /// Link a new OAuth provider to an existing user account
    /// </summary>
    Task<LinkProviderResult> LinkProviderAsync(Guid userId, string provider, string providerId, string username, string? email, string? avatarUrl);
    
    /// <summary>
    /// Unlink an OAuth provider from a user account
    /// </summary>
    Task<UnlinkProviderResult> UnlinkProviderAsync(Guid userId, string provider);
    
    /// <summary>
    /// Get all linked providers for a user
    /// </summary>
    Task<List<LinkedProvider>> GetLinkedProvidersAsync(Guid userId);
}

/// <summary>
/// Result of linking a provider
/// </summary>
public record LinkProviderResult(
    bool Success,
    string? Error = null,
    LinkedProvider? LinkedProvider = null
);

/// <summary>
/// Result of unlinking a provider
/// </summary>
public record UnlinkProviderResult(
    bool Success,
    string? Error = null
);
