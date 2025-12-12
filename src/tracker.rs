// Route Tracker - Main tracking logic

use std::path::PathBuf;
use std::time::{Duration, Instant};

use hudhook::tracing::{info, warn};
use libeldenring::prelude::*;
use windows::Win32::Foundation::HINSTANCE;

use crate::config::Config;
use crate::coordinate_transformer::WorldPositionTransformer;
use crate::route::{save_route_to_file, RoutePoint};

// =============================================================================
// ROUTE TRACKER
// =============================================================================

/// Route tracking state
pub struct RouteTracker {
    pub(crate) pointers: Pointers,
    pub(crate) route: Vec<RoutePoint>,
    pub(crate) is_recording: bool,
    pub(crate) start_time: Option<Instant>,
    pub(crate) last_record_time: Instant,
    pub(crate) record_interval: Duration,
    pub(crate) show_ui: bool,
    pub(crate) config: Config,
    pub(crate) base_dir: PathBuf,
    pub(crate) status_message: Option<(String, Instant)>,
    pub(crate) transformer: WorldPositionTransformer,
}

impl RouteTracker {
    /// Create a new RouteTracker instance
    pub fn new(hmodule: HINSTANCE) -> Option<Self> {
        info!("Initializing Route Tracker...");
        
        // Load configuration - REQUIRED (from DLL directory)
        let config = match Config::load(hmodule) {
            Ok(cfg) => cfg,
            Err(e) => {
                hudhook::tracing::error!("Failed to load configuration: {}", e);
                hudhook::tracing::error!(
                    "Please ensure '{}' exists next to the DLL.",
                    Config::CONFIG_FILENAME
                );
                return None;
            }
        };
        
        info!("Keybindings: Toggle UI={}, Toggle Recording={}, Clear={}, Save={}",
            config.keybindings.toggle_ui.name(),
            config.keybindings.toggle_recording.name(),
            config.keybindings.clear_route.name(),
            config.keybindings.save_route.name()
        );
        
        // Get the DLL's directory for saving routes
        let base_dir = Config::get_dll_directory(hmodule)
            .unwrap_or_else(|| PathBuf::from("."));
        
        // Load coordinate transformer CSV
        let csv_path = base_dir.join("WorldMapLegacyConvParam.csv");
        let transformer = match WorldPositionTransformer::from_csv(&csv_path) {
            Ok(t) => {
                info!("Loaded coordinate transformer: {} maps, {} anchors",
                    t.map_count(), t.anchor_count());
                t
            }
            Err(e) => {
                warn!("Failed to load coordinate transformer from {:?}: {}. \
                       Using overworld-only mode.", csv_path, e);
                // Create empty transformer (will only work for m60_* maps)
                WorldPositionTransformer::from_csv("/dev/null").unwrap_or_else(|_| {
                    // Fallback: create with empty anchors
                    WorldPositionTransformer::empty()
                })
            }
        };
        
        let pointers = Pointers::new();
        
        // Wait for the game to be loaded
        let poll_interval = Duration::from_millis(100);
        loop {
            if let Some(menu_timer) = pointers.menu_timer.read() {
                if menu_timer > 0. {
                    break;
                }
            }
            std::thread::sleep(poll_interval);
        }
        
        info!("Route Tracker initialized!");
        
        let record_interval = Duration::from_millis(config.recording.record_interval_ms);
        
        Some(Self {
            pointers,
            route: Vec::new(),
            is_recording: false,
            start_time: None,
            last_record_time: Instant::now(),
            record_interval,
            show_ui: true,
            config,
            base_dir,
            status_message: None,
            transformer,
        })
    }
    
    /// Start recording
    pub fn start_recording(&mut self) {
        self.route.clear();
        self.start_time = Some(Instant::now());
        self.is_recording = true;
        info!("Recording started!");
    }
    
    /// Stop recording
    pub fn stop_recording(&mut self) {
        self.is_recording = false;
        info!("Recording stopped! {} points recorded.", self.route.len());
    }
    
    /// Record current position if the interval has elapsed
    pub fn record_position(&mut self) {
        if !self.is_recording {
            return;
        }

        if self.last_record_time.elapsed() < self.record_interval {
            return;
        }

        if let (Some([x, y, z, _, _]), Some(map_id)) = (
            self.pointers.global_position.read(),
            self.pointers.global_position.read_map_id(),
        ) {
            let timestamp_ms = self.start_time
                .map(|t| t.elapsed().as_millis() as u64)
                .unwrap_or(0);

            // Convert to global coordinates
            let (global_x, global_y, global_z) = self.transformer
                .local_to_world_first(map_id, x, y, z)
                .unwrap_or((x, y, z)); // Fallback to local if conversion fails

            let map_id_str = WorldPositionTransformer::format_map_id(map_id);

            // Detect if player is riding Torrent (Torrent is spawned = player is mounted)
            let on_torrent = self.pointers.torrent_chunk_position.read().is_some();

            self.route.push(RoutePoint {
                x,
                y,
                z,
                global_x,
                global_y,
                global_z,
                map_id,
                map_id_str,
                timestamp_ms,
                on_torrent,
            });

            self.last_record_time = Instant::now();
        }
    }
    
    /// Save the recorded route to a JSON file
    pub fn save_route(&self) -> Result<PathBuf, String> {
        let result = save_route_to_file(
            &self.route,
            &self.base_dir,
            &self.config.output.routes_directory,
            self.config.recording.record_interval_ms,
        );
        
        if let Ok(ref path) = result {
            info!("Route saved to: {}", path.display());
        }
        
        result
    }
    
    /// Set a status message that will be displayed temporarily
    pub fn set_status(&mut self, message: String) {
        self.status_message = Some((message, Instant::now()));
    }
    
    /// Get current status message if still valid (within 3 seconds)
    pub fn get_status(&self) -> Option<&str> {
        self.status_message.as_ref().and_then(|(msg, time)| {
            if time.elapsed() < Duration::from_secs(3) {
                Some(msg.as_str())
            } else {
                None
            }
        })
    }
    
    /// Returns the player's current position (local and global)
    /// Returns: (local_x, local_y, local_z, global_x, global_y, global_z, map_id)
    pub fn get_current_position(&self) -> Option<(f32, f32, f32, f32, f32, f32, u32)> {
        if let (Some([x, y, z, _, _]), Some(map_id)) = (
            self.pointers.global_position.read(),
            self.pointers.global_position.read_map_id(),
        ) {
            // Convert to global coordinates
            let (gx, gy, gz) = self.transformer
                .local_to_world_first(map_id, x, y, z)
                .unwrap_or((x, y, z));
            
            Some((x, y, z, gx, gy, gz, map_id))
        } else {
            None
        }
    }
}



