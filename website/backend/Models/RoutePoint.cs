using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RouteTracker.Models;

/// <summary>
/// Represents a single point in a route
/// </summary>
public class RoutePoint
{
    [Key]
    public long Id { get; set; }
    
    /// <summary>
    /// Foreign key to the KeyPair
    /// </summary>
    [Required]
    [MaxLength(36)]
    public required string PushKey { get; set; }
    
    /// <summary>
    /// Local X coordinate (within tile)
    /// </summary>
    public float X { get; set; }
    
    /// <summary>
    /// Local Y coordinate (altitude)
    /// </summary>
    public float Y { get; set; }
    
    /// <summary>
    /// Local Z coordinate (within tile)
    /// </summary>
    public float Z { get; set; }
    
    /// <summary>
    /// Global X coordinate (world space)
    /// </summary>
    public float GlobalX { get; set; }
    
    /// <summary>
    /// Global Y coordinate (altitude, same as Y)
    /// </summary>
    public float GlobalY { get; set; }
    
    /// <summary>
    /// Global Z coordinate (world space)
    /// </summary>
    public float GlobalZ { get; set; }
    
    /// <summary>
    /// Map tile ID (packed as 0xWWXXYYDD)
    /// </summary>
    public uint MapId { get; set; }
    
    /// <summary>
    /// Map ID as human-readable string (e.g., "m60_44_36_00")
    /// </summary>
    [MaxLength(20)]
    public string? MapIdStr { get; set; }
    
    /// <summary>
    /// Timestamp in milliseconds from start of recording
    /// </summary>
    public ulong TimestampMs { get; set; }
    
    /// <summary>
    /// Server timestamp when the point was received
    /// </summary>
    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;
    
    /// <summary>
    /// Navigation property to the KeyPair
    /// </summary>
    [ForeignKey(nameof(PushKey))]
    public KeyPair? KeyPair { get; set; }
}

