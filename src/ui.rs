// UI Rendering - ImGui overlay implementation

use hudhook::imgui::{Condition, WindowFlags};
use hudhook::tracing::info;
use hudhook::ImguiRenderLoop;

use crate::tracker::RouteTracker;

// =============================================================================
// HUDHOOK IMPLEMENTATION
// =============================================================================

impl ImguiRenderLoop for RouteTracker {
    fn render(&mut self, ui: &mut hudhook::imgui::Ui) {
        // Handle keyboard shortcuts
        self.handle_hotkeys();
        
        // Record position each frame if recording is active
        self.record_position();
        
        // NOTE: Hudhook crashes if render() doesn't draw anything.
        // We must always call window().build() even when hidden.
        
        let [dw, _dh] = ui.io().display_size;
        
        if !self.show_ui {
            // Draw an invisible/empty window to prevent crash
            ui.window("##hidden")
                .position([-100.0, -100.0], Condition::Always)
                .size([1.0, 1.0], Condition::Always)
                .no_decoration()
                .build(|| {});
            return;
        }
        
        ui.window("Route Tracker")
            .position([dw - 320.0, 20.0], Condition::FirstUseEver)
            .size([300.0, 250.0], Condition::FirstUseEver)
            .flags(WindowFlags::ALWAYS_AUTO_RESIZE)
            .build(|| {
                self.render_position_section(ui);
                ui.separator();
                self.render_recording_section(ui);
                self.render_status_message(ui);
                ui.separator();
                self.render_keybindings_section(ui);
            });
    }
}

// =============================================================================
// UI SECTIONS
// =============================================================================

impl RouteTracker {
    /// Handle keyboard shortcuts
    fn handle_hotkeys(&mut self) {
        if self.config.keybindings.toggle_ui.is_just_pressed() {
            self.show_ui = !self.show_ui;
            info!("UI toggled: show_ui={}", self.show_ui);
        }
        
        if self.config.keybindings.toggle_recording.is_just_pressed() {
            if self.is_recording {
                self.stop_recording();
            } else {
                self.start_recording();
            }
        }
        
        if self.config.keybindings.clear_route.is_just_pressed() {
            self.route.clear();
            self.set_status("Route cleared!".to_string());
            info!("Route cleared!");
        }
        
        if self.config.keybindings.save_route.is_just_pressed() {
            self.do_save_route();
        }
    }
    
    /// Render current position section
    fn render_position_section(&self, ui: &hudhook::imgui::Ui) {
        ui.text("=== Current Position ===");
        if let Some((x, y, z, gx, gy, gz, map_id)) = self.get_current_position() {
            // Map ID in decimal format (matches CSV)
            let (ww, xx, yy, dd) = (
                (map_id >> 24) & 0xff,
                (map_id >> 16) & 0xff,
                (map_id >> 8) & 0xff,
                map_id & 0xff,
            );
            ui.text(format!("Map: m{:02}_{:02}_{:02}_{:02}", ww, xx, yy, dd));
            
            ui.separator();
            ui.text("Local (Tile):");
            ui.text(format!("  X: {:.2}  Y: {:.2}  Z: {:.2}", x, y, z));
            
            ui.separator();
            ui.text("Global (World):");
            ui.text(format!("  X: {:.2}  Y: {:.2}  Z: {:.2}", gx, gy, gz));
        } else {
            ui.text("Position not available");
        }
    }
    
    /// Render recording controls section
    fn render_recording_section(&mut self, ui: &hudhook::imgui::Ui) {
        ui.text("=== Recording ===");
        
        if self.is_recording {
            ui.text_colored([0.0, 1.0, 0.0, 1.0], "● RECORDING");
            ui.text(format!("Points: {}", self.route.len()));
            
            if let Some(start) = self.start_time {
                let elapsed = start.elapsed();
                let secs = elapsed.as_secs();
                let mins = secs / 60;
                let secs = secs % 60;
                ui.text(format!("Duration: {:02}:{:02}", mins, secs));
            }
            
            if ui.button("Stop Recording") {
                self.stop_recording();
            }
        } else {
            ui.text("○ Stopped");
            ui.text(format!("Recorded points: {}", self.route.len()));
            
            if ui.button("Start Recording") {
                self.start_recording();
            }
            
            ui.same_line();
            
            if ui.button("Clear") {
                self.route.clear();
                self.set_status("Route cleared!".to_string());
            }
            
            ui.same_line();
            
            // Only enable Save if we have points
            if !self.route.is_empty() {
                if ui.button("Save") {
                    self.do_save_route();
                }
            } else {
                ui.text_disabled("Save");
            }
        }
    }
    
    /// Render status message if any
    fn render_status_message(&self, ui: &hudhook::imgui::Ui) {
        if let Some(status) = self.get_status() {
            ui.separator();
            ui.text_colored([1.0, 1.0, 0.0, 1.0], status);
        }
    }
    
    /// Render keybindings help section
    fn render_keybindings_section(&self, ui: &hudhook::imgui::Ui) {
        ui.text("=== Keybindings ===");
        ui.text_disabled(format!("{}: Toggle UI", self.config.keybindings.toggle_ui.name()));
        ui.text_disabled(format!("{}: Start/Stop Recording", self.config.keybindings.toggle_recording.name()));
        ui.text_disabled(format!("{}: Clear Route", self.config.keybindings.clear_route.name()));
        ui.text_disabled(format!("{}: Save Route", self.config.keybindings.save_route.name()));
    }
    
    /// Save route and update status
    fn do_save_route(&mut self) {
        match self.save_route() {
            Ok(path) => {
                self.set_status(format!(
                    "Saved: {}",
                    path.file_name().unwrap_or_default().to_string_lossy()
                ));
            }
            Err(e) => {
                self.set_status(format!("Error: {}", e));
            }
        }
    }
}



