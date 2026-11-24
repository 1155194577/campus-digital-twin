"""Render a Z-up Touch Mapper binary STL as a north-up reference image.

Usage: python render-tactile-reference.py input.stl output.webp
Requires NumPy and Pillow. The output is for comparison, not for printing.
"""
import struct
import sys

import numpy as np
from PIL import Image, ImageDraw


def render(stl, output):
    with open(stl, "rb") as source:
        source.read(80)
        count = struct.unpack("<I", source.read(4))[0]
        records = np.fromfile(source, dtype=[("normal", "<f4", 3),
                                              ("vertices", "<f4", (3, 3)),
                                              ("color", "<u2")], count=count)
    if len(records) != count or not count:
        raise ValueError("Expected a non-empty binary STL")
    vertices = records["vertices"]
    low = vertices.min(axis=(0, 1))
    high = vertices.max(axis=(0, 1))
    width, height = (high - low)[:2]
    scale = 1050 / max(width, height)
    size = tuple(np.ceil(np.array([width, height]) * scale).astype(int))
    image = Image.new("RGB", size, "#b7a998")
    draw = ImageDraw.Draw(image)
    points = vertices[:, :, :2].copy()
    points[:, :, 0] -= low[0]
    points[:, :, 1] = high[1] - points[:, :, 1]
    points *= scale
    heights = vertices[:, :, 2].mean(axis=1)
    normals = np.cross(vertices[:, 1] - vertices[:, 0], vertices[:, 2] - vertices[:, 0])
    lengths = np.linalg.norm(normals, axis=1)
    up = normals[:, 2] > 0
    lighting = normals[up] @ np.array([-0.35, 0.42, 0.78]) / lengths[up]
    relief = ((heights[up] - low[2]) / (high[2] - low[2])).clip(0, 1)
    shade = (208 - 112 * relief + 42 * (lighting - .78)).clip(40, 236)
    colors = np.stack([shade + 9, shade - 1, shade - 14], axis=1).astype(int)
    coordinates = points[up].reshape(-1, 6).tolist()
    for i in np.argsort(heights[up], kind="stable"):
        draw.polygon(coordinates[i], fill=tuple(colors[i]))
    image.save(output, "WEBP", lossless=True)
    print(f"{width:.2f} × {height:.2f} mm")


if __name__ == "__main__":
    render(*sys.argv[1:])
