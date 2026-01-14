import { useState, useRef } from 'react';
import { ConnectionStatus } from '../../hooks/useRealtimeRoutes';
import { MAP_CONFIGS } from '../../utils/calibration';
import { detectMapTransitions } from '../../utils/routeAnalysis';
import { useMapIcons } from '../../hooks/useMapIcons';
import { Route } from '../../types/route';
import ColorPicker from '../ColorPicker/ColorPicker';
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
  viewKeyNames: Record<string, string>;
  connectionStatus: Record<string, ConnectionStatus>;
  onAddViewKey: (viewKey: string) => void;
  onRemoveViewKey: (viewKey: string) => void;
  onUpdateViewKeyName: (viewKey: string, name: string) => void;
  onFocusPlayer: (viewKey: string) => void;
  // Active tracking props
  trackedViewKey?: string | null;
  onSetTrackedRoute?: (viewKey: string | null) => void;
  // Static routes management props (multiple routes)
  staticRoutes?: Record<string, Route>;
  staticRouteIds?: string[];
  staticRouteNames?: Record<string, string>;
  onAddStaticRoute?: (file: File) => void;
  onRemoveStaticRoute?: (routeId: string) => void;
  onUpdateStaticRouteName?: (routeId: string, name: string) => void;
  onFocusStaticRoute?: (routeId: string) => void;
  // Route colors props
  routeColors?: Record<string, string>;
  onUpdateRouteColor?: (routeId: string, color: string) => void;
  // Route visibility props
  routeVisibility?: Record<string, boolean>;
  onToggleRouteVisibility?: (routeId: string) => void;
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
  viewKeyNames,
  connectionStatus,
  onAddViewKey,
  onRemoveViewKey,
  onUpdateViewKeyName,
  onFocusPlayer: _onFocusPlayer, // Kept for interface compatibility, replaced by tracking
  trackedViewKey,
  onSetTrackedRoute,
  staticRoutes = {},
  staticRouteIds = [],
  staticRouteNames = {},
  onAddStaticRoute,
  onRemoveStaticRoute,
  onUpdateStaticRouteName,
  onFocusStaticRoute,
  routeColors = {},
  onUpdateRouteColor,
  routeVisibility = {},
  onToggleRouteVisibility,
}: SidePanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [editingViewKey, setEditingViewKey] = useState<string | null>(null);
  const [editingStaticRouteId, setEditingStaticRouteId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [colorPickerRouteId, setColorPickerRouteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const staticRouteNameInputRef = useRef<HTMLInputElement>(null);

  // Load map icons
  const { icons, isLoading: iconsLoading } = useMapIcons({ mapId: activeMapId });

  // Detect transitions in first static route (if any)
  const firstStaticRoute = staticRouteIds.length > 0 ? staticRoutes[staticRouteIds[0]] : null;
  const transitions = firstStaticRoute ? detectMapTransitions(firstStaticRoute) : [];

  // Get all available maps
  const availableMaps = Object.values(MAP_CONFIGS);

  // Static routes file handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onAddStaticRoute) {
      onAddStaticRoute(file);
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
  
  const handleStartEditingName = (viewKey: string) => {
    setEditingViewKey(viewKey);
    setEditingName(viewKeyNames[viewKey] || '');
    // Focus input after a small delay to ensure it's rendered
    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 0);
  };
  
  const handleSaveName = (viewKey: string) => {
    onUpdateViewKeyName(viewKey, editingName);
    setEditingViewKey(null);
    setEditingName('');
  };
  
  const handleCancelEdit = () => {
    setEditingViewKey(null);
    setEditingName('');
  };
  
  const handleNameInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, viewKey: string) => {
    if (e.key === 'Enter') {
      handleSaveName(viewKey);
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  // Static route name editing handlers
  const handleStartEditingStaticRouteName = (routeId: string) => {
    setEditingStaticRouteId(routeId);
    setEditingName(staticRouteNames[routeId] || '');
    setTimeout(() => {
      staticRouteNameInputRef.current?.focus();
      staticRouteNameInputRef.current?.select();
    }, 0);
  };

  const handleSaveStaticRouteName = (routeId: string) => {
    if (onUpdateStaticRouteName) {
      onUpdateStaticRouteName(routeId, editingName);
    }
    setEditingStaticRouteId(null);
    setEditingName('');
  };

  const handleCancelStaticRouteEdit = () => {
    setEditingStaticRouteId(null);
    setEditingName('');
  };

  const handleStaticRouteNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, routeId: string) => {
    if (e.key === 'Enter') {
      handleSaveStaticRouteName(routeId);
    } else if (e.key === 'Escape') {
      handleCancelStaticRouteEdit();
    }
  };

  const getStaticRouteDisplayName = (routeId: string): string => {
    const name = staticRouteNames[routeId];
    if (name && name.trim()) {
      return name.trim();
    }
    return 'Unnamed Route';
  };
  
  const getDisplayName = (viewKey: string): string => {
    const name = viewKeyNames[viewKey];
    if (name && name.trim()) {
      return name.trim();
    }
    return `${viewKey.substring(0, 8)}...${viewKey.substring(viewKey.length - 4)}`;
  };

  const getRouteColorForId = (routeId: string, index?: number): string => {
    if (routeColors[routeId]) {
      return routeColors[routeId];
    }
    if (index !== undefined) {
      return getRouteColor(index);
    }
    return '#8b7355'; // Default static route color
  };

  const handleOpenColorPicker = (routeId: string) => {
    setColorPickerRouteId(routeId);
  };

  const handleCloseColorPicker = () => {
    setColorPickerRouteId(null);
  };

  const handleColorSelect = (color: string) => {
    if (colorPickerRouteId && onUpdateRouteColor) {
      onUpdateRouteColor(colorPickerRouteId, color);
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
            {showIcons ? '🗺️ Icons ON' : '🗺️ Icons OFF'}
          </button>
          {showIcons && !iconsLoading && (
            <span className="icon-count">
              {icons.length} icons
            </span>
          )}
          {iconsLoading && (
            <span className="icon-count">
              Loading...
            </span>
          )}
        </div>
        {transitions.length > 0 && (
          <div className="transitions-info">
            <span className="transitions-icon">⟳</span>
            {transitions.length} transition
            {transitions.length > 1 ? 's' : ''} in route
          </div>
        )}
      </div>

      {/* Static Routes Management - always visible */}
      <div className="side-panel-section">
        <h2 className="side-panel-title">Static Routes</h2>
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
        </div>

        {/* Static Routes List */}
        {staticRouteIds.length > 0 && (
          <div className="realtime-keys-list">
            {staticRouteIds.map((routeId, index) => {
              const routeColor = getRouteColorForId(routeId, index);
              const isVisible = routeVisibility[routeId] !== false;
              return (
                <div
                  key={routeId}
                  className={`realtime-key-item ${!isVisible ? 'hidden' : ''}`}
                  style={{ borderLeftColor: routeColor }}
                >
                  <button
                    className="realtime-key-color-btn"
                    onClick={() => handleOpenColorPicker(routeId)}
                    title="Change color"
                    style={{ backgroundColor: routeColor }}
                  />
                  <button
                    className="route-visibility-btn"
                    onClick={() => onToggleRouteVisibility?.(routeId)}
                    title={isVisible ? "Hide route" : "Show route"}
                  >
                    {isVisible ? '👁️' : '👁️‍🗨️'}
                  </button>
                  {editingStaticRouteId === routeId ? (
                    <input
                      ref={staticRouteNameInputRef}
                      type="text"
                      className="realtime-key-name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleSaveStaticRouteName(routeId)}
                      onKeyDown={(e) => handleStaticRouteNameKeyDown(e, routeId)}
                      placeholder="Route name"
                      maxLength={50}
                    />
                  ) : (
                    <span
                      className="realtime-key-text"
                      onClick={() => handleStartEditingStaticRouteName(routeId)}
                      title="Click to edit name"
                      style={{ cursor: 'pointer' }}
                    >
                      {getStaticRouteDisplayName(routeId)}
                    </span>
                  )}
                  <button
                    className="realtime-focus-player-btn"
                    onClick={() => onFocusStaticRoute?.(routeId)}
                    title="Focus on this route"
                  >
                    Focus
                  </button>
                  <button
                    className="realtime-remove-btn"
                    onClick={() => onRemoveStaticRoute?.(routeId)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {staticRouteIds.length === 0 && (
          <div className="realtime-empty">
            <p>No static route loaded.</p>
            <p className="realtime-hint">
              Click "Load Route" to load a JSON file.
            </p>
          </div>
        )}
      </div>

      {/* Real-time Routes - always visible */}
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
            {viewKeys.map((key, index) => {
              const routeColor = getRouteColorForId(key, index);
              const isVisible = routeVisibility[key] !== false;
              return (
                <div
                  key={key}
                  className={`realtime-key-item ${!isVisible ? 'hidden' : ''}`}
                  style={{ borderLeftColor: routeColor }}
                >
                  <button
                    className="realtime-key-color-btn"
                    onClick={() => handleOpenColorPicker(key)}
                    title="Change color"
                    style={{ backgroundColor: routeColor }}
                  />
                  <button
                    className="route-visibility-btn"
                    onClick={() => onToggleRouteVisibility?.(key)}
                    title={isVisible ? "Hide route" : "Show route"}
                  >
                    {isVisible ? '👁️' : '👁️‍🗨️'}
                  </button>
                  {editingViewKey === key ? (
                    <input
                      ref={nameInputRef}
                      type="text"
                      className="realtime-key-name-input"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={() => handleSaveName(key)}
                      onKeyDown={(e) => handleNameInputKeyDown(e, key)}
                      placeholder="Player name"
                      maxLength={50}
                    />
                  ) : (
                    <span
                      className="realtime-key-text"
                      onClick={() => handleStartEditingName(key)}
                      title="Click to edit name"
                      style={{ cursor: 'pointer' }}
                    >
                      {getDisplayName(key)}
                    </span>
                  )}
                  <span className="realtime-key-status">
                    {getStatusIcon(connectionStatus[key] || 'disconnected')}
                    <span className="realtime-status-text">
                      {getStatusText(connectionStatus[key] || 'disconnected')}
                    </span>
                  </span>
                  <button
                    className={`realtime-track-btn ${trackedViewKey === key ? 'active' : ''}`}
                    onClick={() => onSetTrackedRoute?.(trackedViewKey === key ? null : key)}
                    title={trackedViewKey === key ? "Stop tracking" : "Track this player"}
                  >
                    {trackedViewKey === key ? 'Tracking' : 'Track'}
                  </button>
                  <button
                    className="realtime-remove-btn"
                    onClick={() => onRemoveViewKey(key)}
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              );
            })}
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

      {/* Color Picker Modal */}
      {colorPickerRouteId && (
        <ColorPicker
          selectedColor={getRouteColorForId(colorPickerRouteId)}
          onColorSelect={handleColorSelect}
          onClose={handleCloseColorPicker}
        />
      )}
    </div>
  );
}

export default SidePanel;
