import type { Feature, Point } from "./types";

type TransitPoint = Pick<Feature, "id" | "name" | "localName" | "lat" | "lon">;
type StationExit = TransitPoint & { kind: "exit"; exit: string; localName: string; source: typeof railwayEntranceAttribution };
export type TransitPlace = (TransitPoint & { kind: "station" }) | StationExit;

export type CampusPlace = Feature | TransitPlace;

export const cuhkCampusMap = "https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html";
export const universityStationMap = "https://www.mtr.com.hk/archive/en/services/maps/uni.pdf";
export const railwayEntranceSource = "https://portal.csdi.gov.hk/geoportal/?datasetId=landsd_rcd_1637223748322_25497";
const railwayEntranceAttribution = {
  attribution: "iB1000 Digital Topographic Map (RailwayEntrance), CSDI Portal, Lands Department, Government of the Hong Kong SAR. © Government of the Hong Kong SAR and the relevant organisations.",
  url: railwayEntranceSource,
  terms: "https://portal.csdi.gov.hk/csdi-webpage/doc/TNC",
};
export const universityStation: TransitPlace = {
  id: "node/5098496689",
  kind: "station",
  name: "University Station",
  localName: "大學站",
  lat: 22.4135688,
  lon: 114.2101033,
};

export const universityExits = ([
  ["A", "1810002251", 22.4137252, 114.2099297],
  ["B", "1810000968", 22.4133626, 114.2103080],
  ["C", "1810002271", 22.4140864, 114.2100451],
  ["D", "1810002250", 22.4150981, 114.2107300],
] as const).map(([exit, id, lat, lon]): StationExit => ({
  id: `landsd/${id}`,
  kind: "exit",
  exit,
  name: `University Station Exit ${exit}`,
  localName: `大學站 ${exit} 出口`,
  lat,
  lon,
  source: railwayEntranceAttribution,
}));

// Teaching abbreviations and grid references from the official CUHK Campus Map.
const cuhkAliases: Record<string, string[]> = {
  "relation/1806438/134409112": ["LSB", "H24"],
  "way/107139030": ["RRS", "H9"],
  "way/134410449": ["H3"],
  "way/134410450": ["SC", "H10"],
  "way/135156233": ["ELB", "C1"],
  "way/188010216": ["LSK", "H23a"],
  "way/201907981": ["YIA", "C39a"],
};

export function placeAliases(campusId: string, place: CampusPlace) {
  if (campusId !== "cuhk") return [];
  if (place.kind === "station") return ["MTR", "MTR University Station", "University MTR", "港鐵大學站", "UNI"];
  if (place.kind === "exit") return [
    `Exit ${place.exit}`,
    `Entrance ${place.exit}`,
    `MTR Exit ${place.exit}`,
    `MTR ${place.name}`,
    `${place.exit}出口`,
    `${place.exit} 出口`,
    place.localName.replaceAll(" ", ""),
  ];
  return cuhkAliases[place.id] ?? [];
}

function normalize(value: string) {
  return value.normalize("NFKD").toLowerCase().replace(/[\p{M}'‘’ʼ.]/gu, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export function searchPlaces(places: CampusPlace[], campusId: string, query: string) {
  const term = normalize(query);
  if (!term) return places;
  return places.flatMap(place => {
    const names = [place.name, place.localName ?? ""].map(normalize);
    const aliases = placeAliases(campusId, place).map(normalize);
    const exact = [...names, ...aliases].includes(term);
    return exact || names.join(" ").includes(term) ? [{ place, exact }] : [];
  }).sort((a, b) => Number(b.exact) - Number(a.exact)).map(({ place }) => place);
}

export function isTransitPlace(place: CampusPlace): place is TransitPlace {
  return place.kind === "station" || place.kind === "exit";
}

export function projectPlace(place: Pick<CampusPlace, "lat" | "lon">, [lat, lon]: Point): Point {
  return [(place.lon - lon) * 111320 * Math.cos(lat * Math.PI / 180), (lat - place.lat) * 111320];
}
