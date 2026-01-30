using System.Security.Claims;

namespace RouteTracker.Extensions;

public static class ClaimsPrincipalExtensions
{
    /// <summary>
    /// Get the user ID from the JWT claims
    /// </summary>
    public static Guid? GetUserId(this ClaimsPrincipal user)
    {
        var userIdClaim = user.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim) || !Guid.TryParse(userIdClaim, out var userId))
            return null;
        return userId;
    }
    
    /// <summary>
    /// Check if the user has admin privileges
    /// </summary>
    public static bool IsAdmin(this ClaimsPrincipal user)
    {
        return user.FindFirst("IsAdmin")?.Value == "true";
    }
}
