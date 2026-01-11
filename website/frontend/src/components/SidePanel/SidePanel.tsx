import { useState, useRef } from 'react';
import { ConnectionStatus } from '../../hooks/useRealtimeRoutes';
import { MAP_CONFIGS } from '../../utils/calibration';
import { detectMapTransitions } from '../../utils/routeAnalysis';
import { useMapIcons } from '../../hooks/useMapIcons';
import './SidePanel.css';

// Backend URL - configurable via environment variable
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5192';

interface KeyPairResponse {
  pushKey: string;
  viewKey: string;
}

interface GeneratedKeys {
  pushKey: string;
  viewKey: string;
}

interface SidePanelProps {
  activeMapId: string;
  onMapChange: (mapId: string) => void;
  showIcons: boolean;
  onToggleIcons: (show: boolean) => void;
  viewKeys: string[];
  connectionStatus: Record<string, ConnectionStatus>;
  onAddViewKey: (viewKey: string) => void;
  onRemoveViewKey: (viewKey: string) => void;
  onFocusRoute: () => void;
  hasRoutes: boolean;
  isRealtimeMode: boolean;
  route?: any; // Route data for transitions detection
  // Static mode toolbar props
  onLoadRoute?: (file: File) => void;
  onClearRoute?: () => void;
  hasRoute?: boolean;
}

// Color palette for multiple routes - FLASHY colors for visibility
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

