import { useState, useEffect, useCallback } from 'react';
import { Boss, BossesData } from '../types/bosses';

const BOSSES_URL = './enemies_processed.json';

interface UseBossIconsResult {
  bosses: Boss[];
  isLoading: boolean;
  error: string | null;
  stats: {
    totalCount: number;
    convertedCount: number;
    failedCount: number;
    skippedCount: number;
  } | null;
}

interface UseBossIconsOptions {
  mapId?: string;
}

export function useBossIcons(options: UseBossIconsOptions = {}): UseBossIconsResult {
  const { mapId } = options;

  const [data, setData] = useState<BossesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBosses() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(BOSSES_URL);
        if (!response.ok) {
          throw new Error(`Failed to load bosses: ${response.statusText}`);
        }

        const json: BossesData = await response.json();

        if (!cancelled) {
          setData(json);
          console.log(`Loaded ${json.convertedCount} bosses`);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Unknown error loading bosses';
          setError(message);
          console.error('Error loading bosses:', err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadBosses();

    return () => {
      cancelled = true;
    };
  }, []);

  const getFilteredBosses = useCallback((): Boss[] => {
    if (!data) return [];

    let bosses = data.bosses;

    if (mapId) {
      if (mapId === 'm62') {
        bosses = bosses.filter((boss) => boss.areaNo === 12);
      } else {
        bosses = bosses.filter((boss) => boss.mapId === mapId && boss.areaNo !== 12);
      }
    }

    return bosses;
  }, [data, mapId]);

  return {
    bosses: getFilteredBosses(),
    isLoading,
    error,
    stats: data
      ? {
          totalCount: data.totalCount,
          convertedCount: data.convertedCount,
          failedCount: data.failedCount,
          skippedCount: data.skippedCount,
        }
      : null,
  };
}
