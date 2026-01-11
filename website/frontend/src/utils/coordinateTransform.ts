import {
  CALIBRATION_POINTS,
  MAP_WIDTH,
  MAP_HEIGHT,
  CalibrationPoint,
  MapConfig,
  getMapConfigFromId,
} from './calibration';

export interface Transform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function solveLinearSystem(
  points: CalibrationPoint[],
  getTarget: (p: CalibrationPoint) => number
): [number, number, number] {
  const n = points.length;
  let sumX = 0,
    sumZ = 0,
    sumXX = 0,
    sumZZ = 0,
    sumXZ = 0;
  let sumT = 0,
    sumXT = 0,
    sumZT = 0;

  for (const p of points) {
    const x = p.gameX,
      z = p.gameZ,
      t = getTarget(p);
    sumX += x;
    sumZ += z;
    sumXX += x * x;
    sumZZ += z * z;
    sumXZ += x * z;
    sumT += t;
    sumXT += x * t;
    sumZT += z * t;
  }

  const A = [
    [sumXX, sumXZ, sumX],
    [sumXZ, sumZZ, sumZ],
    [sumX, sumZ, n],
  ];
  const B = [sumXT, sumZT, sumT];

  // Gaussian elimination
  for (let i = 0; i < 3; i++) {
    let maxRow = i;
    for (let k = i + 1; k < 3; k++) {
      if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
    }
    [A[i], A[maxRow]] = [A[maxRow], A[i]];
    [B[i], B[maxRow]] = [B[maxRow], B[i]];

    for (let k = i + 1; k < 3; k++) {
      const c = A[k][i] / A[i][i];
      for (let j = i; j < 3; j++) A[k][j] -= c * A[i][j];
      B[k] -= c * B[i];
    }
  }

  const x: [number, number, number] = [0, 0, 0];
  for (let i = 2; i >= 0; i--) {
    x[i] = B[i];
    for (let j = i + 1; j < 3; j++) x[i] -= A[i][j] * x[j];
    x[i] /= A[i][i];
  }
  return x;
}

// Calibration error for a single point
export interface CalibrationError {
  point: CalibrationPoint;
  predictedX: number;
  predictedY: number;
  errorX: number;
  errorY: number;
  errorDistance: number; // Euclidean distance in pixels
}

// Calibration quality report
export interface CalibrationReport {
  mapId: string;
  mapName: string;
  pointCount: number;
  errors: CalibrationError[];
  meanError: number; // Mean error in pixels
  maxError: number; // Max error in pixels
  rmsError: number; // Root mean square error
}

// Cache transforms per map config
const transformCache: Map<string, Transform> = new Map();

// Calculate transform for a specific map config
export function calculateTransformForMap(config: MapConfig): Transform {
  const cached = transformCache.get(config.id);
  if (cached) return cached;

  const points = config.calibrationPoints;

  if (points.length < 2) {
    const transform: Transform = {
      a: 1,
      b: 0,
      c: config.width / 2,
      d: 0,
      e: -1,
      f: config.height,
    };
    transformCache.set(config.id, transform);
    return transform;
  }

  const [a, b, c] = solveLinearSystem(points, (p) => p.pixelX);
  const [d, e, f] = solveLinearSystem(points, (p) => p.pixelY);

  const transform: Transform = { a, b, c, d, e, f };
  transformCache.set(config.id, transform);
  
  // Calculate and log calibration quality
  const report = calculateCalibrationReport(config, transform);
  console.log(`Transform calculated for ${config.name}:`, transform);
  console.log(`Calibration quality for ${config.name}:`);
  console.log(`  Mean error: ${report.meanError.toFixed(2)} pixels`);
  console.log(`  Max error: ${report.maxError.toFixed(2)} pixels`);
  console.log(`  RMS error: ${report.rmsError.toFixed(2)} pixels`);
  report.errors.forEach((err, i) => {
    console.log(`  Point ${i + 1}: error = ${err.errorDistance.toFixed(2)} px (dx=${err.errorX.toFixed(2)}, dy=${err.errorY.toFixed(2)})`);
  });
  
  return transform;
}

