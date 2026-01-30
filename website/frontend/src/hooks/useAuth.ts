import { useState, useEffect, useCallback } from 'react';
import { User, KeyPairInfo, OAuthProvider } from '../types/auth';
import * as authService from '../services/authService';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  savedKeys: KeyPairInfo[];
  /** True if we have a token in localStorage (even if user object not yet loaded) */
  hasToken: boolean;
}

export interface AuthActions {
  login: (provider: OAuthProvider) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  refreshKeys: () => Promise<void>;
  generateKeys: () => Promise<{ pushKey: string; viewKey: string } | null>;
  addKeyPair: (pushKey: string, viewKey: string) => Promise<{ success: boolean; error?: string }>;
  removeKeyPair: (keyId: string) => Promise<boolean>;
}

export function useAuth(): AuthState & AuthActions {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savedKeys, setSavedKeys] = useState<KeyPairInfo[]>([]);

  // Initialize auth: check URL token and load user
  // Combined into single effect with proper cleanup to avoid race conditions
  useEffect(() => {
    const instanceId = Math.random().toString(36).substring(7);
    const abortController = new AbortController();
    let isMounted = true;

    console.log(`[Auth ${instanceId}] useEffect started, token in localStorage:`, !!authService.getToken());

    const initAuth = async () => {
      // 1. Check for token in URL first (OAuth callback)
      const urlToken = authService.checkUrlForToken();
      if (urlToken) {
        console.log(`[Auth ${instanceId}] Found token in URL, storing it`);
        authService.setToken(urlToken);
      }

      const hasToken = authService.isAuthenticated();
      console.log(`[Auth ${instanceId}] Has token before API call:`, hasToken);

      // 2. Load user if we have a token
      setIsLoading(true);
      try {
        console.log(`[Auth ${instanceId}] Calling getCurrentUser...`);
        const currentUser = await authService.getCurrentUser(abortController.signal);
        
        console.log(`[Auth ${instanceId}] getCurrentUser returned:`, currentUser ? 'user object' : 'null', 'isMounted:', isMounted);
        
        if (!isMounted) {
          console.log(`[Auth ${instanceId}] Component unmounted, skipping state update`);
          return;
        }
        
        setUser(currentUser);
        
        if (currentUser) {
          console.log(`[Auth ${instanceId}] Loading keys...`);
          const keys = await authService.getMyKeys(abortController.signal);
          if (isMounted) {
            console.log(`[Auth ${instanceId}] Got ${keys.length} keys`);
            setSavedKeys(keys);
          }
        }
      } catch (error) {
        console.log(`[Auth ${instanceId}] Error caught:`, error, 'isMounted:', isMounted);
        if (!isMounted) return;
        
        // Ignore abort errors and network errors - these are expected when:
        // - component unmounts (AbortError)
        // - user does hard refresh (TypeError, network errors)
        // We only clear auth on explicit 401 from backend (handled in getCurrentUser)
        const errorName = error instanceof Error ? error.name : '';
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (errorName === 'AbortError' || 
            errorName === 'TypeError' || 
            errorMessage.includes('fetch') ||
            errorMessage.includes('network') ||
            errorMessage.includes('Failed to fetch')) {
          console.log(`[Auth ${instanceId}] Network/abort error, ignoring (token preserved)`);
          return;
        }
        
        console.error(`[Auth ${instanceId}] Error loading user:`, error);
        // Only clear user for unexpected errors, not network issues
        setUser(null);
        setSavedKeys([]);
      } finally {
        if (isMounted) {
          console.log(`[Auth ${instanceId}] Setting isLoading to false`);
          setIsLoading(false);
        }
      }
    };

    initAuth();

    // Cleanup: abort pending requests and mark as unmounted
    return () => {
      console.log(`[Auth ${instanceId}] Cleanup called, aborting`);
      isMounted = false;
      abortController.abort();
    };
  }, []);

  const login = useCallback((provider: OAuthProvider) => {
    authService.login(provider);
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    setUser(null);
    setSavedKeys([]);
  }, []);

  const refreshUser = useCallback(async () => {
    const currentUser = await authService.getCurrentUser();
    setUser(currentUser);
  }, []);

  const refreshKeys = useCallback(async () => {
    if (!authService.isAuthenticated()) {
      setSavedKeys([]);
      return;
    }
    const keys = await authService.getMyKeys();
    setSavedKeys(keys);
  }, []);

  const generateKeys = useCallback(async () => {
    const result = await authService.generateKeys();
    if (result && authService.isAuthenticated()) {
      // Refresh saved keys to include the new one
      await refreshKeys();
    }
    return result;
  }, [refreshKeys]);

  const addKeyPair = useCallback(async (pushKey: string, viewKey: string) => {
    const result = await authService.addKeyPair(pushKey, viewKey);
    if (result.success) {
      await refreshKeys();
    }
    return result;
  }, [refreshKeys]);

  const removeKeyPair = useCallback(async (keyId: string) => {
    const success = await authService.removeKeyPair(keyId);
    if (success) {
      setSavedKeys(prev => prev.filter(k => k.id !== keyId));
    }
    return success;
  }, []);

  return {
    user,
    isAuthenticated: !!user,
    isLoading,
    savedKeys,
    hasToken: authService.isAuthenticated(),
    login,
    logout,
    refreshUser,
    refreshKeys,
    generateKeys,
    addKeyPair,
    removeKeyPair,
  };
}
