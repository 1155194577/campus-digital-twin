import { MathUtils, Spherical, Vector3 } from "three";

export type CameraPose = { position: Vector3; target: Vector3 };

export const easeInOutCubic = (t: number) => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;

const from = new Spherical(), to = new Spherical(), offset = new Vector3();

// Orbits around the moving target so heading and tilt turn smoothly; long hops lift the camera briefly.
export function interpolatePose(start: CameraPose, end: CameraPose, t: number, out: CameraPose) {
  const e = easeInOutCubic(MathUtils.clamp(t, 0, 1));
  from.setFromVector3(offset.subVectors(start.position, start.target));
  to.setFromVector3(offset.subVectors(end.position, end.target));
  const turn = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
  const travel = start.target.distanceTo(end.target);
  const lift = Math.min(travel / Math.max(from.radius, to.radius, 1e-6), 1.5) * .35;
  const radius = from.radius * (to.radius / from.radius) ** e * (1 + lift * Math.sin(Math.PI * e));
  out.target.lerpVectors(start.target, end.target, e);
  out.position.setFromSpherical(to.set(radius, MathUtils.lerp(from.phi, to.phi, e), from.theta + turn * e)).add(out.target);
  return out;
}

export function fitDistance(radius: number, fovDegrees: number, aspect: number, margin = 1.4) {
  const vertical = MathUtils.degToRad(fovDegrees / 2);
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return radius * margin / Math.sin(Math.min(vertical, horizontal));
}

export function viewDirection(offset: Vector3, minPolar: number, maxPolar: number) {
  const spherical = new Spherical().setFromVector3(offset);
  spherical.phi = MathUtils.clamp(spherical.phi, minPolar, maxPolar);
  spherical.radius = 1;
  return new Vector3().setFromSpherical(spherical);
}
