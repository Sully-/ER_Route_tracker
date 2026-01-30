using System.ComponentModel.DataAnnotations;

namespace RouteTracker.Models;

/// <summary>
/// Represents an authenticated user with multiple linked OAuth providers
/// </summary>
public class User
{
    [Key]
    public Guid Id { get; set; }
    
    /// <summary>
    /// Display name shown in the UI
    /// </summary>
    [Required]
    [MaxLength(255)]
    public required string DisplayName { get; set; }
    
    /// <summary>
    /// Email address (optional, from primary provider)
    /// </summary>
    [MaxLength(255)]
    public string? Email { get; set; }
    
    /// <summary>
    /// Avatar URL (from primary provider)
    /// </summary>
    [MaxLength(500)]
    public string? AvatarUrl { get; set; }
    
    /// <summary>
    /// When this user account was created
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Last time the user logged in
    /// </summary>
    public DateTime LastLoginAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Whether this user has admin privileges
    /// </summary>
    public bool IsAdmin { get; set; } = false;
    
    /// <summary>
    /// Navigation property for linked OAuth providers
    /// </summary>
    public ICollection<LinkedProvider> LinkedProviders { get; set; } = new List<LinkedProvider>();
    
    /// <summary>
    /// Navigation property for associated key pairs
    /// </summary>
    public ICollection<KeyPair> KeyPairs { get; set; } = new List<KeyPair>();
}
