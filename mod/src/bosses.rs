// Boss kill tracker — adapted from ER_boss_checklist bosses.rs

use std::fs;
use std::path::Path;

use hudhook::tracing::{error, info};
use serde::{Deserialize, Serialize};

use crate::event_flags::EventFlagReader;

#[derive(Serialize, Deserialize)]
pub struct Boss {
    pub boss: String,
    #[serde(default)]
    pub place: Option<String>,
    pub flag_id: u32,
    pub rememberance: Option<u32>,
}

#[derive(Serialize, Deserialize)]
pub struct Region {
    pub region_name: String,
    #[serde(default)]
    pub region_id: u32,
    pub regions: Vec<u32>,
    pub bosses: Vec<Boss>,
    pub dlc: Option<u32>,
}

struct TrackedBoss {
    flag_id: u32,
    name: String,
    is_dead: bool,
}

pub struct BossesTracker {
    bosses: Vec<TrackedBoss>,
    pub total_bosses: usize,
    pub total_killed: usize,
    newly_killed: Vec<u32>,
}

impl BossesTracker {
    pub fn load(path: &Path, reader: &EventFlagReader) -> Option<Self> {
        let file_content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(e) => {
                error!("Failed to read bosses file at '{}': {}", path.display(), e);
                return None;
            }
        };

        let regions: Vec<Region> = match serde_json::from_str(&file_content) {
            Ok(r) => r,
            Err(e) => {
                error!("Failed to parse bosses JSON: {}", e);
                return None;
            }
        };

        let mut bosses = Vec::new();
        let mut total_killed = 0usize;

        for region in &regions {
            for boss in &region.bosses {
                let is_dead = reader.is_flag_set(boss.flag_id);
                if is_dead {
                    total_killed += 1;
                }
                bosses.push(TrackedBoss {
                    flag_id: boss.flag_id,
                    name: boss.boss.clone(),
                    is_dead,
                });
            }
        }

        info!(
            "Loaded {} bosses from {} ({} already killed)",
            bosses.len(),
            path.display(),
            total_killed
        );

        Some(Self {
            total_bosses: bosses.len(),
            total_killed,
            bosses,
            newly_killed: Vec::new(),
        })
    }

    pub fn update(&mut self, reader: &EventFlagReader) {
        for boss in &mut self.bosses {
            if boss.is_dead {
                continue;
            }

            if reader.is_flag_set(boss.flag_id) {
                boss.is_dead = true;
                self.total_killed = self.total_killed.saturating_add(1);
                self.newly_killed.push(boss.flag_id);
                info!("Boss killed: {} (flag_id={})", boss.name, boss.flag_id);
            }
        }
    }

    pub fn take_newly_killed(&mut self) -> Vec<u32> {
        std::mem::take(&mut self.newly_killed)
    }

    pub fn killed_flag_ids(&self) -> Vec<u32> {
        self.bosses
            .iter()
            .filter(|b| b.is_dead)
            .map(|b| b.flag_id)
            .collect()
    }
}
