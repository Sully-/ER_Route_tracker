using Microsoft.EntityFrameworkCore;
using RouteTracker.Data;
using RouteTracker.Models;

namespace RouteTracker.Services;

public class RouteService : IRouteService
{
    private readonly ApplicationDbContext _context;
    private readonly IKeyService _keyService;
    private readonly ILogger<RouteService> _logger;

    public RouteService(
        ApplicationDbContext context, 
        IKeyService keyService,
        ILogger<RouteService> logger)
    {
        _context = context;
        _keyService = keyService;
        _logger = logger;
    }

    public async Task<RoutePoint> AddRoutePointAsync(string pushKey, RoutePointRequest request)
    {
        var routePoint = new RoutePoint
        {
            PushKey = pushKey,
            X = request.X,
            Y = request.Y,
            Z = request.Z,
            GlobalX = request.GlobalX,
            GlobalY = request.GlobalY,
            GlobalZ = request.GlobalZ,
            MapId = request.MapId,
            MapIdStr = request.MapIdStr,
            TimestampMs = request.TimestampMs,
            ReceivedAt = DateTime.UtcNow
        };

        _context.RoutePoints.Add(routePoint);
        
        // Update last activity
        await _keyService.UpdateLastActivityAsync(pushKey);
        
        await _context.SaveChangesAsync();

        return routePoint;
    }

    public async Task<IEnumerable<RoutePoint>> AddRoutePointsAsync(string pushKey, IEnumerable<RoutePointRequest> requests)
    {
        var routePoints = requests.Select(request => new RoutePoint
        {
            PushKey = pushKey,
            X = request.X,
            Y = request.Y,
            Z = request.Z,
            GlobalX = request.GlobalX,
            GlobalY = request.GlobalY,
            GlobalZ = request.GlobalZ,
            MapId = request.MapId,
            MapIdStr = request.MapIdStr,
            TimestampMs = request.TimestampMs,
            ReceivedAt = DateTime.UtcNow
        }).ToList();

        _context.RoutePoints.AddRange(routePoints);
        
        // Update last activity
        await _keyService.UpdateLastActivityAsync(pushKey);
        
        try
        {
            var savedCount = await _context.SaveChangesAsync();
            _logger.LogInformation("SaveChangesAsync returned {Count} for push key {PushKey}", 
                savedCount, pushKey);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error saving route points to database for push key {PushKey}", pushKey);
            throw;
        }

        _logger.LogInformation("Successfully added {Count} route points for push key {PushKey}. Point IDs: {Ids}", 
            routePoints.Count, pushKey, string.Join(", ", routePoints.Select(p => p.Id)));

        return routePoints;
    }

    public async Task<IEnumerable<RoutePointBroadcast>> GetRoutePointsAsync(string viewKey)
    {
        // Find the key pair by view key
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.ViewKey == viewKey && k.IsActive);

        if (keyPair == null)
        {
            return Enumerable.Empty<RoutePointBroadcast>();
        }

        // Get all route points for this push key
        var routePoints = await _context.RoutePoints
            .Where(rp => rp.PushKey == keyPair.PushKey)
            .OrderBy(rp => rp.TimestampMs)
            .Select(rp => new RoutePointBroadcast(
                rp.X,
                rp.Y,
                rp.Z,
                rp.GlobalX,
                rp.GlobalY,
                rp.GlobalZ,
                rp.MapId,
                rp.MapIdStr,
                rp.TimestampMs,
                rp.ReceivedAt
            ))
            .ToListAsync();

        return routePoints;
    }
}

