// Configuration module for Route Tracker
// Handles loading/saving settings from a TOML file

use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::fs;
use std::path::PathBuf;
use windows::Win32::Foundation::HINSTANCE;
use windows::Win32::System::LibraryLoader::GetModuleFileNameW;
use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;

// =============================================================================
// KEY CODE MAPPING
// =============================================================================

/// All supported key names and their virtual key codes
const KEY_MAPPINGS: &[(&str, i32)] = &[
    // Letters (A-Z)
    ("a", 0x41), ("b", 0x42), ("c", 0x43), ("d", 0x44), ("e", 0x45),
    ("f", 0x46), ("g", 0x47), ("h", 0x48), ("i", 0x49), ("j", 0x4A),
    ("k", 0x4B), ("l", 0x4C), ("m", 0x4D), ("n", 0x4E), ("o", 0x4F),
    ("p", 0x50), ("q", 0x51), ("r", 0x52), ("s", 0x53), ("t", 0x54),
    ("u", 0x55), ("v", 0x56), ("w", 0x57), ("x", 0x58), ("y", 0x59),
    ("z", 0x5A),
    
    // Numbers (top row)
    ("0", 0x30), ("1", 0x31), ("2", 0x32), ("3", 0x33), ("4", 0x34),
    ("5", 0x35), ("6", 0x36), ("7", 0x37), ("8", 0x38), ("9", 0x39),
    
    // Function keys
    ("f1", 0x70), ("f2", 0x71), ("f3", 0x72), ("f4", 0x73),
    ("f5", 0x74), ("f6", 0x75), ("f7", 0x76), ("f8", 0x77),
    ("f9", 0x78), ("f10", 0x79), ("f11", 0x7A), ("f12", 0x7B),
    
    // Numpad
    ("numpad0", 0x60), ("numpad1", 0x61), ("numpad2", 0x62),
    ("numpad3", 0x63), ("numpad4", 0x64), ("numpad5", 0x65),
    ("numpad6", 0x66), ("numpad7", 0x67), ("numpad8", 0x68),
    ("numpad9", 0x69),
    ("num0", 0x60), ("num1", 0x61), ("num2", 0x62), // Aliases
    ("num3", 0x63), ("num4", 0x64), ("num5", 0x65),
    ("num6", 0x66), ("num7", 0x67), ("num8", 0x68),
    ("num9", 0x69),
    ("multiply", 0x6A), ("add", 0x6B), ("subtract", 0x6D),
    ("decimal", 0x6E), ("divide", 0x6F),
    ("numpad_multiply", 0x6A), ("numpad_add", 0x6B),
    ("numpad_subtract", 0x6D), ("numpad_decimal", 0x6E),
    ("numpad_divide", 0x6F),
    
    // Navigation
    ("insert", 0x2D), ("ins", 0x2D),
    ("delete", 0x2E), ("del", 0x2E), ("suppr", 0x2E),
    ("home", 0x24), ("end", 0x23),
    ("pageup", 0x21), ("pagedown", 0x22),
    ("pgup", 0x21), ("pgdn", 0x22),
    ("up", 0x26), ("down", 0x28), ("left", 0x25), ("right", 0x27),
    
    // Special keys
    ("escape", 0x1B), ("esc", 0x1B),
    ("enter", 0x0D), ("return", 0x0D),
    ("space", 0x20), ("spacebar", 0x20),
    ("tab", 0x09),
    ("backspace", 0x08), ("back", 0x08),
    ("capslock", 0x14), ("caps", 0x14),
    ("numlock", 0x90), ("scrolllock", 0x91),
    ("printscreen", 0x2C), ("print", 0x2C),
    ("pause", 0x13), ("break", 0x13),
    
    // Punctuation & symbols
    ("semicolon", 0xBA), (";", 0xBA),
    ("equals", 0xBB), ("=", 0xBB), ("plus", 0xBB),
    ("comma", 0xBC), (",", 0xBC),
    ("minus", 0xBD), ("-", 0xBD),
    ("period", 0xBE), (".", 0xBE),
    ("slash", 0xBF), ("/", 0xBF),
    ("backtick", 0xC0), ("`", 0xC0), ("grave", 0xC0),
    ("openbracket", 0xDB), ("[", 0xDB),
    ("backslash", 0xDC), ("\\", 0xDC),
    ("closebracket", 0xDD), ("]", 0xDD),
    ("quote", 0xDE), ("'", 0xDE),
];

