// Coordinate Transformer - Local to Global coordinate conversion
//
// Elden Ring uses local coordinates relative to map tiles.
// This module converts them to global world coordinates.

use std::collections::{HashMap, HashSet, VecDeque};
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::Path;

// =============================================================================
// DATA STRUCTURES
// =============================================================================

/// An anchor point for coordinate transformation
#[derive(Debug, Clone)]
pub struct Anchor {
    /// Source position in local coordinates
    pub src_pos: (f32, f32, f32),
    /// Destination area number (60 = overworld)
    pub dst_area_no: u8,
    /// Destination grid X index (for m60 tile)
    pub dst_grid_x: u8,
    /// Destination grid Z index (for m60 tile)
    pub dst_grid_z: u8,
    /// Destination position (local to the m60 tile, NOT global!)
    pub dst_pos: (f32, f32, f32),
}

/// A step in a path from a tile to m60
#[derive(Debug, Clone)]
struct PathStep {
    /// The anchor to apply at this step
    anchor: Anchor,
}

/// Pre-computed path from a tile to a global map (m60 or m61)
#[derive(Debug, Clone)]
struct PathToGlobalMap {
    /// Sequence of steps to reach global map (each step transforms coordinates)
    steps: Vec<PathStep>,
    /// Final global map tile coordinates (area_no, grid_x, grid_z) - either m60 or m61
    final_global_tile: (u8, u8, u8),
}

/// Error type for coordinate transformation
#[derive(Debug)]
pub enum TransformError {
    UnknownMap(String),
    IoError(String),
}

impl std::fmt::Display for TransformError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TransformError::UnknownMap(id) => write!(f, "Unknown map_id: {}", id),
            TransformError::IoError(msg) => write!(f, "IO error: {}", msg),
        }
    }
}

// =============================================================================
// WORLD POSITION TRANSFORMER
// =============================================================================

/// Transforms local coordinates to world coordinates
pub struct WorldPositionTransformer {
    /// Lookup table: (area_no, grid_x, grid_z) -> list of anchors
    anchors: HashMap<(u8, u8, u8), Vec<Anchor>>,
    /// Pre-computed paths to global maps (m60 or m61) for tiles without direct links
    paths_to_global: HashMap<(u8, u8, u8), PathToGlobalMap>,
}

impl WorldPositionTransformer {
    /// Create an empty transformer (only works for m60_* and m61_* overworld maps)
    pub fn empty() -> Self {
        Self {
            anchors: HashMap::new(),
            paths_to_global: HashMap::new(),
        }
    }
    
    /// Create a new transformer by loading the CSV file
    pub fn from_csv<P: AsRef<Path>>(csv_path: P) -> Result<Self, TransformError> {
        let file = File::open(csv_path.as_ref()).map_err(|e| {
            TransformError::IoError(format!("Failed to open CSV: {}", e))
        })?;
        
        let reader = BufReader::new(file);
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        for (line_num, line_result) in reader.lines().enumerate() {
            // Skip header line
            if line_num == 0 {
                continue;
            }
            
            let line = line_result.map_err(|e| {
                TransformError::IoError(format!("Failed to read line {}: {}", line_num, e))
            })?;
            
            // Skip empty lines
            if line.trim().is_empty() {
                continue;
            }
            
            // Parse CSV line
            let fields: Vec<&str> = line.split(',').collect();
            
            // We need at least these columns:
            // 5: srcAreaNo, 6: srcGridXNo, 7: srcGridZNo
            // 9: srcPosX, 10: srcPosY, 11: srcPosZ
            // 12: dstAreaNo
            // 16: dstPosX, 17: dstPosY, 18: dstPosZ
            if fields.len() < 18 {
                continue;
            }
            
            // Parse source map identification
            let src_area_no: u8 = match fields[5].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let src_grid_x: u8 = match fields[6].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let src_grid_z: u8 = match fields[7].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            
            // Parse source position (local coordinates)
            let src_pos_x: f32 = match fields[9].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let src_pos_y: f32 = match fields[10].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let src_pos_z: f32 = match fields[11].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            
            // Parse destination map identification
            let dst_area_no: u8 = match fields[12].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let dst_grid_x: u8 = match fields[13].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let dst_grid_z: u8 = match fields[14].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            
            // Parse destination position (local to the m60 tile!)
            let dst_pos_x: f32 = match fields[16].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let dst_pos_y: f32 = match fields[17].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let dst_pos_z: f32 = match fields[18].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            
            let key = (src_area_no, src_grid_x, src_grid_z);
            let anchor = Anchor {
                src_pos: (src_pos_x, src_pos_y, src_pos_z),
                dst_area_no,
                dst_grid_x,
                dst_grid_z,
                dst_pos: (dst_pos_x, dst_pos_y, dst_pos_z),
            };
            
            anchors.entry(key).or_default().push(anchor);
        }
        
        // Generate inverse mappings for bidirectional navigation
        // This allows finding tiles that are only referenced as destinations (like m10_01_00_00)
        Self::add_inverse_anchors(&mut anchors);
        
        // Pre-compute paths to global maps (m60 or m61) for all tiles without direct links
        let paths_to_global = Self::precompute_paths_to_global(&anchors);
        
        Ok(Self { anchors, paths_to_global })
    }
    
