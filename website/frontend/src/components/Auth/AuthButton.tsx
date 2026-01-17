import { useState } from 'react';
import { User, OAUTH_PROVIDERS, PROVIDER_ICONS, OAuthProvider } from '../../types/auth';
import './AuthButton.css';

interface AuthButtonProps {
  user: User | null;
  isLoading: boolean;
  onLogin: (provider: OAuthProvider) => void;
  onLogout: () => void;
}

function AuthButton({ user, isLoading, onLogin, onLogout }: AuthButtonProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  if (isLoading) {
    return (
      <div className="auth-button-container">
        <div className="auth-loading">Loading...</div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="auth-button-container">
        <div className="auth-user-info" onClick={() => setShowDropdown(!showDropdown)}>
          {user.avatarUrl ? (
            <img src={user.avatarUrl} alt={user.displayName} className="auth-avatar" />
          ) : (
            <div className="auth-avatar-placeholder">
              {user.displayName.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="auth-username">{user.displayName}</span>
          <span className="auth-provider-badge">
            {user.linkedProviders?.length || 0} linked
          </span>
        </div>
        {showDropdown && (
          <div className="auth-dropdown">
            <button className="auth-logout-btn" onClick={() => { onLogout(); setShowDropdown(false); }}>
              Logout
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="auth-button-container">
      <button className="auth-login-btn" onClick={() => setShowDropdown(!showDropdown)}>
        Sign In
      </button>
      {showDropdown && (
        <div className="auth-dropdown auth-providers-dropdown">
          <div className="auth-dropdown-title">Sign in with</div>
          {OAUTH_PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              className="auth-provider-btn"
              onClick={() => { onLogin(provider.id); setShowDropdown(false); }}
            >
              <span className="auth-provider-icon" dangerouslySetInnerHTML={{ __html: PROVIDER_ICONS[provider.id] }} />
              <span className="auth-provider-name">{provider.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default AuthButton;