/// Convert key name to virtual key code
fn name_to_keycode(name: &str) -> Option<i32> {
    let name_lower = name.to_lowercase();
    KEY_MAPPINGS
        .iter()
        .find(|(n, _)| *n == name_lower)
        .map(|(_, code)| *code)
}

/// Convert virtual key code to key name (canonical name)
fn keycode_to_name(code: i32) -> &'static str {
    match code {
        0x41 => "A", 0x42 => "B", 0x43 => "C", 0x44 => "D", 0x45 => "E",
        0x46 => "F", 0x47 => "G", 0x48 => "H", 0x49 => "I", 0x4A => "J",
        0x4B => "K", 0x4C => "L", 0x4D => "M", 0x4E => "N", 0x4F => "O",
        0x50 => "P", 0x51 => "Q", 0x52 => "R", 0x53 => "S", 0x54 => "T",
        0x55 => "U", 0x56 => "V", 0x57 => "W", 0x58 => "X", 0x59 => "Y",
        0x5A => "Z",
        0x30 => "0", 0x31 => "1", 0x32 => "2", 0x33 => "3", 0x34 => "4",
        0x35 => "5", 0x36 => "6", 0x37 => "7", 0x38 => "8", 0x39 => "9",
        0x70 => "F1", 0x71 => "F2", 0x72 => "F3", 0x73 => "F4",
        0x74 => "F5", 0x75 => "F6", 0x76 => "F7", 0x77 => "F8",
        0x78 => "F9", 0x79 => "F10", 0x7A => "F11", 0x7B => "F12",
        0x60 => "Numpad0", 0x61 => "Numpad1", 0x62 => "Numpad2",
        0x63 => "Numpad3", 0x64 => "Numpad4", 0x65 => "Numpad5",
        0x66 => "Numpad6", 0x67 => "Numpad7", 0x68 => "Numpad8",
        0x69 => "Numpad9",
        0x6A => "Multiply", 0x6B => "Add", 0x6D => "Subtract",
        0x6E => "Decimal", 0x6F => "Divide",
        0x2D => "Insert", 0x2E => "Delete",
        0x24 => "Home", 0x23 => "End",
        0x21 => "PageUp", 0x22 => "PageDown",
        0x26 => "Up", 0x28 => "Down", 0x25 => "Left", 0x27 => "Right",
        0x1B => "Escape", 0x0D => "Enter", 0x20 => "Space",
        0x09 => "Tab", 0x08 => "Backspace",
        0x14 => "CapsLock", 0x90 => "NumLock", 0x91 => "ScrollLock",
        0x2C => "PrintScreen", 0x13 => "Pause",
        0xBA => ";", 0xBB => "=", 0xBC => ",", 0xBD => "-",
        0xBE => ".", 0xBF => "/", 0xC0 => "`",
        0xDB => "[", 0xDC => "\\", 0xDD => "]", 0xDE => "'",
        _ => "Unknown",
    }
}

// =============================================================================
// MODIFIER KEYS
// =============================================================================

/// Modifier key flags
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Modifiers {
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
}

impl Modifiers {
    /// Virtual key codes for modifier detection
    const VK_CONTROL: i32 = 0x11;
    const VK_SHIFT: i32 = 0x10;
    const VK_MENU: i32 = 0x12; // Alt key

    /// Check if the required modifiers are currently held down
    pub fn are_held(&self) -> bool {
        let ctrl_ok = !self.ctrl || Self::is_key_down(Self::VK_CONTROL);
        let shift_ok = !self.shift || Self::is_key_down(Self::VK_SHIFT);
        let alt_ok = !self.alt || Self::is_key_down(Self::VK_MENU);
        ctrl_ok && shift_ok && alt_ok
    }

