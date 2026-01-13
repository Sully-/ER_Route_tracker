#!/usr/bin/env python3
"""
Tile Generator for Leaflet Maps
Generates map tiles from a source PNG image for use with Leaflet.js

Usage:
    python generate_tiles.py <input_image> <output_dir> [--tile-size 256]

Example:
    python generate_tiles.py original_maps/Underground_Name.png website/frontend/public/tiles_underground
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("Error: Pillow is required. Install with: pip install Pillow")
    sys.exit(1)


def calculate_padded_size(width: int, height: int, tile_size: int = 256) -> int:
    """Calculate the padded size (power of 2 * tile_size) that fits the image."""
    max_dim = max(width, height)
    # Find the smallest power of 2 such that (2^n * tile_size) >= max_dim
    n = 0
    while (2 ** n) * tile_size < max_dim:
        n += 1
    return (2 ** n) * tile_size


def calculate_max_zoom(padded_size: int, tile_size: int = 256) -> int:
    """Calculate the maximum zoom level."""
    return int(math.log2(padded_size / tile_size))


def create_padded_image(img: Image.Image, padded_size: int) -> Image.Image:
    """Create a new image with transparent padding."""
    # Create new RGBA image with transparent background
    padded = Image.new('RGBA', (padded_size, padded_size), (0, 0, 0, 0))
    # Paste original image at top-left
    padded.paste(img, (0, 0))
    return padded


def generate_tiles(
    input_path: str,
    output_dir: str,
    tile_size: int = 256
) -> dict:
    """
    Generate Leaflet tiles from source image.
    
    Returns metadata dict with image dimensions and tile info.
    """
    print(f"Loading image: {input_path}")
    
    # Load image in RGBA mode to preserve/add transparency
    img = Image.open(input_path).convert('RGBA')
    original_width, original_height = img.size
    print(f"Original size: {original_width} x {original_height}")
    
    # Calculate padding and zoom
    padded_size = calculate_padded_size(original_width, original_height, tile_size)
    max_zoom = calculate_max_zoom(padded_size, tile_size)
    
    print(f"Padded size: {padded_size} x {padded_size}")
    print(f"Max zoom: {max_zoom}")
    
    # Create padded image with transparent background
    print("Creating padded image with transparent background...")
    padded_img = create_padded_image(img, padded_size)
    
    # Create output directory
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    # Generate tiles for each zoom level
    total_tiles = 0
    for zoom in range(max_zoom + 1):
        zoom_dir = output_path / str(zoom)
        zoom_dir.mkdir(exist_ok=True)
        
        # Calculate size at this zoom level
        zoom_size = tile_size * (2 ** zoom)
        
        # Resize image for this zoom level
        if zoom == max_zoom:
            # At max zoom, use the padded image directly
            zoom_img = padded_img
        else:
            # Resize to smaller size for lower zoom levels
            zoom_img = padded_img.resize((zoom_size, zoom_size), Image.Resampling.LANCZOS)
        
        # Calculate number of tiles
        num_tiles = 2 ** zoom
        
        print(f"Zoom {zoom}: {num_tiles}x{num_tiles} tiles ({zoom_size}x{zoom_size} px)")
        
        # Generate tiles
        for x in range(num_tiles):
            x_dir = zoom_dir / str(x)
            x_dir.mkdir(exist_ok=True)
            
            for y in range(num_tiles):
                # Extract tile region
                left = x * tile_size
                upper = y * tile_size
                right = left + tile_size
                lower = upper + tile_size
                
                tile = zoom_img.crop((left, upper, right, lower))
                
                # Save tile as PNG with transparency
                tile_path = x_dir / f"{y}.png"
                tile.save(tile_path, 'PNG', optimize=True)
                total_tiles += 1
        
        # Clean up zoom image if not max zoom
        if zoom != max_zoom:
            del zoom_img
    
    print(f"Generated {total_tiles} tiles")
    
    # Create metadata
    metadata = {
        "original_width": original_width,
        "original_height": original_height,
        "padded_size": padded_size,
        "max_zoom": max_zoom,
        "tile_size": tile_size,
        "total_tiles": total_tiles
    }
    
    # Save metadata
    metadata_path = output_path / "metadata.json"
    with open(metadata_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"Metadata saved to: {metadata_path}")
    print("\n=== Configuration for calibration.ts ===")
    print(f"width: {original_width},")
    print(f"height: {original_height},")
    print(f"paddedSize: {padded_size}, // 2^{max_zoom} * {tile_size}")
    print(f"maxZoom: {max_zoom},")
    print(f"tileSize: {tile_size},")
    
    return metadata


def main():
    parser = argparse.ArgumentParser(
        description='Generate Leaflet tiles from a source image'
    )
    parser.add_argument(
        'input',
        help='Path to source PNG image'
    )
    parser.add_argument(
        'output',
        help='Output directory for tiles'
    )
    parser.add_argument(
        '--tile-size',
        type=int,
        default=256,
        help='Tile size in pixels (default: 256)'
    )
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input):
        print(f"Error: Input file not found: {args.input}")
        sys.exit(1)
    
    metadata = generate_tiles(args.input, args.output, args.tile_size)
    
    print("\nDone!")
    return metadata


if __name__ == '__main__':
    main()
