import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route } from '../../types/route';
import { gameToPixel } from '../../utils/coordinateTransform';
import { MAP_WIDTH, MAP_HEIGHT, TILE_CONFIG } from '../../utils/calibration';

export interface MapContainerHandle {
  focusRoute: () => void;
}

interface MapContainerProps {
  route: Route | null;
}

const MapContainer = forwardRef<MapContainerHandle, MapContainerProps>(
  ({ route }, ref) => {
    const mapRef = useRef<L.Map | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const routeLayerRef = useRef<L.Polyline | null>(null);
    const glowLayerRef = useRef<L.Polyline | null>(null);
    const startMarkerRef = useRef<L.CircleMarker | null>(null);
    const endMarkerRef = useRef<L.CircleMarker | null>(null);

    const MAX_ZOOM = TILE_CONFIG.maxZoom;

    // Initialize map
    useEffect(() => {
      if (!containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        crs: L.CRS.Simple,
        minZoom: 0,
        maxZoom: MAX_ZOOM,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
      });

      const PADDED_SIZE = TILE_CONFIG.paddedSize;
      const southWest = map.unproject([0, PADDED_SIZE], MAX_ZOOM);
      const northEast = map.unproject([PADDED_SIZE, 0], MAX_ZOOM);
      const mapBounds = new L.LatLngBounds(southWest, northEast);

      // Cache buster for tiles
      const cacheBuster = Date.now();
      L.tileLayer(`tiles/{z}/{x}/{y}.jpg?v=${cacheBuster}`, {
        minZoom: 0,
        maxZoom: MAX_ZOOM,
        tileSize: 256,
        noWrap: true,
        bounds: mapBounds,
      }).addTo(map);

      // Calculate bounds for actual image (not padded)
      const imageSouthWest = map.unproject([0, MAP_HEIGHT], MAX_ZOOM);
      const imageNorthEast = map.unproject([MAP_WIDTH, 0], MAX_ZOOM);
      const imageBounds = new L.LatLngBounds(imageSouthWest, imageNorthEast);

      map.fitBounds(imageBounds);
      map.setMaxBounds(imageBounds.pad(0.02));

      mapRef.current = map;

      return () => {
        map.remove();
        mapRef.current = null;
      };
    }, [MAX_ZOOM]);

    // Helper function
    const pixelToLatLng = (pixelX: number, pixelY: number): L.LatLng => {
      if (!mapRef.current) return L.latLng(0, 0);
      return mapRef.current.unproject([pixelX, pixelY], MAX_ZOOM);
    };

    // Clear route layers
    const clearRouteLayers = () => {
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
    };

    // Draw route when it changes
    useEffect(() => {
      const map = mapRef.current;
      if (!map) return;

      clearRouteLayers();

      if (!route || !route.points || route.points.length < 2) {
        return;
      }

      const points = route.points;

      // Convert game coordinates to Leaflet coordinates
      const latLngs = points.map((p) => {
        const pixel = gameToPixel(p.global_x, p.global_z);
        return pixelToLatLng(pixel.x, pixel.y);
      });

      // Glow effect (wider, semi-transparent)
      glowLayerRef.current = L.polyline(latLngs, {
        color: '#00ff00',
        weight: 12,
        opacity: 0.3,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);

      // Main route polyline
      routeLayerRef.current = L.polyline(latLngs, {
        color: '#00ff00',
        weight: 6,
        opacity: 0.8,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);

      // Start marker (green)
      const startPixel = gameToPixel(points[0].global_x, points[0].global_z);
      startMarkerRef.current = L.circleMarker(
        pixelToLatLng(startPixel.x, startPixel.y),
        {
          radius: 12,
          fillColor: '#00ff00',
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 1,
        }
      ).addTo(map);
      startMarkerRef.current.bindPopup('<b>Start</b><br>Point 1');

      // End marker (red)
      const endPoint = points[points.length - 1];
      const endPixel = gameToPixel(endPoint.global_x, endPoint.global_z);
      endMarkerRef.current = L.circleMarker(
        pixelToLatLng(endPixel.x, endPixel.y),
        {
          radius: 12,
          fillColor: '#ff0000',
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 1,
        }
      ).addTo(map);
      endMarkerRef.current.bindPopup(`<b>End</b><br>Point ${points.length}`);

      console.log('Route drawn:', points.length, 'points');
    }, [route, MAX_ZOOM]);

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      focusRoute: () => {
        if (mapRef.current && routeLayerRef.current) {
          mapRef.current.fitBounds(routeLayerRef.current.getBounds(), {
            padding: [50, 50],
          });
        }
      },
    }));

    return <div ref={containerRef} className="map-container" />;
  }
);

MapContainer.displayName = 'MapContainer';

export default MapContainer;