    /// Check if a key is currently held down
    fn is_key_down(key_code: i32) -> bool {
        (unsafe { GetAsyncKeyState(key_code) } as u16 & 0x8000) != 0
    }

    /// Get display string for modifiers
    pub fn display_prefix(&self) -> String {
        let mut parts = Vec::new();
        if self.ctrl {
            parts.push("Ctrl");
        }
        if self.shift {
            parts.push("Shift");
        }
        if self.alt {
            parts.push("Alt");
        }
        if parts.is_empty() {
            String::new()
        } else {
            format!("{}+", parts.join("+"))
        }
    }
}

// =============================================================================
// HOTKEY TYPE (Key + optional modifiers)
// =============================================================================

/// A hotkey with optional modifiers (Ctrl, Shift, Alt) and a main key
#[derive(Debug, Clone, Copy)]
pub struct Hotkey {
    pub key: i32,
    pub modifiers: Modifiers,
}

impl Hotkey {
    /// Get the display name for this hotkey
    pub fn name(&self) -> String {
        format!("{}{}", self.modifiers.display_prefix(), keycode_to_name(self.key))
    }

    /// Check if this hotkey was just pressed (key edge + modifiers held)
    pub fn is_just_pressed(&self) -> bool {
        // Check if main key was just pressed (edge detection)
        let key_pressed = (unsafe { GetAsyncKeyState(self.key) } as u16 & 1) != 0;
        // Check if required modifiers are held
        key_pressed && self.modifiers.are_held()
    }
}

/// Parse a hotkey string like "ctrl+shift+f9" or "f9"
fn parse_hotkey(s: &str) -> Result<Hotkey, String> {
    let parts: Vec<&str> = s.split('+').map(|p| p.trim()).collect();
    
    if parts.is_empty() {
        return Err("Empty hotkey string".to_string());
    }

    let mut modifiers = Modifiers::default();
    let mut main_key: Option<i32> = None;

    for part in parts {
        let part_lower = part.to_lowercase();
        match part_lower.as_str() {
            "ctrl" | "control" => modifiers.ctrl = true,
            "shift" => modifiers.shift = true,
            "alt" => modifiers.alt = true,
            _ => {
                // This should be the main key
                if main_key.is_some() {
                    return Err(format!(
                        "Multiple main keys specified: already have one, found '{}'",
                        part
                    ));
                }
                main_key = Some(name_to_keycode(part).ok_or_else(|| {
                    format!("Unknown key name: '{}'. See config file for valid key names.", part)
                })?);
            }
        }
    }

    let key = main_key.ok_or_else(|| "No main key specified in hotkey".to_string())?;

    Ok(Hotkey { key, modifiers })
}

// Custom serialization: Hotkey -> string like "ctrl+f9"
impl Serialize for Hotkey {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut parts = Vec::new();
        if self.modifiers.ctrl {
            parts.push("ctrl".to_string());
        }
        if self.modifiers.shift {
            parts.push("shift".to_string());
        }
        if self.modifiers.alt {
            parts.push("alt".to_string());
        }
        parts.push(keycode_to_name(self.key).to_lowercase());
        serializer.serialize_str(&parts.join("+"))
    }
}

// Custom deserialization: string like "ctrl+f9" -> Hotkey
impl<'de> Deserialize<'de> for Hotkey {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s = String::deserialize(deserializer)?;
        parse_hotkey(&s).map_err(serde::de::Error::custom)
    }
}

// =============================================================================
// CONFIGURATION STRUCTURES
// =============================================================================

/// Keyboard shortcuts configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyBindings {
    /// Key to toggle UI visibility
    pub toggle_ui: Hotkey,
    /// Key to start/stop recording
    pub toggle_recording: Hotkey,
    /// Key to clear recorded route
    pub clear_route: Hotkey,
    /// Key to save recorded route to file
    pub save_route: Hotkey,
}

