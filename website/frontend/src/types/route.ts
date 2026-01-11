export interface RoutePoint {
  x: number;
  y: number;
  z: number;
  global_x: number;
  global_y: number;
  global_z: number;
  map_id: number;
  map_id_str: string;
  global_map_id: number; // 60 = Lands Between, 61 = Shadow Realm
  timestamp_ms: number;
}

export interface Route {
  name: string;
  recorded_at: string;
  point_count: number;
  duration_secs: number;
  interval_ms?: number;
  points: RoutePoint[];
}

