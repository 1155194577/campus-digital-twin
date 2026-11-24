import { Plane, Vector3 } from "three";

export function campusFramePlanes(width: number, depth: number) {
  return [
    new Plane(new Vector3(1, 0, 0), width / 2),
    new Plane(new Vector3(-1, 0, 0), width / 2),
    new Plane(new Vector3(0, 0, 1), depth / 2),
    new Plane(new Vector3(0, 0, -1), depth / 2),
  ];
}
