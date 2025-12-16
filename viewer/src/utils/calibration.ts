export interface CalibrationPoint {
  gameX: number;
  gameZ: number;
  pixelX: number;
  pixelY: number;
}

export interface MapConfig {
  id: string;
  name: string;
  tilePath: string;
  width: number;
  height: number;
  paddedSize: number;
  maxZoom: number;
  tileSize: number;
  calibrationPoints: CalibrationPoint[];
}

// Map configurations indexed by map_id prefix (e.g., "m60", "m61")
export const MAP_CONFIGS: Record<string, MapConfig> = {
  m60: {
    id: 'm60',
    name: 'Lands Between',
    tilePath: 'tiles',
    width: 15175,
    height: 14280,
    paddedSize: 16384, // 2^6 * 256
    maxZoom: 6,
    tileSize: 256,
    calibrationPoints: [
      { gameX: 10740.49, gameZ: 9159.12, pixelX: 5847, pixelY: 11447 },
      { gameX: 10704.96, gameZ: 9296.39, pixelX: 5801, pixelY: 11240 },
      { gameX: 10927.56, gameZ: 9523.99, pixelX: 6135, pixelY: 10886 },
      { gameX: 12396.08, gameZ: 10301.70, pixelX: 8434, pixelY: 9693 },
    ],
  },
  m61: {
    id: 'm61',
    name: 'Shadow Realm',
    tilePath: 'tiles_shadow',
    width: 4879,
    height: 5940,
    paddedSize: 8192, // 2^5 * 256
    maxZoom: 5,
    tileSize: 256,
    // Placeholder calibration points - to be determined manually
    // These are estimated values, need actual calibration
    calibrationPoints: [
      // Point vérifié exactement par l'utilisateur
      { gameX: 11958.53, gameZ: 10560.36, pixelX: 1883, pixelY: 4080 },
      { gameX: 13956.86, gameZ: 9997.36, pixelX: 3867, pixelY: 4648 },
      { gameX: 13268.81, gameZ: 12292.96, pixelX: 3187, pixelY: 2357 },
      { gameX: 11514.89, gameZ: 10556.45, pixelX: 1426, pixelY: 4097 },
      // Point 1 retiré car erreur trop importante (277px)
      // { gameX: 11731.32, gameZ: 9888.13, pixelX: 1161, pixelY: 4752 },
    ],
  },
};

// Default map (Lands Between)
export const DEFAULT_MAP_ID = 'm60';

// Get map config from map_id_str (e.g., "m60_42_36_00" -> m60 config)
export function getMapConfigFromId(mapIdStr: string): MapConfig {
  const prefix = mapIdStr.substring(0, 3); // "m60" or "m61"
  return MAP_CONFIGS[prefix] || MAP_CONFIGS[DEFAULT_MAP_ID];
}

// Get map prefix from map_id_str
export function getMapPrefix(mapIdStr: string): string {
  return mapIdStr.substring(0, 3);
}

// Legacy exports for backward compatibility
export const CALIBRATION_POINTS = MAP_CONFIGS.m60.calibrationPoints;
export const MAP_WIDTH = MAP_CONFIGS.m60.width;
export const MAP_HEIGHT = MAP_CONFIGS.m60.height;
export const TILE_CONFIG = {
  maxZoom: MAP_CONFIGS.m60.maxZoom,
  tileSize: MAP_CONFIGS.m60.tileSize,
  paddedSize: MAP_CONFIGS.m60.paddedSize,
};
