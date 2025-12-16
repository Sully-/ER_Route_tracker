import { Route, RoutePoint } from '../types/route';
import { MapConfig, MAP_CONFIGS, DEFAULT_MAP_ID } from './calibration';

export interface MapTransition {
  pointIndex: number;
  fromMapId: string;
  toMapId: string;
  fromMapName: string;
  toMapName: string;
  point: RoutePoint; // Last point on source map
  destinationPoint: RoutePoint; // First point on destination map
}

export interface MapSegment {
  mapId: string;
  mapName: string;
  startIndex: number;
  endIndex: number;
  points: RoutePoint[];
}

// Get the display map ID for a point (m60 or m61)
// Uses global_map_id from the tracker if available, otherwise defaults to m60
export function getDisplayMapId(point: RoutePoint): string {
  // Use global_map_id if available (new format from tracker)
  if (point.global_map_id !== undefined) {
    if (point.global_map_id === 60) {
      return 'm60';
    } else if (point.global_map_id === 61) {
      return 'm61';
    }
  }
  
  // Fallback: use map_id_str prefix for old route files
  // Extract prefix from map_id_str (e.g., "m60_42_36_00" -> "m60")
  if (point.map_id_str && point.map_id_str.length >= 3) {
    const prefix = point.map_id_str.substring(0, 3);
    if (prefix === 'm60' || prefix === 'm61') {
      return prefix;
    }
  }
  
  // Default to m60
  return DEFAULT_MAP_ID;
}

// Detect the display map for a point
export function detectDisplayMapForPoint(point: RoutePoint): MapConfig {
  const mapId = getDisplayMapId(point);
  return MAP_CONFIGS[mapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
}

// Check if a point is valid (not m255_255_255_255)
export function isValidPoint(point: RoutePoint): boolean {
  return point.map_id_str !== 'm255_255_255_255' && 
         point.global_x !== 0 && 
         point.global_z !== 0;
}

// Detect all map transitions in a route based on global coordinates
export function detectMapTransitions(route: Route): MapTransition[] {
  if (!route.points || route.points.length < 2) {
    return [];
  }

  const transitions: MapTransition[] = [];
  // Find first valid point
  let firstValidIndex = 0;
  while (firstValidIndex < route.points.length && !isValidPoint(route.points[firstValidIndex])) {
    firstValidIndex++;
  }
  
  if (firstValidIndex >= route.points.length) {
    return [];
  }

  let currentMapId = getDisplayMapId(route.points[firstValidIndex]);
  let lastValidIndex = firstValidIndex;

  for (let i = firstValidIndex + 1; i < route.points.length; i++) {
    const point = route.points[i];
    
    // Skip invalid points (m255)
    if (!isValidPoint(point)) {
      continue;
    }

    const newMapId = getDisplayMapId(point);

    if (newMapId !== currentMapId) {
      const fromConfig = MAP_CONFIGS[currentMapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
      const toConfig = MAP_CONFIGS[newMapId] || MAP_CONFIGS[DEFAULT_MAP_ID];

      // Use the last valid point before transition, or current point if it's valid
      const transitionPoint = route.points[lastValidIndex];

      // Find first valid point on destination map (for marker positioning)
      let firstPointOnDestMap = point; // Current point is the first on destination map
      
      transitions.push({
        pointIndex: i,
        fromMapId: currentMapId,
        toMapId: newMapId,
        fromMapName: fromConfig.name,
        toMapName: toConfig.name,
        point: transitionPoint, // Last point on source map
        destinationPoint: firstPointOnDestMap, // First point on destination map
      });

      currentMapId = newMapId;
    }
    
    lastValidIndex = i;
  }

  return transitions;
}

// Get all unique display maps used in a route
export function getUsedMaps(route: Route): MapConfig[] {
  if (!route.points || route.points.length === 0) {
    return [];
  }

  const mapIds = new Set<string>();
  for (const point of route.points) {
    mapIds.add(getDisplayMapId(point));
  }

  return Array.from(mapIds).map((id) => MAP_CONFIGS[id] || MAP_CONFIGS[DEFAULT_MAP_ID]);
}

// Split route into segments by display map
export function splitRouteByMap(route: Route): MapSegment[] {
  if (!route.points || route.points.length === 0) {
    return [];
  }

  const segments: MapSegment[] = [];
  let currentSegment: MapSegment | null = null;

  for (let i = 0; i < route.points.length; i++) {
    const point = route.points[i];
    const mapId = getDisplayMapId(point);
    const config = MAP_CONFIGS[mapId] || MAP_CONFIGS[DEFAULT_MAP_ID];

    if (!currentSegment || currentSegment.mapId !== mapId) {
      // Start new segment
      if (currentSegment) {
        currentSegment.endIndex = i - 1;
        segments.push(currentSegment);
      }

      currentSegment = {
        mapId: mapId,
        mapName: config.name,
        startIndex: i,
        endIndex: i,
        points: [point],
      };
    } else {
      // Continue current segment
      currentSegment.points.push(point);
      currentSegment.endIndex = i;
    }
  }

  // Push last segment
  if (currentSegment) {
    segments.push(currentSegment);
  }

  return segments;
}

// Filter route points for a specific display map
export function filterPointsByMap(
  route: Route,
  mapId: string
): RoutePoint[] {
  if (!route.points) {
    return [];
  }

  return route.points.filter(
    (point) => isValidPoint(point) && getDisplayMapId(point) === mapId
  );
}

// Get the initial display map for a route (first point's map based on coordinates)
export function getInitialMap(route: Route): string {
  if (!route.points || route.points.length === 0) {
    return DEFAULT_MAP_ID;
  }
  return getDisplayMapId(route.points[0]);
}
