export type Point = [number, number];
export type Feature = {
  id: string; kind: "building" | "road" | "park" | "water";
  name: string; localName?: string; points: Point[]; height: number;
  heightEstimated: boolean; levels?: string; category: string; area?: number;
  lat: number; lon: number;
};
export type Campus = { id: string; name: string; subtitle: string; center: Point; width: number; depth: number; fetchedAt: string; coastline?: Point[][]; features: Feature[] };
export type Layers = { building: boolean; road: boolean; park: boolean; water: boolean };
export type UpAxis = "y" | "z";
export type ViewMode = "perspective" | "top";
export type ViewerAction = { type: "zoomIn" | "zoomOut" | "reset" | "focus"; at: number };
