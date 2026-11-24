import type { Feature, Point } from "./types";

export const cuhkRegions = {
  "chung-chi": { name: "Chung Chi College", color: "#cb8941" },
  "new-asia": { name: "New Asia College", color: "#c79d24" },
  united: { name: "United College", color: "#6c9e3a" },
  shaw: { name: "Shaw College", color: "#ba577f" },
  morningside: { name: "Morningside College", color: "#38a5bb" },
  "sh-ho": { name: "S.H. Ho College", color: "#896bc6" },
  "cw-chu": { name: "CW Chu College", color: "#bc5555" },
  "wu-yee-sun": { name: "Wu Yee Sun College", color: "#4984c3" },
  "lee-woo-sing": { name: "Lee Woo Sing College", color: "#419a7b" },
  "non-college": { name: "Non-college", color: "#a5b1ba" },
};

export type CuhkRegion = keyof typeof cuhkRegions;
type CollegeRegion = Exclude<CuhkRegion, "non-college">;

// Named footprints follow the official CUHK campus map's building groups.
// The hand-drawn polygons (longitude, latitude) approximate the areas around those buildings.
const collegeAreas: Record<CollegeRegion, { names: string[]; polygons: Point[][] }> = {
  "chung-chi": {
    names: [
      "Esther Lee Building", "C.C. Administration Building", "Li Wai Chun Building", "Hui Yeung Shing Building",
      "Wong Foo Yuan Building", "Chen Kou Bun Building", "Sino Building", "Chung Chi College Chapel",
      "Theology Building", "Lingnan Stadium", "Ho Tim Building", "Orchid Lodge", "Chung Chi College Staff Club",
      "Elisabeth Luce Moore Library", "Chung Chi Tang", "Fong Yun Wah Hall", "Fong Shu Chuen Building",
      "C.C. Staff Quarters A", "C.C. Staff Quarters B", "C.C. Staff Quarters C", "C.C. Staff Quarters S",
      "Hua Lien Tang", "Ming Hua Tang", "Ying Lin Tang", "Madam S.H.Ho Hall", "Wen Chih Tang", "Wen Lin Tang",
      "Lee Shu Pui Hall", "Li Koon Chun Hall", "Postgraduate Hall No.3", "Pentecostal Mission Hall Complex (High Block)",
      "Pentecostal Mission Hall Complex (Low Block)", "Pommerenke Student Centre", "Lady Ho Tung Hall",
      "President Chi-tung Yung Memorial Building", "Yasumoto International Academic Park", "Wu Ho Man Yuen Building",
      "Lee Shau Kee Architecture Building", "Leung Fung Yee Building", "Kunkle Student Centre",
    ],
    polygons: [
      [[114.207,22.4149],[114.20805,22.41427],[114.20886,22.41367],[114.20905,22.41462],[114.2109,22.41461],
        [114.21126,22.41557],[114.21206,22.41623],[114.21187,22.41766],[114.21077,22.41766],[114.21033,22.4178],
        [114.20911,22.41782],[114.20853,22.41803],[114.20814,22.41792],[114.20818,22.41748],
        [114.2062,22.41753],[114.20614,22.41663],[114.20673,22.41582]],
    ],
  },
  "new-asia": {
    names: [
      "Cheng Ming Building", "Humanities Building", "Ch'ien Mu Library", "Staff Student Centre - Leung Hung Kee Building",
      "Chih Hsing Hall", "Friendship Lodge", "Xuesi Hall", "Grace Tien Hall", "Daisy Li Hall", "Mei Yun Tang",
    ],
    polygons: [[[114.20772,22.42107],[114.20833,22.42012],[114.20867,22.42012],[114.20876,22.42065],
      [114.20985,22.42078],[114.2109,22.42102],[114.21094,22.42182],[114.20905,22.42213],[114.20779,22.42185]]],
  },
  united: {
    names: [
      "Tsang Shiu Tim Building", "Wu Chung Multimedia Library", "T.C. Cheng Building", "Cheung Chuk Shan Amenities Building",
      "Adam Schall Residence", "Bethlehem Hall", "U.C. Staff Residence", "Hang Seng Hall", "Chan Chun Ha Hostel",
      "Choi Kai Yau Residence",
    ],
    polygons: [[[114.20375,22.42038],[114.20462,22.42031],[114.20493,22.42073],[114.20633,22.42062],
      [114.20638,22.42163],[114.20565,22.42216],[114.20567,22.42348],[114.20479,22.42353],[114.20467,22.42172],
      [114.2041,22.42169],[114.20377,22.42088]]],
  },
  shaw: {
    names: ["Kuo Mou Hall", "Wen Lan Tang", "Ya Qun Lodge", "Shaw College Lecture Theatre", "Yat Sen Hall",
      "Student Hostel 2 (Low Block)", "Huen Wing Ming Building", "Mona Shaw Hall"],
    polygons: [[[114.20082,22.42236],[114.20145,22.42224],[114.20221,22.42258],[114.20218,22.42373],
      [114.20081,22.42385]]],
  },
  morningside: {
    names: ["Morningside College", "Maurice R. Greenberg Building"],
    polygons: [[[114.2102,22.41876],[114.21063,22.41879],[114.21064,22.41927],[114.21029,22.41926]]],
  },
  "sh-ho": {
    names: ["Ho Tim Hall", "Lee Quo Wei Hall", "Chan Chun Ha Hall"],
    polygons: [[[114.20961,22.4181],[114.21038,22.41805],[114.21043,22.41862],[114.20997,22.41869],
      [114.20961,22.41839]]],
  },
  "cw-chu": {
    names: ["C. W. Chu College"],
    polygons: [[[114.20618,22.42499],[114.20662,22.42499],[114.2069,22.42536],[114.20636,22.42558],
      [114.20619,22.42533]]],
  },
  "wu-yee-sun": {
    names: ["Wu Yee Sun College", "House of Sunny Living"],
    polygons: [[[114.2022,22.42208],[114.20269,22.422],[114.20311,22.42221],[114.203,22.42248],
      [114.20243,22.42248]]],
  },
  "lee-woo-sing": {
    names: ["North Block, Lee Woo Sing College", "Dorothy and Ti-Hua Koo Building"],
    polygons: [[[114.20393,22.4221],[114.20451,22.42209],[114.20464,22.42268],[114.20417,22.42275]]],
  },
};

const areas = Object.entries(collegeAreas) as [CollegeRegion, (typeof collegeAreas)[CollegeRegion]][];
const namedRegions = new Map(areas.flatMap(([region, { names }]) => names.map(name => [name, region] as const)));

function contains(polygon: Point[], lon: number, lat: number) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [x1, y1] = polygon[i], [x2, y2] = polygon[j];
    if ((y1 > lat) !== (y2 > lat) && lon < x1 + (x2 - x1) * (lat - y1) / (y2 - y1)) inside = !inside;
  }
  return inside;
}

export function cuhkBuildingRegion(building: Pick<Feature, "name" | "lat" | "lon">): CuhkRegion {
  return namedRegions.get(building.name)
    ?? areas.find(([, { polygons }]) => polygons.some(polygon => contains(polygon, building.lon, building.lat)))?.[0]
    ?? "non-college";
}
