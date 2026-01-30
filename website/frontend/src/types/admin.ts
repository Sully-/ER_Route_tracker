// Admin types

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
  lastLoginAt: string;
  isAdmin: boolean;
  keyPairCount: number;
  totalRoutePoints: number;
}

export interface AdminUserDetail {
  id: string;
  displayName: string;
  email?: string;
  avatarUrl?: string;
  createdAt: string;
  lastLoginAt: string;
  isAdmin: boolean;
  linkedProviders: Array<{
    provider: string;
    providerUsername: string;
    linkedAt: string;
  }>;
  keyPairs: Array<{
    id: string;
    pushKey: string;
    viewKey: string;
    createdAt: string;
    lastActivityAt: string;
    isActive: boolean;
    pointCount: number;
  }>;
}

export interface AdminRouteSummary {
  id: string;
  pushKey: string;
  viewKey: string;
  createdAt: string;
  lastActivityAt: string;
  isActive: boolean;
  pointCount: number;
  userId?: string;
  userDisplayName?: string;
}

export interface AdminRouteDetail {
  id: string;
  pushKey: string;
  viewKey: string;
  createdAt: string;
  lastActivityAt: string;
  isActive: boolean;
  pointCount: number;
  owner?: AdminUserSummary;
}
