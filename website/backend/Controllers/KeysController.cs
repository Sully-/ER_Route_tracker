using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using RouteTracker.Models;
using RouteTracker.Services;

namespace RouteTracker.Controllers;

[ApiController]
[Route("api/[controller]")]
public class KeysController : ControllerBase
{
    private readonly IKeyService _keyService;
    private readonly ILogger<KeysController> _logger;

    public KeysController(IKeyService keyService, ILogger<KeysController> logger)
    {
        _keyService = keyService;
        _logger = logger;
    }

    /// <summary>
    /// Generate a new push/view key pair.
    /// If authenticated, the keys are linked to the user's account (permanent).
    /// If not authenticated, keys expire after 24h of inactivity.
    /// </summary>
    [HttpPost("generate")]
    [EnableRateLimiting("KeyGenEndpoint")]
    public async Task<ActionResult<KeyPairResponse>> Generate()
    {
        // Check if user is authenticated
        Guid? userId = null;
        if (User.Identity?.IsAuthenticated == true)
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var parsedUserId))
            {
                userId = parsedUserId;
            }
        }

        var keyPair = await _keyService.GenerateKeyPairAsync(userId);
        
        return Ok(new KeyPairResponse(keyPair.PushKey, keyPair.ViewKey));
    }

    /// <summary>
    /// Get the status of a view key
    /// </summary>
    [HttpGet("{viewKey}/status")]
    public async Task<ActionResult<KeyStatusResponse>> GetStatus(string viewKey)
    {
        var status = await _keyService.GetKeyStatusAsync(viewKey);
        
        if (status == null)
        {
            return NotFound(new { message = "View key not found" });
        }

        return Ok(status);
    }

    /// <summary>
    /// Get all key pairs belonging to the authenticated user
    /// </summary>
    [HttpGet("my-keys")]
    [Authorize]
    public async Task<ActionResult<List<KeyPairInfoResponse>>> GetMyKeys()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { message = "Invalid token" });
        }

        var keyPairs = await _keyService.GetUserKeyPairsAsync(userId);
        
        var response = keyPairs.Select(k => new KeyPairInfoResponse(
            k.Id,
            k.PushKey,
            k.ViewKey,
            k.CreatedAt,
            k.LastActivityAt,
            k.IsActive
        )).ToList();

        return Ok(response);
    }

    /// <summary>
    /// Add an existing key pair to the authenticated user's account.
    /// Requires both PushKey and ViewKey to verify ownership.
    /// </summary>
    [HttpPost("add")]
    [Authorize]
    public async Task<ActionResult<KeyPairInfoResponse>> AddExistingKeyPair([FromBody] AddKeyPairRequest request)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { message = "Invalid token" });
        }

        var result = await _keyService.AddExistingKeyPairToUserAsync(userId, request.PushKey, request.ViewKey);

        if (!result.Success)
        {
            return BadRequest(new { message = result.ErrorMessage });
        }

        var keyPair = result.KeyPair!;
        return Ok(new KeyPairInfoResponse(
            keyPair.Id,
            keyPair.PushKey,
            keyPair.ViewKey,
            keyPair.CreatedAt,
            keyPair.LastActivityAt,
            keyPair.IsActive
        ));
    }

    /// <summary>
    /// Remove a key pair from the authenticated user's account.
    /// The key pair becomes anonymous again (subject to 24h expiration).
    /// </summary>
    [HttpDelete("{keyId}")]
    [Authorize]
    public async Task<IActionResult> RemoveKeyPair(Guid keyId)
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
        {
            return Unauthorized(new { message = "Invalid token" });
        }

        var result = await _keyService.RemoveKeyPairFromUserAsync(userId, keyId);

        if (!result)
        {
            return NotFound(new { message = "Key pair not found or does not belong to you" });
        }

        return Ok(new { message = "Key pair removed from account" });
    }
}

/// <summary>
/// Request DTO for adding an existing key pair
/// </summary>
public record AddKeyPairRequest(string PushKey, string ViewKey);

/// <summary>
/// Response DTO for key pair info
/// </summary>
public record KeyPairInfoResponse(
    Guid Id,
    string PushKey,
    string ViewKey,
    DateTime CreatedAt,
    DateTime LastActivityAt,
    bool IsActive
);

