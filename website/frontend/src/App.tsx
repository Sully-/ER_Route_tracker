import { useRef, useState, useEffect, useCallback } from 'react';
import MapContainer, { MapContainerHandle } from './components/Map/MapContainer';
import RouteInfo from './components/RouteInfo/RouteInfo';
import SidePanel from './components/SidePanel/SidePanel';
import { useRouteLoader } from './hooks/useRouteLoader';
import { useRealtimeRoutes } from './hooks/useRealtimeRoutes';
import { DEFAULT_MAP_ID } from './utils/calibration';
import './App.css';

type TabMode = 'static' | 'realtime';

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
  viewKeyNames: Record<string, string>,
  activeTab: TabMode
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
    
    // Only add viewkeys if in realtime mode and have keys
    if (activeTab === 'realtime' && viewKeys.length > 0) {
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
  
  // Parse viewkeys from URL only once on mount
  const initialViewKeysWithNamesRef = useRef<ViewKeyWithName[]>(parseViewKeysFromUrl());
  const initialViewKeysWithNames = initialViewKeysWithNamesRef.current;
  const initialViewKeys = initialViewKeysWithNames.map(v => v.viewKey);
  
  // If viewkeys are in URL, start in realtime mode
  const [activeTab, setActiveTab] = useState<TabMode>(
    initialViewKeys.length > 0 ? 'realtime' : 'static'
  );
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
  
  // Static mode state
  const { route, error, loadRoute, clearRoute } = useRouteLoader();
  
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
    
    updateUrlWithViewKeys(viewKeys, viewKeyNames, activeTab);
  }, [viewKeys, viewKeyNames, activeTab, urlViewKeysProcessed]);
  
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

  // Handle tab change - update URL accordingly
  const handleTabChange = useCallback((newTab: TabMode) => {
    setActiveTab(newTab);
    // URL will be updated by the useEffect above
  }, []);

  const handleFocusRoute = () => {
    mapRef.current?.focusRoute();
  };

  const handleFocusPlayer = (viewKey: string) => {
    mapRef.current?.focusPlayer(viewKey);
  };
  
  const handleUpdateViewKeyName = useCallback((viewKey: string, name: string) => {
    setViewKeyNames(prev => ({
      ...prev,
      [viewKey]: name.trim() || '',
    }));
  }, []);

  return (
    <div className={`app ${activeTab === 'realtime' ? 'realtime-mode' : ''}`}>
      {/* Tab Navigation */}
      <div className="tab-bar">
      <h1 className="toolbar-title">Elden Ring Route Viewer</h1>
      <span className="alpha-badge">⚠️ ALPHA</span>
        <button
          className={`tab-button ${activeTab === 'static' ? 'active' : ''}`}
          onClick={() => handleTabChange('static')}
        >
          Static Mode
        </button>
        <button
          className={`tab-button ${activeTab === 'realtime' ? 'active' : ''}`}
          onClick={() => handleTabChange('realtime')}
        >
          Real-time Mode
        </button>
      </div>
      
      {/* Side Panel - always visible with map selector, toolbar (static mode) and realtime panel (realtime mode) */}
      <SidePanel
        activeMapId={activeMapId}
        onMapChange={setActiveMapId}
        showIcons={showIcons}
        onToggleIcons={setShowIcons}
        viewKeys={activeTab === 'realtime' ? viewKeys : []}
        viewKeyNames={activeTab === 'realtime' ? viewKeyNames : {}}
        connectionStatus={activeTab === 'realtime' ? connectionStatus : {}}
        onAddViewKey={addViewKey}
        onRemoveViewKey={removeViewKey}
        onUpdateViewKeyName={handleUpdateViewKeyName}
        onFocusRoute={handleFocusRoute}
        onFocusPlayer={handleFocusPlayer}
        isRealtimeMode={activeTab === 'realtime'}
        route={activeTab === 'static' ? route : null}
        onLoadRoute={activeTab === 'static' ? loadRoute : undefined}
        onClearRoute={activeTab === 'static' ? clearRoute : undefined}
        hasRoute={activeTab === 'static' ? route !== null : false}
      />
      
      {/* Map Container - shared between modes */}
      <MapContainer
        ref={mapRef}
        route={activeTab === 'static' ? route : null}
        realtimeRoutes={activeTab === 'realtime' ? realtimeRoutes : undefined}
        viewKeyNames={activeTab === 'realtime' ? viewKeyNames : {}}
        activeMapId={activeMapId}
        onMapChange={setActiveMapId}
        showIcons={showIcons}
      />
      
      {/* Route Info - only in static mode */}
      {activeTab === 'static' && <RouteInfo route={route} />}
      
      {/* Error Toast */}
      {(error || realtimeError) && (
        <div className="error-toast">
          {error || realtimeError}
        </div>
      )}
    </div>
  );
}

export default App;
