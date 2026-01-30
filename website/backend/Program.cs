using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Threading.RateLimiting;
using AspNet.Security.OAuth.Discord;
using AspNet.Security.OAuth.Twitch;
using AspNet.Security.OpenId.Steam;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.Google;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authentication.OpenIdConnect;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Scalar.AspNetCore;
using Microsoft.AspNetCore.HttpOverrides;
using RouteTracker.Data;
using RouteTracker.Hubs;
using RouteTracker.Models;
using RouteTracker.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
    });
builder.Services.AddEndpointsApiExplorer();

// Configure OpenAPI (Microsoft standard)
builder.Services.AddOpenApi();

// Configure PostgreSQL with environment variable support for password
var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (!string.IsNullOrEmpty(connectionString) && connectionString.Contains("${ROUTE_TRACKER_DB_PASSWORD}"))
{
    var password = Environment.GetEnvironmentVariable("ROUTE_TRACKER_DB_PASSWORD");
    if (!string.IsNullOrEmpty(password))
    {
        connectionString = connectionString.Replace("${ROUTE_TRACKER_DB_PASSWORD}", password);
    }
    else
    {
        Console.WriteLine("WARNING: ROUTE_TRACKER_DB_PASSWORD environment variable is not set!");
        Console.WriteLine("Set it with: export ROUTE_TRACKER_DB_PASSWORD='your-password'");
    }
}

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(connectionString));

// Configure SignalR
builder.Services.AddSignalR();

// Register services
builder.Services.AddScoped<IKeyService, KeyService>();
builder.Services.AddScoped<IRouteService, RouteService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IAdminService, AdminService>();

// Configure cleanup background service
builder.Services.AddHostedService<KeyCleanupService>();

// Configure session for OAuth linking flow
builder.Services.AddDistributedMemoryCache();
builder.Services.AddSession(options =>
{
    options.IdleTimeout = TimeSpan.FromMinutes(10);
    options.Cookie.HttpOnly = true;
    options.Cookie.IsEssential = true;
    options.Cookie.SameSite = SameSiteMode.None;
    options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
});

// =============================================================================
// Authentication Configuration
// =============================================================================

// Helper function to resolve environment variables in config values
string ResolveConfigValue(string? value)
{
    if (string.IsNullOrEmpty(value)) return string.Empty;
    if (!value.StartsWith("${") || !value.EndsWith("}")) return value;
    
    var envVarName = value[2..^1];
    return Environment.GetEnvironmentVariable(envVarName) ?? string.Empty;
}

// JWT Configuration
var jwtSecretKey = ResolveConfigValue(builder.Configuration["Authentication:Jwt:SecretKey"]);
var jwtIssuer = builder.Configuration["Authentication:Jwt:Issuer"] ?? "route-tracker";
var jwtAudience = builder.Configuration["Authentication:Jwt:Audience"] ?? "route-tracker";
var jwtExpirationMinutes = builder.Configuration.GetValue<int>("Authentication:Jwt:ExpirationMinutes", 43200);

// OAuth Configuration
var discordClientId = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Discord:ClientId"]);
var discordClientSecret = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Discord:ClientSecret"]);
var twitchClientId = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Twitch:ClientId"]);
var twitchClientSecret = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Twitch:ClientSecret"]);
var googleClientId = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Google:ClientId"]);
var googleClientSecret = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Google:ClientSecret"]);
var microsoftClientId = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Microsoft:ClientId"]);
var microsoftClientSecret = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Microsoft:ClientSecret"]);
var microsoftTenantId = builder.Configuration["Authentication:OAuth:Microsoft:TenantId"] ?? "common";
var steamApiKey = ResolveConfigValue(builder.Configuration["Authentication:OAuth:Steam:ApiKey"]);
var frontendUrl = ResolveConfigValue(builder.Configuration["Authentication:FrontendUrl"]);
if (string.IsNullOrEmpty(frontendUrl))
    throw new InvalidOperationException("Authentication:FrontendUrl must be configured. Set FRONTEND_URL environment variable.");

// Configure Authentication
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultSignInScheme = CookieAuthenticationDefaults.AuthenticationScheme;
})
.AddCookie(CookieAuthenticationDefaults.AuthenticationScheme, options =>
{
    options.Cookie.SameSite = SameSiteMode.Lax;
    options.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
})
.AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
{
    if (!string.IsNullOrEmpty(jwtSecretKey))
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtIssuer,
            ValidAudience = jwtAudience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecretKey)),
            ClockSkew = TimeSpan.Zero
        };
    }
});

// Add OAuth providers only if configured
var authBuilder = builder.Services.AddAuthentication();

if (!string.IsNullOrEmpty(discordClientId) && !string.IsNullOrEmpty(discordClientSecret))
{
    authBuilder.AddDiscord(DiscordAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.ClientId = discordClientId;
        options.ClientSecret = discordClientSecret;
        options.CallbackPath = "/signin-discord";
        options.Scope.Add("identify");
        options.Scope.Add("email");
        options.SaveTokens = true;
    });
}

if (!string.IsNullOrEmpty(twitchClientId) && !string.IsNullOrEmpty(twitchClientSecret))
{
    authBuilder.AddTwitch(TwitchAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.ClientId = twitchClientId;
        options.ClientSecret = twitchClientSecret;
        options.CallbackPath = "/signin-twitch";
        options.Scope.Add("user:read:email");
        options.SaveTokens = true;
    });
}

