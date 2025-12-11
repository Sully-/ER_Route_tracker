# Elden Ring Route Viewer

> ⚠️ **Alpha Version** - Under active development

Interactive map viewer for visualizing recorded routes from the Route Tracker mod.

Built with **React 18**, **TypeScript**, **Vite**, and **Leaflet.js**.

## Built with AI

This viewer was built using **Cursor** + **Claude** (Anthropic).
The code was generated through conversational AI assistance ("vibe coding").

## Current Features

- Full Elden Ring world map with tile-based rendering
- Load route JSON files recorded by the mod
- Auto-focus on loaded routes
- Start (green) and end (red) markers


## Roadmap

- [ ] 📌 Event icons on map (item pickup, death, grace activation...)
- [ ] 🏰 Location icons (graces, bosses, merchants...)
- [ ] 🗺️ Underground maps & DLC maps support
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
│   │   ├── Map/MapContainer.tsx      # Leaflet map with tiles
│   │   ├── Toolbar/Toolbar.tsx       # Load/Clear/Focus buttons
│   │   └── RouteInfo/RouteInfo.tsx   # Route statistics panel
│   ├── hooks/
│   │   └── useRouteLoader.ts         # JSON file loading hook
│   ├── utils/
│   │   ├── coordinateTransform.ts    # Game → Pixel conversion
│   │   └── calibration.ts            # Calibration points
│   ├── types/
│   │   └── route.ts                  # TypeScript interfaces
│   ├── App.tsx
│   └── main.tsx
├── public/
│   └── tiles/                        # Map tiles (zoom 0-6)
├── dist/                             # Production build output
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## Regenerating Tiles

If you need to regenerate the map tiles, you'll need:
1. The source image `fextralife_map.jpg` (15175x14280 px)
2. Python with Pillow: `pip install Pillow`

Then run:
```bash
python generate_tiles.py
```

## Calibration

The viewer uses 4 calibration points to convert game coordinates to pixel coordinates:

| Game (X, Z) | Pixel (x, y) |
|-------------|--------------|
| 10740.49, 9159.12 | 5847, 11447 |
| 10704.96, 9296.39 | 5801, 11240 |
| 10927.56, 9523.99 | 6135, 10886 |
| 12396.08, 10301.70 | 8434, 9693 |

To add or modify calibration points, edit `src/utils/calibration.ts`.

## Route JSON Format

The viewer expects JSON files with this structure:

```json
{
  "name": "Route Name",
  "recorded_at": "2025-01-15 14:30:00",
  "point_count": 150,
  "duration_secs": 120.5,
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
      "timestamp_ms": 0
    }
  ]
}
```

The viewer uses `global_x` and `global_z` for positioning on the map.

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
