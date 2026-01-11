using RouteTracker.Models;

namespace RouteTracker.Services;

public interface IRouteService
{
    /// <summary>
    /// Add a new route point
    /// </summary>
    Task<RoutePoint> AddRoutePointAsync(string pushKey, RoutePointRequest request);
    
    /// <summary>
    /// Add multiple route points in batch
    /// </summary>
    Task<IEnumerable<RoutePoint>> AddRoutePointsAsync(string pushKey, IEnumerable<RoutePointRequest> requests);
    
    /// <summary>
    /// Get all route points for a view key (for catch-up when joining)
    /// </summary>
    Task<IEnumerable<RoutePointBroadcast>> GetRoutePointsAsync(string viewKey);
}

