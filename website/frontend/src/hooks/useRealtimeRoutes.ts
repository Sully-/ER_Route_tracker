import { useState, useCallback, useEffect, useRef } from 'react';
import * as signalR from '@microsoft/signalr';
import { Route, RoutePoint } from '../types/route';

// Backend URL - configurable via environment variable
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://localhost:7169';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface RoutePointBroadcast {
  x: number;
  y: number;
  z: number;
  globalX: number;
  globalY: number;
  globalZ: number;
  mapId: number;
  mapIdStr: string | null;
  globalMapId: number;
  timestampMs: number;
  receivedAt: string;
}

interface UseRealtimeRoutesResult {
  viewKeys: string[];
  routes: Record<string, Route>;
  connectionStatus: Record<string, ConnectionStatus>;
  addViewKey: (viewKey: string) => void;
  removeViewKey: (viewKey: string) => void;
  error: string | null;
}

// Convert broadcast point to route point format
function broadcastToRoutePoint(broadcast: RoutePointBroadcast): RoutePoint {
  return {
    x: broadcast.x,
    y: broadcast.y,
    z: broadcast.z,
    global_x: broadcast.globalX,
    global_y: broadcast.globalY,
    global_z: broadcast.globalZ,
    map_id: broadcast.mapId,
    map_id_str: broadcast.mapIdStr || '',
    timestamp_ms: broadcast.timestampMs,
    global_map_id: broadcast.globalMapId,
  };
}

// Merge two sorted arrays of route points by timestamp_ms, removing duplicates
function mergeRoutePoints(existing: RoutePoint[], newPoints: RoutePoint[]): RoutePoint[] {
  const merged: RoutePoint[] = [];
  let i = 0;
  let j = 0;

  while (i < existing.length && j < newPoints.length) {
    const existingPoint = existing[i];
    const newPoint = newPoints[j];

    // If timestamps are equal, skip duplicate (prefer existing)
    if (existingPoint.timestamp_ms === newPoint.timestamp_ms) {
      merged.push(existingPoint);
      i++;
      j++;
    } else if (existingPoint.timestamp_ms < newPoint.timestamp_ms) {
      merged.push(existingPoint);
      i++;
    } else {
      merged.push(newPoint);
      j++;
    }
  }

  // Add remaining points
  while (i < existing.length) {
    merged.push(existing[i]);
    i++;
  }
  while (j < newPoints.length) {
    merged.push(newPoints[j]);
    j++;
  }

  return merged;
}

