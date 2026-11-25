import type { Campus, Point } from "./types";

export const combinedCampusId = "combined";
export const combinedSourceIds = ["hkstp", "cuhk"] as const;
// Union of the HKSTP and CUHK snapshot bounds (west, south, east, north).
export const combinedBounds = [114.198, 22.410, 114.216, 22.431] as const;

const metresPerDegree = 111320;
const round = (value: number) => Math.round(value * 100) / 100;

export function combineCampuses(sources: readonly Campus[]): Campus {
  const [west, south, east, north] = combinedBounds;
  const lat = (south + north) / 2, lon = (west + east) / 2;
  const factor = metresPerDegree * Math.cos(lat * Math.PI / 180);
  const seen = new Set<string>();
  const features: Campus["features"] = [];
  const coastline: Point[][] = [];
  const walkDetails: NonNullable<Campus["walkDetails"]> = {};
  for (const source of sources) {
    const [sourceLat, sourceLon] = source.center;
    const scale = factor / (metresPerDegree * Math.cos(sourceLat * Math.PI / 180));
    const dx = (sourceLon - lon) * factor, dy = (lat - sourceLat) * metresPerDegree;
    const move = ([x, y]: Point): Point => [round(x * scale + dx), round(y + dy)];
    for (const feature of source.features) {
      if (seen.has(feature.id)) continue;
      seen.add(feature.id);
      features.push({ ...feature, points: feature.points.map(move) });
    }
    for (const line of source.coastline ?? []) coastline.push(line.map(move));
    Object.assign(walkDetails, source.walkDetails);
  }
  return {
    id: combinedCampusId,
    name: "Hong Kong Science Park and CUHK",
    subtitle: "Pak Shek Kok to Ma Liu Shui · One joined view",
    center: [lat, lon],
    width: Math.round((east - west) * factor),
    depth: Math.round((north - south) * metresPerDegree),
    fetchedAt: sources.map(source => source.fetchedAt).sort()[0],
    coastline,
    features,
    walkDetails,
  };
}
