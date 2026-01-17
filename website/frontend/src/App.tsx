import { useRef, useState, useEffect, useCallback } from 'react';
import MapContainer, { MapContainerHandle } from './components/Map/MapContainer';
import RouteInfo from './components/RouteInfo/RouteInfo';
import SidePanel from './components/SidePanel/SidePanel';
import { useStaticRoutes } from './hooks/useStaticRoutes';
import { useRealtimeRoutes } from './hooks/useRealtimeRoutes';
import { useAuth } from './hooks/useAuth';
import { DEFAULT_MAP_ID } from './utils/calibration';
import './App.css';

interface ViewKeyWithName {
  viewKey: string;
  name: string | undefined;
}

/**
 * Parse viewkeys and their names from URL query parameters.
 * Supports formats:
 * - ?viewkey=key1&name1=Player1&viewkey=key2&name2=Player2
 * - ?viewkeys=key1,key2&names=Player1,Player2
 * - ?viewkey=key1&viewkey=key2 (without names, will use default)
 */
function parseViewKeysFromUrl(): ViewKeyWithName[] {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    
    // Try format with indexed parameters: viewkey1, name1, viewkey2, name2, etc.
    const indexedKeys: ViewKeyWithName[] = [];
    let index = 1;
    while (true) {
      const viewKey = urlParams.get(`viewkey${index}`);
      if (!viewKey) break;
      
      const name = urlParams.get(`name${index}`);
      indexedKeys.push({
        viewKey: viewKey.trim(),
        name: name?.trim() || undefined,
      });
      index++;
    }
    
    // If we found indexed keys, use them (priority)
    if (indexedKeys.length > 0) {
      return indexedKeys.filter(k => k.viewKey.length > 0);
    }
    
    // Try format with comma-separated: viewkeys=key1,key2&names=Player1,Player2
    const viewkeysParam = urlParams.get('viewkeys');
    if (viewkeysParam) {
      const keys = viewkeysParam.split(',').map(k => k.trim()).filter(Boolean);
      const namesParam = urlParams.get('names');
      const names = namesParam ? namesParam.split(',').map(n => n.trim()) : [];
      
      return keys.map((key, i) => ({
        viewKey: key,
        name: names[i] || undefined,
      }));
    }
    
    // Fallback: multiple viewkey parameters (old format)
    const viewkeyParams = urlParams.getAll('viewkey');
    if (viewkeyParams.length > 0) {
      return viewkeyParams
        .map(k => k.trim())
        .filter(k => k.length > 0)
        .map(viewKey => ({ viewKey, name: undefined }));
    }
    
    return [];
  } catch (error) {
    console.error('Failed to parse viewkeys from URL:', error);
    return [];
  }
}

/**
 * Update URL query parameters to reflect current viewkeys and their names.
 * Uses history.replaceState to avoid adding history entries.
 * Format: ?viewkey1=key1&name1=Player1&viewkey2=key2&name2=Player2
 */
function updateUrlWithViewKeys(
  viewKeys: string[],
  viewKeyNames: Record<string, string>
): void {
  try {
    const url = new URL(window.location.href);
    
    // Clear existing viewkey params (both old format and indexed format)
    const keysToDelete: string[] = [];
    url.searchParams.forEach((_, key) => {
      if (key === 'viewkey' || key === 'viewkeys' || key === 'names' || 
          key.startsWith('viewkey') || key.startsWith('name')) {
        keysToDelete.push(key);
      }
    });
    keysToDelete.forEach(key => url.searchParams.delete(key));
    
    // Add viewkeys if we have any
    if (viewKeys.length > 0) {
      viewKeys.forEach((key, index) => {
        const paramIndex = index + 1;
        url.searchParams.set(`viewkey${paramIndex}`, key);
        const name = viewKeyNames[key];
        if (name && name.trim()) {
          url.searchParams.set(`name${paramIndex}`, name.trim());
        }
      });
    }
    
    // Update URL without page reload
    window.history.replaceState({}, '', url.toString());
  } catch (error) {
    console.error('Failed to update URL with viewkeys:', error);
  }
}

