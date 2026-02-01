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
  console.log('[removeToken] Token being removed! Stack:', new Error().stack);
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
 * @param signal Optional AbortSignal to cancel the request
 * @throws AbortError if request was aborted
 * @throws Error for network errors (caller should not clear auth state)
 * @returns User object, or null only if token is missing or explicitly invalid (401)
 */
export async function getCurrentUser(signal?: AbortSignal): Promise<User | null> {
  const token = getToken();
  console.log('[getCurrentUser] Token present:', !!token, token ? `(${token.substring(0, 20)}...)` : '');
  if (!token) return null;

  try {
    console.log('[getCurrentUser] Fetching /api/auth/me...');
    const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal,
    });

    console.log('[getCurrentUser] Response status:', response.status);

    if (!response.ok) {
      if (response.status === 401) {
        // Token is invalid/expired, remove it
        console.log('[getCurrentUser] 401 received, removing token');
        removeToken();
        return null;
      }
      // Other HTTP errors - throw to let caller handle
      throw new Error(`Failed to get user info: ${response.status}`);
    }

    const user = await response.json();
    console.log('[getCurrentUser] Got user:', user?.displayName);
    return user;
  } catch (error) {
    // Re-throw ALL errors for proper handling by caller
    // The caller (useAuth) will decide whether to clear auth state
    console.log('[getCurrentUser] Error:', error instanceof Error ? error.name : 'unknown', error);
    throw error;
  }
}

/**
 * Get user's saved key pairs
 * @param signal Optional AbortSignal to cancel the request
 */
export async function getMyKeys(signal?: AbortSignal): Promise<KeyPairInfo[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const response = await fetch(`${BACKEND_URL}/api/keys/my-keys`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      signal,
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
    // Re-throw abort errors for proper handling by caller
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    console.error('Error getting keys:', error);
    return [];
  }
}

/**
 * Generate a new key pair (requires authentication - linked to user's account)
 */
export async function generateKeys(): Promise<{ pushKey: string; viewKey: string } | null> {
  const token = getToken();
  if (!token) {
    throw new Error('Authentication required. Please log in to generate keys.');
  }

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    };

    const response = await fetch(`${BACKEND_URL}/api/keys/generate`, {
      method: 'POST',
      headers,
    });

    if (!response.ok) {
      if (response.status === 401) {
        removeToken(); // Token invalid/expired
        throw new Error('Your session has expired. Please log in again.');
      }
      throw new Error(`Failed to generate keys: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating keys:', error);
    throw error; // Propagate error for UI display
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

/**
 * Get route points for a view key
 */
export async function getRoutePoints(viewKey: string): Promise<{ success: boolean; points?: RoutePointData[]; error?: string }> {
  try {
    const response = await fetch(`${BACKEND_URL}/api/routepoints?viewKey=${encodeURIComponent(viewKey)}`);

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid or expired view key' };
      }
      return { success: false, error: `Failed to get route points: ${response.status}` };
    }

    const points = await response.json();
    return { success: true, points };
  } catch (error) {
    console.error('Error getting route points:', error);
    return { success: false, error: 'Failed to get route points' };
  }
}

/**
 * Route point data from the server
 */
export interface RoutePointData {
  x: number;
  y: number;
  z: number;
  globalX: number;
  globalY: number;
  globalZ: number;
  mapId: number;
  mapIdStr: string | null;
  globalMapId: number;
  timestampMs: number;
  receivedAt: string;
}

/**
 * Reset (delete all route points) for a key pair
 */
export async function resetKeyRoutes(keyId: string): Promise<{ success: boolean; deletedCount?: number; error?: string }> {
  const token = getToken();
  if (!token) {
    return { success: false, error: 'Not authenticated' };
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/routepoints/${keyId}/reset`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 403) {
        return { success: false, error: 'You do not have permission to reset this route' };
      }
      if (response.status === 404) {
        return { success: false, error: 'Key pair not found' };
      }
      const errorData = await response.json().catch(() => ({}));
      return { success: false, error: errorData.message || 'Failed to reset routes' };
    }

    const data = await response.json();
    return { success: true, deletedCount: data.deletedCount };
  } catch (error) {
    console.error('Error resetting routes:', error);
    return { success: false, error: 'Failed to reset routes' };
  }
}
