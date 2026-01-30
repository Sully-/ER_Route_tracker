namespace RouteTracker.Models;

/// <summary>
/// JWT configuration settings
/// </summary>
public class JwtSettings
{
    public string SecretKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = "route-tracker";
    public string Audience { get; set; } = "route-tracker";
    public int ExpirationMinutes { get; set; } = 43200; // 30 days
}

/// <summary>
/// Frontend URL configuration for OAuth redirects
/// </summary>
public class FrontendSettings
{
    public string Url { get; set; } = string.Empty;
}
