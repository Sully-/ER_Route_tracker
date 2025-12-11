import { useRef } from 'react';
import MapContainer, { MapContainerHandle } from './components/Map/MapContainer';
import Toolbar from './components/Toolbar/Toolbar';
import RouteInfo from './components/RouteInfo/RouteInfo';
import { useRouteLoader } from './hooks/useRouteLoader';
import './App.css';

function App() {
  const mapRef = useRef<MapContainerHandle>(null);
  const { route, error, loadRoute, clearRoute } = useRouteLoader();

  const handleFocusRoute = () => {
    mapRef.current?.focusRoute();
  };

  return (
    <div className="app">
      <Toolbar
        onLoadRoute={loadRoute}
        onClearRoute={clearRoute}
        onFocusRoute={handleFocusRoute}
        hasRoute={route !== null}
      />
      
      <MapContainer ref={mapRef} route={route} />
      
      <RouteInfo route={route} />
      
      {error && (
        <div className="error-toast">
          {error}
        </div>
      )}
    </div>
  );
}

export default App;

