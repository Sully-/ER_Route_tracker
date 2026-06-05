// Convert boss enemies from local to global coordinates
//
// Reads `website/frontend/public/enemies.csv` and converts all coordinates
// using the WorldPositionTransformer, outputting `website/frontend/public/enemies_processed.json`

#[path = "../coordinate_transformer.rs"]
mod coordinate_transformer;

use coordinate_transformer::WorldPositionTransformer;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{BufRead, BufReader, Write};
use std::path::Path;

const BOSS_ICON_ID: u32 = 11;

#[derive(Debug, Clone)]
struct InputBoss {
    flag_id: u64,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    map_name: String,
    boss_name: String,
    place: String,
    region_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputBoss {
    id: u64,
    flag_id: u64,
    icon_id: u32,
    area_no: u8,
    grid_x_no: u8,
    grid_z_no: u8,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    global_x: f32,
    global_y: f32,
    global_z: f32,
    map_id: String,
    boss_name: String,
    place: String,
    region_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct OutputBossData {
    bosses: Vec<OutputBoss>,
    total_count: usize,
    converted_count: usize,
    failed_count: usize,
    skipped_count: usize,
    failed_maps: Vec<String>,
}

fn parse_map_name(name: &str) -> Option<u32> {
    let parts: Vec<&str> = name.split('_').collect();
    if parts.len() != 4 {
        return None;
    }

    let area: u8 = parts[0].trim_start_matches('m').parse().ok()?;
    let grid_x: u8 = parts[1].parse().ok()?;
    let grid_z: u8 = parts[2].parse().ok()?;
    let dd: u8 = parts[3].parse().ok()?;

    Some(((area as u32) << 24) | ((grid_x as u32) << 16) | ((grid_z as u32) << 8) | dd as u32)
}

/// Arena bosses use map names like `m60_13_09_02` (interior tile) but the flag_id
/// encodes the overworld display tile as `10XXYY0800` → m60_XX_YY_00.
fn decode_overworld_tile_from_flag_id(flag_id: u64) -> Option<(u8, u8)> {
    let grid_code = ((flag_id / 10_000) % 10_000) as u32;
    if grid_code < 100 {
        return None;
    }
    let grid_x = (grid_code / 100) as u8;
    let grid_z = (grid_code % 100) as u8;
    Some((grid_x, grid_z))
}

fn is_arena_map_name(map_name: &str) -> bool {
    map_name
        .rsplit('_')
        .next()
        .and_then(|dd| dd.parse::<u8>().ok())
        .map(|dd| dd == 2)
        .unwrap_or(false)
}

fn resolve_conversion_map_id(map_name: &str, flag_id: u64) -> Option<u32> {
    if is_arena_map_name(map_name) {
        if let Some((grid_x, grid_z)) = decode_overworld_tile_from_flag_id(flag_id) {
            return Some(((60u32) << 24) | ((grid_x as u32) << 16) | ((grid_z as u32) << 8));
        }
    }
    parse_map_name(map_name)
}

fn global_area_to_map_id(global_area: u8) -> String {
    match global_area {
        60 => "m60".to_string(),
        61 => "m61".to_string(),
        62 => "m62".to_string(),
        _ => "m60".to_string(),
    }
}

fn parse_f32(field: &str) -> Option<f32> {
    field.trim().parse().ok()
}

fn parse_u64(field: &str) -> Option<u64> {
    field.trim().parse().ok()
}

fn load_enemies_csv(path: &Path) -> Result<Vec<InputBoss>, String> {
    let file = File::open(path).map_err(|e| format!("Failed to open CSV: {}", e))?;
    let reader = BufReader::new(file);
    let mut bosses = Vec::new();

    for (line_num, line_result) in reader.lines().enumerate() {
        if line_num == 0 {
            continue; // header
        }

        let line = line_result.map_err(|e| format!("Failed to read line {}: {}", line_num + 1, e))?;
        if line.trim().is_empty() {
            continue;
        }

        let fields: Vec<&str> = line.split(';').collect();
        if fields.len() < 8 {
            eprintln!("Skipping line {}: expected 8 fields, got {}", line_num + 1, fields.len());
            continue;
        }

        let boss_name = fields[5].trim();
        if boss_name.is_empty() {
            continue;
        }

        let map_name = fields[4].trim();
        if parse_map_name(map_name).is_none() {
            eprintln!("Skipping line {}: invalid map_name '{}'", line_num + 1, map_name);
            continue;
        }

        let flag_id = parse_u64(fields[0]).ok_or_else(|| {
            format!("Invalid flag_id on line {}", line_num + 1)
        })?;
        let pos_x = parse_f32(fields[1]).ok_or_else(|| {
            format!("Invalid positionx on line {}", line_num + 1)
        })?;
        let pos_y = parse_f32(fields[2]).ok_or_else(|| {
            format!("Invalid positiony on line {}", line_num + 1)
        })?;
        let pos_z = parse_f32(fields[3]).ok_or_else(|| {
            format!("Invalid positionz on line {}", line_num + 1)
        })?;

        bosses.push(InputBoss {
            flag_id,
            pos_x,
            pos_y,
            pos_z,
            map_name: map_name.to_string(),
            boss_name: boss_name.to_string(),
            place: fields[6].trim().to_string(),
            region_name: fields[7].trim().to_string(),
        });
    }

    Ok(bosses)
}

fn convert_boss(
    boss: &InputBoss,
    transformer: &WorldPositionTransformer,
    converted_count: &mut usize,
    failed_count: &mut usize,
    failed_maps: &mut HashMap<String, usize>,
) -> Option<OutputBoss> {
    let map_id = resolve_conversion_map_id(&boss.map_name, boss.flag_id)?;
    let map_id_str = WorldPositionTransformer::format_map_id(map_id);
    let (area_no, grid_x_no, grid_z_no, _) = WorldPositionTransformer::parse_map_id(map_id);

    match transformer.local_to_world_with_global_map(map_id, boss.pos_x, boss.pos_y, boss.pos_z) {
        Ok((global_x, global_y, global_z, global_area)) => {
            *converted_count += 1;
            Some(OutputBoss {
                id: boss.flag_id,
                flag_id: boss.flag_id,
                icon_id: BOSS_ICON_ID,
                area_no,
                grid_x_no,
                grid_z_no,
                pos_x: boss.pos_x,
                pos_y: boss.pos_y,
                pos_z: boss.pos_z,
                global_x,
                global_y,
                global_z,
                map_id: global_area_to_map_id(global_area),
                boss_name: boss.boss_name.clone(),
                place: boss.place.clone(),
                region_name: boss.region_name.clone(),
            })
        }
        Err(_) => {
            *failed_count += 1;
            *failed_maps.entry(map_id_str).or_insert(0) += 1;
            None
        }
    }
}

fn main() {
    println!("=== Boss Enemies Coordinate Converter ===\n");

    let csv_path = Path::new("src/WorldMapLegacyConvParam.csv");
    let input_path = Path::new("../website/frontend/public/enemies.csv");
    let output_path = Path::new("../website/frontend/public/enemies_processed.json");

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

    println!("\nLoading input CSV from {:?}...", input_path);
    let input_bosses = match load_enemies_csv(input_path) {
        Ok(b) => b,
        Err(e) => {
            eprintln!("ERROR: {}", e);
            std::process::exit(1);
        }
    };

    println!("  Found {} boss entries with valid data", input_bosses.len());

    let mut converted_count = 0usize;
    let mut failed_count = 0usize;
    let mut skipped_count = 0usize;
    let mut failed_maps: HashMap<String, usize> = HashMap::new();
    let mut seen_flag_ids: HashSet<u64> = HashSet::new();
    let mut bosses: Vec<OutputBoss> = Vec::new();

    println!("\nConverting bosses...");
    for boss in &input_bosses {
        if !seen_flag_ids.insert(boss.flag_id) {
            skipped_count += 1;
            continue;
        }

        if let Some(output) = convert_boss(
            boss,
            &transformer,
            &mut converted_count,
            &mut failed_count,
            &mut failed_maps,
        ) {
            bosses.push(output);
        }
    }

    let total_count = input_bosses.len();
    let failed_maps_list: Vec<String> = failed_maps.keys().cloned().collect();

    let output_data = OutputBossData {
        bosses,
        total_count,
        converted_count,
        failed_count,
        skipped_count,
        failed_maps: failed_maps_list,
    };

    println!("\nWriting output to {:?}...", output_path);
    let output_json = serde_json::to_string_pretty(&output_data).expect("Failed to serialize");
    let mut file = File::create(output_path).expect("Failed to create output file");
    file.write_all(output_json.as_bytes())
        .expect("Failed to write output file");

    println!("\n=== Conversion Complete ===");
    println!("  Total entries:   {}", total_count);
    println!("  Converted:       {}", converted_count);
    println!("  Failed:          {}", failed_count);
    println!("  Skipped (dup):   {}", skipped_count);
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
