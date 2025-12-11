export interface CalibrationPoint {
  gameX: number;
  gameZ: number;
  pixelX: number;
  pixelY: number;
}

// Calibration points: Game(X, Z) → Pixel(x, y) using GLOBAL coordinates
export const CALIBRATION_POINTS: CalibrationPoint[] = [
  { gameX: 10740.49, gameZ: 9159.12, pixelX: 5847, pixelY: 11447 },
  { gameX: 10704.96, gameZ: 9296.39, pixelX: 5801, pixelY: 11240 },
  { gameX: 10927.56, gameZ: 9523.99, pixelX: 6135, pixelY: 10886 },
  { gameX: 12396.08, gameZ: 10301.70, pixelX: 8434, pixelY: 9693 },
];

// Map dimensions (original image)
export const MAP_WIDTH = 15175;
export const MAP_HEIGHT = 14280;

// Tile configuration
export const TILE_CONFIG = {
  maxZoom: 6,
  tileSize: 256,
  paddedSize: 16384, // 2^6 * 256
};