    /// Add inverse anchors for bidirectional navigation
    /// 
    /// For each anchor A → B, creates an inverse anchor B → A if it doesn't already exist.
    /// This enables finding paths to m60 for tiles that have no direct source entry in the CSV.
    fn add_inverse_anchors(anchors: &mut HashMap<(u8, u8, u8), Vec<Anchor>>) {
        // Collect all inverse anchors to add (to avoid modifying while iterating)
        let mut inverses_to_add: Vec<((u8, u8, u8), Anchor)> = Vec::new();
        
        for (&(src_area_no, src_grid_x, src_grid_z), anchor_list) in anchors.iter() {
            for anchor in anchor_list {
                // The inverse key is the destination of the original anchor
                let inverse_key = (anchor.dst_area_no, anchor.dst_grid_x, anchor.dst_grid_z);
                
                // Create the inverse anchor (swap src and dst)
                let inverse_anchor = Anchor {
                    src_pos: anchor.dst_pos,
                    dst_area_no: src_area_no,
                    dst_grid_x: src_grid_x,
                    dst_grid_z: src_grid_z,
                    dst_pos: anchor.src_pos,
                };
                
                inverses_to_add.push((inverse_key, inverse_anchor));
            }
        }
        
        // Add inverses, checking for duplicates
        for (key, inverse_anchor) in inverses_to_add {
            let existing_list = anchors.entry(key).or_default();
            
            // Check if this inverse already exists (same destination and positions)
            let already_exists = existing_list.iter().any(|existing| {
                existing.dst_area_no == inverse_anchor.dst_area_no
                    && existing.dst_grid_x == inverse_anchor.dst_grid_x
                    && existing.dst_grid_z == inverse_anchor.dst_grid_z
                    && Self::positions_equal(existing.src_pos, inverse_anchor.src_pos)
                    && Self::positions_equal(existing.dst_pos, inverse_anchor.dst_pos)
            });
            
            if !already_exists {
                existing_list.push(inverse_anchor);
            }
        }
    }
    
    /// Compare two positions with floating point tolerance
    fn positions_equal(a: (f32, f32, f32), b: (f32, f32, f32)) -> bool {
        const EPSILON: f32 = 0.001;
        (a.0 - b.0).abs() < EPSILON
            && (a.1 - b.1).abs() < EPSILON
            && (a.2 - b.2).abs() < EPSILON
    }
    
