import { useState, useCallback } from 'react';
import { Route } from '../types/route';

export function useRouteLoader() {
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);

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

