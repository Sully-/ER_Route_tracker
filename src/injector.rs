// Route Tracking Injector for Elden Ring
// Copyright (C) 2024 [Your Name]
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

use std::path::PathBuf;
use std::{env, thread, time::Duration};

use hudhook::inject::Process;

const PROCESS_NAME: &str = "eldenring.exe";

fn find_dll_path() -> Option<PathBuf> {
    // Try to find the DLL in common locations
    let exe_path = env::current_exe().ok()?;
    let exe_dir = exe_path.parent()?;
    
    // Check next to the executable
    let dll_path = exe_dir.join("route_tracking.dll");
    if dll_path.exists() {
        return Some(dll_path);
    }
    
    // Check in current working directory
    let cwd_dll = PathBuf::from("route_tracking.dll");
    if cwd_dll.exists() {
        return Some(cwd_dll.canonicalize().ok()?);
    }
    
    // Check in target/release
    let release_dll = exe_dir.join("../route_tracking.dll");
    if release_dll.exists() {
        return Some(release_dll.canonicalize().ok()?);
    }
    
    None
}

fn wait_for_process(name: &str, timeout_secs: u64) -> Option<Process> {
    println!("[*] Waiting for {} to start...", name);
    
    let start = std::time::Instant::now();
    let timeout = Duration::from_secs(timeout_secs);
    
    loop {
        if let Ok(process) = Process::by_name(name) {
            return Some(process);
        }
        
        if start.elapsed() > timeout {
            return None;
        }
        
        thread::sleep(Duration::from_millis(500));
    }
}

fn main() {
    println!("===========================================");
    println!("   Route Tracker Injector for Elden Ring");
    println!("===========================================");
    println!();
    
    // Find the DLL
    let dll_path = match find_dll_path() {
        Some(path) => path,
        None => {
            eprintln!("[!] Error: Could not find route_tracking.dll");
            eprintln!("[!] Make sure the DLL is in the same folder as this executable");
            eprintln!("[!] or in the current working directory.");
            eprintln!();
            eprintln!("[*] Press Enter to exit...");
            let _ = std::io::stdin().read_line(&mut String::new());
            return;
        }
    };
    
    println!("[+] Found DLL: {}", dll_path.display());
    
    // Find or wait for the process
    let process = match Process::by_name(PROCESS_NAME) {
        Ok(proc) => {
            println!("[+] Found running process: {}", PROCESS_NAME);
            proc
        }
        Err(_) => {
            println!("[*] {} is not running.", PROCESS_NAME);
            println!("[*] Waiting up to 60 seconds for the game to start...");
            println!("[*] Please launch Elden Ring now.");
            println!();
            
            match wait_for_process(PROCESS_NAME, 60) {
                Some(proc) => {
                    println!("[+] Process found!");
                    // Give the game a moment to initialize
                    println!("[*] Waiting 5 seconds for game initialization...");
                    thread::sleep(Duration::from_secs(5));
                    proc
                }
                None => {
                    eprintln!("[!] Timeout: {} did not start within 60 seconds.", PROCESS_NAME);
                    eprintln!();
                    eprintln!("[*] Press Enter to exit...");
                    let _ = std::io::stdin().read_line(&mut String::new());
                    return;
                }
            }
        }
    };
    
    // Inject the DLL
    println!("[*] Injecting DLL...");
    
    match process.inject(dll_path.clone()) {
        Ok(_) => {
            println!("[+] Successfully injected {}!", dll_path.display());
            println!();
            println!("[+] Route Tracker is now active!");
            println!("[+] Press F9 in-game to toggle the overlay.");
            println!();
        }
        Err(e) => {
            eprintln!("[!] Failed to inject DLL: {:?}", e);
            eprintln!();
            eprintln!("[!] Common causes:");
            eprintln!("    - Game anti-cheat is blocking injection");
            eprintln!("    - Insufficient privileges (try running as Administrator)");
            eprintln!("    - Game version mismatch");
            eprintln!();
        }
    }
    
    println!("[*] Press Enter to exit...");
    let _ = std::io::stdin().read_line(&mut String::new());
}

