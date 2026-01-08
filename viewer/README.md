# Elden Ring Route Viewer

> ⚠️ **Alpha Version** - Under active development

Interactive map viewer for visualizing recorded routes from the Route Tracker mod.

Built with **React 18**, **TypeScript**, **Vite**, and **Leaflet.js**.

## Built with AI

This viewer was built using **Cursor** + **Claude** (Anthropic).
The code was generated through conversational AI assistance ("vibe coding").

## Current Features

### Map Display
- ✅ Interactive world map with tile-based rendering (Lands Between & Shadow Realm DLC)
- ✅ Multiple map support with seamless switching
- ✅ Zoom and pan controls
- ✅ Map selection buttons

### Route Visualization
- ✅ Load route JSON files recorded by the mod
- ✅ Auto-focus on loaded routes
- ✅ Start (green) and end (red) markers
- ✅ Route path visualization with glow effect
- ✅ Teleportation markers (departure/arrival) for intra-map teleports
- ✅ Inter-map transition markers with automatic map switching
- ✅ Automatic zoom on map transitions

### Map Icons
- ✅ Location icons (graces, bosses, merchants, etc.) with popups
- ✅ Icon visibility toggle
- ✅ Filtered by active map
- ✅ Preserved aspect ratio for all icon images

## Roadmap

- [ ] 🗺️ Underground map support
- [ ] 📌 Event icons on map (item pickup, death, grace activation...)
- [ ] ⏱️ Timelapse playback mode
- [ ] 📡 Real-time live tracking of player position

## Prerequisites

- Node.js 18+
- npm

## Quick Start

### Development

```bash
npm install
npm run dev
```

Then open http://localhost:5173/

Or simply double-click `start_dev.bat`

### Production Build

```bash
npm run build
```

The `dist/` folder contains static files ready to deploy.

To preview the production build:
```bash
npm run preview
```

Or double-click `start_production.bat`

## Project Structure

```
viewer/
├── src/
│   ├── components/
│   │   ├── Map/
│   │   │   └── MapContainer.tsx      # Main map component with Leaflet
│   │   ├── Toolbar/
│   │   │   └── Toolbar.tsx           # Load/Clear/Focus buttons
│   │   └── RouteInfo/
│   │       └── RouteInfo.tsx         # Route statistics panel
│   ├── hooks/
│   │   ├── useRouteLoader.ts         # JSON file loading hook
│   │   └── useMapIcons.ts            # Map icons loading and filtering
│   ├── utils/
│   │   ├── coordinateTransform.ts    # Game → Pixel conversion
│   │   ├── calibration.ts            # Calibration points for m60 & m61
│   │   └── routeAnalysis.ts          # Route analysis (transitions, segments)
│   ├── types/
│   │   ├── route.ts                  # Route TypeScript interfaces
│   │   └── mapIcons.ts               # Map icons TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── public/
│   ├── tiles/                        # Lands Between map tiles (zoom 0-6)
│   ├── tiles_shadow/                 # Shadow Realm DLC map tiles (zoom 0-5)
│   ├── map_icons/                    # Icon PNG files (icon_1.png, icon_2.png, ...)
│   ├── map_data_processed.json       # Processed map icons data (global coordinates)
│   └── map_data_export.json          # Raw map icons data (local coordinates)
├── dist/                             # Production build output
├── generate_tiles.py                 # Python script to generate map tiles
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Regenerating Tiles

If you need to regenerate the map tiles:

1. Install Python with Pillow: `pip install Pillow`
2. Prepare source images:
   - **Lands Between**: `Lands_Between_Name.png` (9645x9119 px)
   - **Shadow Realm**: (DLC map source image)
3. Run the tile generation script:
```bash
python generate_tiles.py <source_image_path> <output_directory>
```

Example:
```bash
python generate_tiles.py Lands_Between_Name.png public/tiles
```

## Calibration

The viewer uses calibration points to convert game coordinates to pixel coordinates for each map.

### Lands Between (m60)
7 calibration points (mean error: ~9.7 pixels):

| Location | Game (X, Z) | Pixel (x, y) |
|----------|-------------|--------------|
| The First Step | 10739.17, 9161.5 | 3697, 7345 |
| Morne Moangrave | 10976.9, 7667.36 | 3933, 8851 |
| Starscourge Radahn | 13268.46, 9686.11 | 6239, 6806 |
| First Church of Marika | 13793.61, 14142.3 | 6754, 2363 |
| Ringleader's Evergaol | 8416.3, 10819.95 | 1376, 5692 |
| Converted Tower | 8612.52, 10909.29 | 1576, 5578 |
| Golden Lineage Evergaol | 9919.3, 12719.86 | 2878, 3791 |

### Shadow Realm (m61)
4 calibration points (mean error: ~0.3 pixels):

| Location | Game (X, Z) | Pixel (x, y) |
|----------|-------------|--------------|
| Ellac River Downstream | 12074.65, 10523.87 | 1997, 4123 |
| Scorched Ruins | 11960.21, 10564.6 | 1882, 4083 |
| Fingerstone Hill | 13269.66, 12291.76 | 3189, 2358 |
| Cleansing Chamber Anteroom | 11070.19, 11137.88 | 995, 3509 |

To add or modify calibration points, edit `src/utils/calibration.ts`.

## Map Icons

The viewer displays location icons (graces, bosses, merchants, etc.) from `map_data_processed.json`.

### Icon Data

- **Source**: `public/map_data_processed.json` (processed from `map_data_export.json`)
- **Conversion**: Local coordinates → Global coordinates via Rust script
- **Images**: PNG files in `public/map_icons/` (e.g., `icon_1.png`, `icon_2.png`)
- **Filtering**: Icons are filtered by `mapId` field (m60 or m61)

### Regenerating Icon Data

To regenerate `map_data_processed.json` from raw data:

```bash
# From project root
cargo run --bin convert-map-icons
```

This script:
- Reads `viewer/public/map_data_export.json`
- Converts local coordinates to global using `WorldPositionTransformer`
- Filters out excluded icon IDs (currently 0 and 83)
- Maps AreaNo to display map (m60/m61)
- Outputs `viewer/public/map_data_processed.json`

## Route JSON Format

The viewer expects JSON files with this structure:

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
- `global_x`, `global_z`: Used for positioning on the map
- `global_map_id`: Determines which map to display (60 = Lands Between, 61 = Shadow Realm)
- `map_id_str`: Format is `m{area}_{gridX}_{gridZ}_{sub}`

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server (port 5173) |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build (port 4173) |
| `start_dev.bat` | Windows shortcut for dev server |
| `start_production.bat` | Build + preview in one click |

## License

AGPL-3.0 - See main project LICENSE file.
