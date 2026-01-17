import { User, KeyPairInfo, OAuthProvider } from '../types/auth';

// Backend URL - configurable via environment variable
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://localhost:7169';

// Token storage key
const TOKEN_KEY = 'route_tracker_auth_token';

/**
 * Get the stored JWT token
 */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * Store the JWT token
 */
export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove the stored JWT token
 */
export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Check if user is authenticated (has a token)
 */
export function isAuthenticated(): boolean {
  return !!getToken();
}

/**
 * Get authorization headers with JWT token
 */
export function getAuthHeaders(): HeadersInit {
  const token = getToken();
  if (!token) return {};
  return {
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Initiate OAuth login - redirects to backend
 */
export function login(provider: OAuthProvider): void {
  const currentUrl = window.location.origin + window.location.pathname;
  window.location.href = `${BACKEND_URL}/api/auth/login/${provider}?returnUrl=${encodeURIComponent(currentUrl)}`;
}

/**
 * Logout - removes token
 */
export function logout(): void {
  removeToken();
}

/**
 * Get current user info from the server
 */
export async function getCurrentUser(): Promise<User | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        // Token is invalid/expired, remove it
        removeToken();
        return null;
      }
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting user info:', error);
    return null;
  }
}

/**
 * Get user's saved key pairs
 */
export async function getMyKeys(): Promise<KeyPairInfo[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const response = await fetch(`${BACKEND_URL}/api/keys/my-keys`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        removeToken();
        return [];
      }
      throw new Error(`Failed to get keys: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting keys:', error);
    return [];
  }
}

/**
 * Generate a new key pair (linked to account if authenticated)
 */
export async function generateKeys(): Promise<{ pushKey: string; viewKey: string } | null> {
  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const token = getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${BACKEND_URL}/api/keys/generate`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      throw new Error(`Failed to generate keys: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating keys:', error);
    return null;
  }
}

/**
 * Add an existing key pair to the account
 */
export async function addKeyPair(pushKey: string, viewKey: string): Promise<{ success: boolean; error?: string; keyPair?: KeyPairInfo }> {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/keys/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ pushKey, viewKey }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || `Failed to add key pair: ${response.status}` };
    }

    const keyPair = await response.json();
    return { success: true, keyPair };
  } catch (error) {
    console.error('Error adding key pair:', error);
    return { success: false, error: 'Failed to add key pair' };
  }
}

/**
 * Remove a key pair from the account
 */
export async function removeKeyPair(keyId: string): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/api/keys/${keyId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    return response.ok;
  } catch (error) {
    console.error('Error removing key pair:', error);
    return false;
  }
}

/**
 * Check URL for authentication token (after OAuth callback)
 */
export function checkUrlForToken(): string | null {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  
  if (token) {
    // Remove token from URL to clean it up
    const url = new URL(window.location.href);
    url.searchParams.delete('token');
    url.searchParams.delete('error');
    window.history.replaceState({}, '', url.toString());
    
    return token;
  }
  
  // Check for errors
  const error = urlParams.get('error');
  if (error) {
    console.error('Authentication error:', error);
    // Clean up URL
    const url = new URL(window.location.href);
    url.searchParams.delete('error');
    window.history.replaceState({}, '', url.toString());
  }
  
  return null;
}

/**
 * Link a new OAuth provider to the current account
 */
export async function linkProvider(provider: OAuthProvider): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const returnUrl = window.location.origin + '/account';
    const response = await fetch(
      `${BACKEND_URL}/api/auth/link/${provider}/initiate?returnUrl=${encodeURIComponent(returnUrl)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Failed to initiate link' };
    }

    const data = await response.json();
    // Redirect to the OAuth provider
    window.location.href = data.redirectUrl;
    return { success: true };
  } catch (error) {
    console.error('Error linking provider:', error);
    return { success: false, error: 'Failed to link provider' };
  }
}

/**
 * Unlink an OAuth provider from the current account
 */
export async function unlinkProvider(provider: OAuthProvider): Promise<{ success: boolean; error?: string }> {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/link/${provider}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Failed to unlink provider' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error unlinking provider:', error);
    return { success: false, error: 'Failed to unlink provider' };
  }
}