function App() {
  const mapRef = useRef<MapContainerHandle>(null);
  
  // Authentication state
  const {
    user,
    isLoading: isAuthLoading,
    savedKeys,
    login,
    logout,
    generateKeys,
    addKeyPair,
    removeKeyPair,
  } = useAuth();
  
  // Parse viewkeys from URL only once on mount
  const initialViewKeysWithNamesRef = useRef<ViewKeyWithName[]>(parseViewKeysFromUrl());
  const initialViewKeysWithNames = initialViewKeysWithNamesRef.current;
  const initialViewKeys = initialViewKeysWithNames.map(v => v.viewKey);
  
  const [activeMapId, setActiveMapId] = useState<string>(DEFAULT_MAP_ID);
  const [showIcons, setShowIcons] = useState<boolean>(true);
  const [urlViewKeysProcessed, setUrlViewKeysProcessed] = useState(false);
  
  // ViewKey names mapping (viewKey -> name)
  const [viewKeyNames, setViewKeyNames] = useState<Record<string, string>>(() => {
    const initialNames: Record<string, string> = {};
    initialViewKeysWithNames.forEach(({ viewKey, name }) => {
      if (name) {
        initialNames[viewKey] = name;
      }
    });
    return initialNames;
  });

  // Route colors mapping (routeId -> color)
  // routeId can be "static" for static route or viewKey for realtime routes
  const [routeColors, setRouteColors] = useState<Record<string, string>>(() => {
    try {
      const stored = localStorage.getItem('routeColors');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load route colors from localStorage:', error);
    }
    return {};
  });

  // Route visibility mapping (routeId -> visible)
  // By default, all routes are visible (undefined = visible)
  const [routeVisibility, setRouteVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem('routeVisibility');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Failed to load route visibility from localStorage:', error);
    }
    return {};
  });

  // Active tracking state - which realtime route is being actively tracked (auto-focus)
  // Only one route can be tracked at a time
  const [trackedViewKey, setTrackedViewKey] = useState<string | null>(null);

  // Selected route state - which route is currently selected (highlighted with glow effect)
  // Can be a static routeId or a realtime viewKey
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  
  // Static routes state (multiple routes)
  const {
    routes: staticRoutes,
    routeIds: staticRouteIds,
    routeNames: staticRouteNames,
    error: staticError,
    addRoute: addStaticRoute,
    removeRoute: removeStaticRoute,
    updateRouteName: updateStaticRouteName,
  } = useStaticRoutes();
  
  // Realtime mode state
  const {
    viewKeys,
    routes: realtimeRoutes,
    connectionStatus,
    addViewKey,
    removeViewKey,
    error: realtimeError,
  } = useRealtimeRoutes();

  // Auto-add viewkeys from URL on mount (only once, after SignalR is ready)
  useEffect(() => {
    if (urlViewKeysProcessed) return;
    if (initialViewKeys.length === 0) {
      setUrlViewKeysProcessed(true);
      return;
    }
    
    // Small delay to ensure SignalR connection is established
    const timer = setTimeout(() => {
      console.log('Adding viewkeys from URL:', initialViewKeysWithNames);
      initialViewKeysWithNames.forEach(({ viewKey, name }) => {
        addViewKey(viewKey);
        if (name) {
          setViewKeyNames(prev => ({ ...prev, [viewKey]: name }));
        }
      });
      setUrlViewKeysProcessed(true);
    }, 500);
    
    return () => clearTimeout(timer);
  }, [urlViewKeysProcessed, addViewKey]);

  // Update URL when viewkeys or their names change (sync URL with current state)
  useEffect(() => {
    // Only update URL after initial URL viewkeys have been processed
    if (!urlViewKeysProcessed) return;
    
    updateUrlWithViewKeys(viewKeys, viewKeyNames);
  }, [viewKeys, viewKeyNames, urlViewKeysProcessed]);
  
  // Update viewKey names when viewKeys change (remove names for removed keys)
  useEffect(() => {
    setViewKeyNames(prev => {
      const updated = { ...prev };
      let changed = false;
      Object.keys(updated).forEach(key => {
        if (!viewKeys.includes(key)) {
          delete updated[key];
          changed = true;
        }
      });
      return changed ? updated : prev;
    });
  }, [viewKeys]);

  // Auto-untrack if the tracked route is removed
  useEffect(() => {
    if (trackedViewKey && !viewKeys.includes(trackedViewKey)) {
      console.log(`[Active Tracking] Tracked route ${trackedViewKey} was removed, stopping tracking`);
      setTrackedViewKey(null);
    }
  }, [viewKeys, trackedViewKey]);

  // Auto-deselect if the selected route is removed
  useEffect(() => {
    if (!selectedRouteId) return;
    
    // Check if it's a static route that was removed
    const isStaticRoute = selectedRouteId.startsWith('static-');
    if (isStaticRoute && !staticRouteIds.includes(selectedRouteId)) {
      console.log(`[Selection] Selected static route ${selectedRouteId} was removed, deselecting`);
      setSelectedRouteId(null);
      return;
    }
    
    // Check if it's a realtime route that was removed
    if (!isStaticRoute && !viewKeys.includes(selectedRouteId)) {
      console.log(`[Selection] Selected realtime route ${selectedRouteId} was removed, deselecting`);
      setSelectedRouteId(null);
    }
  }, [selectedRouteId, staticRouteIds, viewKeys]);

  const handleFocusPlayer = (viewKey: string) => {
    mapRef.current?.focusPlayer(viewKey);
  };

  const handleFocusStaticRoute = (routeId: string) => {
    mapRef.current?.focusStaticRoute(routeId);
  };
  
  const handleUpdateViewKeyName = useCallback((viewKey: string, name: string) => {
    setViewKeyNames(prev => ({
      ...prev,
      [viewKey]: name.trim() || '',
    }));
  }, []);

  const handleUpdateRouteColor = useCallback((routeId: string, color: string) => {
    setRouteColors(prev => {
      const updated = { ...prev, [routeId]: color };
      try {
        localStorage.setItem('routeColors', JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save route colors to localStorage:', error);
      }
      return updated;
    });
  }, []);

  const handleToggleRouteVisibility = useCallback((routeId: string) => {
    setRouteVisibility(prev => {
      const currentVisible = prev[routeId] !== false; // default is visible
      const updated = { ...prev, [routeId]: !currentVisible };
      try {
        localStorage.setItem('routeVisibility', JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save route visibility to localStorage:', error);
      }
      return updated;
    });
  }, []);

  // Handler for setting/unsetting the actively tracked route
  const handleSetTrackedRoute = useCallback((viewKey: string | null) => {
    setTrackedViewKey(viewKey);
  }, []);

  // Handler for selecting/deselecting a route (toggle behavior)
  const handleSelectRoute = useCallback((routeId: string | null) => {
    setSelectedRouteId(prev => prev === routeId ? null : routeId);
  }, []);

  return (
    <div className="app">
      {/* Side Panel - always visible with map selector, static routes and realtime routes */}
      <SidePanel
        activeMapId={activeMapId}
        onMapChange={setActiveMapId}
        showIcons={showIcons}
        onToggleIcons={setShowIcons}
        viewKeys={viewKeys}
        viewKeyNames={viewKeyNames}
        connectionStatus={connectionStatus}
        onAddViewKey={addViewKey}
        onRemoveViewKey={removeViewKey}
        onUpdateViewKeyName={handleUpdateViewKeyName}
        onFocusPlayer={handleFocusPlayer}
        // Active tracking props
        trackedViewKey={trackedViewKey}
        onSetTrackedRoute={handleSetTrackedRoute}
        // Static routes props
        staticRoutes={staticRoutes}
        staticRouteIds={staticRouteIds}
        staticRouteNames={staticRouteNames}
        onAddStaticRoute={addStaticRoute}
        onRemoveStaticRoute={removeStaticRoute}
        onUpdateStaticRouteName={updateStaticRouteName}
        onFocusStaticRoute={handleFocusStaticRoute}
        routeColors={routeColors}
        onUpdateRouteColor={handleUpdateRouteColor}
        routeVisibility={routeVisibility}
        onToggleRouteVisibility={handleToggleRouteVisibility}
        // Route selection props
        selectedRouteId={selectedRouteId}
        onSelectRoute={handleSelectRoute}
        // Authentication props
        user={user}
        isAuthLoading={isAuthLoading}
        savedKeys={savedKeys}
        onLogin={login}
        onLogout={logout}
        onGenerateKeys={generateKeys}
        onAddKeyPair={addKeyPair}
        onRemoveSavedKey={removeKeyPair}
      />
      
      {/* Map Container - displays both static and realtime routes */}
      <MapContainer
        ref={mapRef}
        staticRoutes={staticRoutes}
        staticRouteIds={staticRouteIds}
        staticRouteNames={staticRouteNames}
        realtimeRoutes={realtimeRoutes}
        viewKeyNames={viewKeyNames}
        activeMapId={activeMapId}
        onMapChange={setActiveMapId}
        showIcons={showIcons}
        routeColors={routeColors}
        routeVisibility={routeVisibility}
        trackedViewKey={trackedViewKey}
        selectedRouteId={selectedRouteId}
        onSelectRoute={handleSelectRoute}
      />
      
      {/* Route Info - shows first static route info when available */}
      {staticRouteIds.length > 0 && (
        <RouteInfo route={staticRoutes[staticRouteIds[0]]} />
      )}
      
      {/* Error Toast */}
      {(staticError || realtimeError) && (
        <div className="error-toast">
          {staticError || realtimeError}
        </div>
      )}
    </div>
  );
}

export default App;
