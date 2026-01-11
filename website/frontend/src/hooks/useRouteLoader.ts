import { useState, useCallback, useEffect } from 'react';
import { Route } from '../types/route';

export function useRouteLoader() {
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-load test route if URL has ?test parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('test')) {
      fetch('./test_route.json')
        .then(res => res.json())
        .then((data: Route) => {
          console.log('Auto-loaded test route:', data.name);
          setRoute(data);
        })
        .catch(err => {
          console.error('Failed to auto-load test route:', err);
        });
    }
  }, []);

  const loadRoute = useCallback((file: File) => {
    const reader = new FileReader();
    
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') {
          throw new Error('Failed to read file');
        }
        const data = JSON.parse(result) as Route;
        console.log('Loaded route:', data.name);
        setRoute(data);
        setError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Parse error:', err);
        setError(`Error parsing route file: ${message}`);
        setRoute(null);
      }
    };

    reader.onerror = () => {
      setError('Failed to read file');
      setRoute(null);
    };

    reader.readAsText(file);
  }, []);

  const clearRoute = useCallback(() => {
    setRoute(null);
    setError(null);
  }, []);

  return { route, error, loadRoute, clearRoute };
}

