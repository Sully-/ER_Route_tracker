using RouteTracker.Models;

namespace RouteTracker.Services;

/// <summary>
/// Service for admin operations
/// </summary>
public interface IAdminService
{
    /// <summary>
    /// Get all users with summary information
    /// </summary>
    Task<List<AdminUserSummary>> GetAllUsersAsync();
    
    /// <summary>
    /// Get detailed information about a specific user
    /// </summary>
    Task<AdminUserDetail?> GetUserDetailAsync(Guid userId);
    
    /// <summary>
    /// Get all routes (KeyPairs) with summary information
    /// </summary>
    Task<List<AdminRouteSummary>> GetAllRoutesAsync();
    
    /// <summary>
    /// Get detailed information about a specific route
    /// </summary>
    Task<AdminRouteDetail?> GetRouteDetailAsync(string pushKey);
    
    /// <summary>
    /// Delete a user and all associated data (KeyPairs, LinkedProviders, RoutePoints)
    /// </summary>
    Task<bool> DeleteUserAsync(Guid userId);
    
    /// <summary>
    /// Delete a route (KeyPair) and its associated RoutePoints
    /// </summary>
    Task<bool> DeleteRouteAsync(string pushKey);
}
