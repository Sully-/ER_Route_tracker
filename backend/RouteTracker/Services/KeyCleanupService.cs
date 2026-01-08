namespace RouteTracker.Services;

public class KeyCleanupService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<KeyCleanupService> _logger;
    private readonly IConfiguration _configuration;

    public KeyCleanupService(
        IServiceProvider serviceProvider,
        ILogger<KeyCleanupService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _logger = logger;
        _configuration = configuration;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Key Cleanup Service starting");

        var intervalMinutes = _configuration.GetValue<int>("KeySettings:CleanupIntervalMinutes", 60);
        var expirationHours = _configuration.GetValue<int>("KeySettings:ExpirationHours", 24);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await CleanupExpiredKeysAsync(expirationHours);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error during key cleanup");
            }

            await Task.Delay(TimeSpan.FromMinutes(intervalMinutes), stoppingToken);
        }

        _logger.LogInformation("Key Cleanup Service stopping");
    }

    private async Task CleanupExpiredKeysAsync(int expirationHours)
    {
        using var scope = _serviceProvider.CreateScope();
        var keyService = scope.ServiceProvider.GetRequiredService<IKeyService>();

        var deletedCount = await keyService.DeleteExpiredKeysAsync(expirationHours);

        if (deletedCount > 0)
        {
            _logger.LogInformation("Cleanup completed: deleted {Count} expired key pairs", deletedCount);
        }
    }
}

