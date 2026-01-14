using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using RouteTracker.Hubs;
using RouteTracker.Models;
using RouteTracker.Services;

namespace RouteTracker.Controllers;

[ApiController]
[Route("api/[controller]")]
public class RoutePointsController : ControllerBase
{
    private readonly IKeyService _keyService;
    private readonly IRouteService _routeService;
    private readonly IHubContext<RouteHub> _hubContext;
    private readonly ILogger<RoutePointsController> _logger;

    public RoutePointsController(
        IKeyService keyService,
        IRouteService routeService,
        IHubContext<RouteHub> hubContext,
        ILogger<RoutePointsController> logger)
    {
        _keyService = keyService;
        _routeService = routeService;
        _hubContext = hubContext;
        _logger = logger;
    }

    /// <summary>
    /// Maximum number of route points allowed per request (DDoS protection)
    /// </summary>
    private const int MaxPointsPerRequest = 100;
    
    /// <summary>
    /// Submit one or more route points
    /// </summary>
    [HttpPost]
    [EnableRateLimiting("WriteEndpoint")]
    [RequestSizeLimit(1_048_576)] // 1MB max payload size
    public async Task<IActionResult> SubmitPoints([FromBody] List<RoutePointRequest> points)
    {
        _logger.LogInformation("SubmitPoints called with {Count} points", points?.Count ?? 0);
        
        // Get push key from header
        var pushKey = Request.Headers["X-Push-Key"].FirstOrDefault();
        
        if (string.IsNullOrEmpty(pushKey))
        {
            _logger.LogWarning("X-Push-Key header is missing");
            return BadRequest(new { message = "X-Push-Key header is required" });
        }

        _logger.LogInformation("Validating push key: {PushKey}", pushKey);

        // Validate push key
        var keyPair = await _keyService.ValidatePushKeyAsync(pushKey);
        
        if (keyPair == null)
        {
            _logger.LogWarning("Invalid or expired push key: {PushKey}", pushKey);
            return Unauthorized(new { message = "Invalid or expired push key" });
        }

        if (points == null || points.Count == 0)
        {
            _logger.LogWarning("No points provided in request");
            return BadRequest(new { message = "At least one route point is required" });
        }
        
        // DDoS protection: limit number of points per request
        if (points.Count > MaxPointsPerRequest)
        {
            _logger.LogWarning("Request rejected: too many points ({Count} > {Max}) from push key {PushKey}", 
                points.Count, MaxPointsPerRequest, pushKey);
            return BadRequest(new { 
                message = $"Maximum {MaxPointsPerRequest} points per request. Received: {points.Count}" 
            });
        }

        _logger.LogInformation("Saving {Count} points to database for push key {PushKey}", points.Count, pushKey);

        // Save points to database
        var savedPoints = await _routeService.AddRoutePointsAsync(pushKey, points);

        _logger.LogInformation("Successfully saved {Count} points to database. Saved point IDs: {Ids}", 
            savedPoints.Count(), 
            string.Join(", ", savedPoints.Select(p => p.Id)));

        // Broadcast to SignalR group
        var groupName = $"route:{keyPair.ViewKey}";
        // Ensure points are sorted by timestamp before sending to maintain chronological order
        var broadcasts = savedPoints
            .OrderBy(p => p.TimestampMs)
            .Select(p => new RoutePointBroadcast(
                p.X, p.Y, p.Z,
                p.GlobalX, p.GlobalY, p.GlobalZ,
                p.MapId, p.MapIdStr,
                p.GlobalMapId,
                p.TimestampMs, p.ReceivedAt
            ))
            .ToList();

        // Send points with viewKey so frontend knows which route to update
        await _hubContext.Clients.Group(groupName).SendAsync("ReceiveRoutePoints", broadcasts, keyPair.ViewKey);

        _logger.LogInformation("Broadcasted {Count} points to SignalR group {Group} with viewKey {ViewKey}", 
            broadcasts.Count, groupName, keyPair.ViewKey);

        return Ok(new { received = points.Count, saved = savedPoints.Count() });
    }

    /// <summary>
    /// Get all route points for a view key (for initial load)
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<IEnumerable<RoutePointBroadcast>>> GetPoints([FromQuery] string viewKey)
    {
        if (string.IsNullOrEmpty(viewKey))
        {
            return BadRequest(new { message = "viewKey query parameter is required" });
        }

        var keyPair = await _keyService.ValidateViewKeyAsync(viewKey);
        
        if (keyPair == null)
        {
            return Unauthorized(new { message = "Invalid or expired view key" });
        }

        var points = await _routeService.GetRoutePointsAsync(viewKey);
        
        return Ok(points);
    }
}

