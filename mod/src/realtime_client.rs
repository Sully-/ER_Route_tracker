// Real-time streaming client for sending route points to the backend

use hudhook::tracing::{debug, error, info, warn};
use serde::Serialize;
use std::sync::mpsc::{self, Sender, TryRecvError};
use std::thread::{self, JoinHandle};
use std::time::Duration;

use crate::route::RoutePoint;

// =============================================================================
// DATA STRUCTURES
// =============================================================================

/// Request body for sending route points to the backend
#[derive(Debug, Serialize)]
struct RoutePointRequest {
    #[serde(rename = "x")]
    x: f32,
    #[serde(rename = "y")]
    y: f32,
    #[serde(rename = "z")]
    z: f32,
    #[serde(rename = "globalX")]
    global_x: f32,
    #[serde(rename = "globalY")]
    global_y: f32,
    #[serde(rename = "globalZ")]
    global_z: f32,
    #[serde(rename = "mapId")]
    map_id: u32,
    #[serde(rename = "mapIdStr")]
    map_id_str: String,
    #[serde(rename = "globalMapId")]
    global_map_id: u8,
    #[serde(rename = "timestampMs")]
    timestamp_ms: u64,
}

impl From<&RoutePoint> for RoutePointRequest {
    fn from(point: &RoutePoint) -> Self {
        Self {
            x: point.x,
            y: point.y,
            z: point.z,
            global_x: point.global_x,
            global_y: point.global_y,
            global_z: point.global_z,
            map_id: point.map_id,
            map_id_str: point.map_id_str.clone(),
            global_map_id: point.global_map_id,
            timestamp_ms: point.timestamp_ms,
        }
    }
}

/// Message types for the background sender thread
enum SenderMessage {
    /// Send a batch of route points
    SendPoints(Vec<RoutePoint>),
    /// Shutdown the sender thread
    Shutdown,
}

// =============================================================================
// REALTIME CLIENT
// =============================================================================

/// Client for sending route points to the backend in real-time
pub struct RealtimeClient {
    /// Backend API URL
    backend_url: String,
    /// Push key for authentication
    push_key: String,
    /// Channel sender for sending points to background thread
    sender: Sender<SenderMessage>,
    /// Background sender thread handle
    _thread_handle: JoinHandle<()>,
}

impl RealtimeClient {
    /// Create a new realtime client
    pub fn new(backend_url: String, push_key: String) -> Self {
        let (sender, receiver) = mpsc::channel::<SenderMessage>();
        
        let url = backend_url.clone();
        let key = push_key.clone();
        
        // Spawn background thread for sending points
        let thread_handle = thread::spawn(move || {
            Self::sender_thread(url, key, receiver);
        });

        info!("Realtime client initialized: backend={}", backend_url);

        Self {
            backend_url,
            push_key,
            sender,
            _thread_handle: thread_handle,
        }
    }

    /// Send a single route point (non-blocking)
    pub fn send_point(&self, point: &RoutePoint) {
        self.send_points(&[point.clone()]);
    }

    /// Send multiple route points (non-blocking)
    pub fn send_points(&self, points: &[RoutePoint]) {
        if points.is_empty() {
            return;
        }

        if let Err(e) = self.sender.send(SenderMessage::SendPoints(points.to_vec())) {
            warn!("Failed to queue route points for sending: {}", e);
        }
    }

    /// Check if the client is configured and ready
    pub fn is_configured(&self) -> bool {
        !self.push_key.is_empty() && !self.backend_url.is_empty()
    }

