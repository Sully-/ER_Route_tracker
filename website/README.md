# Elden Ring Route Viewer - Technical Documentation

Technical documentation for building and developing the Route Viewer website.

Built with **React 18**, **TypeScript**, **Vite**, **Leaflet.js** (frontend) and **ASP.NET Core**, **PostgreSQL**, **SignalR** (backend).

## Built with AI

This viewer was built using **Cursor** + **Claude** (Anthropic).
The code was generated through conversational AI assistance ("vibe coding").

## Prerequisites

### Frontend
- Node.js 18+
- npm

### Backend
- .NET 10.0+
- PostgreSQL

## Quick Start (Development)

### Frontend

```bash
cd website/frontend
npm install
npm run dev
```

Then open http://localhost:5173/

Or simply double-click `start_dev.bat`

### Backend

```bash
cd website/backend
dotnet run
```

The API will be available at http://localhost:5000/

## Project Structure

```
website/
├── frontend/                         # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Map/MapContainer.tsx  # Main map component with Leaflet
│   │   │   ├── Toolbar/Toolbar.tsx   # Load/Clear/Focus buttons
│   │   │   ├── SidePanel/            # Collapsible side panel
│   │   │   ├── RouteInfo/            # Route statistics display
│   │   │   └── ColorPicker/          # Route color selection
│   │   ├── hooks/
│   │   │   ├── useRouteLoader.ts     # JSON file loading
│   │   │   ├── useRealtimeRoutes.ts  # SignalR real-time tracking
│   │   │   ├── useStaticRoutes.ts    # Static route management
│   │   │   └── useMapIcons.ts        # Map icons loading/filtering
│   │   ├── utils/
│   │   │   ├── coordinateTransform.ts
│   │   │   ├── calibration.ts        # Map calibration points
│   │   │   └── routeAnalysis.ts
│   │   └── types/
│   │       ├── route.ts
│   │       └── mapIcons.ts
│   ├── public/
│   │   ├── tiles/                    # Lands Between tiles (zoom 0-6)
│   │   ├── tiles_shadow/             # Shadow Realm tiles (zoom 0-5)
│   │   ├── tiles_underground/        # Underground tiles (zoom 0-6)
│   │   ├── map_icons/                # Icon PNG files
│   │   └── map_data_processed.json   # Processed icons data
│   ├── package.json
│   └── vite.config.ts
│
└── backend/                          # ASP.NET Core backend
    ├── Controllers/
    │   ├── KeysController.cs         # Key generation API
    │   └── RoutePointsController.cs  # Route points API
    ├── Hubs/
    │   └── RouteHub.cs               # SignalR hub for real-time
    ├── Services/
    │   ├── KeyService.cs             # Key management logic
    │   ├── RouteService.cs           # Route points logic
    │   └── KeyCleanupService.cs      # Background cleanup
    ├── Models/
    │   ├── KeyPair.cs
    │   ├── RoutePoint.cs
    │   └── DTOs.cs
    ├── Data/
    │   └── ApplicationDbContext.cs   # EF Core context
    ├── Program.cs
    ├── appsettings.json
    └── RouteTracker.csproj
```

## Backend API

### Overview

- **Framework**: ASP.NET Core with Entity Framework Core
- **Database**: PostgreSQL
- **Real-time**: SignalR for live route updates
- **Security**: Push/View key system with rate limiting

### Key System

The backend uses a push/view key pair system:
- **Push Key**: Used by the mod to send route points (private)
- **View Key**: Used by viewers to watch routes in real-time (shareable)

### API Endpoints

| Method | Endpoint | Description | Rate Limit |
|--------|----------|-------------|------------|
| POST | `/api/Keys/generate` | Generate a push/view key pair | 5/min |
| GET | `/api/Keys/{viewKey}/status` | Get key status and info | 60/min |
| POST | `/api/RoutePoints` | Submit route points (requires `X-Push-Key` header) | 60/min |
| GET | `/api/RoutePoints?viewKey={key}` | Get all route points for a view key | 60/min |

### SignalR Hub

**Hub URL**: `/hubs/route`

**Client Methods:**
- `JoinRoute(viewKey)` - Subscribe to route updates
- `LeaveRoute(viewKey)` - Unsubscribe from route updates