export function useRealtimeRoutes(): UseRealtimeRoutesResult {
  const [viewKeys, setViewKeys] = useState<string[]>([]);
  const [routes, setRoutes] = useState<Record<string, Route>>({});
  const [connectionStatus, setConnectionStatus] = useState<Record<string, ConnectionStatus>>({});
  const [error, setError] = useState<string | null>(null);
  // Track last received timestamp for each viewKey to detect inactivity
  const [lastReceivedTimestamps, setLastReceivedTimestamps] = useState<Record<string, number>>({});
  
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);

  // Initialize SignalR connection
  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${BACKEND_URL}/hubs/route`)
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    // Handle receiving new route points
    // This handler receives points ONLY for routes this client has joined via JoinRoute()
    // SignalR groups ensure isolation: each client only receives messages from groups they're in
    connection.on('ReceiveRoutePoints', (points: RoutePointBroadcast[], viewKey?: string) => {
      console.log('ReceiveRoutePoints called:', { pointsCount: points?.length, viewKey });
      
      if (!viewKey) {
        console.warn('ReceiveRoutePoints called without viewKey, ignoring');
        return;
      }
      
      if (!points || points.length === 0) {
        console.warn('ReceiveRoutePoints called with empty points array');
        return;
      }
      
      // Security check: only process points for viewKeys we're actively tracking
      // (This shouldn't happen due to SignalR group isolation, but adds defense in depth)
      setViewKeys(currentViewKeys => {
        if (!currentViewKeys.includes(viewKey)) {
          console.warn(`Received points for viewKey ${viewKey} that we're not tracking. Ignoring.`);
          return currentViewKeys;
        }
        
        console.log(`Updating route for viewKey: ${viewKey} with ${points.length} new points`);
        
        // Update last received timestamp (use the most recent point's receivedAt)
        const lastPoint = points[points.length - 1];
        if (lastPoint && lastPoint.receivedAt) {
          const receivedTimestamp = new Date(lastPoint.receivedAt).getTime();
          setLastReceivedTimestamps(prev => ({
            ...prev,
            [viewKey]: receivedTimestamp,
          }));
          
          // If status was 'disconnected' due to inactivity, set it back to 'connected'
          setConnectionStatus(prev => {
            if (prev[viewKey] === 'disconnected') {
              return {
                ...prev,
                [viewKey]: 'connected',
              };
            }
            return prev;
          });
        }
        
        setRoutes(prev => {
          const existingRoute = prev[viewKey];
          const newPoints = points.map(broadcastToRoutePoint);
          
          if (!existingRoute) {
            console.log(`Creating new route for viewKey: ${viewKey}`);
            return {
              ...prev,
              [viewKey]: {
                name: `Live Route (${viewKey.substring(0, 8)}...)`,
                recorded_at: new Date().toISOString(),
                duration_secs: 0,
                interval_ms: 100,
                point_count: newPoints.length,
                points: newPoints,
              },
            };
          }
          
          // Merge new points into existing route in chronological order
          // This handles cases where points arrive out of order
          const mergedPoints = mergeRoutePoints(existingRoute.points, newPoints);
          console.log(`Updating existing route for viewKey: ${viewKey}, merged ${newPoints.length} new points with ${existingRoute.points.length} existing points -> ${mergedPoints.length} total points`);
          return {
            ...prev,
            [viewKey]: {
              ...existingRoute,
              points: mergedPoints,
              point_count: mergedPoints.length,
            },
          };
        });
        
        return currentViewKeys;
      });
    });

    // Handle receiving route history (catch-up on join)
    connection.on('ReceiveRouteHistory', (viewKey: string, points: RoutePointBroadcast[]) => {
      console.log(`ReceiveRouteHistory called for viewKey: ${viewKey}, ${points?.length || 0} points`);
      
      if (!viewKey || !points || points.length === 0) {
        console.warn('ReceiveRouteHistory called with invalid data');
        return;
      }
      
      // Update last received timestamp (use the most recent point's receivedAt)
      const lastPoint = points[points.length - 1];
      if (lastPoint && lastPoint.receivedAt) {
        const receivedTimestamp = new Date(lastPoint.receivedAt).getTime();
        setLastReceivedTimestamps(prev => ({
          ...prev,
          [viewKey]: receivedTimestamp,
        }));
        
        // If status was 'disconnected' due to inactivity, set it back to 'connected'
        setConnectionStatus(prev => {
          if (prev[viewKey] === 'disconnected') {
            return {
              ...prev,
              [viewKey]: 'connected',
            };
          }
          return prev;
        });
      }
      
      const newPoints = points.map(broadcastToRoutePoint);
      console.log(`Loading ${newPoints.length} historical points for viewKey: ${viewKey}`);
      
      setRoutes(prev => ({
        ...prev,
        [viewKey]: {
          name: `Live Route (${viewKey.substring(0, 8)}...)`,
          recorded_at: new Date().toISOString(),
          duration_secs: 0,
          interval_ms: 100,
          point_count: newPoints.length,
          points: newPoints,
        },
      }));
    });

    // Handle join confirmation
    connection.on('JoinedRoute', (viewKey: string) => {
      setConnectionStatus(prev => ({
        ...prev,
        [viewKey]: 'connected',
      }));
      setError(null);
    });

    // Handle leave confirmation
    connection.on('LeftRoute', (viewKey: string) => {
      setConnectionStatus(prev => {
        const newStatus = { ...prev };
        delete newStatus[viewKey];
        return newStatus;
      });
    });

    // Handle errors from server
    connection.on('Error', (message: string) => {
      setError(message);
    });

    // Connection state handlers
    connection.onreconnecting(() => {
      setViewKeys(keys => {
        keys.forEach(key => {
          setConnectionStatus(prev => ({
            ...prev,
            [key]: 'connecting',
          }));
        });
        return keys;
      });
    });

    connection.onreconnected(() => {
      // Rejoin all routes after reconnection
      viewKeys.forEach(key => {
        connection.invoke('JoinRoute', key).catch(err => {
          console.error('Failed to rejoin route:', err);
          setConnectionStatus(prev => ({
            ...prev,
            [key]: 'error',
          }));
        });
      });
    });

    connection.onclose(() => {
      setViewKeys(keys => {
        keys.forEach(key => {
          setConnectionStatus(prev => ({
            ...prev,
            [key]: 'disconnected',
          }));
        });
        return keys;
      });
    });

    connectionRef.current = connection;

    // Start connection
    connection.start()
      .then(() => {
        console.log('SignalR connected successfully to', `${BACKEND_URL}/hubs/route`);
        setError(null);
      })
      .catch(err => {
        console.error('SignalR connection failed:', err);
        console.error('Backend URL:', BACKEND_URL);
        console.error('Full error details:', {
          message: err.message,
          stack: err.stack,
          name: err.name,
        });
        setError(`Failed to connect to real-time server: ${err.message}`);
      });

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      connection.stop();
    };
  }, []);

  // Check for inactive routes (no points received for 1 minute)
  useEffect(() => {
    const INACTIVITY_TIMEOUT_MS = 60 * 1000; // 1 minute
    
    const checkInactivity = () => {
      const now = Date.now();
      
      setConnectionStatus(prevStatus => {
        const newStatus = { ...prevStatus };
        let changed = false;
        
        viewKeys.forEach(viewKey => {
          const lastTimestamp = lastReceivedTimestamps[viewKey];
          
          // Only check if we have a timestamp and the status is 'connected'
          if (lastTimestamp && prevStatus[viewKey] === 'connected') {
            const timeSinceLastPoint = now - lastTimestamp;
            
            if (timeSinceLastPoint > INACTIVITY_TIMEOUT_MS) {
              newStatus[viewKey] = 'disconnected';
              changed = true;
              console.log(`ViewKey ${viewKey} marked as disconnected due to inactivity (${Math.round(timeSinceLastPoint / 1000)}s since last point)`);
            }
          }
        });
        
        return changed ? newStatus : prevStatus;
      });
    };
    
    // Check every 10 seconds
    const intervalId = setInterval(checkInactivity, 10000);
    
    return () => clearInterval(intervalId);
  }, [viewKeys, lastReceivedTimestamps]);

  // Note: Route point updates are handled per-viewKey via handlers registered in addViewKey

  const addViewKey = useCallback((viewKey: string) => {
    if (!viewKey.trim() || viewKeys.includes(viewKey)) {
      return;
    }

    const connection = connectionRef.current;
    if (!connection || connection.state !== signalR.HubConnectionState.Connected) {
      setError('Not connected to server');
      return;
    }

    setConnectionStatus(prev => ({
      ...prev,
      [viewKey]: 'connecting',
    }));

    // Initialize empty route for this key
    setRoutes(prev => ({
      ...prev,
      [viewKey]: {
        name: `Live Route (${viewKey.substring(0, 8)}...)`,
        recorded_at: new Date().toISOString(),
        duration_secs: 0,
        interval_ms: 100,
        point_count: 0,
        points: [],
      },
    }));

    console.log(`Calling JoinRoute for viewKey: ${viewKey}`);

    // Join the route - history will be received via the generic ReceiveRouteHistory handler
    connection.invoke('JoinRoute', viewKey)
      .then(() => {
        console.log(`Successfully joined route for viewKey: ${viewKey}`);
        setViewKeys(prev => [...prev, viewKey]);
      })
      .catch(err => {
        console.error('Failed to join route:', err);
        setConnectionStatus(prev => ({
          ...prev,
          [viewKey]: 'error',
        }));
        setError(`Failed to join route: ${err.message}`);
      });
  }, [viewKeys]);

  const removeViewKey = useCallback((viewKey: string) => {
    const connection = connectionRef.current;
    if (connection && connection.state === signalR.HubConnectionState.Connected) {
      connection.invoke('LeaveRoute', viewKey).catch(err => {
        console.error('Failed to leave route:', err);
      });
    }

    setViewKeys(prev => prev.filter(k => k !== viewKey));
    setRoutes(prev => {
      const newRoutes = { ...prev };
      delete newRoutes[viewKey];
      return newRoutes;
    });
    setConnectionStatus(prev => {
      const newStatus = { ...prev };
      delete newStatus[viewKey];
      return newStatus;
    });
    setLastReceivedTimestamps(prev => {
      const newTimestamps = { ...prev };
      delete newTimestamps[viewKey];
      return newTimestamps;
    });
  }, []);

  return {
    viewKeys,
    routes,
    connectionStatus,
    addViewKey,
    removeViewKey,
    error,
  };
}

