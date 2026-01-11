using Microsoft.AspNetCore.SignalR;
using RouteTracker.Models;
using RouteTracker.Services;

namespace RouteTracker.Hubs;

public class RouteHub : Hub
{
    private readonly IKeyService _keyService;
    private readonly IRouteService _routeService;
    private readonly ILogger<RouteHub> _logger;

    public RouteHub(
        IKeyService keyService, 
        IRouteService routeService,
        ILogger<RouteHub> logger)
    {
        _keyService = keyService;
        _routeService = routeService;
        _logger = logger;
    }

    /// <summary>
    /// Join a route group to receive real-time updates for a specific view key
    /// </summary>
    public async Task JoinRoute(string viewKey)
    {
        var keyPair = await _keyService.ValidateViewKeyAsync(viewKey);
        
        if (keyPair == null)
        {
            _logger.LogWarning("Invalid view key attempted to join: {ViewKey}", viewKey);
            await Clients.Caller.SendAsync("Error", "Invalid or expired view key");
            return;
        }

        var groupName = $"route:{viewKey}";
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
        
        _logger.LogInformation("Client {ConnectionId} joined route group {GroupName}", 
            Context.ConnectionId, groupName);

        // Send existing route points to the new client (catch-up)
        var existingPoints = await _routeService.GetRoutePointsAsync(viewKey);
        if (existingPoints.Any())
        {
            // Include viewKey so frontend knows which route this history belongs to
            await Clients.Caller.SendAsync("ReceiveRouteHistory", viewKey, existingPoints);
            _logger.LogInformation("Sent {Count} historical points to client {ConnectionId} for viewKey {ViewKey}", 
                existingPoints.Count(), Context.ConnectionId, viewKey);
        }
        else
        {
            _logger.LogInformation("No historical points to send for viewKey {ViewKey}", viewKey);
        }

        await Clients.Caller.SendAsync("JoinedRoute", viewKey);
    }

    /// <summary>
    /// Leave a route group
    /// </summary>
    public async Task LeaveRoute(string viewKey)
    {
        var groupName = $"route:{viewKey}";
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, groupName);
        
        _logger.LogInformation("Client {ConnectionId} left route group {GroupName}", 
            Context.ConnectionId, groupName);

        await Clients.Caller.SendAsync("LeftRoute", viewKey);
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client {ConnectionId} disconnected", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }
}

