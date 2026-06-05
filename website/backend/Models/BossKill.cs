using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RouteTracker.Models;

/// <summary>
/// Represents a boss kill event tracked via game event flag
/// </summary>
public class BossKill
{
    [Key]
    public long Id { get; set; }

    [Required]
    [MaxLength(36)]
    public required string PushKey { get; set; }

    public uint FlagId { get; set; }

    public ulong TimestampMs { get; set; }

    public DateTime ReceivedAt { get; set; } = DateTime.UtcNow;

    [ForeignKey(nameof(PushKey))]
    public KeyPair? KeyPair { get; set; }
}