    /// Pre-compute paths to global maps (m60 or m61) for all tiles that don't have a direct link
    /// 
    /// Uses BFS to find the shortest path from each tile to any global map tile (m60 or m61).
    /// This is called once at load time for O(1) lookups during runtime.
    fn precompute_paths_to_global(
        anchors: &HashMap<(u8, u8, u8), Vec<Anchor>>,
    ) -> HashMap<(u8, u8, u8), PathToGlobalMap> {
        let mut paths: HashMap<(u8, u8, u8), PathToGlobalMap> = HashMap::new();
        
        // Find all tiles that need path computation (no direct global map link)
        for &tile_key in anchors.keys() {
            // Skip global map tiles - they don't need paths
            if tile_key.0 == 60 || tile_key.0 == 61 {
                continue;
            }
            
            // Check if this tile has a direct link to a global map (m60 or m61)
            let has_direct_global = anchors
                .get(&tile_key)
                .map(|list| list.iter().any(|a| a.dst_area_no == 60 || a.dst_area_no == 61))
                .unwrap_or(false);
            
            if has_direct_global {
                continue;
            }
            
            // Use BFS to find path to global map (m60 or m61)
            if let Some(path) = Self::bfs_find_path_to_global(tile_key, anchors) {
                paths.insert(tile_key, path);
            }
        }
        
        paths
    }
    
    /// BFS to find the shortest path from a tile to any global map (m60 or m61)
    /// 
    /// Returns the sequence of anchors to apply to transform coordinates.
    fn bfs_find_path_to_global(
        start: (u8, u8, u8),
        anchors: &HashMap<(u8, u8, u8), Vec<Anchor>>,
    ) -> Option<PathToGlobalMap> {
        // Queue entries: (current_tile, path_so_far)
        let mut queue: VecDeque<((u8, u8, u8), Vec<PathStep>)> = VecDeque::new();
        let mut visited: HashSet<(u8, u8, u8)> = HashSet::new();
        
        queue.push_back((start, Vec::new()));
        visited.insert(start);
        
        while let Some((current_tile, path)) = queue.pop_front() {
            // Get all anchors from current tile
            let Some(anchor_list) = anchors.get(&current_tile) else {
                continue;
            };
            
            for anchor in anchor_list {
                let next_tile = (anchor.dst_area_no, anchor.dst_grid_x, anchor.dst_grid_z);
                
                // Build the new path including this step
                let mut new_path = path.clone();
                new_path.push(PathStep {
                    anchor: anchor.clone(),
                });
                
                // Check if we reached a global map (m60 or m61)
                if anchor.dst_area_no == 60 || anchor.dst_area_no == 61 {
                    return Some(PathToGlobalMap {
                        steps: new_path,
                        final_global_tile: next_tile,
                    });
                }
                
                // Continue BFS if not visited
                if !visited.contains(&next_tile) {
                    visited.insert(next_tile);
                    queue.push_back((next_tile, new_path));
                }
            }
        }
        
        None // No path found
    }
    
    /// Parse a u32 map_id into its components (area_no, grid_x, grid_z, _)
    /// 
    /// The map_id is packed as: 0xWWXXYYDD
    /// - WW = area number (60 for overworld)
    /// - XX = grid X index
    /// - YY = grid Z index
    /// - DD = always 00
    pub fn parse_map_id(map_id: u32) -> (u8, u8, u8, u8) {
        let ww = ((map_id >> 24) & 0xFF) as u8;
        let xx = ((map_id >> 16) & 0xFF) as u8;
        let yy = ((map_id >> 8) & 0xFF) as u8;
        let dd = (map_id & 0xFF) as u8;
        (ww, xx, yy, dd)
    }
    
    /// Format a map_id as a string "mWW_XX_YY_DD"
    pub fn format_map_id(map_id: u32) -> String {
        let (ww, xx, yy, dd) = Self::parse_map_id(map_id);
        format!("m{:02}_{:02}_{:02}_{:02}", ww, xx, yy, dd)
    }
    
