using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using RouteTracker.Models;
using RouteTracker.Services;

namespace RouteTracker.Controllers;

/// <summary>
/// Admin controller for managing users and routes
/// </summary>
[ApiController]
[Route("api/[controller]")]
[Authorize(Policy = "AdminOnly")]
public class AdminController : ControllerBase
{
    private readonly IAdminService _adminService;
    private readonly ILogger<AdminController> _logger;

    public AdminController(IAdminService adminService, ILogger<AdminController> logger)
    {
        _adminService = adminService;
        _logger = logger;
    }

    /// <summary>
    /// Get all users with summary information
    /// </summary>
    [HttpGet("users")]
    public async Task<ActionResult<List<AdminUserSummary>>> GetAllUsers()
    {
        _logger.LogInformation("Admin request: Get all users");
        var users = await _adminService.GetAllUsersAsync();
        return Ok(users);
    }

    /// <summary>
    /// Get detailed information about a specific user
    /// </summary>
    [HttpGet("users/{id}")]
    public async Task<ActionResult<AdminUserDetail>> GetUserDetail(Guid id)
    {
        _logger.LogInformation("Admin request: Get user detail for {UserId}", id);
        var user = await _adminService.GetUserDetailAsync(id);
        
        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        return Ok(user);
    }

    /// <summary>
    /// Get all routes (KeyPairs) with summary information
    /// </summary>
    [HttpGet("routes")]
    public async Task<ActionResult<List<AdminRouteSummary>>> GetAllRoutes()
    {
        _logger.LogInformation("Admin request: Get all routes");
        var routes = await _adminService.GetAllRoutesAsync();
        return Ok(routes);
    }

    /// <summary>
    /// Get detailed information about a specific route
    /// </summary>
    [HttpGet("routes/{pushKey}")]
    public async Task<ActionResult<AdminRouteDetail>> GetRouteDetail(string pushKey)
    {
        _logger.LogInformation("Admin request: Get route detail for {PushKey}", pushKey);
        var route = await _adminService.GetRouteDetailAsync(pushKey);
        
        if (route == null)
        {
            return NotFound(new { message = "Route not found" });
        }

        return Ok(route);
    }

    /// <summary>
    /// Delete a user and all associated data
    /// </summary>
    [HttpDelete("users/{id}")]
    public async Task<ActionResult> DeleteUser(Guid id)
    {
        _logger.LogInformation("Admin request: Delete user {UserId}", id);
        
        var success = await _adminService.DeleteUserAsync(id);
        
        if (!success)
        {
            return NotFound(new { message = "User not found" });
        }

        return Ok(new { message = "User deleted successfully" });
    }

    /// <summary>
    /// Delete a route and all associated route points
    /// </summary>
    [HttpDelete("routes/{pushKey}")]
    public async Task<ActionResult> DeleteRoute(string pushKey)
    {
        _logger.LogInformation("Admin request: Delete route {PushKey}", pushKey);
        
        var success = await _adminService.DeleteRouteAsync(pushKey);
        
        if (!success)
        {
            return NotFound(new { message = "Route not found" });
        }

        return Ok(new { message = "Route deleted successfully" });
    }
}
