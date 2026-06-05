using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.AspNetCore.SignalR;
using RouteTracker.Hubs;
using RouteTracker.Models;
using RouteTracker.Services;

namespace RouteTracker.Controllers;

[ApiController]
[Route("api/[controller]")]
public class BossKillsController : ControllerBase
{
    private const int MaxKillsPerRequest = 50;

    private readonly IKeyService _keyService;
    private readonly IBossService _bossService;
    private readonly IHubContext<RouteHub> _hubContext;
    private readonly ILogger<BossKillsController> _logger;

    public BossKillsController(
        IKeyService keyService,
        IBossService bossService,
        IHubContext<RouteHub> hubContext,
        ILogger<BossKillsController> logger)
    {
        _keyService = keyService;
        _bossService = bossService;
        _hubContext = hubContext;
        _logger = logger;
    }

    [HttpPost]
    [EnableRateLimiting("WriteEndpoint")]
    [RequestSizeLimit(65_536)]
    public async Task<IActionResult> SubmitKills([FromBody] List<BossKillRequest> kills)
    {
        var pushKey = Request.Headers["X-Push-Key"].FirstOrDefault();

        if (string.IsNullOrEmpty(pushKey))
        {
            return BadRequest(new { message = "X-Push-Key header is required" });
        }

        var keyPair = await _keyService.ValidatePushKeyAsync(pushKey);

        if (keyPair == null)
        {
            return Unauthorized(new { message = "Invalid or expired push key" });
        }

        if (kills == null || kills.Count == 0)
        {
            return BadRequest(new { message = "At least one boss kill is required" });
        }

        if (kills.Count > MaxKillsPerRequest)
        {
            return BadRequest(new
            {
                message = $"Maximum {MaxKillsPerRequest} boss kills per request. Received: {kills.Count}"
            });
        }

        var savedKills = (await _bossService.AddBossKillsAsync(pushKey, kills)).ToList();

        if (savedKills.Count == 0)
        {
            return Ok(new { received = kills.Count, saved = 0 });
        }

        var groupName = $"route:{keyPair.ViewKey}";
        var broadcasts = savedKills
            .OrderBy(k => k.TimestampMs)
            .Select(k => new BossKillBroadcast(k.FlagId, k.TimestampMs, k.ReceivedAt))
            .ToList();

        await _hubContext.Clients.Group(groupName)
            .SendAsync("ReceiveBossKills", broadcasts, keyPair.ViewKey);

        _logger.LogInformation(
            "Broadcasted {Count} boss kills to SignalR group {Group} with viewKey {ViewKey}",
            broadcasts.Count,
            groupName,
            keyPair.ViewKey);

        return Ok(new { received = kills.Count, saved = savedKills.Count });
    }

    [HttpGet("synced")]
    public async Task<IActionResult> GetSyncedFlagIds()
    {
        var pushKey = Request.Headers["X-Push-Key"].FirstOrDefault();

        if (string.IsNullOrEmpty(pushKey))
        {
            return BadRequest(new { message = "X-Push-Key header is required" });
        }

        var keyPair = await _keyService.ValidatePushKeyAsync(pushKey);

        if (keyPair == null)
        {
            return Unauthorized(new { message = "Invalid or expired push key" });
        }

        var flagIds = await _bossService.GetSyncedFlagIdsByPushKeyAsync(pushKey);
        return Ok(new { flagIds });
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<BossKillBroadcast>>> GetKills([FromQuery] string viewKey)
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

        var kills = await _bossService.GetBossKillsAsync(viewKey);
        return Ok(kills);
    }
}