export function getRouteColor(index: number): string {
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

function SidePanel({
  activeMapId,
  onMapChange,
  showIcons,
  onToggleIcons,
  viewKeys,
  connectionStatus,
  onAddViewKey,
  onRemoveViewKey,
  onFocusRoute,
  hasRoutes,
  isRealtimeMode,
  route,
  onLoadRoute,
  onClearRoute,
  hasRoute,
}: SidePanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load map icons
  const { icons, isLoading: iconsLoading } = useMapIcons({ mapId: activeMapId });

  // Detect transitions in route
  const transitions = route ? detectMapTransitions(route) : [];

  // Get all available maps
  const availableMaps = Object.values(MAP_CONFIGS);

  // Static mode file handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onLoadRoute) {
      onLoadRoute(file);
    }
    // Reset input so same file can be loaded again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleLoadClick = () => {
    fileInputRef.current?.click();
  };

  // Realtime mode handlers
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) {
      onAddViewKey(trimmed);
      setInputValue('');
    }
  };

  const handleGenerateKeys = async () => {
    setIsGenerating(true);
    setGenerateError(null);

    try {
      const response = await fetch(`${BACKEND_URL}/api/Keys/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const data: KeyPairResponse = await response.json();
      setGeneratedKeys({
        pushKey: data.pushKey,
        viewKey: data.viewKey,
      });

      // Automatically add the viewKey to the tracked routes
      onAddViewKey(data.viewKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate keys';
      setGenerateError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyKey = async (key: string, type: 'push' | 'view') => {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      console.error(`Failed to copy ${type} key`);
    }
  };

  const handleDismissGeneratedKeys = () => {
    setGeneratedKeys(null);
    setGenerateError(null);
  };

  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return '🟢';
      case 'connecting':
        return '🟡';
      case 'error':
        return '🔴';
      default:
        return '⚪';
    }
  };

  const getStatusText = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="side-panel">
      {/* Map Selection Section - always visible */}
      <div className="side-panel-section">
        <h2 className="side-panel-title">Map Selection</h2>
        <div className="map-selector-buttons">
          {availableMaps.map((mapConfig) => (
            <button
              key={mapConfig.id}
              onClick={() => onMapChange(mapConfig.id)}
              className={`map-selector-btn ${activeMapId === mapConfig.id ? 'active' : ''}`}
            >
              {mapConfig.name}
            </button>
          ))}
        </div>
        <div className="icon-toggle-container">
          <button
            onClick={() => onToggleIcons(!showIcons)}
            className={`icon-toggle-btn ${showIcons ? 'active' : ''}`}
          >
            {showIcons ? '🗺️ Icônes ON' : '🗺️ Icônes OFF'}
          </button>
          {showIcons && !iconsLoading && (
            <span className="icon-count">
              {icons.length} icônes
            </span>
          )}
          {iconsLoading && (
            <span className="icon-count">
              Chargement...
            </span>
          )}
        </div>
        {transitions.length > 0 && (
          <div className="transitions-info">
            <span className="transitions-icon">⟳</span>
            {transitions.length} transition
            {transitions.length > 1 ? 's' : ''} dans la route
          </div>
        )}
      </div>

      {/* Static Mode - Route Management */}
      {!isRealtimeMode && onLoadRoute && (
        <div className="side-panel-section">
          <h2 className="side-panel-title">Route Management</h2>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleFileChange}
            className="file-input"
          />
          <div className="toolbar-buttons">
            <button onClick={handleLoadClick} className="toolbar-btn">
              📂 Load Route
            </button>
            <button 
              onClick={onClearRoute} 
              className="toolbar-btn"
              disabled={!hasRoute}
            >
              🗑️ Clear
            </button>
            <button 
              onClick={onFocusRoute} 
              className="toolbar-btn"
              disabled={!hasRoute}
            >
              🎯 Focus Route
            </button>
          </div>
        </div>
      )}

      {/* Realtime Mode - Route Tracking */}
      {isRealtimeMode && (
        <div className="side-panel-section">
          <h2 className="side-panel-title">Real-time Routes</h2>
          <form className="realtime-form" onSubmit={handleSubmit}>
            <input
              type="text"
              className="realtime-input"
              placeholder="Enter view key (e.g., 550e8400-e29b-41d4-a716-446655440000)"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <div className="realtime-form-buttons">
              <button type="submit" className="realtime-add-btn">
                Add
              </button>
              <button
                type="button"
                className="realtime-generate-btn"
                onClick={handleGenerateKeys}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
              </button>
              {hasRoutes && (
                <button
                  type="button"
                  className="realtime-focus-btn"
                  onClick={onFocusRoute}
                >
                  Focus
                </button>
              )}
            </div>
          </form>

          {/* Generated Keys Display */}
          {generatedKeys && (
            <div className="realtime-generated-keys">
              <div className="generated-keys-header">
                <span className="generated-keys-title">Generated Key Pair</span>
                <button
                  className="generated-keys-dismiss"
                  onClick={handleDismissGeneratedKeys}
                  title="Dismiss"
                >
                  ×
                </button>
              </div>
              <div className="generated-key-row">
                <span className="generated-key-label">Push Key (Writer):</span>
                <code className="generated-key-value">{generatedKeys.pushKey}</code>
                <button
                  className="generated-key-copy"
                  onClick={() => handleCopyKey(generatedKeys.pushKey, 'push')}
                  title="Copy Push Key"
                >
                  📋
                </button>
              </div>
              <div className="generated-key-row">
                <span className="generated-key-label">View Key (Reader):</span>
                <code className="generated-key-value">{generatedKeys.viewKey}</code>
                <button
                  className="generated-key-copy"
                  onClick={() => handleCopyKey(generatedKeys.viewKey, 'view')}
                  title="Copy View Key"
                >
                  📋
                </button>
              </div>
              <p className="generated-keys-hint">
                The View Key has been automatically added to track. Save the Push Key for your tracker!
              </p>
            </div>
          )}

          {/* Generate Error Display */}
          {generateError && (
            <div className="realtime-generate-error">
              <span>⚠️ {generateError}</span>
              <button
                className="generate-error-dismiss"
                onClick={() => setGenerateError(null)}
              >
                ×
              </button>
            </div>
          )}

          {viewKeys.length > 0 && (
            <div className="realtime-keys-list">
              {viewKeys.map((key, index) => (
                <div
                  key={key}
                  className="realtime-key-item"
                  style={{ borderLeftColor: getRouteColor(index) }}
                >
                  <span
                    className="realtime-key-color"
                    style={{ backgroundColor: getRouteColor(index) }}
                  />
                  <span className="realtime-key-text">
                    {key.substring(0, 8)}...{key.substring(key.length - 4)}
                  </span>
                  <span className="realtime-key-status">
                    {getStatusIcon(connectionStatus[key] || 'disconnected')}
                    <span className="realtime-status-text">
                      {getStatusText(connectionStatus[key] || 'disconnected')}
                    </span>
                  </span>
                  <button
                    className="realtime-remove-btn"
                    onClick={() => onRemoveViewKey(key)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {viewKeys.length === 0 && (
            <div className="realtime-empty">
              <p>No routes being tracked.</p>
              <p className="realtime-hint">
                Enter a view key above to start tracking a route in real-time.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default SidePanel;