    /// Convert local coordinates to world coordinates (returns best result)
    /// 
    /// Prioritizes anchors that point to global maps (dstAreaNo == 60 or 61).
    /// If multiple anchors exist, prefers m60 over m61, then m61.
    /// For tiles without direct global map links, uses pre-computed paths.
    /// 
    /// The conversion process for non-global maps:
    /// 1. Find anchor in CSV for the source map
    /// 2. Calculate position local to destination global map tile: P_local = (x,y,z) - src + dst
    /// 3. Convert to global using global map grid: P_global = P_local + (dstGridX * 256, 0, dstGridZ * 256)
    pub fn local_to_world_first(&self, map_id: u32, x: f32, y: f32, z: f32) -> Result<(f32, f32, f32), TransformError> {
        let result = self.local_to_world_with_global_map(map_id, x, y, z)?;
        Ok((result.0, result.1, result.2))
    }
    
    /// Convert local coordinates to world coordinates and return the global map ID
    /// 
    /// Returns (global_x, global_y, global_z, global_map_area_no)
    /// where global_map_area_no is 60 for Lands Between or 61 for Shadow Realm
    pub fn local_to_world_with_global_map(&self, map_id: u32, x: f32, y: f32, z: f32) -> Result<(f32, f32, f32, u8), TransformError> {
        let (area_no, grid_x, grid_z, _) = Self::parse_map_id(map_id);
        
        // Case 1: Global map tiles (m60|61_XX_YY_00) - simple grid formula (60 == base game, 61 == DLC)
        if area_no == 60  || area_no == 61 {
            let gx = x + (grid_x as f32) * 256.0;
            let gy = y;
            let gz = z + (grid_z as f32) * 256.0;
            return Ok((gx, gy, gz, area_no));
        }
        
        let key = (area_no, grid_x, grid_z);
        
        // Case 2: Direct anchor to global map (prefer m60, then m61)
        if let Some(anchor_list) = self.anchors.get(&key) {
            // Try to find a direct anchor to m60 first
            if let Some(anchor) = anchor_list.iter().find(|a| a.dst_area_no == 60) {
                let (gx, gy, gz) = Self::apply_anchor_and_convert_to_global(x, y, z, anchor);
                return Ok((gx, gy, gz, 60));
            }
            // Then try m61
            if let Some(anchor) = anchor_list.iter().find(|a| a.dst_area_no == 61) {
                let (gx, gy, gz) = Self::apply_anchor_and_convert_to_global(x, y, z, anchor);
                return Ok((gx, gy, gz, 61));
            }
        }
        
        // Case 3: Use pre-computed path to global map
        if let Some(path) = self.paths_to_global.get(&key) {
            let (gx, gy, gz) = self.apply_path_to_global(x, y, z, path);
            let global_map_area = path.final_global_tile.0;
            return Ok((gx, gy, gz, global_map_area));
        }
        
        Err(TransformError::UnknownMap(Self::format_map_id(map_id)))
    }
    
    /// Apply an anchor transformation and convert to global coordinates
    fn apply_anchor_and_convert_to_global(x: f32, y: f32, z: f32, anchor: &Anchor) -> (f32, f32, f32) {
        // Calculate position local to the destination global map tile (m60 or m61)
        let local_x = x - anchor.src_pos.0 + anchor.dst_pos.0;
        let local_y = y - anchor.src_pos.1 + anchor.dst_pos.1;
        let local_z = z - anchor.src_pos.2 + anchor.dst_pos.2;
        
        // Convert to global using the global map grid formula (works for both m60 and m61)
        let gx = local_x + (anchor.dst_grid_x as f32) * 256.0;
        let gy = local_y;
        let gz = local_z + (anchor.dst_grid_z as f32) * 256.0;
        
        (gx, gy, gz)
    }
    
    /// Apply a pre-computed path to transform coordinates to global map coordinates
    fn apply_path_to_global(&self, x: f32, y: f32, z: f32, path: &PathToGlobalMap) -> (f32, f32, f32) {
        let mut current_x = x;
        let mut current_y = y;
        let mut current_z = z;
        
        // Apply each step in the path (transforming through intermediate tiles)
        for step in &path.steps {
            let anchor = &step.anchor;
            current_x = current_x - anchor.src_pos.0 + anchor.dst_pos.0;
            current_y = current_y - anchor.src_pos.1 + anchor.dst_pos.1;
            current_z = current_z - anchor.src_pos.2 + anchor.dst_pos.2;
        }
        
        // The last step should have brought us to a global map tile (m60 or m61)
        // Apply the grid formula using the final global map tile coordinates
        let (_, final_grid_x, final_grid_z) = path.final_global_tile;
        let gx = current_x + (final_grid_x as f32) * 256.0;
        let gy = current_y;
        let gz = current_z + (final_grid_z as f32) * 256.0;
        
        (gx, gy, gz)
    }
    
