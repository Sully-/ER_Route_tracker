import { Route, RoutePoint } from '../types/route';
import { MapConfig, MAP_CONFIGS, DEFAULT_MAP_ID } from './calibration';

export interface MapTransition {
  pointIndex: number;
  fromMapId: string;
  toMapId: string;
  fromMapName: string;
  toMapName: string;
  point: RoutePoint;
}

export interface MapSegment {
  mapId: string;
  mapName: string;
  startIndex: number;
  endIndex: number;
  points: RoutePoint[];
}

// Extract global_map_id from map_id_str if not present (for backward compatibility)
function getGlobalMapId(point: RoutePoint): number {
  // If global_map_id is present, use it
  if (point.global_map_id !== undefined && point.global_map_id !== null) {
    return point.global_map_id;
  }
  
  // Otherwise, extract from map_id_str (e.g., "m60_44_36_00" -> 60, "m61_47_41_00" -> 61)
  if (point.map_id_str) {
    const match = point.map_id_str.match(/^m(\d+)_/);
    if (match) {
      const id = parseInt(match[1], 10);
      if (!isNaN(id)) {
        return id;
      }
    }
  }
  
  // Default to 60 (Lands Between) if parsing fails
  return 60;
}

// Get the display map ID for a point using global_map_id field
// 60 = Lands Between (m60), 61 = Shadow Realm (m61), 62 = Underground (m62)
export function getDisplayMapId(point: RoutePoint): string {
  const globalMapId = getGlobalMapId(point);
  if (globalMapId === 62) {
    return 'm62';
  }
  if (globalMapId === 61) {
    return 'm61';
  }
  return 'm60'; // Default to Lands Between
}

// Detect the display map config for a point
export function detectDisplayMapForPoint(point: RoutePoint): MapConfig {
  const mapId = getDisplayMapId(point);
  return MAP_CONFIGS[mapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
}

// Detect all map transitions in a route based on global coordinates
export function detectMapTransitions(route: Route): MapTransition[] {
  if (!route.points || route.points.length < 2) {
    return [];
  }

  const transitions: MapTransition[] = [];
  let currentMapId = getDisplayMapId(route.points[0]);

  for (let i = 1; i < route.points.length; i++) {
    const point = route.points[i];
    const newMapId = getDisplayMapId(point);

    if (newMapId !== currentMapId) {
      const fromConfig = MAP_CONFIGS[currentMapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
      const toConfig = MAP_CONFIGS[newMapId] || MAP_CONFIGS[DEFAULT_MAP_ID];

      transitions.push({
        pointIndex: i,
        fromMapId: currentMapId,
        toMapId: newMapId,
        fromMapName: fromConfig.name,
        toMapName: toConfig.name,
        point: point,
      });

      currentMapId = newMapId;
    }
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

  return route.points.filter((point) => getDisplayMapId(point) === mapId);
}

// Get the initial display map for a route (first point's map based on coordinates)
export function getInitialMap(route: Route): string {
  if (!route.points || route.points.length === 0) {
    return DEFAULT_MAP_ID;
  }
  return getDisplayMapId(route.points[0]);
}

// Unified Jump interface for both teleports (same map) and transitions (different maps)
export interface Jump {
  departureCoord: { x: number; z: number };
  arrivalCoord: { x: number; z: number };
  departureMapId: string;  // ex: 'm60'
  arrivalMapId: string;    // ex: 'm60' (TP) or 'm61' (transition)
  departureMapName: string;
  arrivalMapName: string;
  isTransition: boolean;   // true if maps are different
  routeId?: string;        // Optional: ID of the route this jump belongs to
}

// Detect all jumps (teleports + transitions) in a route
// A jump is detected when:
// - global_map_id changes (transition between maps)
// - OR distance > threshold on the same map (teleport)
const TELEPORT_THRESHOLD = 500;

export function detectAllJumps(route: Route, routeId?: string): Jump[] {
  if (!route.points || route.points.length < 2) {
    return [];
  }

  const jumps: Jump[] = [];
  
  // Track the last valid point to handle (0,0,0) points during transitions
  let lastValidPoint: RoutePoint | null = null;
  
  for (let i = 0; i < route.points.length; i++) {
    const currPoint = route.points[i];
    
    // Skip invalid points (0, 0, 0) but keep tracking
    if (currPoint.global_x === 0 && currPoint.global_z === 0) {
      continue;
    }
    
    // If we have a previous valid point, check for jump
    if (lastValidPoint) {
      const prevMapId = getDisplayMapId(lastValidPoint);
      const currMapId = getDisplayMapId(currPoint);
      
      const isTransition = prevMapId !== currMapId;
      
      // Calculate distance for same-map teleport detection
      const dx = currPoint.global_x - lastValidPoint.global_x;
      const dz = currPoint.global_z - lastValidPoint.global_z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      const isTeleport = !isTransition && distance > TELEPORT_THRESHOLD;
      
      if (isTransition || isTeleport) {
        const fromConfig = MAP_CONFIGS[prevMapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
        const toConfig = MAP_CONFIGS[currMapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
        
        jumps.push({
          departureCoord: { x: lastValidPoint.global_x, z: lastValidPoint.global_z },
          arrivalCoord: { x: currPoint.global_x, z: currPoint.global_z },
          departureMapId: prevMapId,
          arrivalMapId: currMapId,
          departureMapName: fromConfig.name,
          arrivalMapName: toConfig.name,
          isTransition,
          routeId,
        });
      }
    }
    
    // Update last valid point
    lastValidPoint = currPoint;
  }

  return jumps;
}
