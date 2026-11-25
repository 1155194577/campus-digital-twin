"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TrainFront } from "lucide-react";
import { isTransitPlace, projectPlace, universityStation } from "@/lib/campus-places";
import type { CampusPlace, TransitPlace } from "@/lib/campus-places";
import { partColors } from "@/lib/types";
import type { Campus, Feature, Layers, ModelInfo, Point, UpAxis, ViewMode, ViewerAction } from "@/lib/types";
import { campusFramePlanes, projectCampusFramePlane } from "@/lib/campus-frame";
import { pickCampusSurface, terrainCameraHeight, terrainHeight, terrainSegment, terrainTopLevels, terrainTopStep, type CampusTerrain, type TerrainRoof } from "@/lib/campus-terrain";
import { createDoubleTapDetector, createMapClickGesture } from "@/lib/map-click-gesture";
import { fitDistance, interpolatePose, viewDirection, type CameraPose } from "@/lib/camera-flight";
import { cuhkBuildingRegion, cuhkRegions, type CuhkRegion } from "@/lib/cuhk-regions";

type Flight = { from: CameraPose; to: CameraPose; start: number; duration: number };

type SceneState = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
  controls: OrbitControls; groups: Record<keyof Layers, THREE.Group>; buildings: THREE.Mesh[];
  model: THREE.Group; span: number; flight?: Flight; maxDistance: number; initial: THREE.Vector3; invalidate: () => void;
  route: THREE.Group;
  setActive: (active: boolean) => void;
  view: ViewMode; perspectivePose?: CameraPose; topFrame?: CameraPose; campusBounds: THREE.Box3; modelBounds?: THREE.Box3;
  topSelectionTarget?: THREE.Vector3;
  topTerrainLevels?: (x: number, z: number) => ReturnType<typeof terrainTopLevels>;
  updateTransitMarker?: () => void;
  heightAt: (x: number, z: number) => number;
};

function getCameraPose(s: SceneState): CameraPose {
  return { position: s.camera.position.clone(), target: s.controls.target.clone() };
}

function isAtTopFrame(s: SceneState) {
  const frame = s.topFrame;
  return frame && frame.position.distanceToSquared(s.camera.position) < 1e-6 && frame.target.distanceToSquared(s.controls.target) < 1e-6;
}

const flightDuration = 650;
const minFramePolar = THREE.MathUtils.degToRad(30), maxFramePolar = THREE.MathUtils.degToRad(65);
const topOffset = (distance: number) => new THREE.Vector3(0, distance, .01);

function setMaxDistance(s: SceneState, distance: number) {
  s.maxDistance = distance;
  if (!s.flight) s.controls.maxDistance = distance;
}

function stopFlight(s: SceneState) {
  if (!s.flight) return;
  s.flight = undefined;
  s.controls.maxDistance = s.maxDistance;
}

function flyTo(s: SceneState, to: CameraPose, duration = flightDuration) {
  if (duration <= 0 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stopFlight(s);
    s.controls.target.copy(to.target); s.camera.position.copy(to.position);
    s.controls.update(); s.invalidate();
    return;
  }
  // Interpolated poses may leave the zoom range between two valid end poses.
  s.controls.maxDistance = Infinity;
  s.flight = { from: getCameraPose(s), to: { position: to.position.clone(), target: to.target.clone() }, start: performance.now(), duration };
  s.invalidate();
}

function frame(s: SceneState, center: THREE.Vector3, radius: number, zoom: "fit" | "closer") {
  const fit = THREE.MathUtils.clamp(fitDistance(radius, s.camera.fov, s.camera.aspect), s.controls.minDistance, s.maxDistance);
  const base = s.flight?.to ?? getCameraPose(s);
  const offset = base.position.clone().sub(base.target);
  const distance = zoom === "fit" || offset.length() > fit * 2.5 ? fit : offset.length();
  const position = s.view === "top" ? topOffset(distance)
    : distance === fit ? viewDirection(offset, minFramePolar, maxFramePolar).multiplyScalar(distance) : offset;
  const target = center.clone();
  if (s.view === "top") target.y = s.topTerrainLevels?.(target.x, target.z).target ?? target.y;
  flyTo(s, { target, position: position.add(target) });
}

function fitTopView(s: SceneState, animate = true) {
  const bounds = s.modelBounds ?? s.campusBounds;
  const size = bounds.getSize(new THREE.Vector3());
  const halfFov = THREE.MathUtils.degToRad(s.camera.getEffectiveFOV() / 2);
  const distance = size.y / 2 + Math.max(size.x / s.camera.aspect, size.z) * 1.15 / (2 * Math.tan(halfFov));
  setMaxDistance(s, Math.max(s.span * 3.2, distance * 1.3));
  s.camera.far = Math.max(s.span * 14, s.maxDistance + size.y);
  s.camera.updateProjectionMatrix();
  const target = bounds.getCenter(new THREE.Vector3());
  target.y = s.topTerrainLevels?.(target.x, target.z).target ?? target.y;
  s.topFrame = { target, position: target.clone().add(topOffset(Math.max(s.controls.minDistance, distance))) };
  flyTo(s, s.topFrame, animate ? flightDuration : 0);
}

