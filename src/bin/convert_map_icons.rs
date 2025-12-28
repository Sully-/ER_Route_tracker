// Convert map icons from local to global coordinates
//
// Reads `viewer/public/map_data_export.json` and converts all coordinates
// using the WorldPositionTransformer, outputting `viewer/public/map_data_processed.json`

// Include the coordinate_transformer module directly
#[path = "../coordinate_transformer.rs"]
mod coordinate_transformer;

use coordinate_transformer::WorldPositionTransformer;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::Write;
use std::path::Path;

// =============================================================================
// INPUT DATA STRUCTURES (matching map_data_export.json)
// =============================================================================

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
struct InputMapIcon {
    id: u64,
    icon_id: u32,
    event_flag_id: u64,
    area_no: u8,
    #[serde(rename = "GridXNo")]
    grid_x_no: u8,
    #[serde(rename = "GridZNo")]
    grid_z_no: u8,
    #[serde(rename = "PosX")]
    pos_x: f32,
    #[serde(rename = "PosY")]
    pos_y: f32,
    #[serde(rename = "PosZ")]
    pos_z: f32,
    texts: Vec<InputText>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "PascalCase")]
struct InputText {
    text_id: u64,
    text_type: u32,
    text: Option<String>,
    source: String,
}

#[derive(Debug, Clone, Deserialize)]
struct InputMapData {
    #[serde(rename = "Bonfires")]
    bonfires: Vec<InputMapIcon>,
    #[serde(rename = "MapPoints")]
    map_points: Vec<InputMapIcon>,
}

// =============================================================================
// OUTPUT DATA STRUCTURES (with global coordinates)
// =============================================================================

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputMapIcon {
    id: u64,
    icon_id: u32,
    event_flag_id: u64,
    // Original local coordinates
    area_no: u8,
    grid_x_no: u8,
    grid_z_no: u8,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    // Converted global coordinates
    global_x: f32,
    global_y: f32,
    global_z: f32,
    // Map string (e.g., "m60" or "m61")
    map_id: String,
    // Text data
    texts: Vec<InputText>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputMapData {
    bonfires: Vec<OutputMapIcon>,
    map_points: Vec<OutputMapIcon>,
    // Statistics
    total_count: usize,
    converted_count: usize,
    failed_count: usize,
    failed_maps: Vec<String>,
}

// =============================================================================
// MAIN
// =============================================================================

fn main() {
    println!("=== Map Icons Coordinate Converter ===\n");

    // Paths
    let csv_path = Path::new("src/WorldMapLegacyConvParam.csv");
    let input_path = Path::new("viewer/public/map_data_export.json");
    let output_path = Path::new("viewer/public/map_data_processed.json");

    // Load the coordinate transformer
    println!("Loading coordinate transformer from {:?}...", csv_path);
    let transformer = match WorldPositionTransformer::from_csv(csv_path) {
        Ok(t) => {
            println!(
                "  Loaded: {} maps, {} anchors",
                t.map_count(),
                t.anchor_count()
            );
            t
        }
        Err(e) => {
            eprintln!("ERROR: Failed to load CSV: {}", e);
            std::process::exit(1);
        }
    };

    // Load input JSON
    println!("\nLoading input JSON from {:?}...", input_path);
    let input_json = match fs::read_to_string(input_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("ERROR: Failed to read input file: {}", e);
            std::process::exit(1);
        }
    };

    let input_data: InputMapData = match serde_json::from_str(&input_json) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("ERROR: Failed to parse JSON: {}", e);
            std::process::exit(1);
        }
    };

    println!(
        "  Found {} bonfires, {} map points",
        input_data.bonfires.len(),
        input_data.map_points.len()
    );

    // Track statistics
    let mut converted_count = 0usize;
    let mut failed_count = 0usize;
    let mut failed_maps: HashMap<String, usize> = HashMap::new();

    // Convert bonfires
    println!("\nConverting bonfires...");
    let bonfires: Vec<OutputMapIcon> = input_data
        .bonfires
        .iter()
        .filter_map(|icon| {
            convert_icon(icon, &transformer, &mut converted_count, &mut failed_count, &mut failed_maps)
        })
        .collect();

    // Convert map points
    println!("Converting map points...");
    let map_points: Vec<OutputMapIcon> = input_data
        .map_points
        .iter()
        .filter_map(|icon| {
            convert_icon(icon, &transformer, &mut converted_count, &mut failed_count, &mut failed_maps)
        })
        .collect();

    // Build output
    let total_count = input_data.bonfires.len() + input_data.map_points.len();
    let failed_maps_list: Vec<String> = failed_maps.keys().cloned().collect();

    let output_data = OutputMapData {
        bonfires,
        map_points,
        total_count,
        converted_count,
        failed_count,
        failed_maps: failed_maps_list,
    };

    // Write output
    println!("\nWriting output to {:?}...", output_path);
    let output_json = serde_json::to_string_pretty(&output_data).expect("Failed to serialize");
    let mut file = File::create(output_path).expect("Failed to create output file");
    file.write_all(output_json.as_bytes())
        .expect("Failed to write output file");

    // Summary
    println!("\n=== Conversion Complete ===");
    println!("  Total icons:     {}", total_count);
    println!("  Converted:       {}", converted_count);
    println!("  Failed:          {}", failed_count);
    if !failed_maps.is_empty() {
        println!("\n  Failed maps (count):");
        let mut sorted: Vec<_> = failed_maps.iter().collect();
        sorted.sort_by(|a, b| b.1.cmp(a.1));
        for (map, count) in sorted.iter().take(10) {
            println!("    {}: {}", map, count);
        }
        if sorted.len() > 10 {
            println!("    ... and {} more", sorted.len() - 10);
        }
    }
    println!("\nOutput written to: {:?}", output_path);
}

