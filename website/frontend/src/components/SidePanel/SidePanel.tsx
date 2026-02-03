import { useState, useRef } from 'react';
import { ConnectionStatus } from '../../hooks/useRealtimeRoutes';
import { MAP_CONFIGS } from '../../utils/calibration';
import { detectMapTransitions } from '../../utils/routeAnalysis';
import { useMapIcons } from '../../hooks/useMapIcons';
import { Route } from '../../types/route';
import { User, KeyPairInfo, OAuthProvider, OAUTH_PROVIDERS, PROVIDER_ICONS } from '../../types/auth';
import ColorPicker from '../ColorPicker/ColorPicker';
import AddKeysForm from '../Auth/AddKeysForm';
import './SidePanel.css';

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
  // Route selection props
  selectedRouteId?: string | null;
  onSelectRoute?: (routeId: string | null) => void;
  // Authentication props
  user?: User | null;
  isAuthLoading?: boolean;
  savedKeys?: KeyPairInfo[];
  onLogin?: (provider: OAuthProvider) => void;
  onLogout?: () => void;
  onGenerateKeys?: () => Promise<{ pushKey: string; viewKey: string } | null>;
  onAddKeyPair?: (pushKey: string, viewKey: string) => Promise<{ success: boolean; error?: string }>;
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
  selectedRouteId,
  onSelectRoute,
  // Authentication props
  user,
  isAuthLoading = false,
  savedKeys = [],
  onLogin,
  onLogout,
  onGenerateKeys,
  onAddKeyPair,
}: SidePanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedKeys | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [editingViewKey, setEditingViewKey] = useState<string | null>(null);
  const [editingStaticRouteId, setEditingStaticRouteId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>('');
  const [colorPickerRouteId, setColorPickerRouteId] = useState<string | null>(null);
  const [showLoginDropdown, setShowLoginDropdown] = useState(false);
  const [showAddKeysForm, setShowAddKeysForm] = useState(false);
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
      // Use auth-aware generation if available
      if (onGenerateKeys) {
        const result = await onGenerateKeys();
        if (result) {
          setGeneratedKeys({
            pushKey: result.pushKey,
            viewKey: result.viewKey,
          });
          onAddViewKey(result.viewKey);
        } else {
          throw new Error('Failed to generate keys');
        }
      } else {
        // Fallback to direct API call (for non-authenticated users)
        const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'https://localhost:7169';
        const response = await fetch(`${BACKEND_URL}/api/Keys/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        const data = await response.json();
        setGeneratedKeys({
          pushKey: data.pushKey,
          viewKey: data.viewKey,
        });

        // Automatically add the viewKey to the tracked routes
        onAddViewKey(data.viewKey);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate keys';
      setGenerateError(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySavedKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
    } catch {
      console.error('Failed to copy key');
    }
  };

  const handleLoadSavedKey = (viewKey: string) => {
    if (!viewKeys.includes(viewKey)) {
      onAddViewKey(viewKey);
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
      {/* Account Section */}
      <div className="side-panel-section account-section">
        <h2 className="side-panel-title">Account</h2>
        
        {isAuthLoading ? (
          <div className="auth-loading-state">Loading...</div>
        ) : user ? (
          // Authenticated user
          <div className="account-content">
            <div className="account-user-info">
              <div className="account-user-row">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt={user.displayName || 'User'} className="account-avatar" />
                ) : (
                  <div className="account-avatar-placeholder">
                    {(user.displayName || 'U').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="account-user-details">
                  <span className="account-username">{user.displayName || 'Unknown'}</span>
                  <span className="account-provider">
                    {user.linkedProviders?.map(lp => lp.provider).join(', ') || ''}
                  </span>
                </div>
              </div>
              <div className="account-actions">
                <a href="/account" className="account-manage-btn" title="Manage account">
                  Manage
                </a>
                {user.isAdmin && (
                  <a href="/admin" className="account-admin-btn" title="Admin Dashboard">
                    Admin
                  </a>
                )}
                <button className="account-logout-btn" onClick={onLogout} title="Logout">
                  Logout
                </button>
              </div>
            </div>

            {/* Saved Keys */}
            <div className="saved-keys-section">
              <div className="saved-keys-header">
                <span className="saved-keys-title">Saved Keys ({savedKeys.length})</span>
                <button 
                  className="add-keys-btn"
                  onClick={() => setShowAddKeysForm(true)}
                  title="Add existing key pair"
                >
                  + Add
                </button>
              </div>
              
              {savedKeys.length > 0 ? (
                <div className="saved-keys-list">
                  {savedKeys.map((keyPair) => (
                    <div key={keyPair.id} className="saved-key-item">
                      <div className="saved-key-info">
                        <code className="saved-key-value" title={keyPair.viewKey}>
                          {keyPair.viewKey.substring(0, 8)}...
                        </code>
                        <span className="saved-key-date">
                          {new Date(keyPair.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="saved-key-actions">
                        <button
                          className="saved-key-copy-btn"
                          onClick={() => handleCopySavedKey(keyPair.pushKey)}
                          title="Copy Push Key"
                        >
                          Push
                        </button>
                        <button
                          className="saved-key-copy-btn"
                          onClick={() => handleCopySavedKey(keyPair.viewKey)}
                          title="Copy View Key"
                        >
                          View
                        </button>
                        <button
                          className="saved-key-load-btn"
                          onClick={() => handleLoadSavedKey(keyPair.viewKey)}
                          title="Load this key for tracking"
                        >
                          Load
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="saved-keys-empty">
                  No saved keys yet. Generate new keys to save them automatically.
                </div>
              )}
            </div>
          </div>
        ) : (
          // Not authenticated
          <div className="account-login">
            <p className="account-login-hint">
              Sign in to save your keys permanently and access them from any device.
            </p>
            <div className="login-dropdown-container">
              <button 
                className="login-btn"
                onClick={() => setShowLoginDropdown(!showLoginDropdown)}
              >
                Sign In
              </button>
              {showLoginDropdown && (
                <div className="login-providers-dropdown">
                  {OAUTH_PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      className="login-provider-btn"
                      onClick={() => { onLogin?.(provider.id); setShowLoginDropdown(false); }}
                    >
                      <span className="login-provider-icon" dangerouslySetInnerHTML={{ __html: PROVIDER_ICONS[provider.id] }} />
                      <span>{provider.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
              const isSelected = selectedRouteId === routeId;
              return (
                <div
                  key={routeId}
                  className={`realtime-key-item ${!isVisible ? 'hidden' : ''} ${isSelected ? 'selected' : ''}`}
                  style={{ borderLeftColor: routeColor }}
                  onClick={() => onSelectRoute?.(routeId)}
                >
                  <button
                    className="realtime-key-color-btn"
                    onClick={(e) => { e.stopPropagation(); handleOpenColorPicker(routeId); }}
                    title="Change color"
                    style={{ backgroundColor: routeColor }}
                  />
                  <button
                    className="route-visibility-btn"
                    onClick={(e) => { e.stopPropagation(); onToggleRouteVisibility?.(routeId); }}
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
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Route name"
                      maxLength={50}
                    />
                  ) : (
                    <span
                      className="realtime-key-text"
                      onClick={(e) => { e.stopPropagation(); handleStartEditingStaticRouteName(routeId); }}
                      title="Click to edit name"
                      style={{ cursor: 'pointer' }}
                    >
                      {getStaticRouteDisplayName(routeId)}
                    </span>
                  )}
                  <button
                    className="realtime-focus-player-btn"
                    onClick={(e) => { e.stopPropagation(); onSelectRoute?.(routeId); onFocusStaticRoute?.(routeId); }}
                    title="Focus on this route"
                  >
                    Focus
                  </button>
                  <button
                    className="realtime-remove-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveStaticRoute?.(routeId); }}
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
            {/* Show Generate button only for authenticated users */}
            {user && (
              <button
                type="button"
                className="realtime-generate-btn"
                onClick={handleGenerateKeys}
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating...' : 'Generate'}
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

        {/* Auth hint for non-authenticated users */}
        {!user && !isAuthLoading && (
          <div className="realtime-auth-hint">
            Please log in to generate new tracking keys.
          </div>
        )}

        {viewKeys.length > 0 && (
          <div className="realtime-keys-list">
            {viewKeys.map((key, index) => {
              const routeColor = getRouteColorForId(key, index);
              const isVisible = routeVisibility[key] !== false;
              const isSelected = selectedRouteId === key;
              return (
                <div
                  key={key}
                  className={`realtime-key-item ${!isVisible ? 'hidden' : ''} ${isSelected ? 'selected' : ''}`}
                  style={{ borderLeftColor: routeColor }}
                  onClick={() => onSelectRoute?.(key)}
                >
                  <button
                    className="realtime-key-color-btn"
                    onClick={(e) => { e.stopPropagation(); handleOpenColorPicker(key); }}
                    title="Change color"
                    style={{ backgroundColor: routeColor }}
                  />
                  <button
                    className="route-visibility-btn"
                    onClick={(e) => { e.stopPropagation(); onToggleRouteVisibility?.(key); }}
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
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Player name"
                      maxLength={50}
                    />
                  ) : (
                    <span
                      className="realtime-key-text"
                      onClick={(e) => { e.stopPropagation(); handleStartEditingName(key); }}
                      title="Click to edit name"
                      style={{ cursor: 'pointer' }}
                    >
                      {getDisplayName(key)}
                    </span>
                  )}
                  <span className="realtime-key-status" onClick={(e) => e.stopPropagation()}>
                    {getStatusIcon(connectionStatus[key] || 'disconnected')}
                    <span className="realtime-status-text">
                      {getStatusText(connectionStatus[key] || 'disconnected')}
                    </span>
                  </span>
                  <button
                    className={`realtime-track-btn ${trackedViewKey === key ? 'active' : ''}`}
                    onClick={(e) => { e.stopPropagation(); onSetTrackedRoute?.(trackedViewKey === key ? null : key); }}
                    title={trackedViewKey === key ? "Stop tracking" : "Track this player"}
                  >
                    {trackedViewKey === key ? 'Tracking' : 'Track'}
                  </button>
                  <button
                    className="realtime-remove-btn"
                    onClick={(e) => { e.stopPropagation(); onRemoveViewKey(key); }}
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

      {/* Add Keys Form Modal */}
      {showAddKeysForm && onAddKeyPair && (
        <AddKeysForm
          onSubmit={onAddKeyPair}
          onCancel={() => setShowAddKeysForm(false)}
        />
      )}

      {/* Footer */}
      <div className="sidepanel-footer">
        <a href="/privacy" className="privacy-link">Privacy & Terms</a>
      </div>
    </div>
  );
}

export default SidePanel;
