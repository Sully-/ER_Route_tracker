import { useState, useEffect, useCallback } from 'react';
import { User, KeyPairInfo, OAuthProvider } from '../types/auth';
import * as authService from '../services/authService';

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  savedKeys: KeyPairInfo[];
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

  // Check for token in URL (after OAuth callback)
  useEffect(() => {
    const token = authService.checkUrlForToken();
    if (token) {
      authService.setToken(token);
    }
  }, []);

  // Load user on mount
  useEffect(() => {
    const loadUser = async () => {
      setIsLoading(true);
      try {
        const currentUser = await authService.getCurrentUser();
        setUser(currentUser);
        
        if (currentUser) {
          // Also load saved keys
          const keys = await authService.getMyKeys();
          setSavedKeys(keys);
        }
      } catch (error) {
        console.error('Error loading user:', error);
        setUser(null);
        setSavedKeys([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadUser();
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
    login,
    logout,
    refreshUser,
    refreshKeys,
    generateKeys,
    addKeyPair,
    removeKeyPair,
  };
}