// Icon IDs to exclude from the output
const EXCLUDED_ICON_IDS: &[u32] = &[83];

fn convert_icon(
    icon: &InputMapIcon,
    transformer: &WorldPositionTransformer,
    converted_count: &mut usize,
    failed_count: &mut usize,
    failed_maps: &mut HashMap<String, usize>,
) -> Option<OutputMapIcon> {
    // Skip excluded icon IDs
    if EXCLUDED_ICON_IDS.contains(&icon.icon_id) {
        return None;
    }

    // Build map_id: 0xWWXXYYDD where WW=area, XX=gridX, YY=gridZ, DD=0
    let map_id = ((icon.area_no as u32) << 24)
        | ((icon.grid_x_no as u32) << 16)
        | ((icon.grid_z_no as u32) << 8)
        | 0;

    let map_id_str = WorldPositionTransformer::format_map_id(map_id);

    // Convert coordinates
    match transformer.local_to_world_first(map_id, icon.pos_x, icon.pos_y, icon.pos_z) {
        Ok((global_x, global_y, global_z)) => {
            *converted_count += 1;

            // Determine which map this belongs to (m60 or m61)
            // area_no 60 = base game overworld (m60)
            // area_no 61 = DLC overworld (m61)
            // area_no 20-29 = DLC interiors → m61
            // All other areas = base game interiors → m60
            let target_map = if icon.area_no == 60 {
                "m60".to_string()
            } else if icon.area_no == 61 {
                "m61".to_string()
            } else if icon.area_no >= 20 && icon.area_no < 30 {
                // DLC interior maps (area 20-29) always go to m61
                "m61".to_string()
            } else {
                // Base game interior maps
                "m60".to_string()
            };

            Some(OutputMapIcon {
                id: icon.id,
                icon_id: icon.icon_id,
                event_flag_id: icon.event_flag_id,
                area_no: icon.area_no,
                grid_x_no: icon.grid_x_no,
                grid_z_no: icon.grid_z_no,
                pos_x: icon.pos_x,
                pos_y: icon.pos_y,
                pos_z: icon.pos_z,
                global_x,
                global_y,
                global_z,
                map_id: target_map,
                texts: icon.texts.clone(),
            })
        }
        Err(_) => {
            *failed_count += 1;
            *failed_maps.entry(map_id_str).or_insert(0) += 1;
            None
        }
    }
}