function transitPosition(place: TransitPlace, campus: Campus, heightAt: SceneState["heightAt"]) {
  const [x, z] = projectPlace(place, campus.center);
  return new THREE.Vector3(x, heightAt(x, z) + 2, z);
}

function terrainGeometry(grid: CampusTerrain) {
  const geometry = new THREE.PlaneGeometry(grid.width, grid.depth, grid.columns - 1, grid.rows - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position");
  grid.heights.forEach((height, i) => positions.setY(i, height));
  geometry.computeVertexNormals();
  return geometry;
}

function terrainSides(geometry: THREE.PlaneGeometry, grid: CampusTerrain, bottom: number) {
  const { columns, rows } = grid;
  const positions = geometry.getAttribute("position");
  const sides: number[] = [];
  const add = (a: number, b: number) => {
    const ax = positions.getX(a), az = positions.getZ(a), bx = positions.getX(b), bz = positions.getZ(b);
    const ay = positions.getY(a), by = positions.getY(b);
    sides.push(ax, ay, az, bx, by, bz, ax, bottom, az, ax, bottom, az, bx, by, bz, bx, bottom, bz);
  };
  const south = (rows - 1) * columns;
  for (let x = 0; x < columns - 1; x++) {
    add(x, x + 1);
    add(south + x + 1, south + x);
  }
  for (let z = 0; z < rows - 1; z++) {
    const west = z * columns, east = west + columns - 1;
    add(west + columns, west);
    add(east, east + columns);
  }
  const result = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(sides, 3));
  result.computeVertexNormals();
  return result;
}

function terrainSurface(features: Feature[], grid: CampusTerrain, geometry: THREE.PlaneGeometry, kind: "park" | "water") {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(grid.width); canvas.height = Math.ceil(grid.depth);
  const context = canvas.getContext("2d")!;
  context.fillStyle = kind === "water" ? "#9dcbd1" : "#a6c7ae";
  for (const { points } of features) {
    context.beginPath();
    points.forEach(([x, z], i) => {
      const a = (x / grid.width + .5) * canvas.width, b = (z / grid.depth + .5) * canvas.height;
      if (i === 0) context.moveTo(a, b);
      else context.lineTo(a, b);
    });
    context.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    map, alphaTest: .5, roughness: .85,
    polygonOffset: true, polygonOffsetFactor: kind === "water" ? -2 : -1, polygonOffsetUnits: -1,
  }));
}
function placeFrame(s: SceneState, place: CampusPlace, campus: Campus) {
  if (isTransitPlace(place)) return { center: transitPosition(place, campus, s.heightAt), radius: 45 };
  const mesh = s.buildings.find(m => m.userData.feature.id === place.id);
  if (!mesh) return null;
  const box = new THREE.Box3().setFromObject(mesh);
  return { center: box.getCenter(new THREE.Vector3()), radius: Math.max(25, box.getSize(new THREE.Vector3()).length() / 2) };
}
function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line || child instanceof THREE.Sprite) {
      if (!(child instanceof THREE.Sprite)) child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m: THREE.Material) => {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      });
    }
  });
}

function endpointMarker(point: Point, label: string, color: string, size: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d")!;
  context.beginPath();
  context.arc(32, 32, 28, 0, 2 * Math.PI);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "white";
  context.stroke();
  context.fillStyle = "white";
  context.font = "bold 32px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(label, 32, 33);
  const marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, depthWrite: false, toneMapped: false }));
  marker.position.set(point[0], height + 4, point[1]);
  marker.scale.setScalar(size);
  marker.renderOrder = 2;
  return marker;
}

// STL files are Z-up by convention (slicers, 3d-print, py-touch-mapper); glTF is Y-up.
function fitModel(s: SceneState, upAxis: UpAxis): ModelInfo | null {
  const pivot = s.model.children[0];
  if (!pivot) return null;
  pivot.position.set(0, 0, 0); pivot.scale.setScalar(1);
  pivot.rotation.set(upAxis === "z" ? -Math.PI / 2 : 0, 0, 0);
  pivot.updateMatrixWorld(true);
  pivot.traverse(child => { if (child instanceof THREE.SkinnedMesh) child.skeleton.update(); });
  let box = new THREE.Box3().setFromObject(pivot, true);
  const size = box.getSize(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxSize) || maxSize <= 0) return null;
  pivot.scale.setScalar(s.span * .55 / maxSize);
  box = new THREE.Box3().setFromObject(pivot);
  const center = box.getCenter(new THREE.Vector3());
  const offset = new THREE.Vector3(-center.x, -box.min.y, -center.z);
  pivot.position.add(offset);
  s.modelBounds = box.translate(offset);
  stopFlight(s);
  s.controls.target.set(0, (box.max.y - box.min.y) / 2, 0); s.camera.position.copy(s.initial);
  if (s.view === "top") {
    s.perspectivePose = getCameraPose(s);
    fitTopView(s, false);
  } else { s.controls.update(); s.invalidate(); }
  let triangles = 0;
  pivot.traverse(child => { if (child instanceof THREE.Mesh) { const g = child.geometry as THREE.BufferGeometry; triangles += (g.index?.count ?? g.getAttribute("position")?.count ?? 0) / 3 * (child instanceof THREE.InstancedMesh ? child.count : 1); } });
  return { parts: pivot.children.length, triangles: Math.round(triangles), size: [size.x, size.z, size.y].map(v => v < maxSize * 1e-9 ? 0 : v) as ModelInfo["size"] };
}

