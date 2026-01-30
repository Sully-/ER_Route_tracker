import { useState, useEffect } from 'react';
import { getCurrentUser } from '../services/authService';
import { getAllUsers, getUserDetail, getAllRoutes, getRouteDetail, deleteUser, deleteRoute } from '../services/adminService';
import type { User } from '../types/auth';
import type { AdminUserSummary, AdminUserDetail, AdminRouteSummary, AdminRouteDetail } from '../types/admin';
import './AdminPage.css';

type TabType = 'users' | 'routes';

export default function AdminPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('users');
  
  // Users data
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [loadingUserDetail, setLoadingUserDetail] = useState(false);
  
  // Routes data
  const [routes, setRoutes] = useState<AdminRouteSummary[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<AdminRouteDetail | null>(null);
  const [loadingRouteDetail, setLoadingRouteDetail] = useState(false);

  // Delete confirmation states
  const [confirmDeleteUser, setConfirmDeleteUser] = useState(false);
  const [confirmDeleteRoute, setConfirmDeleteRoute] = useState(false);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deletingRoute, setDeletingRoute] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const user = await getCurrentUser();
      setCurrentUser(user);
      
      if (user?.isAdmin) {
        const [usersData, routesData] = await Promise.all([
          getAllUsers(),
          getAllRoutes()
        ]);
        setUsers(usersData);
        setRoutes(routesData);
      }
    } catch (err) {
      console.error('Error loading admin data:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleUserClick(userId: string) {
    setLoadingUserDetail(true);
    try {
      const detail = await getUserDetail(userId);
      setSelectedUser(detail);
    } catch (err) {
      console.error('Error loading user detail:', err);
    } finally {
      setLoadingUserDetail(false);
    }
  }

  async function handleRouteClick(pushKey: string) {
    setLoadingRouteDetail(true);
    try {
      const detail = await getRouteDetail(pushKey);
      setSelectedRoute(detail);
    } catch (err) {
      console.error('Error loading route detail:', err);
    } finally {
      setLoadingRouteDetail(false);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatNumber(num: number): string {
    return num.toLocaleString('fr-FR');
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  async function handleDeleteUser() {
    if (!selectedUser || deletingUser) return;
    
    // Prevent admin from deleting themselves
    if (selectedUser.id === currentUser?.id) {
      alert('You cannot delete your own account');
      return;
    }

    setDeletingUser(true);
    try {
      const success = await deleteUser(selectedUser.id);
      if (success) {
        // Remove user from list and close modal
        setUsers(prev => prev.filter(u => u.id !== selectedUser.id));
        // Also remove routes owned by this user
        setRoutes(prev => prev.filter(r => r.userId !== selectedUser.id));
        setSelectedUser(null);
        setConfirmDeleteUser(false);
      } else {
        alert('Failed to delete user');
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      alert('Failed to delete user');
    } finally {
      setDeletingUser(false);
    }
  }

  async function handleDeleteRoute() {
    if (!selectedRoute || deletingRoute) return;

    setDeletingRoute(true);
    try {
      const success = await deleteRoute(selectedRoute.pushKey);
      if (success) {
        // Remove route from list and close modal
        setRoutes(prev => prev.filter(r => r.pushKey !== selectedRoute.pushKey));
        setSelectedRoute(null);
        setConfirmDeleteRoute(false);
      } else {
        alert('Failed to delete route');
      }
    } catch (err) {
      console.error('Error deleting route:', err);
      alert('Failed to delete route');
    } finally {
      setDeletingRoute(false);
    }
  }

  function closeUserModal() {
    setSelectedUser(null);
    setConfirmDeleteUser(false);
  }

  function closeRouteModal() {
    setSelectedRoute(null);
    setConfirmDeleteRoute(false);
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <div className="admin-loading">Loading...</div>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <div className="admin-error">Not authenticated</div>
          <a href="/" className="back-link">Back to home</a>
        </div>
      </div>
    );
  }

  if (!currentUser.isAdmin) {
    return (
      <div className="admin-page">
        <div className="admin-container">
          <div className="admin-forbidden">Access denied. Admin privileges required.</div>
          <a href="/" className="back-link">Back to home</a>
        </div>
      </div>
    );
  }

  const totalRoutePoints = routes.reduce((sum, r) => sum + r.pointCount, 0);

  return (
    <div className="admin-page">
      <div className="admin-container">
        <header className="admin-header">
          <a href="/" className="back-link">&larr; Back to map</a>
          <h1>Admin Dashboard</h1>
        </header>

        {/* Stats */}
        <div className="admin-stats">
          <div className="admin-stat">
            <div className="admin-stat-value">{formatNumber(users.length)}</div>
            <div className="admin-stat-label">Users</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{formatNumber(routes.length)}</div>
            <div className="admin-stat-label">Routes</div>
          </div>
          <div className="admin-stat">
            <div className="admin-stat-value">{formatNumber(totalRoutePoints)}</div>
            <div className="admin-stat-label">Total Route Points</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          <button
            className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users ({users.length})
          </button>
          <button
            className={`admin-tab ${activeTab === 'routes' ? 'active' : ''}`}
            onClick={() => setActiveTab('routes')}
          >
            Routes ({routes.length})
          </button>
        </div>

        {/* Content */}
        <div className="admin-content">
          {activeTab === 'users' && (
            <>
              {users.length === 0 ? (
                <div className="admin-no-data">No users found</div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th>Created</th>
                        <th>Last Login</th>
                        <th>Keys</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(user => (
                        <tr key={user.id} onClick={() => handleUserClick(user.id)}>
                          <td>
                            <div className="user-cell">
                              {user.avatarUrl ? (
                                <img src={user.avatarUrl} alt="" className="user-avatar" />
                              ) : (
                                <div className="user-avatar-placeholder">
                                  {user.displayName.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <span className="user-name">
                                {user.displayName}
                                {user.isAdmin && <span className="admin-badge">ADMIN</span>}
                              </span>
                            </div>
                          </td>
                          <td className="email-cell">{user.email || '-'}</td>
                          <td>{formatDate(user.createdAt)}</td>
                          <td>{formatDate(user.lastLoginAt)}</td>
                          <td>{user.keyPairCount}</td>
                          <td>{formatNumber(user.totalRoutePoints)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {activeTab === 'routes' && (
            <>
              {routes.length === 0 ? (
                <div className="admin-no-data">No routes found</div>
              ) : (
                <div className="admin-table-wrapper">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Push Key</th>
                        <th>Owner</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Last Activity</th>
                        <th>Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {routes.map(route => (
                        <tr key={route.id} onClick={() => handleRouteClick(route.pushKey)}>
                          <td>
                            <code className="key-value" title={route.pushKey}>{route.pushKey.substring(0, 12)}...</code>
                          </td>
                          <td>{route.userDisplayName || <em className="anonymous-text">Anonymous</em>}</td>
                          <td>
                            <span className={route.isActive ? 'status-active' : 'status-inactive'}>
                              {route.isActive ? 'Active' : 'Inactive'}
                            </span>
                          </td>
                          <td>{formatDate(route.createdAt)}</td>
                          <td>{formatDate(route.lastActivityAt)}</td>
                          <td>{formatNumber(route.pointCount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* User Detail Modal */}
        {(selectedUser || loadingUserDetail) && (
          <div className="admin-detail-overlay" onClick={() => !loadingUserDetail && closeUserModal()}>
            <div className="admin-detail-panel" onClick={e => e.stopPropagation()}>
              <button className="admin-detail-close" onClick={closeUserModal}>&times;</button>
              
              {loadingUserDetail ? (
                <div className="admin-loading">Loading user details...</div>
              ) : selectedUser && (
                <>
                  <div className="admin-detail-header">
                    {selectedUser.avatarUrl ? (
                      <img src={selectedUser.avatarUrl} alt="" className="admin-detail-avatar" />
                    ) : (
                      <div className="admin-detail-avatar-placeholder">
                        {selectedUser.displayName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="admin-detail-info">
                      <h2>
                        {selectedUser.displayName}
                        {selectedUser.isAdmin && <span className="admin-badge">ADMIN</span>}
                      </h2>
                      <p>{selectedUser.email || 'No email'}</p>
                    </div>
                  </div>

                  <div className="admin-detail-section">
                    <h3>Account Info</h3>
                    <div className="admin-detail-grid">
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">User ID</div>
                        <div className="admin-detail-item-value key">{selectedUser.id}</div>
                      </div>
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">Created</div>
                        <div className="admin-detail-item-value">{formatDate(selectedUser.createdAt)}</div>
                      </div>
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">Last Login</div>
                        <div className="admin-detail-item-value">{formatDate(selectedUser.lastLoginAt)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="admin-detail-section">
                    <h3>Linked Providers ({selectedUser.linkedProviders.length})</h3>
                    {selectedUser.linkedProviders.length === 0 ? (
                      <div className="admin-no-data">No linked providers</div>
                    ) : (
                      <div className="admin-provider-list">
                        {selectedUser.linkedProviders.map((lp, i) => (
                          <div key={i} className="admin-provider-item">
                            <strong>{lp.provider}</strong>
                            <span>{lp.providerUsername}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="admin-detail-section">
                    <h3>Key Pairs ({selectedUser.keyPairs.length})</h3>
                    {selectedUser.keyPairs.length === 0 ? (
                      <div className="admin-no-data">No key pairs</div>
                    ) : (
                      <div className="admin-keypair-list">
                        {selectedUser.keyPairs.map(kp => (
                          <div key={kp.id} className="admin-keypair-item">
                            <div className="admin-keypair-keys">
                              <div className="admin-keypair-key">
                                <label>Push Key</label>
                                <div className="key-with-copy">
                                  <code>{kp.pushKey}</code>
                                  <button 
                                    className="copy-btn"
                                    onClick={() => handleCopy(kp.pushKey)}
                                    title="Copy Push Key"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>
                              <div className="admin-keypair-key">
                                <label>View Key</label>
                                <div className="key-with-copy">
                                  <code>{kp.viewKey}</code>
                                  <button 
                                    className="copy-btn"
                                    onClick={() => handleCopy(kp.viewKey)}
                                    title="Copy View Key"
                                  >
                                    Copy
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="admin-keypair-meta">
                              <span>Points: {formatNumber(kp.pointCount)}</span>
                              <span>Created: {formatDate(kp.createdAt)}</span>
                              <span>Last Activity: {formatDate(kp.lastActivityAt)}</span>
                              <span className={kp.isActive ? 'status-active' : 'status-inactive'}>
                                {kp.isActive ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Delete User Section */}
                  <div className="admin-detail-section admin-danger-zone">
                    <h3>Danger Zone</h3>
                    {selectedUser.id === currentUser?.id ? (
                      <div className="admin-no-data">You cannot delete your own account</div>
                    ) : confirmDeleteUser ? (
                      <div className="delete-confirm">
                        <p>Are you sure you want to delete this user? This will also delete all their routes and data. This action cannot be undone.</p>
                        <div className="delete-confirm-actions">
                          <button 
                            className="delete-btn delete-btn-danger"
                            onClick={handleDeleteUser}
                            disabled={deletingUser}
                          >
                            {deletingUser ? 'Deleting...' : 'Yes, Delete User'}
                          </button>
                          <button 
                            className="delete-btn delete-btn-cancel"
                            onClick={() => setConfirmDeleteUser(false)}
                            disabled={deletingUser}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        className="delete-btn delete-btn-danger"
                        onClick={() => setConfirmDeleteUser(true)}
                      >
                        Delete User
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Route Detail Modal */}
        {(selectedRoute || loadingRouteDetail) && (
          <div className="admin-detail-overlay" onClick={() => !loadingRouteDetail && closeRouteModal()}>
            <div className="admin-detail-panel" onClick={e => e.stopPropagation()}>
              <button className="admin-detail-close" onClick={closeRouteModal}>&times;</button>
              
              {loadingRouteDetail ? (
                <div className="admin-loading">Loading route details...</div>
              ) : selectedRoute && (
                <>
                  <div className="admin-detail-header">
                    <div className="admin-detail-info">
                      <h2>Route Details</h2>
                      <p>
                        <span className={selectedRoute.isActive ? 'status-active' : 'status-inactive'}>
                          {selectedRoute.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="admin-detail-section">
                    <h3>Keys</h3>
                    <div className="admin-detail-grid">
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">Push Key</div>
                        <div className="admin-detail-item-value key">{selectedRoute.pushKey}</div>
                        <button 
                          className="copy-btn copy-btn-block"
                          onClick={() => handleCopy(selectedRoute.pushKey)}
                          title="Copy Push Key"
                        >
                          Copy
                        </button>
                      </div>
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">View Key</div>
                        <div className="admin-detail-item-value key">{selectedRoute.viewKey}</div>
                        <button 
                          className="copy-btn copy-btn-block"
                          onClick={() => handleCopy(selectedRoute.viewKey)}
                          title="Copy View Key"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="admin-detail-section">
                    <h3>Statistics</h3>
                    <div className="admin-detail-grid">
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">Total Points</div>
                        <div className="admin-detail-item-value">{formatNumber(selectedRoute.pointCount)}</div>
                      </div>
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">Created</div>
                        <div className="admin-detail-item-value">{formatDate(selectedRoute.createdAt)}</div>
                      </div>
                      <div className="admin-detail-item">
                        <div className="admin-detail-item-label">Last Activity</div>
                        <div className="admin-detail-item-value">{formatDate(selectedRoute.lastActivityAt)}</div>
                      </div>
                    </div>
                  </div>

                  {selectedRoute.owner && (
                    <div className="admin-detail-section">
                      <h3>Owner</h3>
                      <div className="admin-detail-grid">
                        <div className="admin-detail-item">
                          <div className="admin-detail-item-label">Display Name</div>
                          <div className="admin-detail-item-value">{selectedRoute.owner.displayName}</div>
                        </div>
                        <div className="admin-detail-item">
                          <div className="admin-detail-item-label">Email</div>
                          <div className="admin-detail-item-value">{selectedRoute.owner.email || '-'}</div>
                        </div>
                        <div className="admin-detail-item">
                          <div className="admin-detail-item-label">User ID</div>
                          <div className="admin-detail-item-value key">{selectedRoute.owner.id}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {!selectedRoute.owner && (
                    <div className="admin-detail-section">
                      <h3>Owner</h3>
                      <div className="admin-no-data">Anonymous route (no owner)</div>
                    </div>
                  )}

                  {/* Delete Route Section */}
                  <div className="admin-detail-section admin-danger-zone">
                    <h3>Danger Zone</h3>
                    {confirmDeleteRoute ? (
                      <div className="delete-confirm">
                        <p>Are you sure you want to delete this route? All {formatNumber(selectedRoute.pointCount)} route points will be permanently deleted. This action cannot be undone.</p>
                        <div className="delete-confirm-actions">
                          <button 
                            className="delete-btn delete-btn-danger"
                            onClick={handleDeleteRoute}
                            disabled={deletingRoute}
                          >
                            {deletingRoute ? 'Deleting...' : 'Yes, Delete Route'}
                          </button>
                          <button 
                            className="delete-btn delete-btn-cancel"
                            onClick={() => setConfirmDeleteRoute(false)}
                            disabled={deletingRoute}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button 
                        className="delete-btn delete-btn-danger"
                        onClick={() => setConfirmDeleteRoute(true)}
                      >
                        Delete Route
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
