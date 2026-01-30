import { getToken, removeToken } from './authService';
import type { AdminUserSummary, AdminUserDetail, AdminRouteSummary, AdminRouteDetail } from '../types/admin';

// Backend URL - configurable via environment variable
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://localhost:7169';

/**
 * Get authorization headers with JWT token
 */
function getAuthHeaders(): HeadersInit {
  const token = getToken();
  if (!token) return {};
  return {
    'Authorization': `Bearer ${token}`,
  };
}

/**
 * Get all users (admin only)
 */
export async function getAllUsers(): Promise<AdminUserSummary[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/users`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        removeToken();
        return [];
      }
      throw new Error(`Failed to get users: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting users:', error);
    return [];
  }
}

/**
 * Get user detail (admin only)
 */
export async function getUserDetail(id: string): Promise<AdminUserDetail | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/users/${id}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        removeToken();
        return null;
      }
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get user detail: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting user detail:', error);
    return null;
  }
}

/**
 * Get all routes (admin only)
 */
export async function getAllRoutes(): Promise<AdminRouteSummary[]> {
  const token = getToken();
  if (!token) return [];

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/routes`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        removeToken();
        return [];
      }
      throw new Error(`Failed to get routes: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting routes:', error);
    return [];
  }
}

/**
 * Get route detail (admin only)
 */
export async function getRouteDetail(pushKey: string): Promise<AdminRouteDetail | null> {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/routes/${encodeURIComponent(pushKey)}`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        removeToken();
        return null;
      }
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to get route detail: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting route detail:', error);
    return null;
  }
}

/**
 * Delete a user (admin only)
 */
export async function deleteUser(id: string): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/users/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        removeToken();
        return false;
      }
      throw new Error(`Failed to delete user: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting user:', error);
    return false;
  }
}

/**
 * Delete a route (admin only)
 */
export async function deleteRoute(pushKey: string): Promise<boolean> {
  const token = getToken();
  if (!token) return false;

  try {
    const response = await fetch(`${BACKEND_URL}/api/admin/routes/${encodeURIComponent(pushKey)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        removeToken();
        return false;
      }
      throw new Error(`Failed to delete route: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Error deleting route:', error);
    return false;
  }
}