    /// Get the number of loaded anchors
    pub fn anchor_count(&self) -> usize {
        self.anchors.values().map(|v| v.len()).sum()
    }
    
    /// Get the number of unique maps with anchors
    pub fn map_count(&self) -> usize {
        self.anchors.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_map_id() {
        // m60_40_35_00 = 0x3C282300
        let map_id = 0x3C282300u32;
        let (ww, xx, yy, dd) = WorldPositionTransformer::parse_map_id(map_id);
        assert_eq!(ww, 60);
        assert_eq!(xx, 40);
        assert_eq!(yy, 35);
        assert_eq!(dd, 0);
    }
    
    #[test]
    fn test_format_map_id() {
        let map_id = 0x3C282300u32;
        let formatted = WorldPositionTransformer::format_map_id(map_id);
        assert_eq!(formatted, "m60_40_35_00");
    }
    
    #[test]
    fn test_overworld_conversion() {
        // Create empty transformer (no CSV needed for overworld)
        let transformer = WorldPositionTransformer::empty();
        
        // m60_40_35_00
        let map_id = 0x3C282300u32;
        let (x, y, z) = (10.0, 100.0, 20.0);
        
        let (gx, gy, gz) = transformer.local_to_world_first(map_id, x, y, z).unwrap();
        // GX = x + 40 * 256 = 10 + 10240 = 10250
        assert_eq!(gx, 10.0 + 40.0 * 256.0);
        // GY = y (unchanged)
        assert_eq!(gy, 100.0);
        // GZ = z + 35 * 256 = 20 + 8960 = 8980
        assert_eq!(gz, 20.0 + 35.0 * 256.0);
    }
    
    #[test]
    fn test_inverse_anchors_created() {
        // Create a transformer with a single anchor: m10_00_00_00 -> m10_01_00_00
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        // Original: m10_00_00_00 -> m10_01_00_00 (like line 17 in CSV)
        let original_anchor = Anchor {
            src_pos: (-514.0, 28.0, 200.0),
            dst_area_no: 10,
            dst_grid_x: 1,
            dst_grid_z: 0,
            dst_pos: (0.0, 0.0, 0.0),
        };
        anchors.insert((10, 0, 0), vec![original_anchor]);
        
        // Add inverse anchors
        WorldPositionTransformer::add_inverse_anchors(&mut anchors);
        
        // Check that the inverse was created: m10_01_00_00 should now exist
        assert!(anchors.contains_key(&(10, 1, 0)), "Inverse anchor for m10_01_00_00 should exist");
        
        let inverse_list = anchors.get(&(10, 1, 0)).unwrap();
        assert_eq!(inverse_list.len(), 1);
        
        let inverse = &inverse_list[0];
        // The inverse should point back to m10_00_00_00
        assert_eq!(inverse.dst_area_no, 10);
        assert_eq!(inverse.dst_grid_x, 0);
        assert_eq!(inverse.dst_grid_z, 0);
        // Positions should be swapped
        assert_eq!(inverse.src_pos, (0.0, 0.0, 0.0));
        assert_eq!(inverse.dst_pos, (-514.0, 28.0, 200.0));
    }
    
    #[test]
    fn test_inverse_anchors_no_duplicates() {
        // Create a transformer where the inverse already exists
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        // A -> B
        let anchor_a_to_b = Anchor {
            src_pos: (100.0, 0.0, 100.0),
            dst_area_no: 20,
            dst_grid_x: 1,
            dst_grid_z: 0,
            dst_pos: (200.0, 0.0, 200.0),
        };
        
        // B -> A (already exists as inverse)
        let anchor_b_to_a = Anchor {
            src_pos: (200.0, 0.0, 200.0),
            dst_area_no: 20,
            dst_grid_x: 0,
            dst_grid_z: 0,
            dst_pos: (100.0, 0.0, 100.0),
        };
        
        anchors.insert((20, 0, 0), vec![anchor_a_to_b]);
        anchors.insert((20, 1, 0), vec![anchor_b_to_a]);
        
        let original_count_a = anchors.get(&(20, 0, 0)).unwrap().len();
        let original_count_b = anchors.get(&(20, 1, 0)).unwrap().len();
        
        // Add inverse anchors
        WorldPositionTransformer::add_inverse_anchors(&mut anchors);
        
        // Counts should remain the same (no duplicates added)
        assert_eq!(anchors.get(&(20, 0, 0)).unwrap().len(), original_count_a,
            "No duplicate should be added for m20_00_00_00");
        assert_eq!(anchors.get(&(20, 1, 0)).unwrap().len(), original_count_b,
            "No duplicate should be added for m20_01_00_00");
    }
    
    #[test]
    fn test_positions_equal() {
        assert!(WorldPositionTransformer::positions_equal(
            (1.0, 2.0, 3.0),
            (1.0, 2.0, 3.0)
        ));
        
        // Within epsilon
        assert!(WorldPositionTransformer::positions_equal(
            (1.0, 2.0, 3.0),
            (1.0005, 2.0005, 3.0005)
        ));
        
        // Outside epsilon
        assert!(!WorldPositionTransformer::positions_equal(
            (1.0, 2.0, 3.0),
            (1.1, 2.0, 3.0)
        ));
    }
    
    #[test]
    fn test_bfs_finds_path_to_global() {
        // Create a chain: m10_01_00_00 -> m10_00_00_00 -> m60_40_35_00
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        // m10_00_00_00 -> m60_40_35_00 (direct link to m60)
        anchors.insert((10, 0, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 60,
            dst_grid_x: 40,
            dst_grid_z: 35,
            dst_pos: (100.0, 50.0, 100.0),
        }]);
        
        // m10_01_00_00 -> m10_00_00_00 (no direct global map link)
        anchors.insert((10, 1, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 10,
            dst_grid_x: 0,
            dst_grid_z: 0,
            dst_pos: (-514.0, 28.0, 200.0),
        }]);
        
