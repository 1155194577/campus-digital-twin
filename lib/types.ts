export type Point = [number, number];
export type Feature = {
  id: string; kind: "building" | "road" | "park" | "water";
  name: string; localName?: string; points: Point[]; height: number;
  heightEstimated: boolean; levels?: string; category: string; area?: number;
  lat: number; lon: number;
  walkNodes?: string[];
  crossing?: boolean;
  tactilePaving?: string;
};
export type Campus = { id: string; name: string; subtitle: string; center: Point; width: number; depth: number; fetchedAt: string; coastline?: Point[][]; features: Feature[]; walkDetails?: Record<string, { crossing?: boolean; tactilePaving?: string }> };
export type Layers = { building: boolean; road: boolean; park: boolean; water: boolean };
export type UpAxis = "y" | "z";
export type ViewMode = "perspective" | "top";
export type ViewerAction = { type: "zoomIn" | "zoomOut" | "reset" | "focus"; at: number };

export type ModelInfo = { parts: number; triangles: number; size: [number, number, number] };
export const partColors = ["#83a9d4", "#e3a65f", "#7fb38a", "#c48bc0"];
