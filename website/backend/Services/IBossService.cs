using RouteTracker.Models;

namespace RouteTracker.Services;

public interface IBossService
{
    Task<IEnumerable<BossKill>> AddBossKillsAsync(string pushKey, IEnumerable<BossKillRequest> requests);
    Task<IEnumerable<BossKillBroadcast>> GetBossKillsAsync(string viewKey);
    Task<IReadOnlyList<uint>> GetSyncedFlagIdsByPushKeyAsync(string pushKey);
    Task<int> DeleteBossKillsByKeyPairIdAsync(Guid keyPairId);
}
