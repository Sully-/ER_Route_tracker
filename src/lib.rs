// Route Tracking Mod for Elden Ring
// Copyright (C) 2024 [Your Name]
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// This project uses code from eldenring-practice-tool by johndisandonato
// which is also licensed under AGPL-3.0.
// Original source: https://github.com/veeenu/eldenring-practice-tool

// =============================================================================
// MODULES
// =============================================================================

mod config;
mod coordinate_transformer;
mod route;
mod tracker;
mod ui;

// =============================================================================
// IMPORTS
// =============================================================================

use std::ffi::c_void;

use hudhook::hooks::dx12::ImguiDx12Hooks;
use hudhook::{eject, Hudhook};
use windows::Win32::Foundation::HINSTANCE;
use windows::Win32::System::SystemServices::DLL_PROCESS_ATTACH;

use tracker::RouteTracker;

// =============================================================================
// DLL ENTRY POINT
// =============================================================================

fn start_mod(hmodule: HINSTANCE) {
    let tracker = match RouteTracker::new(hmodule) {
        Some(t) => t,
        None => {
            eject();
            return;
        }
    };
    
    if let Err(e) = Hudhook::builder()
        .with::<ImguiDx12Hooks>(tracker)
        .with_hmodule(hmodule)
        .build()
        .apply()
    {
        hudhook::tracing::error!("Couldn't apply hooks: {e:?}");
        eject();
    }
}

#[no_mangle]
#[allow(clippy::missing_safety_doc)]
pub unsafe extern "system" fn DllMain(hmodule: HINSTANCE, reason: u32, _: *mut c_void) -> bool {
    if reason == DLL_PROCESS_ATTACH {
        // Check game version
        if libeldenring::version::check_version().is_err() {
            return false;
        }
        
        std::thread::spawn(move || {
            start_mod(hmodule);
        });
    }
    
    true
}
