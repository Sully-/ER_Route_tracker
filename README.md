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
- [x] Real-time position streaming to backend endpoint for live tracking

### Viewer (React + Leaflet.js) https://sulli.tech/ER_Route_tracker/
- [x] Interactive world map with tile-based rendering
- [x] Load and display recorded routes
- [x] Start/End markers
- [x] Auto-focus on routes
- [x] DLC maps (Shadow Realm) support
- [x] Location icons (graces, bosses, merchants, etc.) with popups
- [x] Map transitions (Lands Between ↔ Shadow Realm)
- [x] Teleportation markers (departure/arrival) for intra-map and inter-map teleports
- [x] Automatic zoom on map transitions
- [x] Icon visibility toggle
- [x] Real-time live tracking of player position via SignalR

## Roadmap

### Tracker
- [ ] Event tracking (item pickup, death, grace activation...)

### Viewer
- [ ] Underground map
- [ ] Event icons on map (item pickup, death, grace activation...)
- [ ] Timelapse playback mode

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
│   ├── realtime_client.rs            # Real-time streaming client
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
toggle_streaming = "f6"       # Start/stop real-time streaming
save_route = "ctrl+s"         # Save route to file
clear_route = "ctrl+shift+c"  # Clear recorded route

[recording]
record_interval_ms = 100      # Record position every 100ms

[output]
routes_directory = "routes"   # Where to save route files

[realtime]
enabled = false               # Enable real-time streaming
backend_url = "http://localhost:5192"  # Backend API URL
push_key = ""                 # Push key for authentication (get from backend)
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
- **F6** - Start/Stop real-time streaming to backend
- **Ctrl+S** - Save current route to JSON
- **Ctrl+Shift+C** - Clear recorded route

### 5. Real-time streaming (optional)

To enable real-time streaming to the backend:

1. Set up the backend server (see [Backend & Database Setup](#backend--database-setup))
2. Generate a push key from the backend API
3. Edit `route_tracker_config.toml`:
   ```toml
   [realtime]
   enabled = true
   backend_url = "http://localhost:5192"  # Your backend URL
   push_key = "your-push-key-here"         # Get from backend
   ```
4. Use **F6** (default) to start/stop streaming

The viewer can then track routes in real-time using the corresponding view key.

### 6. View your routes

See [viewer/README.md](viewer/README.md) for the interactive map viewer.

## Backend & Database Setup

The project includes an ASP.NET Core backend with PostgreSQL for real-time tracking features.

### Quick Start

**Windows:**
```powershell
.\setup-dev-windows.ps1
```

**Linux:**
```bash
chmod +x setup-dev-linux.sh
./setup-dev-linux.sh
```

**Production (Linux):**
```bash
cd backend/scripts
sudo ./setup-prod-linux.sh --create-service
```

For detailed instructions, see [DATABASE_SETUP.md](DATABASE_SETUP.md).

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

### Tools

- **Smithbox** - [vawser/Smithbox](https://github.com/vawser/Smithbox) - Essential modding tool for Elden Ring (Param Editor, Map Editor, etc.)

## Contributing

Contributions are welcome! All contributed code will be licensed under AGPL-3.0.
