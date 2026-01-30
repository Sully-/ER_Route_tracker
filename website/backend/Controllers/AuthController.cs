using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using AspNet.Security.OAuth.Discord;
using AspNet.Security.OAuth.Twitch;
using AspNet.Security.OpenId.Steam;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using RouteTracker.Extensions;
using RouteTracker.Models;
using RouteTracker.Services;

namespace RouteTracker.Controllers;

[ApiController]
[Route("api/[controller]")]
public class AuthController : ControllerBase
{
    private readonly IUserService _userService;
    private readonly JwtSettings _jwtSettings;
    private readonly FrontendSettings _frontendSettings;
    private readonly ILogger<AuthController> _logger;

    // Mapping of provider names to authentication schemes
    private static readonly Dictionary<string, string> ProviderSchemes = new(StringComparer.OrdinalIgnoreCase)
    {
        { "discord", DiscordAuthenticationDefaults.AuthenticationScheme },
        { "twitch", TwitchAuthenticationDefaults.AuthenticationScheme },
        { "google", GoogleDefaults.AuthenticationScheme },
        { "microsoft", "Microsoft" },
        { "steam", SteamAuthenticationDefaults.AuthenticationScheme }
    };

    public AuthController(
        IUserService userService,
        JwtSettings jwtSettings,
        FrontendSettings frontendSettings,
        ILogger<AuthController> logger)
    {
        _userService = userService;
        _jwtSettings = jwtSettings;
        _frontendSettings = frontendSettings;
        _logger = logger;
    }

    /// <summary>
    /// Get available OAuth providers
    /// </summary>
    [HttpGet("providers")]
    public ActionResult<List<string>> GetProviders()
    {
        return Ok(ProviderSchemes.Keys.ToList());
    }

    /// <summary>
    /// Initiate OAuth login with a provider
    /// </summary>
    [HttpGet("login/{provider}")]
    public IActionResult Login(string provider, [FromQuery] string? returnUrl = null)
    {
        if (!ProviderSchemes.TryGetValue(provider, out var scheme))
        {
            return BadRequest(new { message = $"Unknown provider: {provider}" });
        }

        var redirectUrl = Url.Action(nameof(Callback), "Auth", new { provider, returnUrl });
        var properties = new AuthenticationProperties
        {
            RedirectUri = redirectUrl,
            Items =
            {
                { "provider", provider },
                { "returnUrl", returnUrl ?? _frontendSettings.Url }
            }
        };

        return Challenge(properties, scheme);
    }

    /// <summary>
    /// OAuth callback - handles the response from the OAuth provider
    /// </summary>
    [HttpGet("callback/{provider}")]
    public async Task<IActionResult> Callback(string provider, [FromQuery] string? returnUrl = null)
    {
        try
        {
            // Authenticate using the cookie scheme (where OAuth stores the result)
            var authenticateResult = await HttpContext.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            
            if (!authenticateResult.Succeeded || authenticateResult.Principal == null)
            {
                _logger.LogWarning("Authentication failed for provider {Provider}", provider);
                return Redirect($"{_frontendSettings.Url}?error=auth_failed");
            }

            // Extract user info from claims
            var claims = authenticateResult.Principal.Claims.ToList();
            var providerId = GetClaimValue(claims, ClaimTypes.NameIdentifier) ?? 
                             GetClaimValue(claims, "sub") ?? "";
            var username = GetClaimValue(claims, ClaimTypes.Name) ?? 
                           GetClaimValue(claims, "preferred_username") ??
                           GetClaimValue(claims, "name") ?? 
                           $"User_{providerId[..Math.Min(8, providerId.Length)]}";
            var email = GetClaimValue(claims, ClaimTypes.Email);
            var avatarUrl = GetAvatarUrl(claims, provider);

            // For Steam, the provider ID is a URL, extract just the Steam ID
            if (provider.Equals("steam", StringComparison.OrdinalIgnoreCase) && providerId.Contains('/'))
            {
                providerId = providerId.Split('/').Last();
            }

            // Find or create user
            var user = await _userService.FindOrCreateUserAsync(provider, providerId, username, email, avatarUrl);

            // Generate JWT token
            var token = GenerateJwtToken(user);

            // Sign out of the cookie-based authentication
            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

            // Redirect to frontend with token
            var redirectTarget = returnUrl ?? _frontendSettings.Url;
            var separator = redirectTarget.Contains('?') ? '&' : '?';
            return Redirect($"{redirectTarget}{separator}token={token}");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OAuth callback for provider {Provider}", provider);
            return Redirect($"{_frontendSettings.Url}?error=auth_error");
        }
    }

