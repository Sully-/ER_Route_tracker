namespace RouteTracker.Models;

/// <summary>
/// Summary of a user for admin list view
/// </summary>
public record AdminUserSummary(
    Guid Id,
    string DisplayName,
    string? Email,
    string? AvatarUrl,
    DateTime CreatedAt,
    DateTime LastLoginAt,
    bool IsAdmin,
    int KeyPairCount,
    int TotalRoutePoints
);

/// <summary>
/// Detailed user information for admin detail view
/// </summary>
public record AdminUserDetail(
    Guid Id,
    string DisplayName,
    string? Email,
    string? AvatarUrl,
    DateTime CreatedAt,
    DateTime LastLoginAt,
    bool IsAdmin,
    List<LinkedProviderInfo> LinkedProviders,
    List<AdminKeyPairInfo> KeyPairs
);

/// <summary>
/// Linked provider info for admin views
/// </summary>
public record LinkedProviderInfo(
    string Provider,
    string ProviderUsername,
    DateTime LinkedAt
);

/// <summary>
/// Key pair info with route point count for admin views
/// </summary>
public record AdminKeyPairInfo(
    Guid Id,
    string PushKey,
    string ViewKey,
    DateTime CreatedAt,
    DateTime LastActivityAt,
    bool IsActive,
    int PointCount
);

/// <summary>
/// Summary of a route (KeyPair) for admin list view
/// </summary>
public record AdminRouteSummary(
    Guid Id,
    string PushKey,
    string ViewKey,
    DateTime CreatedAt,
    DateTime LastActivityAt,
    bool IsActive,
    int PointCount,
    Guid? UserId,
    string? UserDisplayName
);

/// <summary>
/// Detailed route information for admin detail view
/// </summary>
public record AdminRouteDetail(
    Guid Id,
    string PushKey,
    string ViewKey,
    DateTime CreatedAt,
    DateTime LastActivityAt,
    bool IsActive,
    int PointCount,
    AdminUserSummary? Owner
);