        // BFS should find path from m10_01_00_00 to m60
        let path = WorldPositionTransformer::bfs_find_path_to_global((10, 1, 0), &anchors);
        
        assert!(path.is_some(), "Should find a path from m10_01_00_00 to global map");
        let path = path.unwrap();
        
        // Path should have 2 steps: m10_01 -> m10_00, m10_00 -> m60
        assert_eq!(path.steps.len(), 2, "Path should have 2 steps");
        assert_eq!(path.final_global_tile, (60, 40, 35), "Should end at m60_40_35_00");
    }
    
    #[test]
    fn test_precompute_paths_to_global() {
        // Create a chain: m10_01_00_00 -> m10_00_00_00 -> m60_40_35_00
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        // m10_00_00_00 -> m60_40_35_00 (direct link to m60)
        anchors.insert((10, 0, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 60,
            dst_grid_x: 40,
            dst_grid_z: 35,
            dst_pos: (100.0, 50.0, 100.0),
        }]);
        
        // m10_01_00_00 -> m10_00_00_00 (no direct global map link)
        anchors.insert((10, 1, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 10,
            dst_grid_x: 0,
            dst_grid_z: 0,
            dst_pos: (-514.0, 28.0, 200.0),
        }]);
        
        let paths = WorldPositionTransformer::precompute_paths_to_global(&anchors);
        
        // m10_00_00_00 has direct link, should NOT be in paths
        assert!(!paths.contains_key(&(10, 0, 0)), 
            "Tile with direct global map link should not have pre-computed path");
        
        // m10_01_00_00 has no direct link, should be in paths
        assert!(paths.contains_key(&(10, 1, 0)), 
            "Tile without direct global map link should have pre-computed path");
    }
    
    #[test]
    fn test_local_to_world_with_path() {
        // Create a transformer with a chain: m10_01_00_00 -> m10_00_00_00 -> m60_40_35_00
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        // m10_00_00_00 -> m60_40_35_00
        anchors.insert((10, 0, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 60,
            dst_grid_x: 40,
            dst_grid_z: 35,
            dst_pos: (100.0, 50.0, 100.0),
        }]);
        
        // m10_01_00_00 -> m10_00_00_00
        anchors.insert((10, 1, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 10,
            dst_grid_x: 0,
            dst_grid_z: 0,
            dst_pos: (10.0, 5.0, 10.0),
        }]);
        
        // Pre-compute paths
        let paths_to_global = WorldPositionTransformer::precompute_paths_to_global(&anchors);
        
        let transformer = WorldPositionTransformer {
            anchors,
            paths_to_global,
        };
        
        // Convert from m10_01_00_00
        // m10_01_00_00 = 0x0A010000
        let map_id = 0x0A010000u32;
        let (x, y, z) = (50.0, 20.0, 30.0);
        
        let result = transformer.local_to_world_first(map_id, x, y, z);
        assert!(result.is_ok(), "Should successfully convert m10_01_00_00 coords");
        
        let (gx, gy, gz) = result.unwrap();
        
        // Step 1: Apply m10_01 -> m10_00 anchor: (50,20,30) - (0,0,0) + (10,5,10) = (60,25,40)
        // Step 2: Apply m10_00 -> m60 anchor: (60,25,40) - (0,0,0) + (100,50,100) = (160,75,140)
        // Step 3: Add grid offset: (160 + 40*256, 75, 140 + 35*256) = (10400, 75, 9100)
        assert_eq!(gx, 160.0 + 40.0 * 256.0);
        assert_eq!(gy, 75.0);
        assert_eq!(gz, 140.0 + 35.0 * 256.0);
    }
    
    #[test]
    fn test_no_path_found() {
        // Create an isolated tile with no path to global map
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        // m99_00_00_00 -> m99_01_00_00 (circular, no global map)
        anchors.insert((99, 0, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 99,
            dst_grid_x: 1,
            dst_grid_z: 0,
            dst_pos: (10.0, 0.0, 10.0),
        }]);
        
        let path = WorldPositionTransformer::bfs_find_path_to_global((99, 0, 0), &anchors);
        assert!(path.is_none(), "Should not find path for isolated tile");
    }
    
    #[test]
    fn test_bfs_finds_path_to_m61() {
        // Test that BFS can find paths to m61 as well
        let mut anchors: HashMap<(u8, u8, u8), Vec<Anchor>> = HashMap::new();
        
        // m20_00_00_00 -> m61_XX_YY_00 (direct link to m61)
        anchors.insert((20, 0, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 61,
            dst_grid_x: 10,
            dst_grid_z: 15,
            dst_pos: (100.0, 50.0, 100.0),
        }]);
        
        // m20_01_00_00 -> m20_00_00_00 (no direct global map link)
        anchors.insert((20, 1, 0), vec![Anchor {
            src_pos: (0.0, 0.0, 0.0),
            dst_area_no: 20,
            dst_grid_x: 0,
            dst_grid_z: 0,
            dst_pos: (-514.0, 28.0, 200.0),
        }]);
        
        // BFS should find path from m20_01_00_00 to m61
        let path = WorldPositionTransformer::bfs_find_path_to_global((20, 1, 0), &anchors);
        
        assert!(path.is_some(), "Should find a path from m20_01_00_00 to m61");
        let path = path.unwrap();
        
        // Path should have 2 steps: m20_01 -> m20_00, m20_00 -> m61
        assert_eq!(path.steps.len(), 2, "Path should have 2 steps");
        assert_eq!(path.final_global_tile.0, 61, "Should end at m61");
    }
}