**Server Events:**
- `ReceiveRoutePoints(points[], viewKey)` - New points received in real-time
- `ReceiveRouteHistory(viewKey, points[])` - Historical points on connection
- `JoinedRoute(viewKey)` - Confirmation of subscription
- `LeftRoute(viewKey)` - Confirmation of unsubscription

### Usage Examples

Generate a key pair:
```bash
curl -X POST https://er-route-tracker.sulli.tech/api/Keys/generate
# Returns: { "pushKey": "xxx", "viewKey": "yyy" }
```

Submit route points:
```bash
curl -X POST https://er-route-tracker.sulli.tech/api/RoutePoints \
  -H "X-Push-Key: your-push-key" \
  -H "Content-Type: application/json" \
  -d '[{"x": 100, "y": 50, "z": 200, "globalX": 10500, ...}]'
```

## Database Setup

### Local Development

1. Install PostgreSQL
2. Create the database and user:
```sql
CREATE DATABASE route_tracker;
CREATE USER route_tracker_user WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE route_tracker TO route_tracker_user;
```

3. Update connection string in `appsettings.json`

### Production Setup

Use the standalone SQL scripts:

```bash
# On the server, copy the files:
# - scripts/website/backend/database/setup-database.sql
# - scripts/website/backend/database/setup-database.sh

chmod +x setup-database.sh
sudo -u postgres ./setup-database.sh
```

### Configuration

- Connection string: `appsettings.json` or `appsettings.Production.json`
- Database password: `ROUTE_TRACKER_DB_PASSWORD` environment variable
- OpenAPI docs: Available at `/scalar/v1` in development mode

### Documentation

- [docs/DATABASE_SETUP.md](../docs/DATABASE_SETUP.md) - Database configuration
- [docs/DAILY_DEPLOYMENT.md](../docs/DAILY_DEPLOYMENT.md) - Daily deployment
- [docs/UBUNTU_DEPLOYMENT_GUIDE.md](../docs/UBUNTU_DEPLOYMENT_GUIDE.md) - Initial Ubuntu setup

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

### Underground (m62)
Contains: Deeproot Depths, Ainsel River, Siofra River

Calibration points: Uses same coordinate system as Lands Between (m60) since Underground zones overlay m60 coordinates.

To add or modify calibration points, edit `src/utils/calibration.ts`.

## Map Tiles

### Regenerating Tiles

If you need to regenerate the map tiles:

1. Install Python with Pillow: `pip install Pillow`
2. Prepare source images:
   - **Lands Between**: `Lands_Between_Name.png` (9645x9119 px)
   - **Shadow Realm**: (DLC map source image)
   - **Underground**: `Underground_Name.png` (9645x9119 px)
3. Run the tile generation script:
```bash
python scripts/website/frontend/generate_tiles.py <source_image_path> <output_directory>
```

Examples:
```bash
python scripts/website/frontend/generate_tiles.py original_maps/Lands_Between_Name.png website/frontend/public/tiles
python scripts/website/frontend/generate_tiles.py original_maps/Underground_Name.png website/frontend/public/tiles_underground
```

## Map Icons

The viewer displays location icons (graces, bosses, merchants, etc.) from `map_data_processed.json`.

### Icon Data

- **Source**: `public/map_data_processed.json` (processed from `map_data_export.json`)
- **Conversion**: Local coordinates → Global coordinates via Rust script
- **Images**: PNG files in `public/map_icons/` (e.g., `icon_1.png`, `icon_2.png`)
- **Filtering**: Icons are filtered by `mapId` field (m60, m61) or `areaNo` for m62 (Underground)

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
- Maps AreaNo to display map (m60/m61/m62)
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
- `global_map_id`: Determines which map to display (60 = Lands Between, 61 = Shadow Realm, 62 = Underground)
- `map_id_str`: Format is `m{area}_{gridX}_{gridZ}_{sub}`

## Build & Deployment

### Frontend Production Build

```bash
cd website/frontend
npm run build
```

The `dist/` folder contains static files ready to deploy.

To preview the production build:
```bash
npm run preview
```

Or double-click `start_production.bat`

### Backend Production Build

```bash
cd website/backend
dotnet publish -c Release
```

### Packaging for Deployment

```powershell
# On Windows, create the packages
.\scripts\website\deploy\package.ps1 -BackendUrl "http://server:5000"
```

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
