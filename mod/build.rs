// Build script for Route Tracker
// Copies the config and CSV files to the output directory after build

use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Tell Cargo to rerun this script if these files change
    println!("cargo:rerun-if-changed=route_tracker_config.toml");
    println!("cargo:rerun-if-changed=src/WorldMapLegacyConvParam.csv");
    println!("cargo:rerun-if-changed=assets/data");

    // Get the output directory from Cargo
    let out_dir = env::var("OUT_DIR").unwrap();
    
    // The OUT_DIR is something like target/release/build/route-tracking-xxx/out
    // We need to go up to target/release or target/debug
    let out_path = Path::new(&out_dir);
    
    // Navigate up to find the profile directory (release/debug)
    // OUT_DIR = target/<profile>/build/<crate>-<hash>/out
    let target_dir = out_path
        .ancestors()
        .nth(3) // Go up 3 levels from 'out'
        .expect("Could not find target directory");

    // Copy config file
    let config_src = Path::new("route_tracker_config.toml");
    let config_dst = target_dir.join("route_tracker_config.toml");

    if config_src.exists() {
        fs::copy(config_src, &config_dst).expect("Failed to copy config file");
        println!(
            "cargo:warning=Copied config file to {}",
            config_dst.display()
        );
    } else {
        println!("cargo:warning=Config file not found: route_tracker_config.toml");
    }
    
    // Copy coordinate transformer CSV
    let csv_src = Path::new("src/WorldMapLegacyConvParam.csv");
    let csv_dst = target_dir.join("WorldMapLegacyConvParam.csv");
    
    if csv_src.exists() {
        fs::copy(csv_src, &csv_dst).expect("Failed to copy CSV file");
        println!(
            "cargo:warning=Copied CSV file to {}",
            csv_dst.display()
        );
    } else {
        println!("cargo:warning=CSV file not found: src/WorldMapLegacyConvParam.csv");
    }

    copy_dir_all(Path::new("assets/data"), &target_dir.join("data"));
}

fn copy_dir_all(src: &Path, dst: &Path) {
    if !src.exists() {
        println!("cargo:warning=Boss data directory not found: {}", src.display());
        return;
    }

    fs::create_dir_all(dst).expect("Failed to create data output directory");
    for entry in fs::read_dir(src).expect("Failed to read assets/data") {
        let entry = entry.expect("Failed to read directory entry");
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            copy_dir_all(&src_path, &dst_path);
        } else {
            fs::copy(&src_path, &dst_path).expect("Failed to copy boss data file");
        }
    }
    println!("cargo:warning=Copied boss data to {}", dst.display());
}

