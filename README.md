# Campus Atlas

A Next.js and Three.js geographic digital twin for Hong Kong Science Park (HKSTP) and The Chinese University of Hong Kong (CUHK).

## Run

Requires Node.js 20.9+ and npm. On the Devin VM, first run `. /home/ubuntu/.nvm/nvm.sh`.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Production: `npm run build && npm start`.

```sh
npm run typecheck
npm run lint
npm run build
```

No API keys, database, backend service or pre-commit hooks are required.

## Features

- Real OpenStreetMap building footprints, roads, green spaces and water.
- HKSTP and CUHK campus switching, bilingual building-name search and inspection.
- A shareable walking-plan estimate using selected features or map points. The mapped path can include steps or crossings, and is not accessibility-verified.
- Three.js orbit, pan, zoom, focus, reset, top-down view and layer visibility.
- Side-by-side comparison with the full-detail HKSTP and CUHK tactile STLs, north up at the same geographic extent.
- Local STL and self-contained GLB viewing, with a 50 MB file limit.
- GeoJSON export and responsive building directory.

## Data provenance and limitations

The compact snapshots in `public/data` were retrieved from the OpenStreetMap map API. They are a geographic snapshot, **not live sensor data**. Attribution: **© OpenStreetMap contributors**, available under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright). These derived geographic databases remain subject to ODbL; see [DATA-LICENSE.md](DATA-LICENSE.md).

| Snapshot | WGS84 bounds (west, south, east, north) |
| --- | --- |
| HKSTP | 114.205, 22.421, 114.216, 22.431 |
| CUHK | 114.198, 22.410, 114.21515, 22.42845 |

The bounds include surrounding buildings. The snapshot has no terrain or slope model. Building heights use mapped height values, or levels × 3.5 m, or a 14 m default; inferred values are labeled. Complex stitched multipolygon outer rings and polygon holes are not reconstructed. The walking planner uses OSM ways that are plausibly walkable and shares a graph junction only where the ways share an OSM node. It does not verify endpoint connections, crossings, current access, or accessibility. This is not a survey-grade, structural or navigation system.

Routing unit tests (Node.js 22.18+): `node --test scripts/*.test.mjs`.

To refresh snapshots, download the XML extracts, then run:

```sh
curl -fL 'https://api.openstreetmap.org/api/0.6/map?bbox=114.205,22.421,114.216,22.431' -o hkstp.osm
curl -fL 'https://api.openstreetmap.org/api/0.6/map?bbox=114.198,22.410,114.21515,22.42845' -o cuhk.osm
python3 scripts/prepare_campuses.py hkstp.osm cuhk.osm
```

Local 3D files are processed in the browser and never uploaded. Models are normalized to fit the viewer; display scale is not a physical measurement. GLBs must embed their resources; external-resource loading is blocked. The existing [map-generation](https://github.com/1155194577/py-touch-mapper-hk) and [3D-print](https://github.com/1155194577/3d-print) projects are linked for context, not connected as services.

### Tactile print references

**Compare print** uses images rendered from the [full-detail, slicer-checked Touch Mapper STLs](https://app.devin.ai/sessions/1a5ad4ae3862445fadd972f9d076d408), not the separate named-roads-only exports. The campus panel is clipped to the original generation bounds; outlines and paths can differ because it uses a separate OSM snapshot and does not simulate print relief.

| Reference | Print scale | Generation bounds (west, south, east, north) |
| --- | --- | --- |
| HKSTP | 1:4,000 | 114.20745, 22.4228, 114.2151, 22.42955 |
| CUHK | 1:9,500 | 114.1987, 22.41165, 114.21515, 22.42845 |

To regenerate an image, run `python scripts/render_tactile_reference.py map.stl public/data/<campus>-print.webp` with NumPy and Pillow installed. The site serves the reference images, not the printable files.

## Deploy on Vercel

Import this repository, choose the **Next.js** framework preset, and use the default install/build settings. No environment variables are needed. The initial production deployment may be created from the implementation branch while its PR remains open; merging the PR can then make `main` the ongoing production source.
