import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route, RoutePoint } from '../../types/route';
import { gameToPixelForMap } from '../../utils/coordinateTransform';
import {
  MapConfig,
  MAP_CONFIGS,
  DEFAULT_MAP_ID,
} from '../../utils/calibration';
import {
  detectMapTransitions,
  getInitialMap,
  isValidPoint,
  getDisplayMapId,
  MapTransition,
} from '../../utils/routeAnalysis';

export interface MapContainerHandle {
  focusRoute: () => void;
}

interface MapContainerProps {
  route: Route | null;
}

// Helper to group consecutive points on the same map into segments
// This ensures we don't draw lines between non-consecutive points
function getConsecutiveSegments(
  route: Route,
  mapId: string
): RoutePoint[][] {
  if (!route.points || route.points.length === 0) {
    return [];
  }

  const segments: RoutePoint[][] = [];
  let currentSegment: RoutePoint[] = [];

  for (const point of route.points) {
    // Skip invalid points
    if (!isValidPoint(point)) {
      // If we have a segment in progress, end it
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
      continue;
    }

    const pointMapId = getDisplayMapId(point);
    
    if (pointMapId === mapId) {
      // Point belongs to the target map, add to current segment
      currentSegment.push(point);
    } else {
      // Point belongs to another map, end current segment if any
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
        currentSegment = [];
      }
    }
  }

  // Don't forget the last segment
  if (currentSegment.length > 0) {
    segments.push(currentSegment);
  }

  return segments;
}

