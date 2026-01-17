import {
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useMemo,
} from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapContainer.css';
import { Route } from '../../types/route';
import { gameToPixelForMap } from '../../utils/coordinateTransform';
import {
  MapConfig,
  MAP_CONFIGS,
  DEFAULT_MAP_ID,
} from '../../utils/calibration';
import {
  detectAllJumps,
  filterPointsByMap,
  getInitialMap,
  getDisplayMapId,
  Jump,
} from '../../utils/routeAnalysis';
import { useMapIcons } from '../../hooks/useMapIcons';
import { MapIcon, getIconPrimaryText } from '../../types/mapIcons';

export interface MapContainerHandle {
  focusRoute: () => void;
  focusPlayer: (viewKey: string) => void;
  focusStaticRoute: (routeId: string) => void;
}

interface MapContainerProps {
  staticRoutes?: Record<string, Route>;
  staticRouteIds?: string[];
  staticRouteNames?: Record<string, string>;
  realtimeRoutes?: Record<string, Route>;
  viewKeyNames?: Record<string, string>;
  activeMapId?: string;
  onMapChange?: (mapId: string) => void;
  showIcons?: boolean;
  routeColors?: Record<string, string>;
  routeVisibility?: Record<string, boolean>;
  // Active tracking - auto-focus on a specific realtime route
  trackedViewKey?: string | null;
  // Route selection - which route is currently selected (highlighted)
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string | null) => void;
}

// Palette de couleurs FLASHY pour les routes realtime - bien visibles sur la carte
const ROUTE_COLORS = [
  '#ff4444', // Rouge vif
  '#44ff44', // Vert vif
  '#4488ff', // Bleu vif
  '#ffaa00', // Orange vif
  '#ff44ff', // Magenta
  '#00ffff', // Cyan
  '#ffff44', // Jaune vif
  '#ff8844', // Orange foncé
];

function getColorForViewKey(
  viewKey: string,
  viewKeys: string[],
  routeColors?: Record<string, string>
): string {
  // Use custom color if available
  if (routeColors && routeColors[viewKey]) {
    return routeColors[viewKey];
  }
  // Fallback to default palette
  const index = viewKeys.indexOf(viewKey);
  return ROUTE_COLORS[index >= 0 ? index % ROUTE_COLORS.length : 0];
}