    /// Background thread that handles actual HTTP sending
    fn sender_thread(backend_url: String, push_key: String, receiver: mpsc::Receiver<SenderMessage>) {
        let endpoint = format!("{}/api/RoutePoints", backend_url.trim_end_matches('/'));
        let mut pending_points: Vec<RoutePoint> = Vec::new();
        let batch_size = 10; // Send in batches of 10 points max
        let max_retries = 3;

        loop {
            // Try to receive messages (non-blocking to allow batching)
            match receiver.try_recv() {
                Ok(SenderMessage::SendPoints(mut points)) => {
                    pending_points.append(&mut points);
                }
                Ok(SenderMessage::Shutdown) => {
                    info!("Realtime sender thread shutting down");
                    // Flush remaining points before shutdown
                    if !pending_points.is_empty() {
                        Self::send_batch(&endpoint, &push_key, &pending_points, max_retries);
                    }
                    break;
                }
                Err(TryRecvError::Empty) => {
                    // No new messages, process pending if any
                }
                Err(TryRecvError::Disconnected) => {
                    info!("Realtime sender channel disconnected, shutting down");
                    break;
                }
            }

            // Send pending points in batches
            while pending_points.len() >= batch_size {
                let batch: Vec<_> = pending_points.drain(..batch_size).collect();
                Self::send_batch(&endpoint, &push_key, &batch, max_retries);
            }

            // If we have pending points but less than batch size, wait a bit then send
            if !pending_points.is_empty() {
                // Wait a short time to see if more points come
                thread::sleep(Duration::from_millis(50));
                
                // Check for more messages
                match receiver.try_recv() {
                    Ok(SenderMessage::SendPoints(mut points)) => {
                        pending_points.append(&mut points);
                        continue; // Go back to check if we have enough for a batch
                    }
                    Ok(SenderMessage::Shutdown) => {
                        // Flush and exit
                        if !pending_points.is_empty() {
                            Self::send_batch(&endpoint, &push_key, &pending_points, max_retries);
                        }
                        break;
                    }
                    Err(TryRecvError::Empty) => {
                        // Timeout reached, send what we have
                        let batch: Vec<_> = pending_points.drain(..).collect();
                        Self::send_batch(&endpoint, &push_key, &batch, max_retries);
                    }
                    Err(TryRecvError::Disconnected) => {
                        break;
                    }
                }
            } else {
                // No pending points, wait for new messages (blocking)
                match receiver.recv_timeout(Duration::from_secs(1)) {
                    Ok(SenderMessage::SendPoints(points)) => {
                        pending_points = points;
                    }
                    Ok(SenderMessage::Shutdown) => {
                        break;
                    }
                    Err(mpsc::RecvTimeoutError::Timeout) => {
                        // Just continue waiting
                    }
                    Err(mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }
        }
    }

    /// Send a batch of points with retry logic
    fn send_batch(endpoint: &str, push_key: &str, points: &[RoutePoint], max_retries: u32) {
        let requests: Vec<RoutePointRequest> = points.iter().map(|p| p.into()).collect();
        
        for attempt in 0..max_retries {
            match ureq::post(endpoint)
                .set("X-Push-Key", push_key)
                .set("Content-Type", "application/json")
                .timeout(Duration::from_secs(5))
                .send_json(&requests)
            {
                Ok(response) => {
                    if response.status() == 200 {
                        debug!("Sent {} route points successfully", points.len());
                        return;
                    } else {
                        warn!(
                            "Backend returned status {}: {}",
                            response.status(),
                            response.status_text()
                        );
                    }
                }
                Err(ureq::Error::Status(code, response)) => {
                    let body = response.into_string().unwrap_or_default();
                    warn!("Backend error ({}): {}", code, body);
                    if code == 401 {
                        error!("Push key is invalid or expired. Please generate a new key.");
                        return; // Don't retry auth errors
                    }
                }
                Err(ureq::Error::Transport(e)) => {
                    warn!(
                        "Network error sending route points (attempt {}/{}): {}",
                        attempt + 1,
                        max_retries,
                        e
                    );
                }
            }

            // Wait before retry
            if attempt < max_retries - 1 {
                thread::sleep(Duration::from_millis(100 * (attempt as u64 + 1)));
            }
        }

        error!(
            "Failed to send {} route points after {} attempts",
            points.len(),
            max_retries
        );
    }
}

impl Drop for RealtimeClient {
    fn drop(&mut self) {
        // Signal shutdown to the background thread
        let _ = self.sender.send(SenderMessage::Shutdown);
    }
}

