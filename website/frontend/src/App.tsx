import { useRef, useState } from 'react';
import MapContainer, { MapContainerHandle } from './components/Map/MapContainer';
import RouteInfo from './components/RouteInfo/RouteInfo';
import SidePanel from './components/SidePanel/SidePanel';
import { useRouteLoader } from './hooks/useRouteLoader';
import { useRealtimeRoutes } from './hooks/useRealtimeRoutes';
import { DEFAULT_MAP_ID } from './utils/calibration';
import './App.css';

type TabMode = 'static' | 'realtime';

function App() {
  const mapRef = useRef<MapContainerHandle>(null);
  const [activeTab, setActiveTab] = useState<TabMode>('static');
  const [activeMapId, setActiveMapId] = useState<string>(DEFAULT_MAP_ID);
  const [showIcons, setShowIcons] = useState<boolean>(true);
  
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

  const handleFocusRoute = () => {
    mapRef.current?.focusRoute();
  };

  return (
    <div className={`app ${activeTab === 'realtime' ? 'realtime-mode' : ''}`}>
      {/* Tab Navigation */}
      <div className="tab-bar">
      <h1 className="toolbar-title">Elden Ring Route Viewer</h1>
      <span className="alpha-badge">⚠️ ALPHA</span>
        <button
          className={`tab-button ${activeTab === 'static' ? 'active' : ''}`}
          onClick={() => setActiveTab('static')}
        >
          Static Mode
        </button>
        <button
          className={`tab-button ${activeTab === 'realtime' ? 'active' : ''}`}
          onClick={() => setActiveTab('realtime')}
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
        connectionStatus={activeTab === 'realtime' ? connectionStatus : {}}
        onAddViewKey={addViewKey}
        onRemoveViewKey={removeViewKey}
        onFocusRoute={handleFocusRoute}
        hasRoutes={Object.keys(realtimeRoutes).length > 0}
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