impl Default for KeyBindings {
    fn default() -> Self {
        Self {
            toggle_ui: Hotkey {
                key: 0x78, // F9
                modifiers: Modifiers::default(),
            },
            toggle_recording: Hotkey {
                key: 0x77, // F8
                modifiers: Modifiers::default(),
            },
            clear_route: Hotkey {
                key: 0x76, // F7
                modifiers: Modifiers::default(),
            },
            save_route: Hotkey {
                key: 0x53, // S
                modifiers: Modifiers { ctrl: true, shift: false, alt: false },
            },
        }
    }
}

/// Recording settings
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordingSettings {
    /// Interval between position records in milliseconds
    pub record_interval_ms: u64,
}

impl Default for RecordingSettings {
    fn default() -> Self {
        Self {
            record_interval_ms: 100, // 10 points per second
        }
    }
}

/// Output settings for saving routes
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputSettings {
    /// Directory where route files will be saved
    pub routes_directory: String,
}

impl Default for OutputSettings {
    fn default() -> Self {
        Self {
            routes_directory: "routes".to_string(),
        }
    }
}

/// Main configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    /// Keyboard shortcuts
    pub keybindings: KeyBindings,
    /// Recording settings
    pub recording: RecordingSettings,
    /// Output settings
    pub output: OutputSettings,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            keybindings: KeyBindings::default(),
            recording: RecordingSettings::default(),
            output: OutputSettings::default(),
        }
    }
}

// =============================================================================
// ERROR HANDLING & LOADING
// =============================================================================

/// Error type for configuration loading
#[derive(Debug)]
pub enum ConfigError {
    /// Could not determine config file path
    PathError,
    /// Config file does not exist
    FileNotFound(PathBuf),
    /// Failed to read the config file
    ReadError(std::io::Error),
    /// Failed to parse the config file
    ParseError(toml::de::Error),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::PathError => write!(f, "Could not determine config file path"),
            ConfigError::FileNotFound(path) => {
                write!(f, "Config file not found: {}", path.display())
            }
            ConfigError::ReadError(e) => write!(f, "Failed to read config file: {}", e),
            ConfigError::ParseError(e) => write!(f, "Failed to parse config file: {}", e),
        }
    }
}

impl Config {
    /// Config file name
    pub const CONFIG_FILENAME: &'static str = "route_tracker_config.toml";

    /// Get the DLL's directory path using its HMODULE
    pub fn get_dll_directory(hmodule: HINSTANCE) -> Option<PathBuf> {
        let mut buffer = [0u16; 260]; // MAX_PATH
        let len = unsafe { GetModuleFileNameW(hmodule, &mut buffer) } as usize;
        
        if len == 0 || len >= buffer.len() {
            return None;
        }
        
        let dll_path = String::from_utf16_lossy(&buffer[..len]);
        let path = PathBuf::from(dll_path);
        path.parent().map(|p| p.to_path_buf())
    }

    /// Get the config file path (next to the DLL)
    pub fn config_path(hmodule: HINSTANCE) -> Option<PathBuf> {
        let dir = Self::get_dll_directory(hmodule)?;
        Some(dir.join(Self::CONFIG_FILENAME))
    }

    /// Load configuration from file next to the DLL
    /// Returns an error if the file does not exist or cannot be parsed
    pub fn load(hmodule: HINSTANCE) -> Result<Self, ConfigError> {
        let config_path = Self::config_path(hmodule).ok_or(ConfigError::PathError)?;

        hudhook::tracing::info!("Looking for config at: {}", config_path.display());

        if !config_path.exists() {
            return Err(ConfigError::FileNotFound(config_path));
        }

        let contents = fs::read_to_string(&config_path).map_err(ConfigError::ReadError)?;

        let config: Config = toml::from_str(&contents).map_err(ConfigError::ParseError)?;

        hudhook::tracing::info!("Loaded config from {}", config_path.display());
        Ok(config)
    }
}
