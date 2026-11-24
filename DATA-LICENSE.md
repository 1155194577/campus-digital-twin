# Geographic data license

The derived geographic snapshots in `public/data/hkstp.json` and `public/data/cuhk.json` contain data from OpenStreetMap and are made available under the Open Database License (ODbL) 1.0.

**© OpenStreetMap contributors**

- Source and contributor attribution: https://www.openstreetmap.org/copyright
- License: https://opendatacommons.org/licenses/odbl/1-0/
- Original map API: https://api.openstreetmap.org/api/0.6/map

The included conversion script records each snapshot retrieval time in `fetchedAt` and preserves OSM feature identifiers. Inferred building heights and local projected coordinates are derived transformations, not surveyed measurements.

The tactile reference images in `public/data/*-print.webp` also derive from OpenStreetMap, via Touch Mapper. The attribution above applies to both comparison panels.

## CUHK directory supplements

- [University Station](https://www.openstreetmap.org/node/5098496689) is an OpenStreetMap point and uses the same ODbL attribution.
- Exit points are from the [iB1000 Digital Topographic Map, RailwayEntrance layer](https://portal.csdi.gov.hk/geoportal/?datasetId=landsd_rcd_1637223748322_25497), transformed from Hong Kong 1980 Grid to WGS 84. Source: CSDI Portal, Lands Department, Government of the Hong Kong SAR. © Government of the Hong Kong SAR and the relevant organisations. These points are separate from the OSM snapshots and available under [CSDI terms](https://portal.csdi.gov.hk/csdi-webpage/doc/TNC).
- Building codes refer to the [official CUHK campus map](https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html). Exit letters can be checked against the [MTR station map](https://www.mtr.com.hk/archive/en/services/maps/uni.pdf).
