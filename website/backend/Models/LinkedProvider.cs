using System.ComponentModel.DataAnnotations;

namespace RouteTracker.Models;

/// <summary>
/// Represents a linked OAuth provider for a user account
/// </summary>
public class LinkedProvider
{
    [Key]
    public Guid Id { get; set; }
    
    /// <summary>
    /// The user this provider is linked to
    /// </summary>
    public Guid UserId { get; set; }
    
    /// <summary>
    /// OAuth provider name (discord, twitch, google, microsoft, steam)
    /// </summary>
    [Required]
    [MaxLength(50)]
    public required string Provider { get; set; }
    
    /// <summary>
    /// Unique identifier from the OAuth provider
    /// </summary>
    [Required]
    [MaxLength(255)]
    public required string ProviderId { get; set; }
    
    /// <summary>
    /// Username from the OAuth provider
    /// </summary>
    [Required]
    [MaxLength(255)]
    public required string ProviderUsername { get; set; }
    
    /// <summary>
    /// Email from the OAuth provider (optional)
    /// </summary>
    [MaxLength(255)]
    public string? ProviderEmail { get; set; }
    
    /// <summary>
    /// Avatar URL from the OAuth provider (optional)
    /// </summary>
    [MaxLength(500)]
    public string? ProviderAvatarUrl { get; set; }
    
    /// <summary>
    /// When this provider was linked
    /// </summary>
    public DateTime LinkedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Navigation property to User
    /// </summary>
    public User User { get; set; } = null!;
}
