#!/usr/bin/env python3
"""
Tile generator for Elden Ring map viewer.
Generates Leaflet-compatible tiles from a source image.

Usage:
    python generate_tiles.py <source_image> <output_dir> [--tile-size 256]

Example:
    python generate_tiles.py ../original_maps/Lands_Between_Name.png public/tiles
"""

import os
import sys
import json
import math
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)


def next_power_of_2(n: int) -> int:
    """Return the smallest power of 2 >= n."""
    return 1 << (n - 1).bit_length()


def generate_tiles(source_path: str, output_dir: str, tile_size: int = 256):
    """Generate map tiles from source image."""
    
    print(f"Loading source image: {source_path}")
    source = Image.open(source_path)
    original_width, original_height = source.size
    print(f"Original dimensions: {original_width} x {original_height}")
    
    # Calculate padded size (next power of 2 that fits both dimensions)
    max_dim = max(original_width, original_height)
    padded_size = next_power_of_2(max_dim)
    print(f"Padded size: {padded_size}")
    
    # Calculate max zoom level
    max_zoom = int(math.log2(padded_size / tile_size))
    print(f"Max zoom: {max_zoom} (tile size: {tile_size})")
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Create padded image (center the original on a padded canvas)
    print(f"Creating padded image...")
    padded = Image.new('RGB', (padded_size, padded_size), (20, 20, 30))  # Dark background
    # Paste at top-left (0, 0) - not centered, to match coordinate system
    padded.paste(source, (0, 0))
    
    # Generate tiles for each zoom level
    total_tiles = 0
    for zoom in range(max_zoom + 1):
        zoom_dir = output_path / str(zoom)
        zoom_dir.mkdir(exist_ok=True)
        
        # Calculate size at this zoom level
        size_at_zoom = tile_size * (2 ** zoom)
        
        # Resize padded image to this zoom level
        if size_at_zoom != padded_size:
            resized = padded.resize((size_at_zoom, size_at_zoom), Image.Resampling.LANCZOS)
        else:
            resized = padded
        
        # Calculate number of tiles
        num_tiles = 2 ** zoom
        
        print(f"  Zoom {zoom}: {num_tiles}x{num_tiles} tiles ({size_at_zoom}px)")
        
        # Generate tiles
        for x in range(num_tiles):
            x_dir = zoom_dir / str(x)
            x_dir.mkdir(exist_ok=True)
            
            for y in range(num_tiles):
                # Extract tile
                left = x * tile_size
                upper = y * tile_size
                right = left + tile_size
                lower = upper + tile_size
                
                tile = resized.crop((left, upper, right, lower))
                
                # Save tile
                tile_path = x_dir / f"{y}.jpg"
                tile.save(tile_path, "JPEG", quality=85)
                total_tiles += 1
    
    print(f"Generated {total_tiles} tiles")
    
    # Save metadata
    metadata = {
        "original_width": original_width,
        "original_height": original_height,
        "padded_size": padded_size,
        "max_zoom": max_zoom,
        "tile_size": tile_size
    }
    
    metadata_path = output_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Saved metadata to {metadata_path}")
    print(f"\nDone! Update calibration.ts with:")
    print(f"  width: {original_width}")
    print(f"  height: {original_height}")
    print(f"  paddedSize: {padded_size}")
    print(f"  maxZoom: {max_zoom}")
    
    return metadata


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    
    source = sys.argv[1]
    output = sys.argv[2]
    tile_size = int(sys.argv[3]) if len(sys.argv) > 3 else 256
    
    generate_tiles(source, output, tile_size)