    /// <summary>
    /// Initiate linking a new provider to existing account
    /// </summary>
    [HttpPost("link/{provider}/initiate")]
    [Authorize]
    public IActionResult InitiateLink(string provider, [FromQuery] string? returnUrl = null)
    {
        if (!ProviderSchemes.TryGetValue(provider, out _))
        {
            return BadRequest(new { message = $"Unknown provider: {provider}" });
        }

        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrEmpty(userIdClaim))
        {
            return Unauthorized(new { message = "Invalid token" });
        }

        // Store user ID in session for the OAuth flow
        HttpContext.Session.SetString("LinkUserId", userIdClaim);

        var callbackUrl = $"{_frontendSettings.Url.TrimEnd('/')}/account?linked={provider}";
        var oauthUrl = Url.Action(nameof(LinkProvider), "Auth", new { provider, returnUrl = returnUrl ?? callbackUrl });
        
        return Ok(new { redirectUrl = $"{Request.Scheme}://{Request.Host}{oauthUrl}" });
    }

    /// <summary>
    /// OAuth redirect for linking (called after initiate)
    /// </summary>
    [HttpGet("link/{provider}")]
    public IActionResult LinkProvider(string provider, [FromQuery] string? returnUrl = null)
    {
        if (!ProviderSchemes.TryGetValue(provider, out var scheme))
        {
            return BadRequest(new { message = $"Unknown provider: {provider}" });
        }

        // Get user ID from session
        var userId = HttpContext.Session.GetString("LinkUserId");
        if (string.IsNullOrEmpty(userId))
        {
            return Redirect($"{_frontendSettings.Url.TrimEnd('/')}/account?error=link_expired");
        }

        var redirectUrl = Url.Action(nameof(LinkCallback), "Auth", new { provider, returnUrl });
        var properties = new AuthenticationProperties
        {
            RedirectUri = redirectUrl,
            Items =
            {
                { "provider", provider },
                { "returnUrl", returnUrl ?? $"{_frontendSettings.Url.TrimEnd('/')}/account" },
                { "linkUserId", userId }
            }
        };

        return Challenge(properties, scheme);
    }

    /// <summary>
    /// OAuth callback for linking a provider
    /// </summary>
    [HttpGet("link/callback/{provider}")]
    public async Task<IActionResult> LinkCallback(string provider, [FromQuery] string? returnUrl = null)
    {
        try
        {
            var authenticateResult = await HttpContext.AuthenticateAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            
            if (!authenticateResult.Succeeded || authenticateResult.Principal == null)
            {
                _logger.LogWarning("Link authentication failed for provider {Provider}", provider);
                return Redirect($"{_frontendSettings.Url.TrimEnd('/')}/account?error=link_failed");
            }

            // Get user ID from AuthenticationProperties (more reliable)
            string? userIdStr = null;
            authenticateResult.Properties?.Items.TryGetValue("linkUserId", out userIdStr);
            if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out var userId))
            {
                // Fallback to session if not in Properties
                userIdStr = HttpContext.Session.GetString("LinkUserId");
                if (string.IsNullOrEmpty(userIdStr) || !Guid.TryParse(userIdStr, out userId))
                {
                    return Redirect($"{_frontendSettings.Url.TrimEnd('/')}/account?error=link_expired");
                }
            }

            // Clear the session
            HttpContext.Session.Remove("LinkUserId");

            // Extract provider info from claims
            var claims = authenticateResult.Principal.Claims.ToList();
            var providerId = GetClaimValue(claims, ClaimTypes.NameIdentifier) ?? 
                             GetClaimValue(claims, "sub") ?? "";
            var username = GetClaimValue(claims, ClaimTypes.Name) ?? 
                           GetClaimValue(claims, "preferred_username") ??
                           GetClaimValue(claims, "name") ?? 
                           $"User_{providerId[..Math.Min(8, providerId.Length)]}";
            var email = GetClaimValue(claims, ClaimTypes.Email);
            var avatarUrl = GetAvatarUrl(claims, provider);

            // For Steam, extract Steam ID from URL
            if (provider.Equals("steam", StringComparison.OrdinalIgnoreCase) && providerId.Contains('/'))
            {
                providerId = providerId.Split('/').Last();
            }

            // Link the provider
            var result = await _userService.LinkProviderAsync(userId, provider, providerId, username, email, avatarUrl);

            await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);

            var redirectTarget = returnUrl ?? $"{_frontendSettings.Url.TrimEnd('/')}/account";
            if (result.Success)
            {
                return Redirect($"{redirectTarget}?linked={provider}");
            }
            else
            {
                return Redirect($"{redirectTarget}?error={Uri.EscapeDataString(result.Error ?? "link_failed")}");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during link callback for provider {Provider}", provider);
            return Redirect($"{_frontendSettings.Url.TrimEnd('/')}/account?error=link_error");
        }
    }

    /// <summary>
    /// Unlink a provider from the account
    /// </summary>
    [HttpDelete("link/{provider}")]
    [Authorize]
    public async Task<IActionResult> UnlinkProvider(string provider)
    {
        var userId = User.GetUserId();
        if (userId == null)
            return Unauthorized(new { message = "Invalid token" });

        var result = await _userService.UnlinkProviderAsync(userId.Value, provider);
        
        if (result.Success)
        {
            return Ok(new { message = $"Successfully unlinked {provider}" });
        }
        else
        {
            return BadRequest(new { message = result.Error });
        }
    }

    /// <summary>
    /// Get current user info with linked providers
    /// </summary>
    [HttpGet("me")]
    [Authorize]
    public async Task<ActionResult<UserInfoResponse>> GetCurrentUser()
    {
        var userId = User.GetUserId();
        if (userId == null)
            return Unauthorized(new { message = "Invalid token" });

        var user = await _userService.GetUserWithProvidersAsync(userId.Value);
        if (user == null)
        {
            return NotFound(new { message = "User not found" });
        }

        var linkedProviders = user.LinkedProviders.Select(lp => new LinkedProviderResponse(
            lp.Id,
            lp.Provider,
            lp.ProviderUsername,
            lp.ProviderEmail,
            lp.ProviderAvatarUrl,
            lp.LinkedAt
        )).ToList();

        return Ok(new UserInfoResponse(
            user.Id,
            user.DisplayName,
            user.Email,
            user.AvatarUrl,
            user.CreatedAt,
            user.LastLoginAt,
            user.IsAdmin,
            linkedProviders
        ));
    }

    /// <summary>
    /// Get linked providers for current user
    /// </summary>
    [HttpGet("providers/linked")]
    [Authorize]
    public async Task<ActionResult<List<LinkedProviderResponse>>> GetLinkedProviders()
    {
        var userId = User.GetUserId();
        if (userId == null)
            return Unauthorized(new { message = "Invalid token" });

        var providers = await _userService.GetLinkedProvidersAsync(userId.Value);
        
        return Ok(providers.Select(lp => new LinkedProviderResponse(
            lp.Id,
            lp.Provider,
            lp.ProviderUsername,
            lp.ProviderEmail,
            lp.ProviderAvatarUrl,
            lp.LinkedAt
        )).ToList());
    }

    /// <summary>
    /// Logout - client should discard the token
    /// </summary>
    [HttpPost("logout")]
    [Authorize]
    public IActionResult Logout()
    {
        return Ok(new { message = "Logged out successfully" });
    }

    private string GenerateJwtToken(User user)
    {
        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.UTF8.GetBytes(_jwtSettings.SecretKey);
        
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.DisplayName)
        };

        if (!string.IsNullOrEmpty(user.Email))
        {
            claims.Add(new Claim(ClaimTypes.Email, user.Email));
        }

        if (user.IsAdmin)
        {
            claims.Add(new Claim("IsAdmin", "true"));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = DateTime.UtcNow.AddMinutes(_jwtSettings.ExpirationMinutes),
            Issuer = _jwtSettings.Issuer,
            Audience = _jwtSettings.Audience,
            SigningCredentials = new SigningCredentials(
                new SymmetricSecurityKey(key),
                SecurityAlgorithms.HmacSha256Signature)
        };

        var token = tokenHandler.CreateToken(tokenDescriptor);
        return tokenHandler.WriteToken(token);
    }

    private static string? GetClaimValue(List<Claim> claims, string type)
    {
        return claims.FirstOrDefault(c => c.Type == type)?.Value;
    }

    private static string? GetAvatarUrl(List<Claim> claims, string provider)
    {
        var avatarClaim = claims.FirstOrDefault(c => 
            c.Type == "urn:discord:avatar:url" ||
            c.Type == "urn:twitch:profile_image_url" ||
            c.Type == "picture" ||
            c.Type == "urn:steam:avatar:full");

        return avatarClaim?.Value;
    }
}

/// <summary>
/// Response DTO for user info
/// </summary>
public record UserInfoResponse(
    Guid Id,
    string DisplayName,
    string? Email,
    string? AvatarUrl,
    DateTime CreatedAt,
    DateTime LastLoginAt,
    bool IsAdmin,
    List<LinkedProviderResponse> LinkedProviders
);

/// <summary>
/// Response DTO for linked provider
/// </summary>
public record LinkedProviderResponse(
    Guid Id,
    string Provider,
    string ProviderUsername,
    string? ProviderEmail,
    string? ProviderAvatarUrl,
    DateTime LinkedAt
);