const MapContainer = forwardRef<MapContainerHandle, MapContainerProps>(
  ({ route }, ref) => {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const routeLayersRef = useRef<L.Polyline[]>([]); // Array for multiple segments
    const glowLayersRef = useRef<L.Polyline[]>([]); // Array for multiple segments
    const teleportLinesRef = useRef<L.Polyline[]>([]); // Dashed lines for teleports between segments
    const startMarkerRef = useRef<L.CircleMarker | null>(null);
    const endMarkerRef = useRef<L.CircleMarker | null>(null);
    const transitionMarkersRef = useRef<L.Marker[]>([]);

    const [activeMapId, setActiveMapId] = useState<string>(DEFAULT_MAP_ID);
    const [transitions, setTransitions] = useState<MapTransition[]>([]);

    // Get current map config
    const getActiveConfig = useCallback((): MapConfig => {
      return MAP_CONFIGS[activeMapId] || MAP_CONFIGS[DEFAULT_MAP_ID];
    }, [activeMapId]);

    // Helper function to convert pixel to LatLng for a specific config
    const pixelToLatLng = useCallback(
      (
        pixelX: number,
        pixelY: number,
        config: MapConfig
      ): L.LatLng => {
        if (!mapRef.current) return L.latLng(0, 0);
        return mapRef.current.unproject([pixelX, pixelY], config.maxZoom);
      },
      []
    );

    // Clear all route-related layers
    const clearRouteLayers = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      // Clear all route polylines (multiple segments)
      routeLayersRef.current.forEach((layer) => {
        map.removeLayer(layer);
      });
      routeLayersRef.current = [];

      // Clear all glow polylines (multiple segments)
      glowLayersRef.current.forEach((layer) => {
        map.removeLayer(layer);
      });
      glowLayersRef.current = [];

      // Clear teleport/jump lines between segments
      teleportLinesRef.current.forEach((layer) => {
        map.removeLayer(layer);
      });
      teleportLinesRef.current = [];

      if (startMarkerRef.current) {
        map.removeLayer(startMarkerRef.current);
        startMarkerRef.current = null;
      }
      if (endMarkerRef.current) {
        map.removeLayer(endMarkerRef.current);
        endMarkerRef.current = null;
      }

      // Clear transition markers
      transitionMarkersRef.current.forEach((marker) => {
        map.removeLayer(marker);
      });
      transitionMarkersRef.current = [];
    }, []);

    // Switch to a different map
    const switchMap = useCallback(
      (targetMapId: string) => {
        const map = mapRef.current;
        if (!map) return;

        const newConfig = MAP_CONFIGS[targetMapId];
        if (!newConfig) return;

        console.log(`Switching map from ${activeMapId} to ${targetMapId}`);

        // Remove old tile layer
        if (tileLayerRef.current) {
          map.removeLayer(tileLayerRef.current);
        }

        // Update max zoom
        map.setMaxZoom(newConfig.maxZoom);

        // Calculate new bounds
        const southWest = map.unproject(
          [0, newConfig.paddedSize],
          newConfig.maxZoom
        );
        const northEast = map.unproject(
          [newConfig.paddedSize, 0],
          newConfig.maxZoom
        );
        const tileBounds = new L.LatLngBounds(southWest, northEast);

        // Add new tile layer
        const cacheBuster = Date.now();
        tileLayerRef.current = L.tileLayer(
          `${newConfig.tilePath}/{z}/{x}/{y}.jpg?v=${cacheBuster}`,
          {
            minZoom: 0,
            maxZoom: newConfig.maxZoom,
            tileSize: newConfig.tileSize,
            noWrap: true,
            bounds: tileBounds,
          }
        ).addTo(map);

        // Calculate bounds for actual image (not padded)
        const imageSouthWest = map.unproject(
          [0, newConfig.height],
          newConfig.maxZoom
        );
        const imageNorthEast = map.unproject(
          [newConfig.width, 0],
          newConfig.maxZoom
        );
        const imageBounds = new L.LatLngBounds(imageSouthWest, imageNorthEast);

        map.setMaxBounds(imageBounds.pad(0.02));
        map.fitBounds(imageBounds);

        setActiveMapId(targetMapId);
      },
      [activeMapId]
    );

    // Initialize map
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const config = getActiveConfig();

      const map = L.map(containerRef.current, {
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: config.maxZoom,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
      });

      const southWest = map.unproject([0, config.paddedSize], config.maxZoom);
      const northEast = map.unproject([config.paddedSize, 0], config.maxZoom);
      const tileBounds = new L.LatLngBounds(southWest, northEast);

      // Cache buster for tiles
      const cacheBuster = Date.now();
      tileLayerRef.current = L.tileLayer(
        `${config.tilePath}/{z}/{x}/{y}.jpg?v=${cacheBuster}`,
        {
          minZoom: 0,
          maxZoom: config.maxZoom,
          tileSize: config.tileSize,
          noWrap: true,
          bounds: tileBounds,
        }
      ).addTo(map);

      // Calculate bounds for actual image (not padded)
      const imageSouthWest = map.unproject([0, config.height], config.maxZoom);
      const imageNorthEast = map.unproject([config.width, 0], config.maxZoom);
      const imageBounds = new L.LatLngBounds(imageSouthWest, imageNorthEast);

      map.fitBounds(imageBounds);
      map.setMaxBounds(imageBounds.pad(0.02));

      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
      };
    }, [getActiveConfig]);

    // Detect transitions when route changes
    useEffect(() => {
      if (!route || !route.points || route.points.length === 0) {
        setTransitions([]);
        return;
      }

      const detectedTransitions = detectMapTransitions(route);
      setTransitions(detectedTransitions);

      // Set initial map based on route's first point
      const initialMap = getInitialMap(route);
      if (initialMap !== activeMapId) {
        switchMap(initialMap);
      }
    }, [route]);

    // Draw route when route or active map changes
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      clearRouteLayers();

      if (!route || !route.points || route.points.length < 2) {
        return;
      }

      const config = getActiveConfig();

      // Get consecutive segments for the active map
      // This ensures we don't draw lines between non-consecutive points
      const segments = getConsecutiveSegments(route, activeMapId);

      if (segments.length === 0) {
        console.log(`No segments for map ${activeMapId}`);
        // Still show transition markers
        addTransitionMarkers(map, config);
        return;
      }

      // Draw each segment separately
      let totalPoints = 0;
      for (const segment of segments) {
        if (segment.length < 2) {
          // Single point segments don't need a line
          totalPoints += segment.length;
          continue;
        }

        // Convert game coordinates to Leaflet coordinates for this segment
        const latLngs = segment.map((p) => {
          const pixel = gameToPixelForMap(p.global_x, p.global_z, config);
          return pixelToLatLng(pixel.x, pixel.y, config);
        });

        // Glow effect (wider, semi-transparent)
        const glowLayer = L.polyline(latLngs, {
          color: '#00ff00',
          weight: 12,
          opacity: 0.3,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(map);
        glowLayersRef.current.push(glowLayer);

        // Main route polyline
        const routeLayer = L.polyline(latLngs, {
          color: '#00ff00',
          weight: 6,
          opacity: 0.8,
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(map);
        routeLayersRef.current.push(routeLayer);

        totalPoints += segment.length;
      }

      // Draw dashed teleport lines between consecutive segments on the same map
      // This shows jumps/teleports that happened while staying on the same global map
      for (let i = 0; i < segments.length - 1; i++) {
        const currentSegment = segments[i];
        const nextSegment = segments[i + 1];

        if (currentSegment.length === 0 || nextSegment.length === 0) continue;

        // Get the last point of current segment and first point of next segment
        const fromPoint = currentSegment[currentSegment.length - 1];
        const toPoint = nextSegment[0];

        // Convert to pixel coordinates
        const fromPixel = gameToPixelForMap(fromPoint.global_x, fromPoint.global_z, config);
        const toPixel = gameToPixelForMap(toPoint.global_x, toPoint.global_z, config);

        // Convert to LatLng
        const fromLatLng = pixelToLatLng(fromPixel.x, fromPixel.y, config);
        const toLatLng = pixelToLatLng(toPixel.x, toPixel.y, config);

        // Draw dashed line for teleport/jump
        const teleportLine = L.polyline([fromLatLng, toLatLng], {
          color: '#ffaa00', // Orange color for teleport
          weight: 4,
          opacity: 0.7,
          dashArray: '10, 10', // Dashed pattern
          lineJoin: 'round',
          lineCap: 'round',
        }).addTo(map);
        teleportLinesRef.current.push(teleportLine);

        // Add arrow marker at the destination to show direction
        const arrowIcon = L.divIcon({
          className: 'teleport-arrow',
          html: `<div style="
            width: 0;
            height: 0;
            border-left: 8px solid transparent;
            border-right: 8px solid transparent;
            border-bottom: 12px solid #ffaa00;
            transform: rotate(${Math.atan2(
              toPixel.y - fromPixel.y,
              toPixel.x - fromPixel.x
            ) * 180 / Math.PI + 90}deg);
            filter: drop-shadow(0 0 2px rgba(0,0,0,0.5));
          "></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });

        const arrowMarker = L.marker(toLatLng, { icon: arrowIcon }).addTo(map);
        transitionMarkersRef.current.push(arrowMarker);
      }

      // Find global start and end points across all segments
      const allPoints = segments.flat();
      const firstPoint = allPoints[0];
      const lastPoint = allPoints[allPoints.length - 1];
      
      const isGlobalStart =
        route.points[0].map_id_str === firstPoint.map_id_str &&
        route.points[0].timestamp_ms === firstPoint.timestamp_ms;
      const isGlobalEnd =
        route.points[route.points.length - 1].map_id_str ===
          lastPoint.map_id_str &&
        route.points[route.points.length - 1].timestamp_ms ===
          lastPoint.timestamp_ms;

      // Check if there's a transition marker at the start/end points
      const hasTransitionAtStart = transitions.some(
        (t) =>
          (t.fromMapId === activeMapId &&
            t.point.timestamp_ms === firstPoint.timestamp_ms) ||
          (t.toMapId === activeMapId &&
            t.destinationPoint.timestamp_ms === firstPoint.timestamp_ms)
      );
      const hasTransitionAtEnd = transitions.some(
        (t) =>
          (t.fromMapId === activeMapId &&
            t.point.timestamp_ms === lastPoint.timestamp_ms) ||
          (t.toMapId === activeMapId &&
            t.destinationPoint.timestamp_ms === lastPoint.timestamp_ms)
      );

      // Start marker (only if no transition marker at this location)
      if (!hasTransitionAtStart) {
        const startPixel = gameToPixelForMap(
          firstPoint.global_x,
          firstPoint.global_z,
          config
        );
        startMarkerRef.current = L.circleMarker(
          pixelToLatLng(startPixel.x, startPixel.y, config),
          {
            radius: 12,
            fillColor: isGlobalStart ? '#00ff00' : '#ffaa00',
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 1,
          }
        ).addTo(map);
        startMarkerRef.current.bindPopup(
          `<b>${isGlobalStart ? 'Start' : 'Entry'}</b><br>${config.name}`
        );
      }

      // End marker (only if no transition marker at this location)
      if (!hasTransitionAtEnd) {
        const endPixel = gameToPixelForMap(
          lastPoint.global_x,
          lastPoint.global_z,
          config
        );
        endMarkerRef.current = L.circleMarker(
          pixelToLatLng(endPixel.x, endPixel.y, config),
          {
            radius: 12,
            fillColor: isGlobalEnd ? '#ff0000' : '#ffaa00',
            color: '#ffffff',
            weight: 3,
            opacity: 1,
            fillOpacity: 1,
          }
        ).addTo(map);
        endMarkerRef.current.bindPopup(
          `<b>${isGlobalEnd ? 'End' : 'Exit'}</b><br>${config.name}`
        );
      }

      // Add transition markers
      addTransitionMarkers(map, config);

      console.log(
        `Route drawn on ${config.name}: ${segments.length} segments, ${totalPoints} points`
      );
    }, [route, activeMapId, getActiveConfig, clearRouteLayers, pixelToLatLng]);

    // Add transition markers for other maps
    const addTransitionMarkers = (map: L.Map, config: MapConfig) => {
      if (transitions.length === 0) return;

      // Create forward transition icon (go to next map)
      const forwardIcon = L.divIcon({
        className: 'transition-marker-forward',
        html: `<div style="
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #10b981, #3b82f6);
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(16, 185, 129, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          font-weight: bold;
        ">→</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      // Create backward transition icon (go back to previous map)
      const backwardIcon = L.divIcon({
        className: 'transition-marker-backward',
        html: `<div style="
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #f59e0b, #ef4444);
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 12px rgba(245, 158, 11, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 18px;
          font-weight: bold;
        ">←</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      transitions.forEach((transition) => {
        // Determine which map this transition is visible on
        const fromPrefix = transition.fromMapId;
        const toPrefix = transition.toMapId;

        let showMarker = false;
        let targetMapId = '';
        let labelText = '';
        let pointToUse: RoutePoint | null = null;
        let isForward = false; // true = forward (→), false = backward (←)

        if (fromPrefix === activeMapId) {
          // We're on the source map - show forward marker at last point on this map
          showMarker = true;
          targetMapId = toPrefix;
          labelText = `Continue to ${transition.toMapName}`;
          pointToUse = transition.point;
          isForward = true;
        } else if (toPrefix === activeMapId) {
          // We're on the destination map - show backward marker at first point on this map
          showMarker = true;
          targetMapId = fromPrefix;
          labelText = `Return to ${transition.fromMapName}`;
          pointToUse = transition.destinationPoint;
          isForward = false;
        }

        if (!showMarker || !pointToUse) {
          return; // Skip - not on a relevant map
        }

        const point = pointToUse;
        
        // Skip if point is invalid (m255 or zero coordinates)
        if (!isValidPoint(point)) {
          console.warn('Skipping transition marker for invalid point:', point);
          return; // Skip this transition
        }
        
        // Always use the config of the map where we're currently viewing (activeMapId)
        // The point's coordinates are global, so we convert them using the current map's calibration
        const pixel = gameToPixelForMap(
          point.global_x,
          point.global_z,
          config
        );
        
        // Skip if pixel coordinates are invalid (NaN or out of bounds)
        if (isNaN(pixel.x) || isNaN(pixel.y) || pixel.x < 0 || pixel.y < 0) {
          console.warn('Skipping transition marker for invalid pixel coordinates:', pixel);
          return; // Skip this transition
        }
        
        // Check if pixel is within current map bounds (with some margin)
        const margin = 500; // Allow markers slightly outside bounds
        if (pixel.x < -margin || pixel.x > config.width + margin || 
            pixel.y < -margin || pixel.y > config.height + margin) {
          // Point is not visible on current map, skip marker
          return;
        }
        
        const latLng = pixelToLatLng(pixel.x, pixel.y, config);
        const icon = isForward ? forwardIcon : backwardIcon;

        const marker = L.marker(latLng, { icon }).addTo(map);

        // Bind popup with click action
        marker.bindPopup(
          `<div style="text-align: center;">
            <b>Map Transition</b><br>
            <span style="color: #666;">${labelText}</span><br>
            <button onclick="window.dispatchEvent(new CustomEvent('switchMap', { detail: '${targetMapId}' }))"
              style="
                margin-top: 8px;
                padding: 6px 12px;
                background: linear-gradient(135deg, #9333ea, #3b82f6);
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-weight: bold;
              ">
              Switch Map
            </button>
          </div>`
        );

        // Also handle direct click
        marker.on('click', () => {
          switchMap(targetMapId);
        });

        transitionMarkersRef.current.push(marker);
      });
    };

    // Listen for switchMap events from popups
    useEffect(() => {
      const handleSwitchMap = (event: CustomEvent<string>) => {
        switchMap(event.detail);
      };

      window.addEventListener(
        'switchMap',
        handleSwitchMap as EventListener
      );
      return () => {
        window.removeEventListener(
          'switchMap',
          handleSwitchMap as EventListener
        );
      };
    }, [switchMap]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focusRoute: () => {
        if (mapRef.current && routeLayersRef.current.length > 0) {
          // Combine bounds from all route segments
          let bounds: L.LatLngBounds | null = null;
          for (const layer of routeLayersRef.current) {
            const layerBounds = layer.getBounds();
            if (bounds) {
              bounds = bounds.extend(layerBounds);
            } else {
              bounds = layerBounds;
            }
          }
          if (bounds) {
            mapRef.current.fitBounds(bounds, {
              padding: [50, 50],
            });
          }
        }
      },
    }));

    // Get all available maps
    const availableMaps = Object.values(MAP_CONFIGS);

    return (
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        <div ref={containerRef} className="map-container" />
        {/* Map selector */}
        <div
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 1000,
            background: 'rgba(26, 26, 46, 0.95)',
            padding: '12px 16px',
            borderRadius: '10px',
            border: '1px solid rgba(147, 51, 234, 0.4)',
            color: 'white',
            fontSize: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4)',
          }}
        >
          {/* Map buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {availableMaps.map((mapConfig) => (
              <button
                key={mapConfig.id}
                onClick={() => switchMap(mapConfig.id)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '13px',
                  transition: 'all 0.2s ease',
                  background:
                    activeMapId === mapConfig.id
                      ? 'linear-gradient(135deg, #9333ea, #3b82f6)'
                      : 'rgba(255, 255, 255, 0.1)',
                  color: 'white',
                  boxShadow:
                    activeMapId === mapConfig.id
                      ? '0 2px 10px rgba(147, 51, 234, 0.4)'
                      : 'none',
                }}
              >
                {mapConfig.name}
              </button>
            ))}
          </div>
          {/* Transitions info */}
          {transitions.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: 'rgba(255, 255, 255, 0.7)',
              }}
            >
              <span style={{ color: '#9333ea' }}>⟳</span>
              {transitions.length} transition
              {transitions.length > 1 ? 's' : ''} dans la route
            </div>
          )}
        </div>
      </div>
    );
  }
);

MapContainer.displayName = 'MapContainer';

export default MapContainer;