export default function CampusScene({ campus, terrain, layers, selected, scheduledBuildings, colorRegions, highlightedRegion, showTransit, onSelect, onMapPoint, routeStart, routeDestination, routePath, view, action, modelFiles, upAxis, active, onError, onModelError, onReady, onModelInfo, onHeadingChange }: {
  campus: Campus; layers: Layers; selected: CampusPlace | null; showTransit: boolean; onSelect: (f: CampusPlace | null) => void;
  terrain?: CampusTerrain;
  scheduledBuildings?: ReadonlySet<string>;
  colorRegions: boolean; highlightedRegion: CuhkRegion | null;
  onMapPoint?: (point: Point) => void; routeStart?: Point; routeDestination?: Point; routePath?: Point[];
  view: ViewMode; action: ViewerAction | null; modelFiles: File[]; upAxis: UpAxis; active: boolean;
  onError: (error: string) => void; onModelError: () => void; onReady: () => void; onModelInfo: (info: ModelInfo | null) => void; onHeadingChange: (degrees: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const transitMarker = useRef<HTMLButtonElement>(null);
  const state = useRef<SceneState | null>(null);
  const lastAction = useRef<ViewerAction | null>(null);
  const callbacks = useRef({ onSelect, onMapPoint, onError, onModelError, onReady, onModelInfo, onHeadingChange });
  const upAxisRef = useRef(upAxis);
  const showTransitMarker = showTransit && campus.id === "cuhk" && !modelFiles.length;
  const marker = showTransitMarker ? (selected?.kind === "exit" ? selected : universityStation) : null;
  useEffect(() => { callbacks.current = { onSelect, onMapPoint, onError, onModelError, onReady, onModelInfo, onHeadingChange }; }, [onSelect, onMapPoint, onError, onModelError, onReady, onModelInfo, onHeadingChange]);

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, stencil: Boolean(terrain) }); }
    catch { callbacks.current.onError("3D rendering is unavailable. Enable WebGL or try another browser; the building directory is still available."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor("#e9f0f0");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);
    renderer.domElement.tabIndex = 0;
    renderer.domElement.setAttribute("role", "group");
    renderer.domElement.setAttribute("aria-label", "Interactive 3D view");
    renderer.domElement.setAttribute("aria-describedby", "scene-keyboard-help");
    const scene = new THREE.Scene();
    const span = Math.max(campus.width, campus.depth);
    const heightAt = terrain ? (x: number, z: number) => terrainHeight(terrain, x, z) : () => 0;
    const camera = new THREE.PerspectiveCamera(38, 1, 1, span * 14);
    const initial = new THREE.Vector3(span * .58, span * .9 + heightAt(0, 0), span * .82);
    camera.position.copy(initial);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.y = heightAt(0, 0);
    controls.listenToKeyEvents(renderer.domElement);
    controls.keyRotateSpeed = 12;
    const projectedTarget = new THREE.Vector3();
    const projectedNorth = new THREE.Vector3();
    const updateNorthHeading = () => {
      projectedTarget.copy(controls.target).project(camera);
      projectedNorth.set(controls.target.x, controls.target.y, controls.target.z - 1).project(camera);
      const dx = (projectedNorth.x - projectedTarget.x) * camera.aspect;
      const dy = projectedNorth.y - projectedTarget.y;
      const length = Math.hypot(dx, dy);
      const heading = Number.isFinite(length) && length > 1e-6 ? Math.atan2(dx, dy) : controls.getAzimuthalAngle();
      callbacks.current.onHeadingChange(THREE.MathUtils.radToDeg(heading));
    };
    controls.enableDamping = true; controls.dampingFactor = .08;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 40; controls.maxDistance = span * 3.2;
    controls.zoomToCursor = true;
    // OrbitControls measures pinch centres in page coordinates but the canvas in viewport coordinates.
    type ZoomInternals = { _handleTouchMoveDolly(event: PointerEvent): void; _updateZoomParameters(x: number, y: number): void };
    const zoomInternals = controls as unknown as ZoomInternals;
    const pinchDolly = zoomInternals._handleTouchMoveDolly;
    const updateZoom = zoomInternals._updateZoomParameters;
    zoomInternals._handleTouchMoveDolly = function (this: ZoomInternals, event) {
      this._updateZoomParameters = (x, y) => updateZoom.call(this, x - window.scrollX, y - window.scrollY);
      try { pinchDolly.call(this, event); } finally { this._updateZoomParameters = updateZoom; }
    };
    scene.add(new THREE.HemisphereLight(0xffffff, 0x849c9a, 2.2));
    const sun = new THREE.DirectionalLight(0xfff6e8, 3.2);
    sun.position.set(-600,1000,300); scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb7dbec, 1); fill.position.set(500,400,-400); scene.add(fill);
    const groups = { building: new THREE.Group(), road: new THREE.Group(), park: new THREE.Group(), water: new THREE.Group() };
    Object.values(groups).forEach(group => scene.add(group));
    const framePlanes = campusFramePlanes(campus.width, campus.depth);
    const projectedPlanes = framePlanes.map(() => new THREE.Plane());
    const clippingPlanes = [...framePlanes];
    const groundTop = -1;
    const groundThickness = 8;
    const relief = terrain && terrainGeometry(terrain);
    const ground = new THREE.Mesh(relief || new THREE.BoxGeometry(campus.width, groundThickness, campus.depth), new THREE.MeshStandardMaterial({ color: "#dce8dc", roughness: 1 }));
    if (terrain) {
      ground.renderOrder = -1;
      ground.material.stencilRef = 1;
      ground.material.stencilZPass = THREE.ReplaceStencilOp;
    } else ground.position.y = groundTop - groundThickness / 2;
    scene.add(ground);
    const terrainClippedMaterials: THREE.Material[] = [];
    const clipToTerrain = (material: THREE.Material) => {
      if (!terrain) return;
      material.stencilFunc = THREE.EqualStencilFunc;
      material.stencilRef = 1;
      material.stencilWriteMask = 0;
      terrainClippedMaterials.push(material);
    };
    const campusBounds = new THREE.Box3().setFromObject(ground);
    if (terrain && relief) {
      const skirt = terrainSides(relief, terrain, campusBounds.min.y - groundThickness);
      scene.add(new THREE.Mesh(skirt, new THREE.MeshStandardMaterial({ color: "#bfd0c5", roughness: 1 })));
    } else {
      const groundEdge = new THREE.LineSegments(new THREE.EdgesGeometry(ground.geometry), new THREE.LineBasicMaterial({ color: "#bed0c7", transparent: true, opacity: .6 }));
      groundEdge.position.copy(ground.position); scene.add(groundEdge);
    }
    const buildings: THREE.Mesh[] = [];
    const terrainRoofs: TerrainRoof[] = [];
    const roads = new Map<string, THREE.BufferGeometry[]>();
    const outlines: THREE.BufferGeometry[] = [];
    const surfaces = { park: [] as THREE.BufferGeometry[], water: [] as THREE.BufferGeometry[] };
    const terrainSurfaces = { park: [] as Feature[], water: [] as Feature[] };
    for (const feature of campus.features) {
      const points = feature.points;
      if (points.length < 2) continue;
      for (const [x, z] of points) {
        campusBounds.min.x = Math.min(campusBounds.min.x, x);
        campusBounds.max.x = Math.max(campusBounds.max.x, x);
        campusBounds.min.z = Math.min(campusBounds.min.z, z);
        campusBounds.max.z = Math.max(campusBounds.max.z, z);
      }
      if (feature.kind === "road") {
        const color = feature.category === "footway" || feature.category === "path" ? "#fefcf4" : "#bdc8c7";
        const positions: number[] = [];
        for (let i = 1; i < points.length; i++) {
          const edge = terrain ? terrainSegment(terrain, points[i - 1], points[i]) : [points[i - 1], points[i]];
          for (let j = 1; j < edge.length; j++) {
            const [x, z] = edge[j - 1], [endX, endZ] = edge[j];
            positions.push(x, heightAt(x, z) + .9, z, endX, heightAt(endX, endZ) + .9, endZ);
          }
        }
        const segments = roads.get(color) ?? [];
        segments.push(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)));
        roads.set(color, segments);
        continue;
      }
      if (terrain && feature.kind !== "building") {
        terrainSurfaces[feature.kind].push(feature);
        continue;
      }
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], -p[1])));
      const height = feature.kind === "building" ? feature.height : .4;
      let base = 1, foundation = 0;
      if (terrain) {
        let low = Infinity, high = -Infinity;
        for (let i = 1; i < points.length; i++) {
          for (const point of terrainSegment(terrain, points[i - 1], points[i])) {
            const y = heightAt(...point);
            low = Math.min(low, y); high = Math.max(high, y);
          }
        }
        base = low - 1;
        foundation = high - base;
      }
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height + foundation, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      if (feature.kind !== "building") {
        surfaces[feature.kind].push(geometry.translate(0, feature.kind === "water" ? -.3 : .15, 0));
        continue;
      }
      const color = feature.name ? "#d3dce0" : "#e1e6e4";
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .02, clippingPlanes }));
      clipToTerrain(mesh.material);
      mesh.position.y = base;
      const roof = height + foundation + base;
      campusBounds.max.y = Math.max(campusBounds.max.y, roof);
      if (terrain) {
        geometry.computeBoundingBox();
        if (geometry.boundingBox) {
          const { min, max } = geometry.boundingBox;
          terrainRoofs.push({ minX: min.x, maxX: max.x, minZ: min.z, maxZ: max.z, height: roof });
        }
      }
      mesh.userData = { feature, baseColor: color, region: campus.id === "cuhk" ? cuhkBuildingRegion(feature) : null };
      groups[feature.kind].add(mesh);
      buildings.push(mesh);
      outlines.push(new THREE.EdgesGeometry(geometry, 30).translate(0, mesh.position.y, 0));
    }
    for (const [color, segments] of roads) {
      groups.road.add(new THREE.LineSegments(mergeGeometries(segments), new THREE.LineBasicMaterial({ color, clippingPlanes })));
      segments.forEach(geometry => geometry.dispose());
    }
    if (outlines.length) {
      const material = new THREE.LineBasicMaterial({ color: "#819a9e", transparent: true, opacity: .35, clippingPlanes });
      clipToTerrain(material);
      groups.building.add(new THREE.LineSegments(mergeGeometries(outlines), material));
      outlines.forEach(geometry => geometry.dispose());
    }
    for (const kind of ["park", "water"] as const) {
      if (terrain && relief && terrainSurfaces[kind].length) {
        groups[kind].add(terrainSurface(terrainSurfaces[kind], terrain, relief, kind));
      }
      const geometries = surfaces[kind];
      if (!geometries.length) continue;
      const color = kind === "water" ? "#9dcbd1" : "#a6c7ae";
      groups[kind].add(new THREE.Mesh(mergeGeometries(geometries), new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .02, clippingPlanes })));
      geometries.forEach(geometry => geometry.dispose());
    }
    const model = new THREE.Group();
    const route = new THREE.Group();
    scene.add(model, route);
    let frame: number | undefined;
    let visible = true;
    let ready = false;
    let dirty = false;
    let terrainOutlineClipped = false;
    let framesToSettle = 0;
    const dampingFrames = Math.ceil(Math.log(.001) / Math.log(1 - controls.dampingFactor));
    const schedule = () => { if (visible) frame ??= requestAnimationFrame(render); };
    const invalidate = () => { dirty = true; schedule(); };
    const setActive = (active: boolean) => {
      visible = active;
      if (visible) invalidate();
      else if (frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }
    };
    const topTerrainLevelsAt = terrain && ((x: number, z: number) => terrainTopLevels(terrain, terrainRoofs, x, z, controls.minDistance));
    const sceneState: SceneState = { scene, camera, renderer, controls, groups, buildings, model, route, span, initial, invalidate, setActive, view: "perspective", campusBounds, maxDistance: controls.maxDistance, heightAt, topTerrainLevels: topTerrainLevelsAt };
    const flightPose: CameraPose = { position: new THREE.Vector3(), target: new THREE.Vector3() };
    function render() {
      const flight = sceneState.flight;
      if (flight) {
        const t = (performance.now() - flight.start) / flight.duration;
        const pose = t >= 1 ? flight.to : interpolatePose(flight.from, flight.to, t, flightPose);
        controls.target.copy(pose.target); camera.position.copy(pose.position);
        if (t >= 1) stopFlight(sceneState);
        dirty = true;
      }
      const moved = controls.update();
      const { x, y, z } = camera.position;
      let heightAdjusted = false;
      if (sceneState.view === "top" && topTerrainLevelsAt) {
        const levels = topTerrainLevelsAt(controls.target.x, controls.target.z);
        const delta = terrainTopStep(levels, controls.target.y, y);
        if (Math.abs(delta) > 1e-6) {
          controls.target.y += delta;
          camera.position.y += delta;
          heightAdjusted = true;
        }
      } else if (terrain) {
        const floor = terrainCameraHeight(terrain, x, y, z);
        if (y < floor) {
          camera.position.y = floor;
          camera.lookAt(controls.target);
          heightAdjusted = true;
        }
      }
      if (dirty || moved || heightAdjusted) {
        if (sceneState.view === "top" && !terrain) {
          framePlanes.forEach((plane, i) => projectCampusFramePlane(plane, groundTop, camera.position, projectedPlanes[i]));
          if (clippingPlanes.length === framePlanes.length) clippingPlanes.push(...projectedPlanes);
        } else {
          clippingPlanes.length = framePlanes.length;
        }
        const clipTerrainOutline = Boolean(terrain && sceneState.view === "top");
        if (clipTerrainOutline !== terrainOutlineClipped) {
          ground.material.stencilWrite = clipTerrainOutline;
          terrainClippedMaterials.forEach(material => { material.stencilWrite = clipTerrainOutline; });
          terrainOutlineClipped = clipTerrainOutline;
        }
        renderer.render(scene,camera);
        updateNorthHeading();
        sceneState.updateTransitMarker?.();
        if (!ready) { ready = true; callbacks.current.onReady(); }
        dirty = false;
      }
      frame = undefined;
      if (framesToSettle > 0) framesToSettle--;
      if (moved || heightAdjusted || sceneState.flight || framesToSettle > 0) schedule();
    }
    state.current = sceneState;
    controls.addEventListener("change", invalidate);
    const interrupt = () => stopFlight(sceneState);
    controls.addEventListener("start", interrupt);
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width,height);
      const aspectChanged = camera.aspect !== width / height;
      camera.aspect = width / height;
      if (sceneState.view === "top" && aspectChanged && isAtTopFrame(sceneState)) fitTopView(sceneState, false);
      else { camera.updateProjectionMatrix(); invalidate(); }
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const raycaster = new THREE.Raycaster();
    const gesture = createMapClickGesture();
    const doubleTap = createDoubleTapDetector();
    let tapPoint: THREE.Vector3 | null = null;
    const zoomPoint = (pointer: THREE.Vector2) => {
      raycaster.setFromCamera(pointer, camera);
      const hit = model.children.length ? raycaster.intersectObject(model, true)[0]
        : pickCampusSurface(raycaster, groups.building.visible ? buildings : [], clippingPlanes, terrain ? ground : undefined, terrainOutlineClipped);
      return hit?.point ?? raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
    };
    const zoomAt = (hit: THREE.Vector3) => {
      const base = sceneState.flight?.to ?? getCameraPose(sceneState);
      const offset = base.position.clone().sub(base.target).multiplyScalar(.5).clampLength(controls.minDistance, sceneState.maxDistance);
      flyTo(sceneState, { target: hit, position: hit.clone().add(offset) }, 400);
    };
    const move = (event: PointerEvent) => {
      gesture.move(event);
      if (!event.buttons && event.pointerType !== "touch") return;
      framesToSettle = dampingFrames;
      schedule();
    };
    const up = (event: PointerEvent) => {
      if (!gesture.up(event)) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
      if (!callbacks.current.onMapPoint) {
        // Resolve the zoom point on the first tap; a selection flight may move the camera before the second.
        if (doubleTap.tap(event)) { const point = tapPoint ?? zoomPoint(pointer); if (point) zoomAt(point); tapPoint = null; return; }
        tapPoint = zoomPoint(pointer);
      }
      if (model.children.length) return;
      raycaster.setFromCamera(pointer,camera);
      const hit = pickCampusSurface(raycaster, groups.building.visible ? buildings : [], clippingPlanes, terrain ? ground : undefined, terrainOutlineClipped);
      if (hit && hit.object !== ground) callbacks.current.onSelect(hit.object.userData.feature);
      else if (callbacks.current.onMapPoint) {
        const point = terrain ? hit?.point
          : raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        if (point && framePlanes.every(plane => plane.distanceToPoint(point) >= 0)) callbacks.current.onMapPoint([point.x, point.z]);
      } else callbacks.current.onSelect(null);
    };
    renderer.domElement.addEventListener("pointerdown", gesture.down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", gesture.cancel);
    renderer.domElement.addEventListener("keydown", interrupt);
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onError("The 3D graphics connection was interrupted. Reload the page to reconnect."); };
    renderer.domElement.addEventListener("webglcontextlost",lost);
    invalidate();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect(); controls.removeEventListener("change", invalidate); controls.removeEventListener("start", interrupt); controls.dispose();
      renderer.domElement.removeEventListener("keydown", interrupt);
      renderer.domElement.removeEventListener("pointerdown",gesture.down); renderer.domElement.removeEventListener("pointerup",up);
      renderer.domElement.removeEventListener("pointercancel",gesture.cancel);
      renderer.domElement.removeEventListener("pointermove",move);
      renderer.domElement.removeEventListener("webglcontextlost",lost);
      disposeObject(scene); renderer.dispose(); renderer.forceContextLoss(); host.removeChild(renderer.domElement); state.current=null;
    };
  }, [campus, terrain]);

  useEffect(() => { state.current?.setActive(active); }, [active, campus, terrain]);
  useEffect(() => {
    const s=state.current; if(!s)return;
    for(const key of Object.keys(layers) as (keyof Layers)[]) s.groups[key].visible=layers[key] && !modelFiles.length;
    s.invalidate();
  }, [layers, campus, modelFiles, terrain]);
  useEffect(() => {
    const s = state.current;
    const node = transitMarker.current;
    if (!s || !node || !marker) return;
    const point = transitPosition(marker, campus, s.heightAt);
    const screen = new THREE.Vector3();
    s.updateTransitMarker = () => {
      screen.copy(point).project(s.camera);
      const visible = screen.z >= -1 && screen.z <= 1 && Math.abs(screen.x) < .94 && Math.abs(screen.y) < .92;
      node.hidden = !visible;
      if (!visible) return;
      node.style.left = `${((screen.x + 1) * 50).toFixed(2)}%`;
      node.style.top = `${((1 - screen.y) * 50).toFixed(2)}%`;
    };
    s.invalidate();
    return () => { s.updateTransitMarker = undefined; };
  }, [campus, marker, terrain]);
  useEffect(() => {
    const s = state.current; if(!s)return;
    for(const mesh of s.buildings) {
      const isSelected = mesh.userData.feature.id === selected?.id;
      const material=mesh.material as THREE.MeshStandardMaterial;
      const region = mesh.userData.region as CuhkRegion | null;
      const baseColor = colorRegions && region
        ? highlightedRegion && region !== highlightedRegion ? "#e1e6e4" : cuhkRegions[region].color
        : mesh.userData.baseColor;
      material.color.set(isSelected ? "#317cff" : scheduledBuildings?.has(mesh.userData.feature.id) ? "#087e70" : baseColor);
      material.emissive.set(isSelected ? "#092649" : "#000000");
    }
    s.invalidate();
  }, [selected,campus,scheduledBuildings,colorRegions,highlightedRegion,terrain]);
  useEffect(() => {
    const s = state.current; if(!s)return;
    const place = selected && placeFrame(s, selected, campus);
    if (s.view === "top") s.topSelectionTarget = place?.center;
    if (place) frame(s, place.center, place.radius, "closer");
  }, [selected,campus,terrain]);
  useEffect(() => {
    const s=state.current; if(!s)return;
    const distance=s.camera.position.distanceTo(s.controls.target);
    s.view = view;
    if (view === "top") {
      s.perspectivePose = s.flight?.to ?? getCameraPose(s);
      s.topSelectionTarget = undefined;
      fitTopView(s);
      return;
    }
    setMaxDistance(s, s.span * 3.2);
    s.camera.far = s.span * 14;
    s.camera.updateProjectionMatrix();
    if (s.perspectivePose) {
      const { position, target } = s.perspectivePose;
      const center = s.topSelectionTarget ?? target;
      flyTo(s, { target: center.clone(), position: position.clone().sub(target).add(center) });
      s.topSelectionTarget = undefined;
      s.perspectivePose = undefined;
    } else if (!s.flight) flyTo(s, { target: s.controls.target.clone(), position: s.controls.target.clone().add(new THREE.Vector3(.5,.72,.65).normalize().multiplyScalar(distance)) });
  },[view,campus,terrain]);
  useEffect(() => {
    const s = state.current; if (!s) return;
    // Campus maps pan like a map; uploaded models keep orbit-first inspection.
    const orbit = modelFiles.length > 0 && view !== "top";
    s.controls.enableRotate = view !== "top";
    s.controls.screenSpacePanning = orbit;
    s.controls.mouseButtons.LEFT = orbit ? THREE.MOUSE.ROTATE : THREE.MOUSE.PAN;
    s.controls.mouseButtons.RIGHT = orbit ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    s.controls.touches.ONE = orbit ? THREE.TOUCH.ROTATE : THREE.TOUCH.PAN;
    s.controls.touches.TWO = view === "top" || orbit ? THREE.TOUCH.DOLLY_PAN : THREE.TOUCH.DOLLY_ROTATE;
  }, [view, campus, modelFiles, terrain]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    disposeObject(s.route);
    s.route.clear();
    s.invalidate();
    if (modelFiles.length) return;
    const size = s.span * .032;
    if (routeStart) s.route.add(endpointMarker(routeStart, "A", "#073f75", size, s.heightAt(...routeStart)));
    if (routeDestination) s.route.add(endpointMarker(routeDestination, "B", "#841d51", size, s.heightAt(...routeDestination)));
    if (routePath && routePath.length > 1) {
      const positions: number[] = [];
      const halfWidth = s.span * .0022;
      const addVertex = (x: number, z: number) => positions.push(x, s.heightAt(x, z) + 3, z);
      const addStrip = ([x, z]: Point, [endX, endZ]: Point) => {
        const length = Math.hypot(endX - x, endZ - z);
        if (!length) return;
        const dx = (endZ - z) / length * halfWidth, dz = (x - endX) / length * halfWidth;
        addVertex(x + dx, z + dz); addVertex(endX + dx, endZ + dz); addVertex(endX - dx, endZ - dz);
        addVertex(x + dx, z + dz); addVertex(endX - dx, endZ - dz); addVertex(x - dx, z - dz);
      };
      for (let i = 1; i < routePath.length; i++) {
        const edge = terrain ? terrainSegment(terrain, routePath[i - 1], routePath[i]) : [routePath[i - 1], routePath[i]];
        for (let j = 1; j < edge.length; j++) addStrip(edge[j - 1], edge[j]);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const path = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: "#007570", side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
      path.renderOrder = 1;
      s.route.add(path);
    }
  }, [campus, modelFiles, routeStart, routeDestination, routePath, terrain]);
  useEffect(() => {
    const s = state.current;
    if (!s || !routeStart || !routeDestination || modelFiles.length) return;
    const points = [routeStart, routeDestination, ...(routePath ?? [])];
    const box = new THREE.Box3().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, s.heightAt(x, z), z)));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(110, Math.hypot(size.x, size.z) * .6) / (Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2)) * Math.min(1, s.camera.aspect));
    if (view === "top") center.y = s.topTerrainLevels?.(center.x, center.z).target ?? center.y;
    const offset = view === "top" ? topOffset(radius) : new THREE.Vector3(.5, .72, .65).normalize().multiplyScalar(radius);
    flyTo(s, { target: center, position: center.clone().add(offset) });
  }, [campus, modelFiles, routeStart, routeDestination, routePath, view, terrain]);
  useEffect(()=>{
    const s=state.current; if(!s||!action||lastAction.current===action)return;
    lastAction.current=action;
    if(action.type==="reset") flyTo(s,{target:new THREE.Vector3(0,s.heightAt(0,0),0),position:s.initial.clone()});
    if(action.type==="zoomIn"||action.type==="zoomOut") {
      const base=s.flight?.to??getCameraPose(s);
      const offset=base.position.clone().sub(base.target).multiplyScalar(action.type==="zoomIn"?.6:1.6).clampLength(s.controls.minDistance,s.maxDistance);
      flyTo(s,{target:base.target,position:base.target.clone().add(offset)},300);
    }
    const place=action.type==="focus"&&selected?placeFrame(s,selected,campus):null;
    if(place) frame(s,place.center,place.radius,"fit");
  },[action,selected,campus]);
  useEffect(()=>{
    const s=state.current; if(!s)return;
    let cancelled=false;
    s.model.clear();
    const hadModel = Boolean(s.modelBounds);
    s.modelBounds = undefined;
    if (hadModel && s.view === "top") fitTopView(s);
    s.invalidate();
    if(!modelFiles.length){callbacks.current.onReady();return;}
    const load=async()=>{
      try {
        const pivot=new THREE.Group();
        // Parts keep their shared origin (e.g. py-touch-mapper's map-ways.stl + map-rest.stl).
        for(const [index,file] of modelFiles.entries()) {
          const extension=file.name.split(".").pop()?.toLowerCase();
          let object: THREE.Object3D;
          if(extension==="stl") {
            const {STLLoader}=await import("three/addons/loaders/STLLoader.js");
            const geometry=new STLLoader().parse(await file.arrayBuffer());
            if(!geometry.getAttribute("position")?.count){geometry.dispose();continue;}
            geometry.computeVertexNormals();
            object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:partColors[index%partColors.length],roughness:.5,metalness:.12,side:THREE.DoubleSide}));
          } else if(extension==="glb") {
            const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
            // Self-contained binary glTF only; external model resources are blocked.
            const manager=new THREE.LoadingManager(); manager.setURLModifier(url=>{if(!url.startsWith("blob:")&&!url.startsWith("data:"))throw new Error("Use a self-contained GLB without external resources.");return url;});
            object=(await new GLTFLoader(manager).parseAsync(await file.arrayBuffer(),"")).scene;
          } else throw new Error("Choose a binary .glb or .stl file.");
          object.name=file.name; pivot.add(object);
          if(cancelled)break;
        }
        if(cancelled){disposeObject(pivot);return;}
        s.model.add(pivot);
        const info=fitModel(s,upAxisRef.current);
        if(!info) {disposeObject(s.model);s.model.clear();throw new Error("The model contains no usable geometry.");}
        callbacks.current.onModelInfo(info); callbacks.current.onReady();
      }catch{if(!cancelled){callbacks.current.onModelError();callbacks.current.onError("Could not open this model. Choose a valid STL or self-contained GLB file.");}}
    };
    void load();
    return ()=>{cancelled=true;disposeObject(s.model);s.model.clear();};
  },[modelFiles,campus,terrain]);
  useEffect(()=>{ upAxisRef.current=upAxis; const s=state.current; if(s?.model.children.length) callbacks.current.onModelInfo(fitModel(s,upAxis)); },[upAxis]);
  return <>
    <div className="scene-canvas" ref={container}/>
    {marker&&<button key={marker.id} ref={transitMarker} hidden className="map-place-marker" aria-pressed={selected?.id===marker.id} onClick={()=>onSelect(marker)}><TrainFront size={12}/>{marker.kind==="exit"?`Exit ${marker.exit}`:marker.name}</button>}
  </>;
}