const MapContainer = forwardRef<MapContainerHandle, MapContainerProps>(
  ({ staticRoutes = {}, staticRouteIds = [], staticRouteNames = {}, realtimeRoutes, viewKeyNames = {}, activeMapId: propActiveMapId, onMapChange: propOnMapChange, showIcons: propShowIcons, routeColors, routeVisibility = {}, trackedViewKey, selectedRouteId, onSelectRoute }, ref) => {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const routeLayerRef = useRef<L.Polyline | null>(null);
    const glowLayerRef = useRef<L.Polyline | null>(null);
    const startMarkersRef = useRef<L.CircleMarker[]>([]);
    const endMarkersRef = useRef<L.CircleMarker[]>([]);
    const transitionMarkersRef = useRef<L.Marker[]>([]);
    const teleportMarkersRef = useRef<L.Marker[]>([]);
    const segmentPolylinesRef = useRef<L.Polyline[]>([]);
    const iconMarkersRef = useRef<L.Marker[]>([]);
    const iconLayerGroupRef = useRef<L.LayerGroup | null>(null);

    // Use props if provided, otherwise use local state
    const [internalActiveMapId, setInternalActiveMapId] = useState<string>(DEFAULT_MAP_ID);
    const [internalShowIcons, _setInternalShowIcons] = useState<boolean>(true);
    
    const activeMapId = propActiveMapId !== undefined ? propActiveMapId : internalActiveMapId;
    const showIcons = propShowIcons !== undefined ? propShowIcons : internalShowIcons;
    
    const [pendingZoomTarget, setPendingZoomTarget] = useState<{ x: number; z: number } | null>(null);

    // Use prop callbacks if provided, otherwise use local state
    const handleMapChange = useCallback((mapId: string) => {
      if (propOnMapChange) {
        propOnMapChange(mapId);
      } else {
        setInternalActiveMapId(mapId);
      }
    }, [propOnMapChange]);

    // Load map icons
    const { icons, isLoading: iconsLoading } = useMapIcons({ mapId: activeMapId });

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

      if (routeLayerRef.current) {
        map.removeLayer(routeLayerRef.current);
        routeLayerRef.current = null;
      }
      if (glowLayerRef.current) {
        map.removeLayer(glowLayerRef.current);
        glowLayerRef.current = null;
      }
      // Clear start markers
      startMarkersRef.current.forEach((marker) => {
        map.removeLayer(marker);
      });
      startMarkersRef.current = [];

      // Clear end markers
      endMarkersRef.current.forEach((marker) => {
        map.removeLayer(marker);
      });
      endMarkersRef.current = [];

      // Clear transition markers
      transitionMarkersRef.current.forEach((marker) => {
        map.removeLayer(marker);
      });
      transitionMarkersRef.current = [];

      // Clear teleport markers
      teleportMarkersRef.current.forEach((marker) => {
        map.removeLayer(marker);
      });
      teleportMarkersRef.current = [];

      // Clear segment polylines
      segmentPolylinesRef.current.forEach((polyline) => {
        map.removeLayer(polyline);
      });
      segmentPolylinesRef.current = [];
    }, []);

    // Clear all icon markers
    const clearIconMarkers = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      if (iconLayerGroupRef.current) {
        map.removeLayer(iconLayerGroupRef.current);
        iconLayerGroupRef.current = null;
      }
      iconMarkersRef.current = [];
    }, []);

    // Cache for Leaflet icons
    const iconCache = useMemo(() => new Map<number, L.DivIcon>(), []);

    // Get or create a Leaflet icon for a given iconId
    const getLeafletIcon = useCallback(
      (iconId: number): L.DivIcon => {
        if (iconCache.has(iconId)) {
          return iconCache.get(iconId)!;
        }

        const icon = L.divIcon({
          className: 'map-icon-container',
          html: `<img src="./map_icons/icon_${iconId}.png" style="max-width: 48px; max-height: 48px; object-fit: contain; display: block;">`,
          iconSize: [48, 48],
          iconAnchor: [24, 24],
          popupAnchor: [0, -24],
        });

        iconCache.set(iconId, icon);
        return icon;
      },
      [iconCache]
    );

    // Create popup content for an icon
    const createIconPopup = useCallback((icon: MapIcon): string => {
      const primaryText = getIconPrimaryText(icon);
      const secondaryTexts = icon.texts
        .filter((t) => t.Text !== null && t.Text !== primaryText)
        .map((t) => `<div style="color: ${t.TextType === 0 ? '#fff' : '#aaa'};">${t.Text}</div>`)
        .join('');

      return `
        <div style="text-align: center; min-width: 120px;">
          <b style="font-size: 14px;">${primaryText || 'Location'}</b>
          ${secondaryTexts ? `<div style="margin-top: 4px; font-size: 12px;">${secondaryTexts}</div>` : ''}
          <div style="margin-top: 6px; font-size: 10px; color: #888;">
            (${icon.globalX.toFixed(1)}, ${icon.globalZ.toFixed(1)})
          </div>
        </div>
      `;
    }, []);

    // Switch to a different map, optionally zooming to a specific game coordinate
    const switchMap = useCallback(
      (targetMapId: string, zoomToGameCoord?: { x: number; z: number }) => {
        const map = mapRef.current;
        if (!map) return;

        const newConfig = MAP_CONFIGS[targetMapId];
        if (!newConfig) return;

        console.log(`Switching map from ${activeMapId} to ${targetMapId}`);
        
        // Update parent state if callback provided
        handleMapChange(targetMapId);

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

        // Add new tile layer (cache buster only in dev mode)
        const cacheBuster = import.meta.env.DEV ? `?v=${Date.now()}` : '';
        tileLayerRef.current = L.tileLayer(
          `${newConfig.tilePath}/{z}/{x}/{y}.png${cacheBuster}`,
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
        
        // Set map bounds initially
        map.fitBounds(imageBounds);
        
        // Store the zoom target for later application (after route is drawn)
        if (zoomToGameCoord) {
          console.log(`Setting pending zoom target: (${zoomToGameCoord.x}, ${zoomToGameCoord.z})`);
          setPendingZoomTarget(zoomToGameCoord);
        }
      },
      [activeMapId, handleMapChange]
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

      // Create custom panes for z-index control
      // Default Leaflet panes: tilePane(200), overlayPane(400), shadowPane(500), markerPane(600), tooltipPane(650), popupPane(700)
      map.createPane('mapIconsPane');
      map.getPane('mapIconsPane')!.style.zIndex = '450'; // Below default markers
      
      map.createPane('teleportPane');
      map.getPane('teleportPane')!.style.zIndex = '750'; // Above default markers, below popups

      // Panes for selected route (above everything else)
      map.createPane('selectedRoutePane');
      map.getPane('selectedRoutePane')!.style.zIndex = '800'; // Selected route polylines
      
      map.createPane('selectedMarkersPane');
      map.getPane('selectedMarkersPane')!.style.zIndex = '850'; // Selected route markers

      const southWest = map.unproject([0, config.paddedSize], config.maxZoom);
      const northEast = map.unproject([config.paddedSize, 0], config.maxZoom);
      const tileBounds = new L.LatLngBounds(southWest, northEast);

      // Cache buster for tiles (only in dev mode)
      const cacheBuster = import.meta.env.DEV ? `?v=${Date.now()}` : '';
      tileLayerRef.current = L.tileLayer(
        `${config.tilePath}/{z}/{x}/{y}.png${cacheBuster}`,
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

    // Set initial map based on first route's first point when routes change
    useEffect(() => {
      if (staticRouteIds.length === 0) {
        return;
      }

      const firstRoute = staticRoutes[staticRouteIds[0]];
      if (!firstRoute || !firstRoute.points || firstRoute.points.length === 0) {
        return;
      }

      // Set initial map based on first route's first point
      const initialMap = getInitialMap(firstRoute);
      if (initialMap !== activeMapId) {
        switchMap(initialMap);
      }
    }, [staticRoutes, staticRouteIds]);

    // Helper function to draw a single route with a given color
    const drawRouteWithColor = useCallback((
      routeToDraw: Route,
      color: string,
      map: L.Map,
      config: MapConfig,
      isSelected: boolean = false,
      routeKey?: string,
      selectHandler?: (key: string) => void
    ) => {
      // Filter points for the active map and remove invalid points (0, 0, 0)
      const filteredPoints = filterPointsByMap(routeToDraw, activeMapId).filter(
        (p) => !(p.global_x === 0 && p.global_z === 0)
      );

      if (filteredPoints.length < 2) {
        return;
      }

      // Split route into segments at teleport points (large distance jumps)
      const TELEPORT_THRESHOLD = 500;
      const segments: L.LatLng[][] = [];
      let currentSegment: L.LatLng[] = [];

      for (let i = 0; i < filteredPoints.length; i++) {
        const p = filteredPoints[i];
        const pixel = gameToPixelForMap(p.global_x, p.global_z, config);
        const latLng = pixelToLatLng(pixel.x, pixel.y, config);

        if (i > 0) {
          const prevP = filteredPoints[i - 1];
          const dx = p.global_x - prevP.global_x;
          const dz = p.global_z - prevP.global_z;
          const distance = Math.sqrt(dx * dx + dz * dz);

          if (distance > TELEPORT_THRESHOLD) {
            if (currentSegment.length > 0) {
              segments.push(currentSegment);
            }
            currentSegment = [latLng];
            continue;
          }
        }

        currentSegment.push(latLng);
      }

      if (currentSegment.length > 0) {
        segments.push(currentSegment);
      }

      // Draw each segment
      segments.forEach((segment) => {
        if (segment.length >= 2) {
          // Route principale - opaque
          const main = L.polyline(segment, {
            color: color,
            weight: isSelected ? 6 : 5,
            opacity: 1,
            lineJoin: 'round',
            lineCap: 'round',
            pane: isSelected ? 'selectedRoutePane' : undefined,
            className: isSelected ? 'route-selected' : undefined,
          }).addTo(map);
          
          // Add click handler if provided
          if (routeKey && selectHandler) {
            main.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              selectHandler(routeKey);
            });
          }
          
          segmentPolylinesRef.current.push(main);
        }
      });

      // Return the last point for player marker in realtime mode
      if (filteredPoints.length > 0) {
        return filteredPoints[filteredPoints.length - 1];
      }
      return null;
    }, [activeMapId, pixelToLatLng]);

    // Draw route when route or active map changes
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      clearRouteLayers();

      const config = getActiveConfig();

      // Calculate all jumps (teleports + transitions) for all visible static routes
      const allJumps: Jump[] = [];
      staticRouteIds.forEach((routeId) => {
        // Skip hidden routes
        if (routeVisibility[routeId] === false) {
          return;
        }
        const route = staticRoutes[routeId];
        if (route && route.points && route.points.length > 0) {
          const routeJumps = detectAllJumps(route, routeId);
          allJumps.push(...routeJumps);
        }
      });

      // Handle realtime routes (draw them first, then static route on top)
      if (realtimeRoutes && Object.keys(realtimeRoutes).length > 0) {
        const viewKeys = Object.keys(realtimeRoutes);
        viewKeys.forEach((viewKey) => {
          // Skip hidden routes
          if (routeVisibility[viewKey] === false) {
            return;
          }
          const rt = realtimeRoutes[viewKey];
          if (rt && rt.points && rt.points.length >= 2) {
            const color = getColorForViewKey(viewKey, viewKeys, routeColors);
            const isSelected = viewKey === selectedRouteId;
            const lastPoint = drawRouteWithColor(
              rt, 
              color, 
              map, 
              config, 
              isSelected, 
              viewKey, 
              onSelectRoute ? (key) => onSelectRoute(key) : undefined
            );
            
            // Add a marker at the current position (last point)
            if (lastPoint) {
              const pixel = gameToPixelForMap(lastPoint.global_x, lastPoint.global_z, config);
              const latLng = pixelToLatLng(pixel.x, pixel.y, config);
              
              const playerMarker = L.circleMarker(latLng, {
                radius: isSelected ? 14 : 12,
                fillColor: color,
                color: isSelected ? color : '#ffffff',
                weight: isSelected ? 4 : 3,
                opacity: 1,
                fillOpacity: 1,
                pane: isSelected ? 'selectedMarkersPane' : 'teleportPane',
                className: isSelected ? 'realtime-player-marker marker-selected' : 'realtime-player-marker',
              }).addTo(map);
              
              // Use custom name if available, otherwise use truncated viewKey
              const playerName = viewKeyNames[viewKey]?.trim() || `${viewKey.substring(0, 8)}...${viewKey.substring(viewKey.length - 4)}`;
              playerMarker.bindTooltip(playerName, {
                direction: 'top',
                offset: [0, -10],
                permanent: true,
              });
              
              // Click to select route
              playerMarker.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                onSelectRoute?.(viewKey);
              });
              
              teleportMarkersRef.current.push(playerMarker as unknown as L.Marker);
            }
          }
        });
        console.log(`Drew ${viewKeys.length} realtime routes on ${config.name}`);
      }

      // Handle static routes (can coexist with realtime routes)
      if (staticRouteIds.length === 0) {
        // No static routes, no transitions to show
        return;
      }

      // Draw each static route
      staticRouteIds.forEach((routeId, routeIndex) => {
        // Skip hidden routes
        if (routeVisibility[routeId] === false) {
          return;
        }
        const route = staticRoutes[routeId];
        if (!route || !route.points || route.points.length < 2) {
          return;
        }

        // Filter points for the active map and remove invalid points (0, 0, 0)
        const filteredPoints = filterPointsByMap(route, activeMapId).filter(
          (p) => !(p.global_x === 0 && p.global_z === 0)
        );

        if (filteredPoints.length < 2) {
          return;
        }

        // Split route into segments at teleport points (large distance jumps)
        // Jump markers are handled separately by addJumpMarkers
        const TELEPORT_THRESHOLD = 500;
        const segments: L.LatLng[][] = [];
        let currentSegment: L.LatLng[] = [];

        for (let i = 0; i < filteredPoints.length; i++) {
          const p = filteredPoints[i];
          const pixel = gameToPixelForMap(p.global_x, p.global_z, config);
          const latLng = pixelToLatLng(pixel.x, pixel.y, config);

          if (i > 0) {
            const prevP = filteredPoints[i - 1];
            const dx = p.global_x - prevP.global_x;
            const dz = p.global_z - prevP.global_z;
            const distance = Math.sqrt(dx * dx + dz * dz);

            if (distance > TELEPORT_THRESHOLD) {
              if (currentSegment.length > 0) {
                segments.push(currentSegment);
              }
              currentSegment = [latLng];
              continue;
            }
          }

          currentSegment.push(latLng);
        }

        if (currentSegment.length > 0) {
          segments.push(currentSegment);
        }

        // Get color for this route (use routeId from routeColors, or default based on index)
        const routeColor = routeColors?.[routeId] || ROUTE_COLORS[routeIndex % ROUTE_COLORS.length];
        const isSelected = routeId === selectedRouteId;
        
        // Draw each segment as separate polylines
        segments.forEach((segment) => {
          if (segment.length >= 2) {
            const main = L.polyline(segment, {
              color: routeColor,
              weight: isSelected ? 6 : 5,
              opacity: 1,
              lineJoin: 'round',
              lineCap: 'round',
              pane: isSelected ? 'selectedRoutePane' : undefined,
              className: isSelected ? 'route-selected' : undefined,
            }).addTo(map);
            
            // Add click handler to select/deselect the route
            main.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              onSelectRoute?.(routeId);
            });
            
            segmentPolylinesRef.current.push(main);
          }
        });

        // Store first route's first segment for focus functionality
        if (routeIndex === 0 && segments.length > 0 && segments[0].length >= 2) {
          routeLayerRef.current = L.polyline(segments[0], {
            color: 'transparent',
            weight: 0,
          });
        }

        // Start/end markers for ALL routes
        // (Jump markers are handled separately by addJumpMarkers)
        const firstPoint = filteredPoints[0];
        const lastPoint = filteredPoints[filteredPoints.length - 1];
        const isGlobalStart =
          route.points[0].map_id_str === firstPoint.map_id_str &&
          route.points[0].timestamp_ms === firstPoint.timestamp_ms;
        const isGlobalEnd =
          route.points[route.points.length - 1].map_id_str ===
            lastPoint.map_id_str &&
          route.points[route.points.length - 1].timestamp_ms ===
            lastPoint.timestamp_ms;

        // Detect transitions for this specific route (only transitions, not teleports)
        const routeJumps = detectAllJumps(route, routeId);
        const routeTransitions = routeJumps.filter(j => j.isTransition);
        const isStartFromTransition = routeTransitions.some(
          (t) => t.arrivalMapId === activeMapId
        );
        const isEndToTransition = routeTransitions.some(
          (t) => t.departureMapId === activeMapId
        );

        // Get display name for this route (custom name or fallback to route ID prefix)
        const routeDisplayName = staticRouteNames[routeId]?.trim() || routeId.substring(0, 12);

        if (isGlobalStart || !isStartFromTransition) {
          const startPixel = gameToPixelForMap(
            firstPoint.global_x,
            firstPoint.global_z,
            config
          );
          const startMarker = L.circleMarker(
            pixelToLatLng(startPixel.x, startPixel.y, config),
            {
              radius: isSelected ? 14 : 12,
              fillColor: isGlobalStart ? '#8b7355' : '#6b5b4a',
              color: isSelected ? routeColor : '#5a4a3a',
              weight: isSelected ? 3 : 2,
              opacity: 1,
              fillOpacity: 0.9,
              pane: isSelected ? 'selectedMarkersPane' : 'teleportPane',
              className: isSelected ? 'marker-selected' : undefined,
            }
          ).addTo(map);
          startMarker.bindTooltip(
            `${isGlobalStart ? 'Start' : 'Entry'}: ${routeDisplayName}`,
            { direction: 'top', offset: [0, -10] }
          );
          startMarker.bindPopup(
            `<b>${isGlobalStart ? 'Start' : 'Entry'}</b><br>${routeDisplayName}<br><small>${config.name}</small>`
          );
          // Click to select route
          startMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectRoute?.(routeId);
          });
          startMarkersRef.current.push(startMarker);
        }

        if (isGlobalEnd || !isEndToTransition) {
          const endPixel = gameToPixelForMap(
            lastPoint.global_x,
            lastPoint.global_z,
            config
          );
          const endMarker = L.circleMarker(
            pixelToLatLng(endPixel.x, endPixel.y, config),
            {
              radius: isSelected ? 14 : 12,
              fillColor: isGlobalEnd ? '#5c2e2e' : '#6b5b4a',
              color: isSelected ? routeColor : '#4a1f1f',
              weight: isSelected ? 3 : 2,
              opacity: 1,
              fillOpacity: 0.9,
              pane: isSelected ? 'selectedMarkersPane' : 'teleportPane',
              className: isSelected ? 'marker-selected' : undefined,
            }
          ).addTo(map);
          endMarker.bindTooltip(
            `${isGlobalEnd ? 'End' : 'Exit'}: ${routeDisplayName}`,
            { direction: 'top', offset: [0, -10] }
          );
          endMarker.bindPopup(
            `<b>${isGlobalEnd ? 'End' : 'Exit'}</b><br>${routeDisplayName}<br><small>${config.name}</small>`
          );
          // Click to select route
          endMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            onSelectRoute?.(routeId);
          });
          endMarkersRef.current.push(endMarker);
        }

        console.log(
          `Static route ${routeIndex} drawn on ${config.name}: ${filteredPoints.length} points`
        );
      });

      // Add jump markers (teleports + transitions) for all visible routes
      addJumpMarkers(map, config, allJumps);

      // Apply pending zoom target if any (after everything is drawn)
      if (pendingZoomTarget) {
        const pixel = gameToPixelForMap(pendingZoomTarget.x, pendingZoomTarget.z, config);
        const latLng = pixelToLatLng(pixel.x, pixel.y, config);
        setTimeout(() => {
          map.setView(latLng, 6);
        }, 50);
        setPendingZoomTarget(null);
      }
    }, [staticRoutes, staticRouteIds, staticRouteNames, realtimeRoutes, viewKeyNames, activeMapId, getActiveConfig, clearRouteLayers, pixelToLatLng, pendingZoomTarget, drawRouteWithColor, routeColors, routeVisibility, selectedRouteId, onSelectRoute]);

    // Add jump markers (unified: teleports + transitions)
    // Jumps on current map show both departure and arrival markers
    // Jumps to other maps show departure marker (click to switch map)
    // Jumps from other maps show arrival marker (click to go back)
    const addJumpMarkers = (map: L.Map, config: MapConfig, jumps: Jump[]) => {
      if (jumps.length === 0) return;

      // Create icon with optional glow effect for selected routes
      const createDepartureIcon = (isSelected: boolean) => L.divIcon({
        className: `jump-departure ${isSelected ? 'jump-marker-selected' : ''}`,
        html: `<div style="
          width: ${isSelected ? '40px' : '36px'};
          height: ${isSelected ? '40px' : '36px'};
          background: linear-gradient(135deg, #8b5a3a, #6b4a2a);
          border: ${isSelected ? '4px' : '3px'} solid ${isSelected ? '#d4c4a8' : '#5a4a3a'};
          border-radius: 50%;
          box-shadow: ${isSelected 
            ? '0 0 12px rgba(212, 196, 168, 0.8), 0 0 20px rgba(139, 90, 58, 0.6), 0 0 30px rgba(139, 90, 58, 0.4)' 
            : '0 0 8px rgba(139, 90, 58, 0.4), 0 0 15px rgba(139, 90, 58, 0.2)'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isSelected ? '20px' : '18px'};
          color: #d4c4a8;
          cursor: pointer;
          z-index: 10000;
          position: relative;
          ${isSelected ? 'animation: jumpGlow 2s ease-in-out infinite;' : ''}
        ">↗</div>`,
        iconSize: [isSelected ? 40 : 36, isSelected ? 40 : 36],
        iconAnchor: [isSelected ? 20 : 18, isSelected ? 20 : 18],
      });

      const createArrivalIcon = (isSelected: boolean) => L.divIcon({
        className: `jump-arrival ${isSelected ? 'jump-marker-selected' : ''}`,
        html: `<div style="
          width: ${isSelected ? '40px' : '36px'};
          height: ${isSelected ? '40px' : '36px'};
          background: linear-gradient(135deg, #4a4a5a, #3a3a4a);
          border: ${isSelected ? '4px' : '3px'} solid ${isSelected ? '#d4c4a8' : '#5a5a6a'};
          border-radius: 50%;
          box-shadow: ${isSelected 
            ? '0 0 12px rgba(212, 196, 168, 0.8), 0 0 20px rgba(74, 74, 90, 0.6), 0 0 30px rgba(74, 74, 90, 0.4)' 
            : '0 0 8px rgba(74, 74, 90, 0.4), 0 0 15px rgba(74, 74, 90, 0.2)'};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: ${isSelected ? '20px' : '18px'};
          color: #b4a4a8;
          cursor: pointer;
          z-index: 10000;
          position: relative;
          ${isSelected ? 'animation: jumpGlow 2s ease-in-out infinite;' : ''}
        ">↙</div>`,
        iconSize: [isSelected ? 40 : 36, isSelected ? 40 : 36],
        iconAnchor: [isSelected ? 20 : 18, isSelected ? 20 : 18],
      });

      jumps.forEach((jump, index) => {
        const { departureCoord, arrivalCoord, departureMapId, arrivalMapId, isTransition, arrivalMapName, departureMapName, routeId } = jump;
        const isSelected = routeId === selectedRouteId;
        const markerPane = isSelected ? 'selectedMarkersPane' : 'teleportPane';

        // Case 1: Same map teleport - show both markers on current map
        if (!isTransition && departureMapId === activeMapId) {
          // Departure marker
          const depPixel = gameToPixelForMap(departureCoord.x, departureCoord.z, config);
          const depLatLng = pixelToLatLng(depPixel.x, depPixel.y, config);
          
          const depMarker = L.marker(depLatLng, { 
            icon: createDepartureIcon(isSelected),
            pane: markerPane,
            zIndexOffset: isSelected ? 3000 : 2000,
          }).addTo(map);
          
          // Store arrival for click handler
          const arrPixel = gameToPixelForMap(arrivalCoord.x, arrivalCoord.z, config);
          const arrLatLng = pixelToLatLng(arrPixel.x, arrPixel.y, config);
          
          depMarker.bindTooltip(`⚡ TP #${index + 1} Departure → Click to go to arrival`, {
            direction: 'top',
            offset: [0, -10],
          });
          
          depMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (routeId) onSelectRoute?.(routeId);
            map.panTo(arrLatLng);
          });
          
          teleportMarkersRef.current.push(depMarker);

          // Arrival marker
          const arrMarker = L.marker(arrLatLng, { 
            icon: createArrivalIcon(isSelected),
            pane: markerPane,
            zIndexOffset: isSelected ? 3000 : 2000,
          }).addTo(map);
          
          arrMarker.bindTooltip(`⚡ TP #${index + 1} Arrival → Click to go to departure`, {
            direction: 'top',
            offset: [0, -10],
          });
          
          arrMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (routeId) onSelectRoute?.(routeId);
            map.panTo(depLatLng);
          });
          
          teleportMarkersRef.current.push(arrMarker);
        }
        
        // Case 2: Transition - departure is on current map
        if (isTransition && departureMapId === activeMapId) {
          const depPixel = gameToPixelForMap(departureCoord.x, departureCoord.z, config);
          const depLatLng = pixelToLatLng(depPixel.x, depPixel.y, config);
          
          const marker = L.marker(depLatLng, { 
            icon: createDepartureIcon(isSelected),
            pane: markerPane,
            zIndexOffset: isSelected ? 3000 : 2000,
          }).addTo(map);
          
          marker.bindTooltip(`🌍 Transition #${index + 1} → ${arrivalMapName}<br>Click to go there`, {
            direction: 'top',
            offset: [0, -10],
          });
          
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (routeId) onSelectRoute?.(routeId);
            switchMap(arrivalMapId, arrivalCoord);
          });
          
          transitionMarkersRef.current.push(marker);
        }
        
        // Case 3: Transition - arrival is on current map
        if (isTransition && arrivalMapId === activeMapId) {
          const arrPixel = gameToPixelForMap(arrivalCoord.x, arrivalCoord.z, config);
          const arrLatLng = pixelToLatLng(arrPixel.x, arrPixel.y, config);
          
          const marker = L.marker(arrLatLng, { 
            icon: createArrivalIcon(isSelected),
            pane: markerPane,
            zIndexOffset: isSelected ? 3000 : 2000,
          }).addTo(map);
          
          marker.bindTooltip(`🌍 Transition #${index + 1} ← ${departureMapName}<br>Click to go back`, {
            direction: 'top',
            offset: [0, -10],
          });
          
          marker.on('click', (e) => {
            L.DomEvent.stopPropagation(e);
            if (routeId) onSelectRoute?.(routeId);
            switchMap(departureMapId, departureCoord);
          });
          
          transitionMarkersRef.current.push(marker);
        }
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

    // Draw map icons when icons or active map changes
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      // Clear existing icons
      clearIconMarkers();

      // Don't draw if icons are hidden or still loading
      if (!showIcons || iconsLoading || icons.length === 0) {
        return;
      }

      const config = getActiveConfig();

      // Create a layer group for all icons
      iconLayerGroupRef.current = L.layerGroup();

      // Add markers for each icon
      icons.forEach((icon) => {
        try {
          const pixel = gameToPixelForMap(icon.globalX, icon.globalZ, config);
          const latLng = pixelToLatLng(pixel.x, pixel.y, config);

          const leafletIcon = getLeafletIcon(icon.iconId);
          const marker = L.marker(latLng, { 
            icon: leafletIcon,
            pane: 'mapIconsPane', // Use custom pane with lower z-index
          });
          
          marker.bindPopup(createIconPopup(icon));
          
          iconMarkersRef.current.push(marker);
          iconLayerGroupRef.current!.addLayer(marker);
        } catch (err) {
          // Skip icons that fail to render
          console.warn(`Failed to render icon ${icon.id}:`, err);
        }
      });

      // Add layer group to map
      iconLayerGroupRef.current.addTo(map);

      console.log(`Rendered ${iconMarkersRef.current.length} icons on ${config.name}`);

      return () => {
        clearIconMarkers();
      };
    }, [
      icons,
      showIcons,
      iconsLoading,
      activeMapId,
      getActiveConfig,
      pixelToLatLng,
      getLeafletIcon,
      createIconPopup,
      clearIconMarkers,
    ]);

    // Active tracking - auto-focus on the tracked player's position
    // This effect runs whenever the tracked route gets new points
    const lastTrackedTimestampRef = useRef<number | null>(null);
    
    useEffect(() => {
      // Skip if no route is being tracked
      if (!trackedViewKey) {
        lastTrackedTimestampRef.current = null;
        return;
      }

      const map = mapRef.current;
      if (!map) return;

      // Get the tracked route
      const trackedRoute = realtimeRoutes?.[trackedViewKey];
      if (!trackedRoute || !trackedRoute.points || trackedRoute.points.length === 0) {
        return;
      }

      // Get the last point
      const lastPoint = trackedRoute.points[trackedRoute.points.length - 1];
      
      // Skip if we've already focused on this exact point
      if (lastTrackedTimestampRef.current === lastPoint.timestamp_ms) {
        return;
      }
      
      // Update the last tracked timestamp
      lastTrackedTimestampRef.current = lastPoint.timestamp_ms;

      // Determine which map the player is on
      const pointMapId = getDisplayMapId(lastPoint);
      
      // If player is on a different map, switch to that map
      if (pointMapId !== activeMapId) {
        console.log(`[Active Tracking] Player changed map: ${activeMapId} -> ${pointMapId}`);
        switchMap(pointMapId, { x: lastPoint.global_x, z: lastPoint.global_z });
        return; // switchMap will handle the focus via pendingZoomTarget
      }

      // Player is on the current map - focus on their position
      const config = getActiveConfig();
      const pixel = gameToPixelForMap(lastPoint.global_x, lastPoint.global_z, config);
      const latLng = pixelToLatLng(pixel.x, pixel.y, config);
      
      // Smooth pan to the player's position
      map.setView(latLng, 7, { animate: true, duration: 0.3 });
    }, [trackedViewKey, realtimeRoutes, activeMapId, getActiveConfig, pixelToLatLng, switchMap]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focusRoute: () => {
        const map = mapRef.current;
        if (!map) return;

        const config = getActiveConfig();

        // Priority: realtime routes > static routes
        if (realtimeRoutes && Object.keys(realtimeRoutes).length > 0) {
          // Collect all last points from all players on the current map
          const playerPointsOnCurrentMap: L.LatLng[] = [];
          const playerPointsOnOtherMaps: Map<string, L.LatLng[]> = new Map();

          Object.entries(realtimeRoutes).forEach(([_viewKey, rt]) => {
            if (rt && rt.points && rt.points.length > 0) {
              const lastPoint = rt.points[rt.points.length - 1];
              const pointMapId = getDisplayMapId(lastPoint);
              
              const pixel = gameToPixelForMap(lastPoint.global_x, lastPoint.global_z, config);
              const latLng = pixelToLatLng(pixel.x, pixel.y, config);
              
              if (pointMapId === activeMapId) {
                playerPointsOnCurrentMap.push(latLng);
              } else {
                if (!playerPointsOnOtherMaps.has(pointMapId)) {
                  playerPointsOnOtherMaps.set(pointMapId, []);
                }
                playerPointsOnOtherMaps.get(pointMapId)!.push(latLng);
              }
            }
          });

          // If we have players on current map, fit bounds to show all of them
          if (playerPointsOnCurrentMap.length > 0) {
            if (playerPointsOnCurrentMap.length === 1) {
              // Single player: zoom close on that player
              map.setView(playerPointsOnCurrentMap[0], 7);
            } else {
              // Multiple players: fit bounds to show all players
              const bounds = L.latLngBounds(playerPointsOnCurrentMap);
              map.fitBounds(bounds, {
                padding: [100, 100],
                maxZoom: 7, // Limit max zoom to stay close
              });
            }
            return;
          }

          // If no players on current map, switch to map with most players
          if (playerPointsOnOtherMaps.size > 0) {
            let bestMapId = '';
            let maxPlayers = 0;
            
            playerPointsOnOtherMaps.forEach((points, mapId) => {
              if (points.length > maxPlayers) {
                maxPlayers = points.length;
                bestMapId = mapId;
              }
            });

            if (bestMapId) {
              handleMapChange(bestMapId);
              setTimeout(() => {
                const points = playerPointsOnOtherMaps.get(bestMapId)!;
                
                if (points.length === 1) {
                  // Single player: zoom close
                  if (mapRef.current) {
                    mapRef.current.setView(points[0], 7);
                  }
                } else {
                  // Multiple players: fit bounds
                  const bounds = L.latLngBounds(points);
                  if (mapRef.current) {
                    mapRef.current.fitBounds(bounds, {
                      padding: [100, 100],
                      maxZoom: 7,
                    });
                  }
                }
              }, 100);
            }
          }
          return;
        }

        // Fallback: first static route - zoom to last point
        const firstRoute = staticRouteIds.length > 0 ? staticRoutes[staticRouteIds[0]] : null;
        if (firstRoute && firstRoute.points && firstRoute.points.length > 0) {
          const lastPoint = firstRoute.points[firstRoute.points.length - 1];
          const pointMapId = getDisplayMapId(lastPoint);
          
          // Switch map if needed
          if (pointMapId !== activeMapId) {
            handleMapChange(pointMapId);
            setTimeout(() => {
              const newConfig = MAP_CONFIGS[pointMapId] || config;
              const pixel = gameToPixelForMap(lastPoint.global_x, lastPoint.global_z, newConfig);
              const latLng = pixelToLatLng(pixel.x, pixel.y, newConfig);
              if (mapRef.current) {
                mapRef.current.setView(latLng, 7); // Closer zoom
              }
            }, 100);
          } else {
            // Filter points for current map
            const filteredPoints = filterPointsByMap(firstRoute, activeMapId).filter(
              (p) => !(p.global_x === 0 && p.global_z === 0)
            );
            
            if (filteredPoints.length > 0) {
              const lastFilteredPoint = filteredPoints[filteredPoints.length - 1];
              const pixel = gameToPixelForMap(lastFilteredPoint.global_x, lastFilteredPoint.global_z, config);
              const latLng = pixelToLatLng(pixel.x, pixel.y, config);
              map.setView(latLng, 7); // Closer zoom
            }
          }
          return;
        }

        // Fallback: if we have a route layer, use fitBounds
        if (routeLayerRef.current) {
          map.fitBounds(routeLayerRef.current.getBounds(), {
            padding: [50, 50],
          });
        }
      },
      focusPlayer: (viewKey: string) => {
        const map = mapRef.current;
        if (!map) return;

        const config = getActiveConfig();

        // Find the specific player's route
        if (realtimeRoutes && realtimeRoutes[viewKey]) {
          const rt = realtimeRoutes[viewKey];
          if (rt && rt.points && rt.points.length > 0) {
            const lastPoint = rt.points[rt.points.length - 1];
            const pointMapId = getDisplayMapId(lastPoint);
            
            // Switch map if needed
            if (pointMapId !== activeMapId) {
              handleMapChange(pointMapId);
              setTimeout(() => {
                const newConfig = MAP_CONFIGS[pointMapId] || config;
                const pixel = gameToPixelForMap(lastPoint.global_x, lastPoint.global_z, newConfig);
                const latLng = pixelToLatLng(pixel.x, pixel.y, newConfig);
                if (mapRef.current) {
                  mapRef.current.setView(latLng, 7);
                }
              }, 100);
            } else {
              // Zoom to this specific player on current map
              const pixel = gameToPixelForMap(lastPoint.global_x, lastPoint.global_z, config);
              const latLng = pixelToLatLng(pixel.x, pixel.y, config);
              map.setView(latLng, 7);
            }
          }
        }
      },
      focusStaticRoute: (routeId: string) => {
        const map = mapRef.current;
        if (!map) return;

        const config = getActiveConfig();

        // Find the specific static route
        const route = staticRoutes[routeId];
        if (route && route.points && route.points.length > 0) {
          // Filter points for current map
          const filteredPoints = filterPointsByMap(route, activeMapId).filter(
            (p) => !(p.global_x === 0 && p.global_z === 0)
          );
          
          if (filteredPoints.length > 0) {
            // Fit bounds to show entire route on current map
            const latLngs = filteredPoints.map(p => {
              const pixel = gameToPixelForMap(p.global_x, p.global_z, config);
              return pixelToLatLng(pixel.x, pixel.y, config);
            });
            
            const bounds = L.latLngBounds(latLngs);
            map.fitBounds(bounds, {
              padding: [50, 50],
              maxZoom: 7,
            });
          } else {
            // No points on current map, switch to map with first point (start of route)
            const firstRoutePoint = route.points[0];
            const pointMapId = getDisplayMapId(firstRoutePoint);
            
            if (pointMapId !== activeMapId) {
              handleMapChange(pointMapId);
              setTimeout(() => {
                const newConfig = MAP_CONFIGS[pointMapId] || config;
                const newFilteredPoints = filterPointsByMap(route, pointMapId).filter(
                  (p) => !(p.global_x === 0 && p.global_z === 0)
                );
                
                if (newFilteredPoints.length > 0 && mapRef.current) {
                  const latLngs = newFilteredPoints.map(p => {
                    const pixel = gameToPixelForMap(p.global_x, p.global_z, newConfig);
                    return pixelToLatLng(pixel.x, pixel.y, newConfig);
                  });
                  
                  const bounds = L.latLngBounds(latLngs);
                  mapRef.current.fitBounds(bounds, {
                    padding: [50, 50],
                    maxZoom: 7,
                  });
                }
              }, 100);
            }
          }
        }
      },
    }), [realtimeRoutes, staticRoutes, staticRouteIds, activeMapId, getActiveConfig, pixelToLatLng, handleMapChange]);

    return (
      <div className="map-wrapper">
        <div ref={containerRef} className="map-container" />
      </div>
    );
  }
);

MapContainer.displayName = 'MapContainer';

export default MapContainer;
