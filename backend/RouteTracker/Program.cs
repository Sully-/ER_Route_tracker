using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using RouteTracker.Data;
using RouteTracker.Hubs;
using RouteTracker.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllers();
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

// Configure cleanup background service
builder.Services.AddHostedService<KeyCleanupService>();

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

var app = builder.Build();

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
