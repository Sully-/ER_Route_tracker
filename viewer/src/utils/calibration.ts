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
    width: 9645,
    height: 9119,
    paddedSize: 16384, // 2^6 * 256
    maxZoom: 6,
    tileSize: 256,
    // Calibration points from Lands_Between_Name.png (9645 x 9119)
    calibrationPoints: [
      { gameX: 10739.17, gameZ: 9161.5, pixelX: 3697, pixelY: 7345 },    // The First Step
      { gameX: 10976.9, gameZ: 7667.36, pixelX: 3933, pixelY: 8851 },    // Morne Moangrave
      { gameX: 13268.46, gameZ: 9686.11, pixelX: 6239, pixelY: 6806 },   // Starscourge Radahn
      { gameX: 13793.61, gameZ: 14142.3, pixelX: 6754, pixelY: 2363 },   // First Church of Marika
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
    // Calibration points from manual measurement
    calibrationPoints: [
      { gameX: 12074.65, gameZ: 10523.87, pixelX: 1997, pixelY: 4123 },  // Ellac River Downstream
      { gameX: 11960.21, gameZ: 10564.6, pixelX: 1882, pixelY: 4083 },   // Scorched Ruins
      { gameX: 13269.66, gameZ: 12291.76, pixelX: 3189, pixelY: 2358 }, // Fingerstone Hill
      { gameX: 11070.19, gameZ: 11137.88, pixelX: 995, pixelY: 3509 },  // Cleansing Chamber Anteroom
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
