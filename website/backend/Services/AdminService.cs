using Microsoft.EntityFrameworkCore;
using RouteTracker.Data;
using RouteTracker.Models;

namespace RouteTracker.Services;

/// <summary>
/// Service for admin operations
/// </summary>
public class AdminService : IAdminService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<AdminService> _logger;

    public AdminService(ApplicationDbContext context, ILogger<AdminService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<List<AdminUserSummary>> GetAllUsersAsync()
    {
        var users = await _context.Users
            .Include(u => u.KeyPairs)
            .OrderByDescending(u => u.CreatedAt)
            .ToListAsync();

        var result = new List<AdminUserSummary>();

        foreach (var user in users)
        {
            // Count total route points for this user's key pairs
            var pushKeys = user.KeyPairs.Select(k => k.PushKey).ToList();
            var totalPoints = pushKeys.Count > 0
                ? await _context.RoutePoints.CountAsync(rp => pushKeys.Contains(rp.PushKey))
                : 0;

            result.Add(new AdminUserSummary(
                user.Id,
                user.DisplayName,
                user.Email,
                user.AvatarUrl,
                user.CreatedAt,
                user.LastLoginAt,
                user.IsAdmin,
                user.KeyPairs.Count,
                totalPoints
            ));
        }

        return result;
    }

    public async Task<AdminUserDetail?> GetUserDetailAsync(Guid userId)
    {
        var user = await _context.Users
            .Include(u => u.LinkedProviders)
            .Include(u => u.KeyPairs)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
            return null;

        var linkedProviders = user.LinkedProviders
            .Select(lp => new LinkedProviderInfo(
                lp.Provider,
                lp.ProviderUsername,
                lp.LinkedAt
            ))
            .ToList();

        var keyPairs = new List<AdminKeyPairInfo>();
        foreach (var kp in user.KeyPairs)
        {
            var pointCount = await _context.RoutePoints.CountAsync(rp => rp.PushKey == kp.PushKey);
            keyPairs.Add(new AdminKeyPairInfo(
                kp.Id,
                kp.PushKey,
                kp.ViewKey,
                kp.CreatedAt,
                kp.LastActivityAt,
                kp.IsActive,
                pointCount
            ));
        }

        return new AdminUserDetail(
            user.Id,
            user.DisplayName,
            user.Email,
            user.AvatarUrl,
            user.CreatedAt,
            user.LastLoginAt,
            user.IsAdmin,
            linkedProviders,
            keyPairs
        );
    }

    public async Task<List<AdminRouteSummary>> GetAllRoutesAsync()
    {
        var keyPairs = await _context.KeyPairs
            .Include(k => k.User)
            .OrderByDescending(k => k.LastActivityAt)
            .ToListAsync();

        var result = new List<AdminRouteSummary>();

        foreach (var kp in keyPairs)
        {
            var pointCount = await _context.RoutePoints.CountAsync(rp => rp.PushKey == kp.PushKey);

            result.Add(new AdminRouteSummary(
                kp.Id,
                kp.PushKey,
                kp.ViewKey,
                kp.CreatedAt,
                kp.LastActivityAt,
                kp.IsActive,
                pointCount,
                kp.UserId,
                kp.User?.DisplayName
            ));
        }

        return result;
    }

    public async Task<AdminRouteDetail?> GetRouteDetailAsync(string pushKey)
    {
        var keyPair = await _context.KeyPairs
            .Include(k => k.User)
            .FirstOrDefaultAsync(k => k.PushKey == pushKey);

        if (keyPair == null)
            return null;

        var pointCount = await _context.RoutePoints.CountAsync(rp => rp.PushKey == pushKey);

        AdminUserSummary? owner = null;
        if (keyPair.User != null)
        {
            var userPushKeys = await _context.KeyPairs
                .Where(k => k.UserId == keyPair.UserId)
                .Select(k => k.PushKey)
                .ToListAsync();
            
            var userTotalPoints = userPushKeys.Count > 0
                ? await _context.RoutePoints.CountAsync(rp => userPushKeys.Contains(rp.PushKey))
                : 0;

            var userKeyPairCount = await _context.KeyPairs.CountAsync(k => k.UserId == keyPair.UserId);

            owner = new AdminUserSummary(
                keyPair.User.Id,
                keyPair.User.DisplayName,
                keyPair.User.Email,
                keyPair.User.AvatarUrl,
                keyPair.User.CreatedAt,
                keyPair.User.LastLoginAt,
                keyPair.User.IsAdmin,
                userKeyPairCount,
                userTotalPoints
            );
        }

        return new AdminRouteDetail(
            keyPair.Id,
            keyPair.PushKey,
            keyPair.ViewKey,
            keyPair.CreatedAt,
            keyPair.LastActivityAt,
            keyPair.IsActive,
            pointCount,
            owner
        );
    }

    public async Task<bool> DeleteUserAsync(Guid userId)
    {
        var user = await _context.Users
            .Include(u => u.KeyPairs)
            .Include(u => u.LinkedProviders)
            .FirstOrDefaultAsync(u => u.Id == userId);

        if (user == null)
        {
            _logger.LogWarning("Attempted to delete non-existent user {UserId}", userId);
            return false;
        }

        // Delete all route points for user's key pairs
        var pushKeys = user.KeyPairs.Select(k => k.PushKey).ToList();
        if (pushKeys.Count > 0)
        {
            var routePoints = await _context.RoutePoints
                .Where(rp => pushKeys.Contains(rp.PushKey))
                .ToListAsync();
            _context.RoutePoints.RemoveRange(routePoints);
            _logger.LogInformation("Deleting {Count} route points for user {UserId}", routePoints.Count, userId);
        }

        // Delete key pairs
        _context.KeyPairs.RemoveRange(user.KeyPairs);
        _logger.LogInformation("Deleting {Count} key pairs for user {UserId}", user.KeyPairs.Count, userId);

        // Delete linked providers
        _context.LinkedProviders.RemoveRange(user.LinkedProviders);
        _logger.LogInformation("Deleting {Count} linked providers for user {UserId}", user.LinkedProviders.Count, userId);

        // Delete user
        _context.Users.Remove(user);

        await _context.SaveChangesAsync();
        _logger.LogInformation("Successfully deleted user {UserId} ({DisplayName})", userId, user.DisplayName);

        return true;
    }

    public async Task<bool> DeleteRouteAsync(string pushKey)
    {
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.PushKey == pushKey);

        if (keyPair == null)
        {
            _logger.LogWarning("Attempted to delete non-existent route {PushKey}", pushKey);
            return false;
        }

        // Delete all route points for this key pair
        var routePoints = await _context.RoutePoints
            .Where(rp => rp.PushKey == pushKey)
            .ToListAsync();
        _context.RoutePoints.RemoveRange(routePoints);
        _logger.LogInformation("Deleting {Count} route points for route {PushKey}", routePoints.Count, pushKey);

        // Delete key pair
        _context.KeyPairs.Remove(keyPair);

        await _context.SaveChangesAsync();
        _logger.LogInformation("Successfully deleted route {PushKey}", pushKey);

        return true;
    }
}
