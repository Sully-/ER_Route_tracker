// Route data structures and serialization

use serde::Serialize;
use std::fs::{self, File};
use std::io::Write;
use std::path::PathBuf;
use std::time::SystemTime;

// =============================================================================
// DATA STRUCTURES
// =============================================================================

/// Route point with timestamp (serializable)
#[derive(Clone, Debug, Serialize)]
pub struct RoutePoint {
    /// Local X coordinate (within tile)
    pub x: f32,
    /// Local Y coordinate (altitude)
    pub y: f32,
    /// Local Z coordinate (within tile)
    pub z: f32,
    /// Global X coordinate (world space)
    pub global_x: f32,
    /// Global Y coordinate (altitude, same as y)
    pub global_y: f32,
    /// Global Z coordinate (world space)
    pub global_z: f32,
    /// Map tile ID (packed as 0xWWXXYYDD)
    pub map_id: u32,
    /// Map ID as human-readable string
    pub map_id_str: String,
    /// Timestamp in milliseconds from start of recording
    pub timestamp_ms: u64,
    /// Whether the player is riding Torrent
    pub on_torrent: bool,
}

/// Saved route file structure
#[derive(Debug, Serialize)]
pub struct SavedRoute {
    /// Route name/description
    pub name: String,
    /// Recording date (ISO 8601)
    pub recorded_at: String,
    /// Total duration in seconds
    pub duration_secs: f64,
    /// Recording interval in milliseconds
    pub interval_ms: u64,
    /// Number of points
    pub point_count: usize,
    /// The route points
    pub points: Vec<RoutePoint>,
}

// =============================================================================
// HELPERS
// =============================================================================

/// Simple timestamp generator (without chrono dependency)
pub fn generate_timestamp() -> String {
    let duration = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    
    // Convert to date/time components (approximate, but good enough for filenames)
    let days = secs / 86400;
    let years = 1970 + days / 365;
    let remaining_days = days % 365;
    let months = remaining_days / 30 + 1;
    let day = remaining_days % 30 + 1;
    let hours = (secs % 86400) / 3600;
    let minutes = (secs % 3600) / 60;
    let seconds = secs % 60;
    
    format!("{:04}-{:02}-{:02} {:02}:{:02}:{:02}", 
            years, months, day, hours, minutes, seconds)
}

// =============================================================================
// ROUTE SAVING
// =============================================================================

/// Save a route to a JSON file
pub fn save_route_to_file(
    route: &[RoutePoint],
    base_dir: &PathBuf,
    routes_directory: &str,
    interval_ms: u64,
) -> Result<PathBuf, String> {
    if route.is_empty() {
        return Err("No route data to save".to_string());
    }
    
    // Create routes directory
    let routes_dir = base_dir.join(routes_directory);
    if !routes_dir.exists() {
        fs::create_dir_all(&routes_dir)
            .map_err(|e| format!("Failed to create routes directory: {}", e))?;
    }
    
    // Generate filename with timestamp
    let now = generate_timestamp();
    let filename = format!("route_{}.json", now.replace(":", "-").replace(" ", "_"));
    let filepath = routes_dir.join(&filename);
    
    // Calculate total duration
    let duration_secs = route.last()
        .map(|p| p.timestamp_ms as f64 / 1000.0)
        .unwrap_or(0.0);
    
    // Create saved route structure
    let saved_route = SavedRoute {
        name: format!("Route {}", now),
        recorded_at: now,
        duration_secs,
        interval_ms,
        point_count: route.len(),
        points: route.to_vec(),
    };
    
    // Serialize to JSON
    let json = serde_json::to_string_pretty(&saved_route)
        .map_err(|e| format!("Failed to serialize route: {}", e))?;
    
    // Write to file
    let mut file = File::create(&filepath)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    file.write_all(json.as_bytes())
        .map_err(|e| format!("Failed to write file: {}", e))?;
    
    Ok(filepath)
}