if (!string.IsNullOrEmpty(googleClientId) && !string.IsNullOrEmpty(googleClientSecret))
{
    authBuilder.AddGoogle(GoogleDefaults.AuthenticationScheme, options =>
    {
        options.ClientId = googleClientId;
        options.ClientSecret = googleClientSecret;
        options.CallbackPath = "/signin-google";
        options.SaveTokens = true;
    });
}

if (!string.IsNullOrEmpty(microsoftClientId) && !string.IsNullOrEmpty(microsoftClientSecret))
{
    authBuilder.AddOpenIdConnect("Microsoft", options =>
    {
        options.ClientId = microsoftClientId;
        options.ClientSecret = microsoftClientSecret;
        options.Authority = $"https://login.microsoftonline.com/{microsoftTenantId}/v2.0";
        options.CallbackPath = "/signin-microsoft";
        options.ResponseType = "code";
        options.Scope.Add("openid");
        options.Scope.Add("profile");
        options.Scope.Add("email");
        options.SaveTokens = true;
        options.GetClaimsFromUserInfoEndpoint = true;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = false // Allow any tenant
        };
    });
}

if (!string.IsNullOrEmpty(steamApiKey))
{
    authBuilder.AddSteam(SteamAuthenticationDefaults.AuthenticationScheme, options =>
    {
        options.ApplicationKey = steamApiKey;
        options.CallbackPath = "/signin-steam";
    });
}

// Store JWT settings for use in controllers
builder.Services.AddSingleton(new JwtSettings
{
    SecretKey = jwtSecretKey,
    Issuer = jwtIssuer,
    Audience = jwtAudience,
    ExpirationMinutes = jwtExpirationMinutes
});

// Store Frontend settings for OAuth redirects
builder.Services.AddSingleton(new FrontendSettings
{
    Url = frontendUrl
});

// Configure Authorization policies
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy =>
        policy.RequireClaim("IsAdmin", "true"));
});

// Configure CORS for local and server deployment
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyMethod()
              .AllowAnyHeader();
    });
    
    options.AddPolicy("AllowSignalR", policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyMethod()
              .AllowAnyHeader()
              .AllowCredentials();
    });
});

// Configure Rate Limiting for DDoS protection
builder.Services.AddRateLimiter(options =>
{
    // Strict limit for POST /api/RoutePoints (DB write)
    // Max 60 requests/minute per IP (1 point per second)
    options.AddFixedWindowLimiter("WriteEndpoint", limiterOptions =>
    {
        limiterOptions.Window = TimeSpan.FromMinutes(1);
        limiterOptions.PermitLimit = 60;
        limiterOptions.QueueLimit = 5;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
    
    // Very strict limit for POST /api/Keys/generate
    // Max 5 key generations/minute per IP
    options.AddFixedWindowLimiter("KeyGenEndpoint", limiterOptions =>
    {
        limiterOptions.Window = TimeSpan.FromMinutes(1);
        limiterOptions.PermitLimit = 5;
        limiterOptions.QueueLimit = 1;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
    
    // General limit for all other endpoints
    // 60 requests/minute per IP
    options.AddSlidingWindowLimiter("GeneralEndpoint", limiterOptions =>
    {
        limiterOptions.Window = TimeSpan.FromMinutes(1);
        limiterOptions.SegmentsPerWindow = 6;
        limiterOptions.PermitLimit = 60;
        limiterOptions.QueueLimit = 5;
        limiterOptions.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    });
    
    // Custom rejection response
    options.OnRejected = async (context, cancellationToken) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.ContentType = "application/json";
        
        var logger = context.HttpContext.RequestServices.GetRequiredService<ILoggerFactory>()
            .CreateLogger("RateLimiting");
        logger.LogWarning("Rate limit exceeded for {Path} from {IP}", 
            context.HttpContext.Request.Path,
            context.HttpContext.Connection.RemoteIpAddress);
        
        await context.HttpContext.Response.WriteAsJsonAsync(new 
        { 
            message = "Rate limit exceeded. Please try again later.",
            retryAfter = "60 seconds"
        }, cancellationToken);
    };
});

var app = builder.Build();

// Forward headers from reverse proxy (nginx)
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto | ForwardedHeaders.XForwardedHost
});

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    // Map OpenAPI document (Microsoft standard)
    app.MapOpenApi();
    
    // Map Scalar UI for OpenAPI documentation
    app.MapScalarApiReference();
}

// Only use HTTPS redirection in production
if (!app.Environment.IsDevelopment())
{
    app.UseHttpsRedirection();
}

// Use CORS - SignalR needs credentials
// CORS must be before UseAuthorization and MapHub
app.UseCors("AllowSignalR");

// Rate limiting middleware - DDoS protection
app.UseRateLimiter();

// Session for OAuth linking flow
app.UseSession();

// Authentication must come before Authorization
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Map SignalR Hub
app.MapHub<RouteHub>("/hubs/route");

// Log startup info
var logger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");
logger.LogInformation("SignalR Hub available at: /hubs/route");
logger.LogInformation("Application is running in {Environment} mode", app.Environment.EnvironmentName);

// Auto-migrate database in development
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.Migrate();
}

app.Run();
