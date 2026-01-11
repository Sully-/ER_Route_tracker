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
  detectMapTransitions,
  filterPointsByMap,
  getInitialMap,
  getDisplayMapId,
  MapTransition,
} from '../../utils/routeAnalysis';
import { useMapIcons } from '../../hooks/useMapIcons';
import { MapIcon, getIconPrimaryText } from '../../types/mapIcons';

export interface MapContainerHandle {
  focusRoute: () => void;
  focusPlayer: (viewKey: string) => void;
}

interface MapContainerProps {
  route: Route | null;
  realtimeRoutes?: Record<string, Route>;
  viewKeyNames?: Record<string, string>;
  activeMapId?: string;
  onMapChange?: (mapId: string) => void;
  showIcons?: boolean;
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

function getColorForViewKey(viewKey: string, viewKeys: string[]): string {
  const index = viewKeys.indexOf(viewKey);
  return ROUTE_COLORS[index >= 0 ? index % ROUTE_COLORS.length : 0];
}

const MapContainer = forwardRef<MapContainerHandle, MapContainerProps>(
  ({ route, realtimeRoutes, viewKeyNames = {}, activeMapId: propActiveMapId, onMapChange: propOnMapChange, showIcons: propShowIcons }, ref) => {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const tileLayerRef = useRef<L.TileLayer | null>(null);
    const routeLayerRef = useRef<L.Polyline | null>(null);
    const glowLayerRef = useRef<L.Polyline | null>(null);
    const startMarkerRef = useRef<L.CircleMarker | null>(null);
    const endMarkerRef = useRef<L.CircleMarker | null>(null);
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
    
    const [transitions, setTransitions] = useState<MapTransition[]>([]);
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

    // Helper function to draw a single route with a given color
    const drawRouteWithColor = useCallback((
      routeToDraw: Route,
      color: string,
      map: L.Map,
      config: MapConfig
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
            weight: 5,
            opacity: 1,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(map);
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

      // Handle realtime routes
      if (realtimeRoutes && Object.keys(realtimeRoutes).length > 0) {
        const viewKeys = Object.keys(realtimeRoutes);
        viewKeys.forEach((viewKey) => {
          const rt = realtimeRoutes[viewKey];
          if (rt && rt.points && rt.points.length >= 2) {
            const color = getColorForViewKey(viewKey, viewKeys);
            const lastPoint = drawRouteWithColor(rt, color, map, config);
            
            // Add a marker at the current position (last point)
            if (lastPoint) {
              const pixel = gameToPixelForMap(lastPoint.global_x, lastPoint.global_z, config);
              const latLng = pixelToLatLng(pixel.x, pixel.y, config);
              
              const playerMarker = L.circleMarker(latLng, {
                radius: 12,
                fillColor: color,
                color: '#ffffff',
                weight: 3,
                opacity: 1,
                fillOpacity: 1,
                pane: 'teleportPane',
                className: 'realtime-player-marker', // Effet sonar CSS
              }).addTo(map);
              
              // Use custom name if available, otherwise use truncated viewKey
              const playerName = viewKeyNames[viewKey]?.trim() || `${viewKey.substring(0, 8)}...${viewKey.substring(viewKey.length - 4)}`;
              playerMarker.bindTooltip(playerName, {
                direction: 'top',
                offset: [0, -10],
                permanent: true,
              });
              teleportMarkersRef.current.push(playerMarker as unknown as L.Marker);
            }
          }
        });
        console.log(`Drew ${viewKeys.length} realtime routes on ${config.name}`);
        return;
      }

      // Handle static route
      if (!route || !route.points || route.points.length < 2) {
        return;
      }

      // Filter points for the active map and remove invalid points (0, 0, 0)
      const filteredPoints = filterPointsByMap(route, activeMapId).filter(
        (p) => !(p.global_x === 0 && p.global_z === 0)
      );

      if (filteredPoints.length < 2) {
        console.log(`No points for map ${activeMapId}`);
        // Still show transition markers
        addTransitionMarkers(map, config);
        return;
      }

      // Split route into segments at teleport points (large distance jumps)
      const TELEPORT_THRESHOLD = 500; // Distance in game units to consider as teleport
      const segments: L.LatLng[][] = [];
      let currentSegment: L.LatLng[] = [];
      
      // Track teleport points for markers
      interface TeleportPoint {
        departureLatLng: L.LatLng;
        arrivalLatLng: L.LatLng;
        distance: number;
      }
      const teleportPoints: TeleportPoint[] = [];

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
            // Teleport detected - record departure and arrival points
            const prevPixel = gameToPixelForMap(prevP.global_x, prevP.global_z, config);
            const departureLatLng = pixelToLatLng(prevPixel.x, prevPixel.y, config);
            
            teleportPoints.push({
              departureLatLng,
              arrivalLatLng: latLng,
              distance,
            });
            
            // Start new segment
            if (currentSegment.length > 0) {
              segments.push(currentSegment);
            }
            currentSegment = [latLng];
            console.log(`Teleport detected: ${distance.toFixed(0)} units`);
            continue;
          }
        }

        currentSegment.push(latLng);
      }

      // Push last segment
      if (currentSegment.length > 0) {
        segments.push(currentSegment);
      }

      // Draw each segment as separate polylines
      const allLatLngs: L.LatLng[] = [];
      segments.forEach((segment) => {
        if (segment.length >= 2) {
          // Route principale - opaque
          const main = L.polyline(segment, {
            color: '#8b7355', // Or/brun Elden Ring
            weight: 5,
            opacity: 1,
            lineJoin: 'round',
            lineCap: 'round',
          }).addTo(map);
          segmentPolylinesRef.current.push(main);
        }
        allLatLngs.push(...segment);
      });

      // Store first segment's polyline for focus functionality
      if (segments.length > 0 && segments[0].length >= 2) {
        routeLayerRef.current = L.polyline(segments[0], {
          color: 'transparent',
          weight: 0,
        });
      }

      // Add teleport markers (departure = orange, arrival = purple)
      teleportPoints.forEach((tp, index) => {
        // Departure marker (brun-rouille - leaving this spot)
        const departureIcon = L.divIcon({
          className: 'teleport-departure',
          html: `<div style="
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #8b5a3a, #6b4a2a);
            border: 3px solid #5a4a3a;
            border-radius: 50%;
            box-shadow: 0 0 8px rgba(139, 90, 58, 0.4), 0 0 15px rgba(139, 90, 58, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: #d4c4a8;
            cursor: pointer;
            z-index: 10000;
            position: relative;
          ">↗</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const departureMarker = L.marker(tp.departureLatLng, { 
          icon: departureIcon,
          pane: 'teleportPane', // Use custom pane with higher z-index
          zIndexOffset: 2000, // Additional offset within pane
        }).addTo(map);
        teleportMarkersRef.current.push(departureMarker);
        
        // Click on departure → pan to arrival (without changing zoom)
        departureMarker.on('click', () => {
          console.log('Departure clicked, panning to arrival:', tp.arrivalLatLng);
          map.panTo(tp.arrivalLatLng);
        });
        
        // Tooltip on hover instead of popup
        departureMarker.bindTooltip(`⚡ TP #${index + 1} Départ → Clic pour aller à l'arrivée`, {
          direction: 'top',
          offset: [0, -10],
        });

        // Arrival marker (gris sombre - arriving at this spot)
        const arrivalIcon = L.divIcon({
          className: 'teleport-arrival',
          html: `<div style="
            width: 36px;
            height: 36px;
            background: linear-gradient(135deg, #4a4a5a, #3a3a4a);
            border: 3px solid #5a5a6a;
            border-radius: 50%;
            box-shadow: 0 0 8px rgba(74, 74, 90, 0.4), 0 0 15px rgba(74, 74, 90, 0.2);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: #b4a4a8;
            cursor: pointer;
            z-index: 10000;
            position: relative;
          ">↙</div>`,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const arrivalMarker = L.marker(tp.arrivalLatLng, { 
          icon: arrivalIcon,
          pane: 'teleportPane', // Use custom pane with higher z-index
          zIndexOffset: 2000, // Additional offset within pane
        }).addTo(map);
        teleportMarkersRef.current.push(arrivalMarker);
        
        // Click on arrival → pan to departure (without changing zoom)
        arrivalMarker.on('click', () => {
          console.log('Arrival clicked, panning to departure:', tp.departureLatLng);
          map.panTo(tp.departureLatLng);
        });
        
        // Tooltip on hover instead of popup
        arrivalMarker.bindTooltip(`⚡ TP #${index + 1} Arrivée → Clic pour aller au départ`, {
          direction: 'top',
          offset: [0, -10],
        });
      });

      // Find start and end points for this map segment
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

      // Check if start/end are transition points (we'll show transition markers instead)
      const isStartFromTransition = transitions.some(
        (t) => t.toMapId === activeMapId
      );
      const isEndToTransition = transitions.some(
        (t) => t.fromMapId === activeMapId
      );

      // Start marker (only show if global start OR not coming from a transition)
      if (isGlobalStart || !isStartFromTransition) {
        const startPixel = gameToPixelForMap(
          firstPoint.global_x,
          firstPoint.global_z,
          config
        );
        startMarkerRef.current = L.circleMarker(
          pixelToLatLng(startPixel.x, startPixel.y, config),
          {
            radius: 12,
            fillColor: isGlobalStart ? '#8b7355' : '#6b5b4a', // Or désaturé Elden Ring
            color: '#5a4a3a',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            pane: 'teleportPane', // Above map icons
          }
        ).addTo(map);
        startMarkerRef.current.bindPopup(
          `<b>${isGlobalStart ? 'Start' : 'Entry'}</b><br>${config.name}`
        );
      }

      // End marker (only show if global end OR not going to a transition)
      if (isGlobalEnd || !isEndToTransition) {
        const endPixel = gameToPixelForMap(
          lastPoint.global_x,
          lastPoint.global_z,
          config
        );
        endMarkerRef.current = L.circleMarker(
          pixelToLatLng(endPixel.x, endPixel.y, config),
          {
            radius: 12,
            fillColor: isGlobalEnd ? '#5c2e2e' : '#6b5b4a', // Rouge sombre Elden Ring
            color: '#4a1f1f',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.9,
            pane: 'teleportPane', // Above map icons
          }
        ).addTo(map);
        endMarkerRef.current.bindPopup(
          `<b>${isGlobalEnd ? 'End' : 'Exit'}</b><br>${config.name}`
        );
      }

      // Add transition markers
      addTransitionMarkers(map, config);

      console.log(
        `Route drawn on ${config.name}: ${filteredPoints.length} points`
      );

      // Apply pending zoom target if any (after everything is drawn)
      if (pendingZoomTarget) {
        const pixel = gameToPixelForMap(pendingZoomTarget.x, pendingZoomTarget.z, config);
        const latLng = pixelToLatLng(pixel.x, pixel.y, config);
        console.log(`Applying pending zoom to: (${pendingZoomTarget.x}, ${pendingZoomTarget.z})`);
        // Use setTimeout to ensure map is fully ready
        setTimeout(() => {
          map.setView(latLng, 4);
        }, 50);
        // Clear the pending target
        setPendingZoomTarget(null);
      }
    }, [route, realtimeRoutes, viewKeyNames, activeMapId, getActiveConfig, clearRouteLayers, pixelToLatLng, pendingZoomTarget, drawRouteWithColor]);

    // Add transition markers for other maps (using same style as teleport markers)
    const addTransitionMarkers = (map: L.Map, config: MapConfig) => {
      if (transitions.length === 0) return;

      // Departure icon (brun-rouille - leaving this map)
      const departureIcon = L.divIcon({
        className: 'map-transition-departure',
        html: `<div style="
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #8b5a3a, #6b4a2a);
          border: 3px solid #5a4a3a;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(139, 90, 58, 0.4), 0 0 15px rgba(139, 90, 58, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: #d4c4a8;
          cursor: pointer;
          z-index: 10000;
          position: relative;
        ">↗</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      // Arrival icon (gris sombre - arriving on this map)
      const arrivalIcon = L.divIcon({
        className: 'map-transition-arrival',
        html: `<div style="
          width: 36px;
          height: 36px;
          background: linear-gradient(135deg, #4a4a5a, #3a3a4a);
          border: 3px solid #5a5a6a;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(74, 74, 90, 0.4), 0 0 15px rgba(74, 74, 90, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          color: #b4a4a8;
          cursor: pointer;
          z-index: 10000;
          position: relative;
        ">↙</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      });

      transitions.forEach((transition, index) => {
        // Determine which map this transition is visible on
        const fromPrefix = transition.fromMapId;
        const toPrefix = transition.toMapId;

        if (fromPrefix === activeMapId) {
          // We're on the "from" map - show DEPARTURE marker (orange ↗)
          // Find the last valid point BEFORE the transition (transition.pointIndex is the first point on new map)
          let departurePoint = null;
          for (let i = transition.pointIndex - 1; i >= 0; i--) {
            const p = route!.points[i];
            if (p.global_x !== 0 || p.global_z !== 0) {
              departurePoint = p;
              break;
            }
          }
          
          if (!departurePoint) {
            console.warn(`No valid departure point found for transition ${index}`);
            return;
          }
          
          const pixel = gameToPixelForMap(departurePoint.global_x, departurePoint.global_z, config);
          const latLng = pixelToLatLng(pixel.x, pixel.y, config);

          const marker = L.marker(latLng, { 
            icon: departureIcon,
            pane: 'teleportPane',
            zIndexOffset: 2000,
          }).addTo(map);

          // Find arrival point on target map (first valid point after transition)
          const arrivalPointIndex = route!.points.findIndex(
            (p) => p.timestamp_ms > transition.point.timestamp_ms && 
                   p.global_x !== 0 && p.global_z !== 0
          );
          const arrivalCoord = arrivalPointIndex !== -1 
            ? { x: route!.points[arrivalPointIndex].global_x, z: route!.points[arrivalPointIndex].global_z }
            : undefined;
          
          console.log(`Transition ${index}: arrivalPointIndex=${arrivalPointIndex}, arrivalCoord=`, arrivalCoord);

          // Tooltip instead of popup for easier clicking
          marker.bindTooltip(
            `🌍 Transition #${index + 1} → ${transition.toMapName}<br>Clic pour y aller`,
            { direction: 'top', offset: [0, -10] }
          );

          // Store arrivalCoord for click handler (avoid stale closure issues)
          const targetCoord = arrivalCoord;

          // Click to switch map and zoom to arrival
          marker.on('click', () => {
            console.log(`Transition departure clicked, switching to ${toPrefix}, targetCoord=`, targetCoord);
            switchMap(toPrefix, targetCoord);
          });

          transitionMarkersRef.current.push(marker);
        } else if (toPrefix === activeMapId) {
          // We're on the "to" map - show ARRIVAL marker (purple ↙)
          // Use the NEXT point after transition (first point on this map)
          const nextPointIndex = route!.points.findIndex(
            (p) => p.timestamp_ms > transition.point.timestamp_ms && 
                   p.global_x !== 0 && p.global_z !== 0
          );
          
          if (nextPointIndex !== -1) {
            const arrivalPoint = route!.points[nextPointIndex];
            const pixel = gameToPixelForMap(arrivalPoint.global_x, arrivalPoint.global_z, config);
            const latLng = pixelToLatLng(pixel.x, pixel.y, config);

            // Find departure point on source map (last valid point before transition)
            let departureCoord: { x: number; z: number } | undefined;
            for (let i = transition.pointIndex - 1; i >= 0; i--) {
              const p = route!.points[i];
              if (p.global_x !== 0 || p.global_z !== 0) {
                departureCoord = { x: p.global_x, z: p.global_z };
                break;
              }
            }

            const marker = L.marker(latLng, { 
              icon: arrivalIcon,
              pane: 'teleportPane',
              zIndexOffset: 2000,
            }).addTo(map);

            // Tooltip instead of popup for easier clicking
            marker.bindTooltip(
              `🌍 Transition #${index + 1} ← ${transition.fromMapName}<br>Clic pour y retourner`,
              { direction: 'top', offset: [0, -10] }
            );

            // Click to switch map and zoom to departure
            marker.on('click', () => {
              console.log(`Transition arrival clicked, switching to ${fromPrefix}`);
              switchMap(fromPrefix, departureCoord);
            });

            transitionMarkersRef.current.push(marker);
          }
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

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focusRoute: () => {
        const map = mapRef.current;
        if (!map) return;

        const config = getActiveConfig();

        // Priority: realtime routes > static route
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

        // Fallback: static route - zoom to last point
        if (route && route.points && route.points.length > 0) {
          const lastPoint = route.points[route.points.length - 1];
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
            const filteredPoints = filterPointsByMap(route, activeMapId).filter(
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
    }), [realtimeRoutes, route, activeMapId, getActiveConfig, pixelToLatLng, handleMapChange]);

    return (
      <div className="map-wrapper">
        <div ref={containerRef} className="map-container" />
      </div>
    );
  }
);

MapContainer.displayName = 'MapContainer';

export default MapContainer;
