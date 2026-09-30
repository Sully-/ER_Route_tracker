// Route Tracker - Main tracking logic

use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use hudhook::tracing::{info, warn};
use libeldenring::prelude::*;
use windows::Win32::Foundation::HINSTANCE;

use crate::bosses::BossesTracker;
use crate::config::Config;
use crate::coordinate_transformer::WorldPositionTransformer;
use crate::event_flags::EventFlagReader;
use crate::realtime_client::RealtimeClient;
use crate::route::{save_route_to_file, RoutePoint};

// =============================================================================
// ROUTE TRACKER
// =============================================================================

/// Route tracking state
pub struct RouteTracker {
    pub(crate) pointers: Pointers,
    pub(crate) route: Vec<RoutePoint>,
    pub(crate) is_recording: bool,
    pub(crate) is_streaming: bool,
    /// Start time of current recording session (for UI duration display)
    pub(crate) recording_start_time: Option<Instant>,
    /// Start time of current streaming session (for UI duration display)
    pub(crate) stream_start_time: Option<Instant>,
    pub(crate) last_record_time: Instant,
    pub(crate) last_stream_time: Instant,
    pub(crate) record_interval: Duration,
    pub(crate) show_ui: bool,
    pub(crate) config: Config,
    pub(crate) base_dir: PathBuf,
    pub(crate) status_message: Option<(String, Instant)>,
    pub(crate) transformer: WorldPositionTransformer,
    /// Real-time streaming client (None if disabled)
    pub(crate) realtime_client: Option<RealtimeClient>,
    /// Boss kill tracker (None if disabled or failed to init)
    pub(crate) bosses_tracker: Option<BossesTracker>,
    pub(crate) event_flag_reader: Option<EventFlagReader>,
    pub(crate) last_boss_poll: Instant,
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
        
        info!("Keybindings: Toggle UI={}, Toggle Recording={}, Toggle Streaming={}, Clear={}, Save={}",
            config.keybindings.toggle_ui.name(),
            config.keybindings.toggle_recording.name(),
            config.keybindings.toggle_streaming.name(),
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
        
        // Initialize real-time client if enabled
        let realtime_client = if config.realtime.enabled {
            if let Some(ref push_key) = config.realtime.push_key {
                if !push_key.is_empty() {
                    info!("Real-time streaming enabled: backend={}", config.realtime.backend_url);
                    Some(RealtimeClient::new(
                        config.realtime.backend_url.clone(),
                        push_key.clone(),
                    ))
                } else {
                    warn!("Real-time streaming enabled but push_key is empty. Disabling.");
                    None
                }
            } else {
                warn!("Real-time streaming enabled but push_key is not set. Disabling.");
                None
            }
        } else {
            None
        };

        // Initialize boss kill tracker if enabled
        let (event_flag_reader, bosses_tracker) = if config.bosses.enabled {
            let bosses_path = base_dir
                .join("data")
                .join(&config.bosses.language)
                .join("bosses.json");

            match EventFlagReader::new() {
                Some(reader) => {
                    let tracker = BossesTracker::load(&bosses_path, &reader);
                    (Some(reader), tracker)
                }
                None => {
                    warn!("Boss tracking disabled: event flag reader failed to initialize");
                    (None, None)
                }
            }
        } else {
            (None, None)
        };

        if bosses_tracker.is_some() {
            info!("Boss kill tracking enabled");
        }
        
        Some(Self {
            pointers,
            route: Vec::new(),
            is_recording: false,
            is_streaming: false,
            recording_start_time: None,
            stream_start_time: None,
            last_record_time: Instant::now(),
            last_stream_time: Instant::now(),
            record_interval,
            show_ui: true,
            config,
            base_dir,
            status_message: None,
            transformer,
            realtime_client,
            bosses_tracker,
            event_flag_reader,
            last_boss_poll: Instant::now(),
        })
    }
    
    /// Start recording
    pub fn start_recording(&mut self) {
        self.route.clear();
        self.recording_start_time = Some(Instant::now());
        self.is_recording = true;
        info!("Recording started!");
    }
    
    /// Stop recording
    pub fn stop_recording(&mut self) {
        self.is_recording = false;
        info!("Recording stopped! {} points recorded.", self.route.len());
    }
    
    /// Start streaming
    pub fn start_streaming(&mut self) {
        self.stream_start_time = Some(Instant::now());
        self.is_streaming = true;

        let should_sync = self
            .realtime_client
            .as_ref()
            .map(|client| client.is_configured())
            .unwrap_or(false);

        if should_sync {
            if let (Some(reader), Some(tracker)) =
                (&self.event_flag_reader, &mut self.bosses_tracker)
            {
                tracker.update(reader);
                let killed = tracker.killed_flag_ids();
                if !killed.is_empty() {
                    if let Some(ref client) = self.realtime_client {
                        info!(
                            "Streaming start: syncing {} killed bosses to backend",
                            killed.len()
                        );
                        client.sync_boss_kills(killed);
                    }
                }
            }
        }

        info!("Streaming started!");
    }
    
