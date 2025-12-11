# Route Tracker - Elden Ring Mod

A mod for Elden Ring that records player position to track speedrun routes.

## License

This project is licensed under **GNU Affero General Public License v3.0** (AGPL-3.0).

This project uses code from [eldenring-practice-tool](https://github.com/veeenu/eldenring-practice-tool) 
by johndisandonato, also licensed under AGPL-3.0.

## Prerequisites

- Rust toolchain (edition 2021)
- Windows target: `x86_64-pc-windows-msvc`
- Elden Ring with [EAC bypass](https://soulsspeedruns.com/eldenring/eac-bypass/)

## Building

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

### 2. Configure (optional)

Edit `route_tracker_config.toml` to customize hotkeys:

```toml
[keybindings]
toggle_ui = "f9"              # Show/hide overlay
toggle_recording = "ctrl+r"   # Start/stop recording
clear_route = "ctrl+shift+c"  # Clear recorded route

[recording]
record_interval_ms = 100      # Record position every 100ms
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
- **Ctrl+Shift+C** - Clear recorded route

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

## Project Structure

```
Route_tracking/
├── Cargo.toml                    # Project configuration
├── LICENSE                       # AGPL-3.0 license
├── README.md                     # This file
├── route_tracker_config.toml     # Configuration template
└── src/
    ├── lib.rs                    # Main mod code (DLL)
    ├── config.rs                 # Configuration & hotkey parsing
    └── injector.rs               # Standalone injector (EXE)
```

## Features

- [x] Display current player position (X, Y, Z, Map ID)
- [x] Record route with configurable interval
- [x] Configurable hotkeys with modifier support
- [x] Built-in DLL injector
- [ ] Export route to file
- [ ] 3D route visualization
- [ ] Route comparison

## Attribution

This project is based on the work of:
- **johndisandonato** - [eldenring-practice-tool](https://github.com/veeenu/eldenring-practice-tool)
- **veeenu** - [hudhook](https://github.com/veeenu/hudhook)

## Contributing

Contributions are welcome! All contributed code will be licensed under AGPL-3.0.