// Calculate calibration error report for a map
export function calculateCalibrationReport(
  config: MapConfig,
  transform?: Transform
): CalibrationReport {
  const t = transform || calculateTransformForMap(config);
  const points = config.calibrationPoints;
  
  const errors: CalibrationError[] = points.map((point) => {
    const predictedX = t.a * point.gameX + t.b * point.gameZ + t.c;
    const predictedY = t.d * point.gameX + t.e * point.gameZ + t.f;
    const errorX = predictedX - point.pixelX;
    const errorY = predictedY - point.pixelY;
    const errorDistance = Math.sqrt(errorX * errorX + errorY * errorY);
    
    return {
      point,
      predictedX,
      predictedY,
      errorX,
      errorY,
      errorDistance,
    };
  });
  
  const distances = errors.map((e) => e.errorDistance);
  const meanError = distances.reduce((a, b) => a + b, 0) / distances.length;
  const maxError = Math.max(...distances);
  const rmsError = Math.sqrt(
    distances.reduce((sum, d) => sum + d * d, 0) / distances.length
  );
  
  return {
    mapId: config.id,
    mapName: config.name,
    pointCount: points.length,
    errors,
    meanError,
    maxError,
    rmsError,
  };
}

// Get calibration reports for all maps
export function getAllCalibrationReports(
  mapConfigs: Record<string, MapConfig>
): CalibrationReport[] {
  return Object.values(mapConfigs).map((config) =>
    calculateCalibrationReport(config)
  );
}

// Convert game coordinates to pixel coordinates for a specific map
export function gameToPixelForMap(
  gameX: number,
  gameZ: number,
  config: MapConfig
): { x: number; y: number } {
  const transform = calculateTransformForMap(config);
  return {
    x: transform.a * gameX + transform.b * gameZ + transform.c,
    y: transform.d * gameX + transform.e * gameZ + transform.f,
  };
}

// Convert game coordinates to pixel using map_id_str
export function gameToPixelByMapId(
  gameX: number,
  gameZ: number,
  mapIdStr: string
): { x: number; y: number } {
  const config = getMapConfigFromId(mapIdStr);
  return gameToPixelForMap(gameX, gameZ, config);
}

// Legacy cached transform for backward compatibility (m60 only)
let cachedTransform: Transform | null = null;

export function calculateTransform(): Transform {
  if (cachedTransform) return cachedTransform;

  if (CALIBRATION_POINTS.length < 2) {
    cachedTransform = {
      a: 1,
      b: 0,
      c: MAP_WIDTH / 2,
      d: 0,
      e: -1,
      f: MAP_HEIGHT,
    };
    return cachedTransform;
  }

  const [a, b, c] = solveLinearSystem(CALIBRATION_POINTS, (p) => p.pixelX);
  const [d, e, f] = solveLinearSystem(CALIBRATION_POINTS, (p) => p.pixelY);

  cachedTransform = { a, b, c, d, e, f };
  console.log('Transform calculated:', cachedTransform);
  return cachedTransform;
}

// Legacy function for backward compatibility (assumes m60 map)
export function gameToPixel(
  gameX: number,
  gameZ: number
): { x: number; y: number } {
  const transform = calculateTransform();
  return {
    x: transform.a * gameX + transform.b * gameZ + transform.c,
    y: transform.d * gameX + transform.e * gameZ + transform.f,
  };
}

// Check if pixel coordinates are within map bounds (with margin)
export function isInMapBounds(
  pixelX: number,
  pixelY: number,
  config: MapConfig,
  margin: number = 100
): boolean {
  return (
    pixelX >= -margin &&
    pixelX <= config.width + margin &&
    pixelY >= -margin &&
    pixelY <= config.height + margin
  );
}

// Detect the appropriate map for given global coordinates
// Returns the map config where the coordinates fall within bounds
export function detectMapFromCoordinates(
  gameX: number,
  gameZ: number,
  mapConfigs: Record<string, MapConfig>
): MapConfig | null {
  // Try each map and find which one the coordinates fit in
  for (const config of Object.values(mapConfigs)) {
    const pixel = gameToPixelForMap(gameX, gameZ, config);
    if (isInMapBounds(pixel.x, pixel.y, config)) {
      return config;
    }
  }
  return null;
}

// Detect the best map for coordinates, with fallback
export function detectMapFromCoordinatesWithFallback(
  gameX: number,
  gameZ: number,
  mapConfigs: Record<string, MapConfig>,
  fallbackMapId: string = 'm60'
): MapConfig {
  const detected = detectMapFromCoordinates(gameX, gameZ, mapConfigs);
  if (detected) {
    return detected;
  }
  // Fallback to default map
  return mapConfigs[fallbackMapId] || Object.values(mapConfigs)[0];
}
