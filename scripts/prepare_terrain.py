"""Crop the DATA.GOV.HK LandsD 5 m DTM into the Campus Atlas coordinate frame.

Usage: python scripts/prepare_terrain.py /path/to/Whole_HK_DTM_5m.zip
Requires numpy and pyproj. See DATA-LICENSE.md for the source and terms.
"""
import json
import math
from pathlib import Path
import sys
from zipfile import ZipFile

import numpy as np
from pyproj import Transformer


DATA = Path(__file__).resolve().parents[1] / "public" / "data"
CELL_SIZE = 5
METRES_PER_DEGREE = 111320


def campus_grid(raster_path, campus_id):
    campus = json.loads((DATA / f"{campus_id}.json").read_text())
    width, depth = campus["width"], campus["depth"]
    lat, lon = campus["center"]
    x, z = np.meshgrid(
        np.linspace(-width / 2, width / 2, math.ceil(width / CELL_SIZE) + 1),
        np.linspace(-depth / 2, depth / 2, math.ceil(depth / CELL_SIZE) + 1),
    )
    east, north = Transformer.from_crs(4326, 2326, always_xy=True).transform(
        lon + x / (METRES_PER_DEGREE * math.cos(math.radians(lat))),
        lat - z / METRES_PER_DEGREE,
    )
    with ZipFile(raster_path) as archive, archive.open("Whole_HK_DTM_5m.asc") as raster:
        header = {key: float(value) for key, value in (raster.readline().decode().lower().split() for _ in range(6))}
        cell = header["cellsize"]
        col = (east - header["xllcorner"]) / cell - .5
        row = header["nrows"] - .5 - (north - header["yllcorner"]) / cell
        i, j = row.astype(int), col.astype(int)
        row_start, row_stop = i.min(), i.max() + 2
        col_start, col_stop = j.min(), j.max() + 2
        if row_start < 0 or col_start < 0 or row_stop > header["nrows"] or col_stop > header["ncols"]:
            raise ValueError(f"{campus_id} extends outside the LandsD grid")
        for _ in range(row_start):
            raster.readline()
        crop = np.array([
            np.fromstring(raster.readline().decode(), sep=" ")[col_start:col_stop]
            for _ in range(row_start, row_stop)
        ])
    fy, fx = row - i, col - j
    i, j = i - row_start, j - col_start
    weighted_sum, weight = np.zeros_like(row), np.zeros_like(row)
    for dy, dx, w in ((0, 0, (1-fy)*(1-fx)), (0, 1, (1-fy)*fx), (1, 0, fy*(1-fx)), (1, 1, fy*fx)):
        values = crop[i + dy, j + dx]
        valid = values != header["nodata_value"]
        weighted_sum += np.where(valid, w * values, 0)
        weight += np.where(valid, w, 0)
    if np.any(weight == 0):
        raise ValueError(f"{campus_id} has {np.count_nonzero(weight == 0)} NoData cells")
    elevations = weighted_sum / weight
    encoded = np.rint(elevations * 10).astype("<i2")
    encoded.tofile(DATA / f"{campus_id}-terrain.bin")
    rows, cols = encoded.shape
    print(f"{campus_id}: {cols} × {rows}, {encoded.nbytes} bytes, "
          f"{elevations.min():.1f}–{elevations.max():.1f} m, 0 NoData cells")


if __name__ == "__main__":
    for ident in ("hkstp", "cuhk"):
        campus_grid(sys.argv[1], ident)
