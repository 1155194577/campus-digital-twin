import { Plane, Vector3 } from "three";

export function campusFramePlanes(width: number, depth: number) {
  return [
    new Plane(new Vector3(1, 0, 0), width / 2),
    new Plane(new Vector3(-1, 0, 0), width / 2),
    new Plane(new Vector3(0, 0, 1), depth / 2),
    new Plane(new Vector3(0, 0, -1), depth / 2),
  ];
}

export function projectCampusFramePlane(edge: Plane, groundTop: number, cameraPosition: Vector3, target: Plane) {
  const height = cameraPosition.y - groundTop;
  const offset = edge.distanceToPoint(cameraPosition);
  return target.setComponents(
    height * edge.normal.x, -offset, height * edge.normal.z,
    height * edge.constant + offset * groundTop,
  ).normalize();
}
