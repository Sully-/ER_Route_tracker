# Route Tracker Mod - Technical Documentation

Technical documentation for building and developing the Route Tracker mod for Elden Ring.

## Prerequisites

- **Rust toolchain** (edition 2021)
- **Windows target**: `x86_64-pc-windows-msvc`
- **Elden Ring** with [EAC bypass](https://soulsspeedruns.com/eldenring/eac-bypass/)

## Building

### Using Cargo

```powershell
cd mod
cargo build --release
```

### Using the Build Script

```powershell
.\scripts\mod\build.ps1 -Release
```

### Build Output

The build generates:
- `mod/target/release/route_tracking.dll` - The mod DLL
- `mod/target/release/route-tracker-injector.exe` - The injector

## Project Structure

```
mod/
├── src/
│   ├── lib.rs                    # Main mod code (DLL entry point)
│   ├── config.rs                 # Configuration & hotkey parsing
│   ├── route.rs                  # Route data structures
│   ├── tracker.rs                # Position tracking logic
│   ├── coordinate_transformer.rs # Local → Global coordinate conversion
│   ├── realtime_client.rs        # Real-time streaming client (HTTP)
│   ├── ui.rs                     # ImGui overlay rendering
│   ├── injector.rs               # Standalone injector (EXE)
│   └── WorldMapLegacyConvParam.csv
├── Cargo.toml
├── Cargo.lock
├── build.rs
└── route_tracker_config.toml     # Configuration template
```

## Architecture

### DLL (route_tracking.dll)

The mod is a DLL that gets injected into the Elden Ring process. It uses:

- **hudhook** - For ImGui overlay rendering
- **windows-rs** - For Windows API bindings
- **reqwest** - For HTTP requests to the backend

### Injector (route-tracker-injector.exe)

A standalone executable that:
1. Waits for Elden Ring process to start
2. Injects the DLL into the game process
3. Exits after successful injection

### Coordinate Transformation

The mod converts local tile coordinates to global world coordinates using `WorldMapLegacyConvParam.csv`. This allows routes to be displayed correctly on the map viewer.

Key components:
- `coordinate_transformer.rs` - Main transformation logic
- `WorldMapLegacyConvParam.csv` - Conversion parameters from game data

## Configuration

### File: `route_tracker_config.toml`

The configuration file **must exist** next to the DLL. The mod will fail to load without it.

```toml
[keybindings]
toggle_ui = "f9"                                      # Show/hide overlay
toggle_recording = "ctrl+r"                           # Start/stop recording
toggle_streaming = "f6"                               # Start/stop real-time streaming
save_route = "ctrl+s"                                 # Save route to file
clear_route = "ctrl+shift+c"                          # Clear recorded route

[recording]
record_interval_ms = 100                              # Record position every 100ms

[output]
routes_directory = "routes"                           # Where to save route files

[realtime]
enabled = false                                       # Enable real-time streaming
backend_url = "https://er-route-tracker.sulli.tech/"  # Backend API URL
push_key = ""                                         # Push key for authentication
```

### Valid Key Names

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

### Hotkey Format

- Simple key: `"f9"`, `"a"`, `"insert"`
- With modifier: `"ctrl+f9"`, `"shift+a"`, `"alt+1"`
- Multiple modifiers: `"ctrl+shift+s"`, `"ctrl+alt+delete"`

## Real-Time Streaming

The mod can stream player position to the backend in real-time.

### How It Works

1. When streaming is enabled, the mod sends position updates to the backend via HTTP POST
2. The backend broadcasts updates to connected viewers via SignalR
3. Viewers see the route update in real-time on the map

### API Endpoint

```
POST https://er-route-tracker.sulli.tech/api/RoutePoints
Headers:
  X-Push-Key: <push-key>
  Content-Type: application/json
Body: [{ x, y, z, globalX, globalY, globalZ, mapId, mapIdStr, globalMapId, timestampMs }]
```

## Route JSON Format

Routes are saved as JSON files with this structure:

```json
{
  "name": "Route Name",
  "recorded_at": "2025-01-15 14:30:00",
  "point_count": 150,
  "duration_secs": 120.5,
  "interval_ms": 5000,
  "points": [
    {
      "x": -11.51,
      "y": 90.60,
      "z": -56.88,
      "global_x": 10740.49,
      "global_y": 90.60,
      "global_z": 9159.12,
      "map_id": 1862270976,
      "map_id_str": "m60_42_36_00",
      "global_map_id": 60,
      "timestamp_ms": 0
    }
  ]
}
```

**Fields:**
- `x`, `y`, `z` - Local tile coordinates
- `global_x`, `global_y`, `global_z` - Global world coordinates
- `map_id` - Raw map ID from game memory
- `map_id_str` - Human-readable map ID (format: `m{area}_{gridX}_{gridZ}_{sub}`)
- `global_map_id` - Display map (60 = Lands Between, 61 = Shadow Realm, 62 = Underground)
- `timestamp_ms` - Timestamp relative to recording start

## Development

### Adding a New Feature

1. Modify the relevant source file in `src/`
2. Update `lib.rs` if adding new modules
3. Test with `cargo build` (debug) or `cargo build --release`
4. Inject into game and verify

### Debugging

- Use `log` crate for logging (output goes to debug console)
- Build in debug mode for faster iteration: `cargo build`
- Use a debugger attached to the game process if needed

### Memory Offsets

The mod reads player position from game memory. Offsets may need updating after game patches.

See `tracker.rs` for current memory reading logic.

## Attribution

This project is based on:
- **johndisandonato** - [eldenring-practice-tool](https://github.com/veeenu/eldenring-practice-tool)
- **veeenu** - [hudhook](https://github.com/veeenu/hudhook)

## License

AGPL-3.0 - See main project LICENSE file.
