import { useState, useEffect, useCallback } from 'react';
import { MapIcon, MapIconsData, MapIconCategory } from '../types/mapIcons';

const MAP_ICONS_URL = './map_data_processed.json';

interface UseMapIconsResult {
  icons: MapIcon[];
  isLoading: boolean;
  error: string | null;
  stats: {
    totalCount: number;
    convertedCount: number;
    failedCount: number;
  } | null;
}

interface UseMapIconsOptions {
  category?: MapIconCategory;
  mapId?: string; // 'm60', 'm61', or 'm62' to filter by map
}

export function useMapIcons(options: UseMapIconsOptions = {}): UseMapIconsResult {
  const { category = 'all', mapId } = options;
  
  const [data, setData] = useState<MapIconsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load the JSON data
  useEffect(() => {
    let cancelled = false;

    async function loadIcons() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(MAP_ICONS_URL);
        if (!response.ok) {
          throw new Error(`Failed to load map icons: ${response.statusText}`);
        }

        const json: MapIconsData = await response.json();
        
        if (!cancelled) {
          setData(json);
          console.log(`Loaded ${json.convertedCount} map icons`);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error loading map icons';
          setError(message);
          console.error('Error loading map icons:', err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadIcons();

    return () => {
      cancelled = true;
    };
  }, []);

  // Filter icons based on options
  const getFilteredIcons = useCallback((): MapIcon[] => {
    if (!data) return [];

    let icons: MapIcon[];
    
    // Filter by category
    switch (category) {
      case 'bonfires':
        icons = data.bonfires;
        break;
      case 'mapPoints':
        icons = data.mapPoints;
        break;
      case 'all':
      default:
        icons = [...data.bonfires, ...data.mapPoints];
        break;
    }

    // Filter by map ID if specified
    if (mapId) {
      if (mapId === 'm62') {
        // Underground: filter by areaNo === 12 (icons have mapId 'm60' but should appear on m62)
        icons = icons.filter((icon) => icon.areaNo === 12);
      } else {
        // Other maps: filter by mapId field, excluding underground icons (areaNo === 12) from m60
        icons = icons.filter((icon) => icon.mapId === mapId && icon.areaNo !== 12);
      }
    }

    return icons;
  }, [data, category, mapId]);

  return {
    icons: getFilteredIcons(),
    isLoading,
    error,
    stats: data ? {
      totalCount: data.totalCount,
      convertedCount: data.convertedCount,
      failedCount: data.failedCount,
    } : null,
  };
}

// Hook variant that returns icons grouped by IconId
export function useMapIconsGrouped(options: UseMapIconsOptions = {}): {
  iconsByType: Map<number, MapIcon[]>;
  isLoading: boolean;
  error: string | null;
} {
  const { icons, isLoading, error } = useMapIcons(options);

  const iconsByType = new Map<number, MapIcon[]>();
  
  for (const icon of icons) {
    const existing = iconsByType.get(icon.iconId) || [];
    existing.push(icon);
    iconsByType.set(icon.iconId, existing);
  }

  return { iconsByType, isLoading, error };
}

