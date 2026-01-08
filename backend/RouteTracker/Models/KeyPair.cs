using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RouteTracker.Models;

/// <summary>
/// Represents a push/view key pair for real-time route tracking
/// </summary>
public class KeyPair
{
    [Key]
    public Guid Id { get; set; }
    
    /// <summary>
    /// Key used by the Rust mod to push route points
    /// </summary>
    [Required]
    [MaxLength(36)]
    public required string PushKey { get; set; }
    
    /// <summary>
    /// Key used by viewers to receive route points in real-time
    /// </summary>
    [Required]
    [MaxLength(36)]
    public required string ViewKey { get; set; }
    
    /// <summary>
    /// When this key pair was created
    /// </summary>
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Last time a route point was received with this push key.
    /// Used for 24h expiration check.
    /// </summary>
    public DateTime LastActivityAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Whether this key pair is still active
    /// </summary>
    public bool IsActive { get; set; } = true;
    
    /// <summary>
    /// Navigation property for associated route points
    /// </summary>
    public ICollection<RoutePoint> RoutePoints { get; set; } = new List<RoutePoint>();
}

