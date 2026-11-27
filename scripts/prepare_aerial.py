"""Resample the LandsD True Digital Orthophoto into Campus Atlas ground textures.

Usage: python scripts/prepare_aerial.py /path/to/tdop7nec20250009.tif /path/to/tdop7sea20250009.tif
Download sheets T7-NE-C and T7-SE-A (GeoTIFF, HK1980 Grid) from the CSDI Portal TDOP dataset.
Requires numpy, pyproj, rasterio and Pillow. See DATA-LICENSE.md for the source and terms.
"""
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image
from pyproj import Transformer
import rasterio
from rasterio.windows import from_bounds

from prepare_terrain import DATA, METRES_PER_DEGREE, campus_frame

METRES_PER_PIXEL = 0.5
MAX_SIDE = 4096


def read_mosaic(paths, west, south, east, north):
    """Read the HK1980 rectangle from the sheets into one RGB array at source resolution."""
    with rasterio.open(paths[0]) as first:
        res = first.res[0]
    left, top = math.floor(west / res) * res, math.ceil(north / res) * res
    cols, rows = math.ceil((east - left) / res), math.ceil((top - south) / res)
    mosaic = np.zeros((3, rows, cols), np.uint8)
    covered = np.zeros((rows, cols), bool)
    for path in paths:
        with rasterio.open(path) as sheet:
            b = sheet.bounds
            l, r = max(left, b.left), min(left + cols * res, b.right)
            bt, t = max(top - rows * res, b.bottom), min(top, b.top)
            if l >= r or bt >= t:
                continue
            data = sheet.read([1, 2, 3], window=from_bounds(l, bt, r, t, sheet.transform).round_offsets().round_lengths())
            row, col = round((top - t) / res), round((l - left) / res)
            mosaic[:, row:row + data.shape[1], col:col + data.shape[2]] = data
            covered[row:row + data.shape[1], col:col + data.shape[2]] = True
    if not covered.all():
        raise ValueError("TDOP sheets do not cover the whole campus")
    return mosaic, left, top, res


def campus_aerial(paths, campus_id):
    width, depth, lat, lon = campus_frame(campus_id)
    scale = min(1 / METRES_PER_PIXEL, MAX_SIDE / max(width, depth))
    cols, rows = round(width * scale), round(depth * scale)
    x, z = np.meshgrid((np.arange(cols) + .5) / cols * width - width / 2,
                       (np.arange(rows) + .5) / rows * depth - depth / 2)
    east, north = Transformer.from_crs(4326, 2326, always_xy=True).transform(
        lon + x / (METRES_PER_DEGREE * math.cos(math.radians(lat))),
        lat - z / METRES_PER_DEGREE,
    )
    pad = 4
    mosaic, left, top, res = read_mosaic(paths, east.min() - pad, north.min() - pad, east.max() + pad, north.max() + pad)
    # Box-filter the 0.25 m source down to the output pixel size before sampling.
    factor = max(1, round(1 / (scale * res)))
    if factor > 1:
        h, w = mosaic.shape[1] // factor * factor, mosaic.shape[2] // factor * factor
        mosaic = mosaic[:, :h, :w].reshape(3, h // factor, factor, w // factor, factor).mean((2, 4))
        res *= factor
    col = (east - left) / res - .5
    row = (top - north) / res - .5
    j, i = np.floor(col).astype(int), np.floor(row).astype(int)
    fx, fy = col - j, row - i
    j, i = np.clip(j, 0, mosaic.shape[2] - 2), np.clip(i, 0, mosaic.shape[1] - 2)
    image = sum(mosaic[:, i + dy, j + dx] * w for dy, dx, w in
                ((0, 0, (1-fy)*(1-fx)), (0, 1, (1-fy)*fx), (1, 0, fy*(1-fx)), (1, 1, fy*fx)))
    out = DATA / f"{campus_id}-aerial.webp"
    Image.fromarray(np.rint(image).clip(0, 255).astype(np.uint8).transpose(1, 2, 0)).save(out, quality=72, method=6)
    print(f"{campus_id}: {cols} × {rows} px, {width / cols:.2f} m/px, {out.stat().st_size} bytes")


if __name__ == "__main__":
    for ident in ("hkstp", "cuhk", "combined"):
        campus_aerial(sys.argv[1:], ident)
