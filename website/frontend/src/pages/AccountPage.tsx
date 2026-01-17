import { useState, useEffect } from 'react';
import { User, KeyPairInfo, OAUTH_PROVIDERS, PROVIDER_ICONS, OAuthProvider } from '../types/auth';
import { getCurrentUser, getMyKeys, removeKeyPair, logout, linkProvider, unlinkProvider } from '../services/authService';
import './AccountPage.css';

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [keys, setKeys] = useState<KeyPairInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [linkingProvider, setLinkingProvider] = useState<string | null>(null);

  useEffect(() => {
    // Check for success/error messages in URL
    const urlParams = new URLSearchParams(window.location.search);
    const linked = urlParams.get('linked');
    const urlError = urlParams.get('error');
    
    if (linked) {
      setSuccessMessage(`Successfully linked ${linked}`);
      // Clean URL
      const url = new URL(window.location.href);
      url.searchParams.delete('linked');
      window.history.replaceState({}, '', url.toString());
    }
    
    if (urlError) {
      setError(decodeURIComponent(urlError));
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      window.history.replaceState({}, '', url.toString());
    }

    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [userData, keysData] = await Promise.all([
        getCurrentUser(),
        getMyKeys()
      ]);
      
      if (!userData) {
        window.location.href = '/?error=not_authenticated';
        return;
      }
      
      setUser(userData);
      setKeys(keysData);
    } catch (err) {
      setError('Failed to load account data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleLinkProvider(provider: OAuthProvider) {
    setLinkingProvider(provider);
    setError(null);
    
    const result = await linkProvider(provider);
    if (!result.success) {
      setError(result.error || 'Failed to link provider');
      setLinkingProvider(null);
    }
    // If success, we get redirected to OAuth
  }

  async function handleUnlinkProvider(provider: string) {
    if (!confirm(`Are you sure you want to unlink ${provider}?`)) return;
    
    setError(null);
    const result = await unlinkProvider(provider as OAuthProvider);
    
    if (result.success) {
      setSuccessMessage(`Successfully unlinked ${provider}`);
      await loadData(); // Refresh user data
    } else {
      setError(result.error || 'Failed to unlink provider');
    }
  }

  async function handleRemoveKey(keyId: string) {
    if (!confirm('Are you sure you want to remove this key pair?')) return;
    
    const success = await removeKeyPair(keyId);
    if (success) {
      setKeys(keys.filter(k => k.id !== keyId));
    }
  }

  function handleLogout() {
    logout();
    window.location.href = '/';
  }

  if (loading) {
    return (
      <div className="account-page">
        <div className="account-container">
          <div className="account-loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="account-page">
        <div className="account-container">
          <div className="account-error">Not authenticated</div>
          <a href="/" className="back-link">Back to home</a>
        </div>
      </div>
    );
  }

  // Get linked provider IDs
  const linkedProviderIds = user.linkedProviders.map(lp => lp.provider.toLowerCase());
  
  // Get available (not linked) providers
  const availableProviders = OAUTH_PROVIDERS.filter(
    p => !linkedProviderIds.includes(p.id)
  );

  return (
    <div className="account-page">
      <div className="account-container">
        <header className="account-header">
          <a href="/" className="back-link">&larr; Back to map</a>
          <h1>Account Settings</h1>
        </header>

        {/* Messages */}
        {error && (
          <div className="message error-message">
            {error}
            <button onClick={() => setError(null)}>&times;</button>
          </div>
        )}
        {successMessage && (
          <div className="message success-message">
            {successMessage}
            <button onClick={() => setSuccessMessage(null)}>&times;</button>
          </div>
        )}

        {/* Profile Section */}
        <section className="account-section">
          <h2>Profile</h2>
          <div className="profile-card">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt={user.displayName} className="profile-avatar" />
            ) : (
              <div className="profile-avatar-placeholder">
                {user.displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="profile-info">
              <div className="profile-username">{user.displayName}</div>
              {user.email && <div className="profile-email">{user.email}</div>}
              <div className="profile-dates">
                Member since {new Date(user.createdAt).toLocaleDateString()}
              </div>
            </div>
            <button className="logout-btn" onClick={handleLogout}>
              Logout
            </button>
          </div>
        </section>

        {/* Linked Providers Section */}
        <section className="account-section">
          <h2>Linked Accounts ({user.linkedProviders.length})</h2>
          <div className="providers-list">
            {user.linkedProviders.map(lp => {
              const providerInfo = OAUTH_PROVIDERS.find(p => p.id === lp.provider.toLowerCase());
              return (
                <div key={lp.id} className="provider-card linked">
                  <span 
                    className="provider-icon"
                    style={{ color: providerInfo?.color }}
                    dangerouslySetInnerHTML={{ __html: PROVIDER_ICONS[lp.provider.toLowerCase() as OAuthProvider] || '' }}
                  />
                  <div className="provider-info">
                    <span className="provider-name">{providerInfo?.name || lp.provider}</span>
                    <span className="provider-username">{lp.providerUsername}</span>
                  </div>
                  {user.linkedProviders.length > 1 && (
                    <button 
                      className="unlink-btn"
                      onClick={() => handleUnlinkProvider(lp.provider)}
                      title="Unlink this account"
                    >
                      Unlink
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Available Providers to Link */}
          {availableProviders.length > 0 && (
            <>
              <h3 className="subsection-title">Link Another Account</h3>
              <div className="providers-list">
                {availableProviders.map(provider => (
                  <button
                    key={provider.id}
                    className="provider-card available"
                    onClick={() => handleLinkProvider(provider.id)}
                    disabled={linkingProvider !== null}
                    style={{ borderColor: provider.color }}
                  >
                    <span 
                      className="provider-icon"
                      style={{ color: provider.color }}
                      dangerouslySetInnerHTML={{ __html: PROVIDER_ICONS[provider.id] }}
                    />
                    <span className="provider-name">
                      {linkingProvider === provider.id ? 'Linking...' : `Link ${provider.name}`}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </section>

        {/* Keys Section */}
        <section className="account-section">
          <h2>Saved Key Pairs ({keys.length})</h2>
          {keys.length === 0 ? (
            <p className="no-keys-message">
              No saved keys yet. Generate or add keys from the main page to save them to your account.
            </p>
          ) : (
            <div className="keys-list">
              {keys.map(key => (
                <div key={key.id} className="key-card">
                  <div className="key-info">
                    <div className="key-row">
                      <span className="key-label">Push Key:</span>
                      <code className="key-value">{key.pushKey}</code>
                    </div>
                    <div className="key-row">
                      <span className="key-label">View Key:</span>
                      <code className="key-value">{key.viewKey}</code>
                    </div>
                    <div className="key-meta">
                      Created: {new Date(key.createdAt).toLocaleDateString()} | 
                      Last activity: {new Date(key.lastActivityAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button 
                    className="remove-key-btn"
                    onClick={() => handleRemoveKey(key.id)}
                    title="Remove key pair"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
