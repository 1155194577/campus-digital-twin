# Geographic data license

The derived geographic snapshots in `public/data/hkstp.json` and `public/data/cuhk.json` contain data from OpenStreetMap and are made available under the Open Database License (ODbL) 1.0.

**© OpenStreetMap contributors**

- Source and contributor attribution: https://www.openstreetmap.org/copyright
- License: https://opendatacommons.org/licenses/odbl/1-0/
- Original map API: https://api.openstreetmap.org/api/0.6/map

The included conversion script records each snapshot retrieval time in `fetchedAt` and preserves OSM feature identifiers. Inferred building heights and local projected coordinates are derived transformations, not surveyed measurements.

The tactile reference images in `public/data/*-print.webp` also derive from OpenStreetMap, via Touch Mapper. The attribution above applies to both comparison panels and to the Campus Atlas renders in `public/showcase/`.

## Terrain elevation

The campus terrain grids (`public/data/*-terrain.bin`) are resampled from the [5 m Digital Terrain Model](https://data.gov.hk/en-data/dataset/hk-landsd-openmap-5m-grid-dtm), separate from the OpenStreetMap snapshots. Source: Lands Department, Government of the Hong Kong Special Administrative Region, via DATA.GOV.HK. © Government of the Hong Kong Special Administrative Region and the relevant organisations. The source and grids are subject to the [DATA.GOV.HK Terms of Use](https://data.gov.hk/en/terms-and-conditions).

## Aerial ground

The aerial ground images (`public/data/*-aerial.webp`) are cropped and resampled to about 0.5 m per pixel from the 2025 [True Digital Orthophoto](https://portal.csdi.gov.hk/geoportal/?datasetId=landsd_rcd_1701762716904_4826) sheets T7-NE-C and T7-SE-A (0.25 m, Hong Kong 1980 Grid) with `scripts/prepare_aerial.py`. Source: CSDI Portal, Lands Department, Government of the Hong Kong SAR. © Government of the Hong Kong SAR and the relevant organisations. The source and images are subject to the [CSDI terms](https://portal.csdi.gov.hk/csdi-webpage/doc/TNC).

## CUHK directory supplements

- [University Station](https://www.openstreetmap.org/node/5098496689) is an OpenStreetMap point and uses the same ODbL attribution.
- Exit points are from the [iB1000 Digital Topographic Map, RailwayEntrance layer](https://portal.csdi.gov.hk/geoportal/?datasetId=landsd_rcd_1637223748322_25497), transformed from Hong Kong 1980 Grid to WGS 84. Source: CSDI Portal, Lands Department, Government of the Hong Kong SAR. © Government of the Hong Kong SAR and the relevant organisations. These points are separate from the OSM snapshots and available under [CSDI terms](https://portal.csdi.gov.hk/csdi-webpage/doc/TNC).
- Building codes refer to the [official CUHK campus map](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html). Exit letters can be checked against the [MTR station map](https://www.mtr.com.hk/archive/en/services/maps/uni.pdf).
