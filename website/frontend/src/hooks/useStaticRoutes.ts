import { useState, useCallback, useEffect } from 'react';
import { Route } from '../types/route';

const STORAGE_KEY_NAMES = 'staticRouteNames';

/**
 * Generate a unique ID for a static route
 */
function generateRouteId(): string {
  return `static-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Hook to manage multiple static routes with persistent names
 */
export function useStaticRoutes() {
  const [routes, setRoutes] = useState<Record<string, Route>>({});
  const [routeIds, setRouteIds] = useState<string[]>([]); // Maintain order
  const [routeNames, setRouteNames] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_NAMES);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load static route names from localStorage:', error);
    }
    return {};
  });
  const [error, setError] = useState<string | null>(null);

  // Auto-load test route if URL has ?test parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('test')) {
      fetch('./test_route.json')
        .then(res => res.json())
        .then((data: Route) => {
          console.log('Auto-loaded test route:', data.name);
          const id = generateRouteId();
          setRoutes(prev => ({ ...prev, [id]: data }));
          setRouteIds(prev => [...prev, id]);
          // Use route name from file as default name
          setRouteNames(prev => ({ ...prev, [id]: data.name || 'Test Route' }));
        })
        .catch(err => {
          console.error('Failed to auto-load test route:', err);
        });
    }
  }, []);

  // Persist route names to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_NAMES, JSON.stringify(routeNames));
    } catch (error) {
      console.error('Failed to save static route names to localStorage:', error);
    }
  }, [routeNames]);

  // Clean up orphaned names when routes change
  useEffect(() => {
    setRouteNames(prev => {
      const updated = { ...prev };
      let changed = false;
      Object.keys(updated).forEach(key => {
        if (!routes[key]) {
          delete updated[key];
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [routes]);

  const addRoute = useCallback((file: File) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') {
          throw new Error('Failed to read file');
        }
        const data = JSON.parse(result) as Route;
        const id = generateRouteId();
        
        // Get default name from file name (without extension) or route name
        const fileName = file.name.replace(/\.json$/i, '');
        const defaultName = data.name || fileName || 'Route';
        
        console.log('Loaded static route:', defaultName, 'with id:', id);
        
        setRoutes(prev => ({ ...prev, [id]: data }));
        setRouteIds(prev => [...prev, id]);
        setRouteNames(prev => ({ ...prev, [id]: defaultName }));
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Parse error:', err);
        setError(`Error parsing route file: ${message}`);
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
    };

    reader.readAsText(file);
  }, []);

  const removeRoute = useCallback((routeId: string) => {
    setRoutes(prev => {
      const updated = { ...prev };
      delete updated[routeId];
      return updated;
    });
    setRouteIds(prev => prev.filter(id => id !== routeId));
    // Names will be cleaned up by the effect
  }, []);

  const updateRouteName = useCallback((routeId: string, name: string) => {
    setRouteNames(prev => ({
      ...prev,
      [routeId]: name.trim() || '',
    }));
  }, []);

  const clearAllRoutes = useCallback(() => {
    setRoutes({});
    setRouteIds([]);
    setError(null);
  }, []);

  return {
    routes,
    routeIds,
    routeNames,
    error,
    addRoute,
    removeRoute,
    updateRouteName,
    clearAllRoutes,
    hasRoutes: routeIds.length > 0,
  };
}
