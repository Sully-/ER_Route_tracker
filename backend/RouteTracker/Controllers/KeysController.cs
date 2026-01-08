using Microsoft.AspNetCore.Mvc;
using RouteTracker.Models;
using RouteTracker.Services;

namespace RouteTracker.Controllers;

[ApiController]
[Route("api/[controller]")]
public class KeysController : ControllerBase
{
    private readonly IKeyService _keyService;
    private readonly ILogger<KeysController> _logger;

    public KeysController(IKeyService keyService, ILogger<KeysController> logger)
    {
        _keyService = keyService;
        _logger = logger;
    }

    /// <summary>
    /// Generate a new push/view key pair
    /// </summary>
    [HttpPost("generate")]
    public async Task<ActionResult<KeyPairResponse>> Generate()
    {
        var keyPair = await _keyService.GenerateKeyPairAsync();
        
        return Ok(new KeyPairResponse(keyPair.PushKey, keyPair.ViewKey));
    }

    /// <summary>
    /// Get the status of a view key
    /// </summary>
    [HttpGet("{viewKey}/status")]
    public async Task<ActionResult<KeyStatusResponse>> GetStatus(string viewKey)
    {
        var status = await _keyService.GetKeyStatusAsync(viewKey);
        
        if (status == null)
        {
            return NotFound(new { message = "View key not found" });
        }

        return Ok(status);
    }
}

