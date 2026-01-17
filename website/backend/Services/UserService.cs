using Microsoft.EntityFrameworkCore;
using RouteTracker.Data;
using RouteTracker.Models;

namespace RouteTracker.Services;

public class UserService : IUserService
{
    private readonly ApplicationDbContext _context;
    private readonly ILogger<UserService> _logger;

    public UserService(ApplicationDbContext context, ILogger<UserService> logger)
    {
        _context = context;
        _logger = logger;
    }

    public async Task<User> FindOrCreateUserAsync(string provider, string providerId, string username, string? email, string? avatarUrl)
    {
        // Try to find existing linked provider
        var existingProvider = await _context.LinkedProviders
            .Include(lp => lp.User)
            .FirstOrDefaultAsync(lp => lp.Provider == provider && lp.ProviderId == providerId);

        if (existingProvider != null)
        {
            // Update provider info if changed
            var updated = false;
            
            if (existingProvider.ProviderUsername != username)
            {
                existingProvider.ProviderUsername = username;
                updated = true;
            }
            
            if (existingProvider.ProviderEmail != email)
            {
                existingProvider.ProviderEmail = email;
                updated = true;
            }
            
            if (existingProvider.ProviderAvatarUrl != avatarUrl)
            {
                existingProvider.ProviderAvatarUrl = avatarUrl;
                updated = true;
            }

            // Update user's avatar if it's from this provider
            var user = existingProvider.User;
            if (avatarUrl != null && user.AvatarUrl != avatarUrl)
            {
                user.AvatarUrl = avatarUrl;
                updated = true;
            }

            user.LastLoginAt = DateTime.UtcNow;
            
            if (updated)
            {
                _logger.LogInformation("Updated provider info for {Provider}/{ProviderId}: {Username}", 
                    provider, providerId, username);
            }

            await _context.SaveChangesAsync();
            return user;
        }

        // Create new user with linked provider
        var newUser = new User
        {
            Id = Guid.NewGuid(),
            DisplayName = username,
            Email = email,
            AvatarUrl = avatarUrl,
            CreatedAt = DateTime.UtcNow,
            LastLoginAt = DateTime.UtcNow
        };

        var newLinkedProvider = new LinkedProvider
        {
            Id = Guid.NewGuid(),
            UserId = newUser.Id,
            Provider = provider,
            ProviderId = providerId,
            ProviderUsername = username,
            ProviderEmail = email,
            ProviderAvatarUrl = avatarUrl,
            LinkedAt = DateTime.UtcNow
        };

        _context.Users.Add(newUser);
        _context.LinkedProviders.Add(newLinkedProvider);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Created new user with {Provider}/{ProviderId} - {Username}", 
            provider, providerId, username);

        return newUser;
    }

    public async Task<User?> GetUserByIdAsync(Guid userId)
    {
        return await _context.Users.FindAsync(userId);
    }

    public async Task<User?> GetUserWithProvidersAsync(Guid userId)
    {
        return await _context.Users
            .Include(u => u.LinkedProviders)
            .FirstOrDefaultAsync(u => u.Id == userId);
    }

    public async Task<User?> GetUserByProviderAsync(string provider, string providerId)
    {
        var linkedProvider = await _context.LinkedProviders
            .Include(lp => lp.User)
            .FirstOrDefaultAsync(lp => lp.Provider == provider && lp.ProviderId == providerId);
        
        return linkedProvider?.User;
    }

    public async Task UpdateLastLoginAsync(Guid userId)
    {
        var user = await _context.Users.FindAsync(userId);
        if (user != null)
        {
            user.LastLoginAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
        }
    }

    public async Task<List<KeyPair>> GetUserKeyPairsAsync(Guid userId)
    {
        return await _context.KeyPairs
            .Where(k => k.UserId == userId && k.IsActive)
            .OrderByDescending(k => k.CreatedAt)
            .ToListAsync();
    }

    public async Task<LinkProviderResult> LinkProviderAsync(Guid userId, string provider, string providerId, string username, string? email, string? avatarUrl)
    {
        // Check if this provider account is already linked to any user
        var existingProvider = await _context.LinkedProviders
            .FirstOrDefaultAsync(lp => lp.Provider == provider && lp.ProviderId == providerId);

        if (existingProvider != null)
        {
            if (existingProvider.UserId == userId)
            {
                return new LinkProviderResult(false, "This account is already linked to your profile");
            }
            return new LinkProviderResult(false, "This account is already linked to another user");
        }

        // Check if user already has this provider type linked
        var userHasProvider = await _context.LinkedProviders
            .AnyAsync(lp => lp.UserId == userId && lp.Provider == provider);

        if (userHasProvider)
        {
            return new LinkProviderResult(false, $"You already have a {provider} account linked");
        }

        // Create the link
        var linkedProvider = new LinkedProvider
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Provider = provider,
            ProviderId = providerId,
            ProviderUsername = username,
            ProviderEmail = email,
            ProviderAvatarUrl = avatarUrl,
            LinkedAt = DateTime.UtcNow
        };

        _context.LinkedProviders.Add(linkedProvider);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Linked {Provider}/{ProviderId} to user {UserId}", provider, providerId, userId);

        return new LinkProviderResult(true, null, linkedProvider);
    }

    public async Task<UnlinkProviderResult> UnlinkProviderAsync(Guid userId, string provider)
    {
        // Get all providers for this user
        var userProviders = await _context.LinkedProviders
            .Where(lp => lp.UserId == userId)
            .ToListAsync();

        if (userProviders.Count <= 1)
        {
            return new UnlinkProviderResult(false, "Cannot unlink the last provider. You must have at least one login method.");
        }

        var providerToRemove = userProviders.FirstOrDefault(lp => lp.Provider.Equals(provider, StringComparison.OrdinalIgnoreCase));
        
        if (providerToRemove == null)
        {
            return new UnlinkProviderResult(false, "Provider not found");
        }

        _context.LinkedProviders.Remove(providerToRemove);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Unlinked {Provider} from user {UserId}", provider, userId);

        return new UnlinkProviderResult(true);
    }

    public async Task<List<LinkedProvider>> GetLinkedProvidersAsync(Guid userId)
    {
        return await _context.LinkedProviders
            .Where(lp => lp.UserId == userId)
            .OrderBy(lp => lp.LinkedAt)
            .ToListAsync();
    }
}
