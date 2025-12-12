# Route Tracker - Elden Ring Mod

> ⚠️ **Alpha Version** - Under active development


A mod for Elden Ring that records player position to track speedrun routes, with an interactive map viewer.

## License

This project is licensed under **GNU Affero General Public License v3.0** (AGPL-3.0).

This project uses code from [eldenring-practice-tool](https://github.com/veeenu/eldenring-practice-tool) 
by johndisandonato, also licensed under AGPL-3.0.

## Current Features

### Tracker (Rust DLL)
- [x] Display current player position (X, Y, Z, Map ID)
- [x] Display global world coordinates (converted from local tile coordinates)
- [x] Record route with configurable interval
- [x] Configurable hotkeys with modifier support
- [x] Built-in DLL injector
- [x] Export route to JSON file

### Viewer (React + Leaflet.js) https://sulli.tech/ER_Route_tracker/
- [x] Interactive world map with tile-based rendering
- [x] Load and display recorded routes
- [x] Start/End markers
- [x] Auto-focus on routes

## Roadmap

### Tracker
- [ ] Event tracking (item pickup, death, grace activation...)
- [ ] Real-time position streaming to endpoint for live tracking

### Viewer
- [ ] Event icons on map (item pickup, death, grace activation...)
- [ ] Location icons (graces, bosses, merchants...)
- [ ] Underground maps & DLC maps
- [ ] Timelapse playback mode
- [ ] Real-time live tracking of player position

## Project Structure

```
Route_tracking/
├── Cargo.toml                        # Rust project configuration
├── LICENSE                           # AGPL-3.0 license
├── README.md                         # This file
├── route_tracker_config.toml         # Configuration template
├── src/
│   ├── lib.rs                        # Main mod code (DLL)
│   ├── config.rs                     # Configuration & hotkey parsing
│   ├── route.rs                      # Route data structures
│   ├── tracker.rs                    # Position tracking logic
│   ├── coordinate_transformer.rs     # Local → Global coordinate conversion
│   ├── ui.rs                         # ImGui overlay
│   ├── injector.rs                   # Standalone injector (EXE)
│   └── WorldMapLegacyConvParam.csv   # Coordinate mapping data
└── viewer/                           # Interactive map viewer
    └── (see viewer/README.md)
```

## Prerequisites

- Rust toolchain (edition 2021)
- Windows target: `x86_64-pc-windows-msvc`
- Elden Ring with [EAC bypass](https://soulsspeedruns.com/eldenring/eac-bypass/)
- Node.js 18+ (for the viewer)

## Building the Mod

```powershell
cargo build --release
```

This generates:
- `target/release/route_tracking.dll` - The mod DLL
- `target/release/route-tracker-injector.exe` - The injector

## Installation & Usage

### 1. Prepare the files

Copy these files to the same folder:
- `route_tracking.dll`
- `route-tracker-injector.exe`
- `route_tracker_config.toml` (required!)
- `WorldMapLegacyConvParam.csv` (required for coordinate conversion)

### 2. Configure (optional)

Edit `route_tracker_config.toml` to customize hotkeys:

```toml
[keybindings]
toggle_ui = "f9"              # Show/hide overlay
toggle_recording = "ctrl+r"   # Start/stop recording
save_route = "ctrl+s"         # Save route to file
clear_route = "ctrl+shift+c"  # Clear recorded route

[recording]
record_interval_ms = 100      # Record position every 100ms

[output]
routes_directory = "routes"   # Where to save route files
```

**Hotkey format:**
- Simple key: `"f9"`, `"a"`, `"insert"`
- With modifier: `"ctrl+f9"`, `"shift+a"`, `"alt+1"`
- Multiple modifiers: `"ctrl+shift+s"`, `"ctrl+alt+delete"`

### 3. Launch

1. Start Elden Ring (with EAC bypass)
2. Run `route-tracker-injector.exe` (as Administrator recommended)
3. The injector will wait for the game if not running, then inject automatically

### 4. In-game controls

Default hotkeys (configurable):
- **F9** - Toggle overlay visibility
- **Ctrl+R** - Start/Stop recording
- **Ctrl+S** - Save current route to JSON
- **Ctrl+Shift+C** - Clear recorded route

### 5. View your routes

See [viewer/README.md](viewer/README.md) for the interactive map viewer.

## Configuration file

The `route_tracker_config.toml` file **must exist** next to the DLL. The mod will fail to load without it.

### Valid key names

| Category | Keys |
|----------|------|
| Letters | `a` - `z` |
| Numbers | `0` - `9` |
| Function | `f1` - `f12` |
| Numpad | `numpad0` - `numpad9`, `num0` - `num9` |
| Modifiers | `ctrl`, `shift`, `alt` |
| Navigation | `insert`, `delete`, `home`, `end`, `pageup`, `pagedown` |
| Arrows | `up`, `down`, `left`, `right` |
| Special | `escape`, `enter`, `space`, `tab`, `backspace` |

Key names are case-insensitive.

## Attribution

This project is based on the work of:
- **johndisandonato** - [eldenring-practice-tool](https://github.com/veeenu/eldenring-practice-tool)
- **veeenu** - [hudhook](https://github.com/veeenu/hudhook)

## Contributing

Contributions are welcome! All contributed code will be licensed under AGPL-3.0.
