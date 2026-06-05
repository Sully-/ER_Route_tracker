using Microsoft.EntityFrameworkCore;
using RouteTracker.Data;
using RouteTracker.Models;

namespace RouteTracker.Services;

public class BossService : IBossService
{
    private const int MaxKillsPerBatch = 50;

    private readonly ApplicationDbContext _context;
    private readonly IKeyService _keyService;
    private readonly ILogger<BossService> _logger;

    public BossService(
        ApplicationDbContext context,
        IKeyService keyService,
        ILogger<BossService> logger)
    {
        _context = context;
        _keyService = keyService;
        _logger = logger;
    }

    public async Task<IEnumerable<BossKill>> AddBossKillsAsync(
        string pushKey,
        IEnumerable<BossKillRequest> requests)
    {
        var requestsList = requests.ToList();

        if (requestsList.Count > MaxKillsPerBatch)
        {
            throw new ArgumentException(
                $"Maximum {MaxKillsPerBatch} boss kills per batch. Received: {requestsList.Count}");
        }

        var saved = new List<BossKill>();

        foreach (var request in requestsList)
        {
            var exists = await _context.BossKills
                .AnyAsync(bk => bk.PushKey == pushKey && bk.FlagId == request.FlagId);

            if (exists)
            {
                continue;
            }

            var bossKill = new BossKill
            {
                PushKey = pushKey,
                FlagId = request.FlagId,
                TimestampMs = request.TimestampMs,
                ReceivedAt = DateTime.UtcNow,
            };

            _context.BossKills.Add(bossKill);
            saved.Add(bossKill);
        }

        if (saved.Count > 0)
        {
            await _keyService.UpdateLastActivityAsync(pushKey);
            await _context.SaveChangesAsync();
            _logger.LogInformation(
                "Saved {Count} boss kills for push key {PushKey}",
                saved.Count,
                pushKey);
        }

        return saved;
    }

    public async Task<IEnumerable<BossKillBroadcast>> GetBossKillsAsync(string viewKey)
    {
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.ViewKey == viewKey && k.IsActive);

        if (keyPair == null)
        {
            return Enumerable.Empty<BossKillBroadcast>();
        }

        return await _context.BossKills
            .Where(bk => bk.PushKey == keyPair.PushKey)
            .OrderBy(bk => bk.TimestampMs)
            .Select(bk => new BossKillBroadcast(
                bk.FlagId,
                bk.TimestampMs,
                bk.ReceivedAt))
            .ToListAsync();
    }

    public async Task<IReadOnlyList<uint>> GetSyncedFlagIdsByPushKeyAsync(string pushKey)
    {
        return await _context.BossKills
            .Where(bk => bk.PushKey == pushKey)
            .Select(bk => bk.FlagId)
            .ToListAsync();
    }

    public async Task<int> DeleteBossKillsByKeyPairIdAsync(Guid keyPairId)
    {
        var keyPair = await _context.KeyPairs
            .FirstOrDefaultAsync(k => k.Id == keyPairId);

        if (keyPair == null)
        {
            return -1;
        }

        var bossKills = await _context.BossKills
            .Where(bk => bk.PushKey == keyPair.PushKey)
            .ToListAsync();

        var count = bossKills.Count;

        if (count > 0)
        {
            _context.BossKills.RemoveRange(bossKills);
            await _context.SaveChangesAsync();
            _logger.LogInformation(
                "Deleted {Count} boss kills for key pair {KeyPairId}",
                count,
                keyPairId);
        }

        return count;
    }
}
