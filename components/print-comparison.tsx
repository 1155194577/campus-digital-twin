import Image from "next/image";
import { ArrowUp } from "lucide-react";
import type { Campus, Feature, Layers, Point } from "@/lib/types";
import hkstpPrint from "@/public/data/hkstp-print.webp";
import cuhkPrint from "@/public/data/cuhk-print.webp";

const references = {
  hkstp: { bounds: [114.20745, 22.4228, 114.2151, 22.42955], width: 196.8, depth: 187.9, scale: "4,000", image: hkstpPrint },
  cuhk: { bounds: [114.1987, 22.41165, 114.21515, 22.42845], width: 178.2, depth: 196.9, scale: "9,500", image: cuhkPrint },
};
const pointsAttr = (points: Point[]) => points.map(point => point.join(",")).join(" ");
const fills = { building: "#70838b", park: "#c5d7b5", water: "#a1cbd5" };
const drawOrder = ["park", "water", "road", "building"] as const;

export default function PrintComparison({ campus, layers, selected }: {
  campus: Campus; layers: Layers; selected: Feature | null;
}) {
  const reference = references[campus.id as keyof typeof references];
  if (!reference) return null;
  const [west, south, east, north] = reference.bounds;
  const [lat, lon] = campus.center;
  const longitudeFactor = 111320 * Math.cos(lat * Math.PI / 180);
  const x = (west - lon) * longitudeFactor;
  const y = (lat - north) * 111320;
  const width = (east - west) * longitudeFactor;
  const height = (north - south) * 111320;
  const intersectsPrint = (points: Point[]) =>
    points.some(([px]) => px >= x) && points.some(([px]) => px <= x + width)
    && points.some(([, py]) => py >= y) && points.some(([, py]) => py <= y + height);

  return <section className="print-comparison" aria-labelledby="print-heading">
    <header className="print-header">
      <div><h2 id="print-heading">Compare with the tactile print</h2><p>{campus.name} · Same geographic extent in both panels</p></div>
      <span className="print-north"><ArrowUp size={14} aria-hidden="true"/>North up</span>
    </header>
    <div className="print-pair">
      <figure>
        <figcaption>Campus map</figcaption>
        <svg role="img" aria-label={`${campus.name} map cropped to the print extent`} viewBox={`${x} ${y} ${width} ${height}`}>
          <rect x={x} y={y} width={width} height={height} fill="#eff0e5"/>
          {drawOrder.map(kind => layers[kind] && <g key={kind}>
            {campus.features.filter(feature => feature.kind === kind && intersectsPrint(feature.points)).map(feature =>
              feature.kind === "road"
                ? <polyline key={feature.id} points={pointsAttr(feature.points)} fill="none" stroke={["footway", "path"].includes(feature.category) ? "#a1a393" : "#b0a98e"} strokeWidth={["footway", "path"].includes(feature.category) ? 2 : 5}/>
                : <polygon key={feature.id} points={pointsAttr(feature.points)} fill={fills[feature.kind]}/>
            )}
          </g>)}
          {layers.water && campus.coastline?.map(points =>
            <polyline key={pointsAttr(points)} points={pointsAttr(points)} fill="none" stroke="#458ea5" strokeWidth={4}/>
          )}
          {selected && layers.building && <polygon points={pointsAttr(selected.points)} fill="#286ace" stroke="#174b91" strokeWidth={3}/>}
        </svg>
      </figure>
      <figure>
        <figcaption>Tactile STL render</figcaption>
        <Image src={reference.image} alt={`North-up render of the ${campus.name} full-detail tactile STL`} unoptimized/>
      </figure>
    </div>
    <footer className="print-notes">
      <p><strong>Print:</strong> {reference.width.toFixed(1)} × {reference.depth.toFixed(1)} mm at 1:{reference.scale}. On-screen size is not physical scale.</p>
      <p>The STL shows raised print relief; the campus panel shows flat outlines. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></p>
      {selected && layers.building && <p>{selected.name || "Selected building"}{intersectsPrint(selected.points) ? " is highlighted in blue." : " is outside the print area."}</p>}
    </footer>
  </section>;
}