    /// Stop streaming
    pub fn stop_streaming(&mut self) {
        self.is_streaming = false;
        info!("Streaming stopped!");
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
            // Use absolute Unix timestamp (milliseconds since epoch)
            let timestamp_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            
            // Convert to global coordinates and get the global map ID
            let (global_x, global_y, global_z, global_map_id) = self.transformer
                .local_to_world_with_global_map(map_id, x, y, z)
                .unwrap_or_else(|_| {
                    // Fallback: if conversion fails, determine global map from map_id
                    let (area_no, _, _, _) = WorldPositionTransformer::parse_map_id(map_id);
                    let fallback_global_map = if area_no == 12 {
                        62 // Underground (m62)
                    } else if area_no == 60 || area_no == 61 {
                        area_no
                    } else {
                        60 // Default to m60 if unknown
                    };
                    (x, y, z, fallback_global_map)
                });
            
            let map_id_str = WorldPositionTransformer::format_map_id(map_id);

            // Look/facing direction (yaw) in radians. The live facing angle is
            // held by chunk_position (global_position's angle fields are not the
            // player's facing), stored as a quaternion component -> yaw = 2*asin.
            let angle = self
                .pointers
                .chunk_position
                .angle1
                .read()
                .map(|a1| a1.asin() * 2.0)
                .unwrap_or(0.0);

            self.route.push(RoutePoint {
                x,
                y,
                z,
                global_x,
                global_y,
                global_z,
                map_id,
                map_id_str,
                global_map_id,
                angle,
                timestamp_ms,
            });
            
            self.last_record_time = Instant::now();
        }
    }
    
    /// Stream current position to real-time backend if enabled
    /// This is independent of recording - streams position even when not recording
    pub fn stream_position(&mut self) {
        // Only stream if streaming is enabled and client is configured
        if !self.is_streaming {
            return;
        }
        
        let Some(ref client) = self.realtime_client else {
            return;
        };
        
        // Respect the same interval as recording
        if self.last_stream_time.elapsed() < self.record_interval {
            return;
        }
        
        if let (Some([x, y, z, _, _]), Some(map_id)) = (
            self.pointers.global_position.read(),
            self.pointers.global_position.read_map_id(),
        ) {
            // Use absolute Unix timestamp (milliseconds since epoch)
            // This ensures timestamps are always increasing across game restarts
            let timestamp_ms = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|d| d.as_millis() as u64)
                .unwrap_or(0);
            
            // Convert to global coordinates and get the global map ID
            let (global_x, global_y, global_z, global_map_id) = self.transformer
                .local_to_world_with_global_map(map_id, x, y, z)
                .unwrap_or_else(|_| {
                    // Fallback: if conversion fails, determine global map from map_id
                    let (area_no, _, _, _) = WorldPositionTransformer::parse_map_id(map_id);
                    let fallback_global_map = if area_no == 12 {
                        62 // Underground (m62)
                    } else if area_no == 60 || area_no == 61 {
                        area_no
                    } else {
                        60 // Default to m60 if unknown
                    };
                    (x, y, z, fallback_global_map)
                });
            
            let map_id_str = WorldPositionTransformer::format_map_id(map_id);

            // Look/facing direction (yaw) in radians. See record_position.
            let angle = self
                .pointers
                .chunk_position
                .angle1
                .read()
                .map(|a1| a1.asin() * 2.0)
                .unwrap_or(0.0);

            let point = RoutePoint {
                x,
                y,
                z,
                global_x,
                global_y,
                global_z,
                map_id,
                map_id_str,
                global_map_id,
                angle,
                timestamp_ms,
            };
            
            // Send to real-time backend
            client.send_point(&point);
            
            self.last_stream_time = Instant::now();
        }
    }

    /// Poll boss kill flags and stream newly killed bosses if streaming is active.
    pub fn poll_boss_kills(&mut self) {
        let Some(ref reader) = self.event_flag_reader else {
            return;
        };
        let Some(ref mut tracker) = self.bosses_tracker else {
            return;
        };

        let poll_interval = Duration::from_millis(self.config.bosses.poll_interval_ms);
        if self.last_boss_poll.elapsed() < poll_interval {
            return;
        }
        self.last_boss_poll = Instant::now();

        tracker.update(reader);

        if !self.is_streaming {
            tracker.take_newly_killed();
            return;
        }

        let Some(ref client) = self.realtime_client else {
            tracker.take_newly_killed();
            return;
        };

        let newly_killed = tracker.take_newly_killed();
        if newly_killed.is_empty() {
            return;
        }

        let timestamp_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        for flag_id in newly_killed {
            client.send_boss_kill(flag_id, timestamp_ms);
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



