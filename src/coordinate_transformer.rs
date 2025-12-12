// Coordinate Transformer - Local to Global coordinate conversion
//
// Elden Ring uses local coordinates relative to map tiles.
// This module converts them to global world coordinates.

use std::collections::HashMap;
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
}

impl WorldPositionTransformer {
    /// Create an empty transformer (only works for m60_* overworld maps)
    pub fn empty() -> Self {
        Self {
            anchors: HashMap::new(),
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
            // 15: dstPosX, 16: dstPosY, 17: dstPosZ
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
            let dst_pos_x: f32 = match fields[15].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let dst_pos_y: f32 = match fields[16].trim().parse() {
                Ok(v) => v,
                Err(_) => continue,
            };
            let dst_pos_z: f32 = match fields[17].trim().parse() {
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
        
        Ok(Self { anchors })
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
    /// Prioritizes anchors that point to the overworld (dstAreaNo == 60).
    /// If multiple anchors exist, prefers the one targeting the overworld.
    /// 
    /// The conversion process for non-m60 maps:
    /// 1. Find anchor in CSV for the source map
    /// 2. Calculate position local to destination m60 tile: P_local = (x,y,z) - src + dst
    /// 3. Convert to global using m60 grid: P_global = P_local + (dstGridX * 256, 0, dstGridZ * 256)
    pub fn local_to_world_first(&self, map_id: u32, x: f32, y: f32, z: f32) -> Result<(f32, f32, f32), TransformError> {
        let (area_no, grid_x, grid_z, _) = Self::parse_map_id(map_id);
        
        // Case 1: Overworld tiles (m60_XX_YY_00) - simple grid formula
        if area_no == 60 {
            let gx = x + (grid_x as f32) * 256.0;
            let gy = y;
            let gz = z + (grid_z as f32) * 256.0;
            return Ok((gx, gy, gz));
        }
        
        // Case 2: Legacy/Underground/Dungeons - use CSV anchors
        let key = (area_no, grid_x, grid_z);
        
        if let Some(anchor_list) = self.anchors.get(&key) {
            // Priority: find an anchor where dstAreaNo == 60 (overworld)
            let best_anchor = anchor_list
                .iter()
                .find(|a| a.dst_area_no == 60)
                .or_else(|| anchor_list.first());
            
            if let Some(anchor) = best_anchor {
                // Step 1: Calculate position local to the destination m60 tile
                let local_x = x - anchor.src_pos.0 + anchor.dst_pos.0;
                let local_y = y - anchor.src_pos.1 + anchor.dst_pos.1;
                let local_z = z - anchor.src_pos.2 + anchor.dst_pos.2;
                
                // Step 2: Convert to global using the m60 grid formula
                let gx = local_x + (anchor.dst_grid_x as f32) * 256.0;
                let gy = local_y;
                let gz = local_z + (anchor.dst_grid_z as f32) * 256.0;
                
                return Ok((gx, gy, gz));
            }
        }
        
        Err(TransformError::UnknownMap(Self::format_map_id(map_id)))
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
        let transformer = WorldPositionTransformer {
            anchors: HashMap::new(),
        };
        
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
}

