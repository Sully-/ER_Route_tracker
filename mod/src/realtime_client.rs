// Real-time streaming client for sending route points and boss kills to the backend

use hudhook::tracing::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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

#[derive(Debug, Serialize)]
struct BossKillRequest {
    #[serde(rename = "flagId")]
    flag_id: u32,
    #[serde(rename = "timestampMs")]
    timestamp_ms: u64,
}

#[derive(Debug, Deserialize)]
struct SyncedFlagIdsResponse {
    #[serde(rename = "flagIds")]
    flag_ids: Vec<u32>,
}

const MAX_BOSS_KILLS_PER_BATCH: usize = 50;

/// Message types for the background sender thread
enum SenderMessage {
    SendPoints(Vec<RoutePoint>),
    SendBossKills(Vec<BossKillRequest>),
    SyncBossKills(Vec<u32>),
    Shutdown,
}

// =============================================================================
// REALTIME CLIENT
// =============================================================================

/// Client for sending route points to the backend in real-time
pub struct RealtimeClient {
    backend_url: String,
    push_key: String,
    sender: Sender<SenderMessage>,
    _thread_handle: JoinHandle<()>,
}

impl RealtimeClient {
    pub fn new(backend_url: String, push_key: String) -> Self {
        let (sender, receiver) = mpsc::channel::<SenderMessage>();

        let url = backend_url.clone();
        let key = push_key.clone();

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

    pub fn send_point(&self, point: &RoutePoint) {
        self.send_points(&[point.clone()]);
    }

    pub fn send_points(&self, points: &[RoutePoint]) {
        if points.is_empty() {
            return;
        }

        if let Err(e) = self.sender.send(SenderMessage::SendPoints(points.to_vec())) {
            warn!("Failed to queue route points for sending: {}", e);
        }
    }

    pub fn send_boss_kill(&self, flag_id: u32, timestamp_ms: u64) {
        self.send_boss_kills(&[(flag_id, timestamp_ms)]);
    }

    pub fn send_boss_kills(&self, kills: &[(u32, u64)]) {
        if kills.is_empty() {
            return;
        }

        let requests: Vec<BossKillRequest> = kills
            .iter()
            .map(|(flag_id, timestamp_ms)| BossKillRequest {
                flag_id: *flag_id,
                timestamp_ms: *timestamp_ms,
            })
            .collect();

        if let Err(e) = self.sender.send(SenderMessage::SendBossKills(requests)) {
            warn!("Failed to queue boss kills for sending: {}", e);
        }
    }

    /// Resync locally killed bosses with the backend (delta-only, on streaming start).
    pub fn sync_boss_kills(&self, local_killed: Vec<u32>) {
        if local_killed.is_empty() {
            return;
        }

        if let Err(e) = self.sender.send(SenderMessage::SyncBossKills(local_killed)) {
            warn!("Failed to queue boss kill sync: {}", e);
        }
    }

    pub fn is_configured(&self) -> bool {
        !self.push_key.is_empty() && !self.backend_url.is_empty()
    }

    fn sender_thread(backend_url: String, push_key: String, receiver: mpsc::Receiver<SenderMessage>) {
        let route_endpoint = format!("{}/api/RoutePoints", backend_url.trim_end_matches('/'));
        let boss_endpoint = format!("{}/api/BossKills", backend_url.trim_end_matches('/'));
        let mut pending_points: Vec<RoutePoint> = Vec::new();
        let batch_size = 10;
        let max_retries = 3;

        loop {
            match receiver.try_recv() {
                Ok(SenderMessage::SendPoints(mut points)) => {
                    pending_points.append(&mut points);
                }
                Ok(SenderMessage::SendBossKills(kills)) => {
                    Self::send_boss_kill_batch(&boss_endpoint, &push_key, &kills, max_retries);
                }
                Ok(SenderMessage::SyncBossKills(local_killed)) => {
                    Self::perform_boss_kill_sync(&boss_endpoint, &push_key, &local_killed, max_retries);
                }
                Ok(SenderMessage::Shutdown) => {
                    info!("Realtime sender thread shutting down");
                    if !pending_points.is_empty() {
                        Self::send_route_batch(&route_endpoint, &push_key, &pending_points, max_retries);
                    }
                    break;
                }
                Err(TryRecvError::Empty) => {}
                Err(TryRecvError::Disconnected) => {
                    info!("Realtime sender channel disconnected, shutting down");
                    break;
                }
            }

            while pending_points.len() >= batch_size {
                let batch: Vec<_> = pending_points.drain(..batch_size).collect();
                Self::send_route_batch(&route_endpoint, &push_key, &batch, max_retries);
            }

            if !pending_points.is_empty() {
                thread::sleep(Duration::from_millis(50));

                match receiver.try_recv() {
                    Ok(SenderMessage::SendPoints(mut points)) => {
                        pending_points.append(&mut points);
                        continue;
                    }
                    Ok(SenderMessage::SendBossKills(kills)) => {
                        Self::send_boss_kill_batch(&boss_endpoint, &push_key, &kills, max_retries);
                        continue;
                    }
                    Ok(SenderMessage::SyncBossKills(local_killed)) => {
                        Self::perform_boss_kill_sync(&boss_endpoint, &push_key, &local_killed, max_retries);
                        continue;
                    }
                    Ok(SenderMessage::Shutdown) => {
                        if !pending_points.is_empty() {
                            Self::send_route_batch(&route_endpoint, &push_key, &pending_points, max_retries);
                        }
                        break;
                    }
                    Err(TryRecvError::Empty) => {
                        let batch: Vec<_> = pending_points.drain(..).collect();
                        Self::send_route_batch(&route_endpoint, &push_key, &batch, max_retries);
                    }
                    Err(TryRecvError::Disconnected) => break,
                }
            } else {
                match receiver.recv_timeout(Duration::from_secs(1)) {
                    Ok(SenderMessage::SendPoints(points)) => {
                        pending_points = points;
                    }
                    Ok(SenderMessage::SendBossKills(kills)) => {
                        Self::send_boss_kill_batch(&boss_endpoint, &push_key, &kills, max_retries);
                    }
                    Ok(SenderMessage::SyncBossKills(local_killed)) => {
                        Self::perform_boss_kill_sync(&boss_endpoint, &push_key, &local_killed, max_retries);
                    }
                    Ok(SenderMessage::Shutdown) => break,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                }
            }
        }
    }

    fn send_route_batch(endpoint: &str, push_key: &str, points: &[RoutePoint], max_retries: u32) {
        let requests: Vec<RoutePointRequest> = points.iter().map(|p| p.into()).collect();
        Self::post_json(endpoint, push_key, &requests, max_retries, "route points", points.len());
    }

    fn send_boss_kill_batch(
        endpoint: &str,
        push_key: &str,
        kills: &[BossKillRequest],
        max_retries: u32,
    ) {
        for chunk in kills.chunks(MAX_BOSS_KILLS_PER_BATCH) {
            Self::post_json(endpoint, push_key, chunk, max_retries, "boss kills", chunk.len());
        }
    }

    fn perform_boss_kill_sync(
        boss_endpoint: &str,
        push_key: &str,
        local_killed: &[u32],
        max_retries: u32,
    ) {
        let delta = match Self::fetch_synced_flag_ids(boss_endpoint, push_key, max_retries) {
            Some(remote_synced) => {
                let remote_set: HashSet<u32> = remote_synced.into_iter().collect();
                let delta: Vec<BossKillRequest> = local_killed
                    .iter()
                    .filter(|id| !remote_set.contains(id))
                    .map(|flag_id| BossKillRequest {
                        flag_id: *flag_id,
                        timestamp_ms: 0,
                    })
                    .collect();

                if delta.is_empty() {
                    debug!(
                        "Boss kill sync: nothing to send ({} local, all already synced)",
                        local_killed.len()
                    );
                    return;
                }

                info!(
                    "Boss kill sync: sending {} new kills ({} local, {} already on backend)",
                    delta.len(),
                    local_killed.len(),
                    remote_set.len()
                );

                delta
            }
            None => {
                warn!(
                    "Could not fetch synced boss kills from backend; sending all {} local kills (backend will dedupe)",
                    local_killed.len()
                );
                local_killed
                    .iter()
                    .map(|flag_id| BossKillRequest {
                        flag_id: *flag_id,
                        timestamp_ms: 0,
                    })
                    .collect()
            }
        };

        Self::send_boss_kill_batch(boss_endpoint, push_key, &delta, max_retries);
    }

    fn fetch_synced_flag_ids(
        boss_endpoint: &str,
        push_key: &str,
        max_retries: u32,
    ) -> Option<Vec<u32>> {
        let synced_endpoint = format!("{}/synced", boss_endpoint.trim_end_matches('/'));

        for attempt in 0..max_retries {
            match ureq::get(&synced_endpoint)
                .set("X-Push-Key", push_key)
                .timeout(Duration::from_secs(5))
                .call()
            {
                Ok(response) => {
                    if response.status() == 200 {
                        match response.into_json::<SyncedFlagIdsResponse>() {
                            Ok(data) => return Some(data.flag_ids),
                            Err(e) => {
                                warn!("Failed to parse synced flag IDs response: {}", e);
                                return None;
                            }
                        }
                    }
                    if response.status() == 404 {
                        debug!(
                            "GET /api/BossKills/synced not available (404); falling back to full sync"
                        );
                        return None;
                    }
                    warn!(
                        "Backend returned status {} when fetching synced boss kills: {}",
                        response.status(),
                        response.status_text()
                    );
                }
                Err(ureq::Error::Status(code, response)) => {
                    let body = response.into_string().unwrap_or_default();
                    if code == 404 {
                        debug!(
                            "GET /api/BossKills/synced not available (404); falling back to full sync"
                        );
                        return None;
                    }
                    warn!(
                        "Backend error fetching synced boss kills ({}): {}",
                        code, body
                    );
                    if code == 401 {
                        error!("Push key is invalid or expired. Please generate a new key.");
                        return None;
                    }
                }
                Err(ureq::Error::Transport(e)) => {
                    warn!(
                        "Network error fetching synced boss kills (attempt {}/{}): {}",
                        attempt + 1,
                        max_retries,
                        e
                    );
                }
            }

            if attempt < max_retries - 1 {
                thread::sleep(Duration::from_millis(100 * (attempt as u64 + 1)));
            }
        }

        None
    }

    fn post_json<T: Serialize + ?Sized>(
        endpoint: &str,
        push_key: &str,
        body: &T,
        max_retries: u32,
        label: &str,
        count: usize,
    ) {
        for attempt in 0..max_retries {
            match ureq::post(endpoint)
                .set("X-Push-Key", push_key)
                .set("Content-Type", "application/json")
                .timeout(Duration::from_secs(5))
                .send_json(body)
            {
                Ok(response) => {
                    if response.status() == 200 {
                        debug!("Sent {} {} successfully", count, label);
                        return;
                    }
                    warn!(
                        "Backend returned status {} for {}: {}",
                        response.status(),
                        label,
                        response.status_text()
                    );
                }
                Err(ureq::Error::Status(code, response)) => {
                    let body = response.into_string().unwrap_or_default();
                    warn!("Backend error for {} ({}): {}", label, code, body);
                    if code == 401 {
                        error!("Push key is invalid or expired. Please generate a new key.");
                        return;
                    }
                }
                Err(ureq::Error::Transport(e)) => {
                    warn!(
                        "Network error sending {} (attempt {}/{}): {}",
                        label,
                        attempt + 1,
                        max_retries,
                        e
                    );
                }
            }

            if attempt < max_retries - 1 {
                thread::sleep(Duration::from_millis(100 * (attempt as u64 + 1)));
            }
        }

        error!(
            "Failed to send {} {} after {} attempts",
            count, label, max_retries
        );
    }
}

impl Drop for RealtimeClient {
    fn drop(&mut self) {
        let _ = self.sender.send(SenderMessage::Shutdown);
    }
}
