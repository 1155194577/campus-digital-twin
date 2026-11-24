"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { partColors } from "@/lib/types";
import type { Campus, Feature, Layers, ModelInfo, Point, UpAxis, ViewMode, ViewerAction } from "@/lib/types";
import { campusFramePlanes, projectCampusFramePlane } from "@/lib/campus-frame";
import { createMapClickGesture } from "@/lib/map-click-gesture";

type CameraPose = { position: THREE.Vector3; target: THREE.Vector3 };

type SceneState = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
  controls: OrbitControls; groups: Record<keyof Layers, THREE.Group>; buildings: THREE.Mesh[];
  model: THREE.Group; span: number; focus?: THREE.Vector3; initial: THREE.Vector3; invalidate: () => void;
  route: THREE.Group;
  setActive: (active: boolean) => void;
  view: ViewMode; perspectivePose?: CameraPose; topFrame?: CameraPose; campusBounds: THREE.Box3; modelBounds?: THREE.Box3;
  topSelectionTarget?: THREE.Vector3;
};

function getCameraPose(s: SceneState): CameraPose {
  return { position: s.camera.position.clone(), target: s.controls.target.clone() };
}

function isAtTopFrame(s: SceneState) {
  const frame = s.topFrame;
  return frame && frame.position.distanceToSquared(s.camera.position) < 1e-6 && frame.target.distanceToSquared(s.controls.target) < 1e-6;
}

function fitTopView(s: SceneState) {
  const bounds = s.modelBounds ?? s.campusBounds;
  const size = bounds.getSize(new THREE.Vector3());
  const halfFov = THREE.MathUtils.degToRad(s.camera.getEffectiveFOV() / 2);
  const distance = size.y / 2 + Math.max(size.x / s.camera.aspect, size.z) * 1.15 / (2 * Math.tan(halfFov));
  s.controls.maxDistance = Math.max(s.span * 3.2, distance * 1.3);
  s.camera.far = Math.max(s.span * 14, s.controls.maxDistance + size.y);
  s.camera.updateProjectionMatrix();
  bounds.getCenter(s.controls.target);
  s.camera.position.copy(s.controls.target).add(new THREE.Vector3(0, Math.max(s.controls.minDistance, distance), .01));
  s.focus = undefined;
  s.controls.update();
  s.topFrame = getCameraPose(s);
  s.invalidate();
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

function endpointMarker(point: Point, label: string, color: string, size: number) {
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
  marker.position.set(point[0], 4, point[1]);
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
  s.controls.target.set(0, (box.max.y - box.min.y) / 2, 0); s.camera.position.copy(s.initial); s.focus = undefined;
  if (s.view === "top") {
    s.perspectivePose = getCameraPose(s);
    fitTopView(s);
  } else { s.controls.update(); s.invalidate(); }
  let triangles = 0;
  pivot.traverse(child => { if (child instanceof THREE.Mesh) { const g = child.geometry as THREE.BufferGeometry; triangles += (g.index?.count ?? g.getAttribute("position")?.count ?? 0) / 3 * (child instanceof THREE.InstancedMesh ? child.count : 1); } });
  return { parts: pivot.children.length, triangles: Math.round(triangles), size: [size.x, size.z, size.y].map(v => v < maxSize * 1e-9 ? 0 : v) as ModelInfo["size"] };
}

export default function CampusScene({ campus, layers, selected, onSelect, onMapPoint, routeStart, routeDestination, routePath, view, action, modelFiles, upAxis, active, onError, onModelError, onReady, onModelInfo, onHeadingChange }: {
  campus: Campus; layers: Layers; selected: string | null; onSelect: (f: Feature | null) => void;
  onMapPoint?: (point: Point) => void; routeStart?: Point; routeDestination?: Point; routePath?: Point[];
  view: ViewMode; action: ViewerAction | null; modelFiles: File[]; upAxis: UpAxis; active: boolean;
  onError: (error: string) => void; onModelError: () => void; onReady: () => void; onModelInfo: (info: ModelInfo | null) => void; onHeadingChange: (degrees: number) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);
  const lastAction = useRef<ViewerAction | null>(null);
  const callbacks = useRef({ onSelect, onMapPoint, onError, onModelError, onReady, onModelInfo, onHeadingChange });
  const upAxisRef = useRef(upAxis);
  useEffect(() => { callbacks.current = { onSelect, onMapPoint, onError, onModelError, onReady, onModelInfo, onHeadingChange }; }, [onSelect, onMapPoint, onError, onModelError, onReady, onModelInfo, onHeadingChange]);

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
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
    const camera = new THREE.PerspectiveCamera(38, 1, 1, span * 14);
    const initial = new THREE.Vector3(span * .58, span * .9, span * .82);
    camera.position.copy(initial);
    const controls = new OrbitControls(camera, renderer.domElement);
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
    controls.screenSpacePanning = true;
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
    const ground = new THREE.Mesh(new THREE.BoxGeometry(campus.width, groundThickness, campus.depth), new THREE.MeshStandardMaterial({ color: "#dce8dc", roughness: 1 }));
    ground.position.y = groundTop - groundThickness / 2; scene.add(ground);
    const campusBounds = new THREE.Box3().setFromObject(ground);
    const groundEdge = new THREE.LineSegments(new THREE.EdgesGeometry(ground.geometry), new THREE.LineBasicMaterial({ color: "#bed0c7", transparent: true, opacity: .6 }));
    groundEdge.position.copy(ground.position); scene.add(groundEdge);
    const buildings: THREE.Mesh[] = [];
    const roads = new Map<string, THREE.BufferGeometry[]>();
    const outlines: THREE.BufferGeometry[] = [];
    const surfaces = { park: [] as THREE.BufferGeometry[], water: [] as THREE.BufferGeometry[] };
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
        const positions = new Float32Array((points.length - 1) * 6);
        for (let i = 1; i < points.length; i++) {
          positions.set([points[i-1][0], .9, points[i-1][1], points[i][0], .9, points[i][1]], (i - 1) * 6);
        }
        const segments = roads.get(color) ?? [];
        segments.push(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(positions, 3)));
        roads.set(color, segments);
        continue;
      }
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], -p[1])));
      const height = feature.kind === "building" ? feature.height : .4;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      if (feature.kind !== "building") {
        surfaces[feature.kind].push(geometry.translate(0, feature.kind === "water" ? -.3 : .15, 0));
        continue;
      }
      const color = feature.name ? "#d3dce0" : "#e1e6e4";
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .02, clippingPlanes }));
      mesh.position.y = 1;
      campusBounds.max.y = Math.max(campusBounds.max.y, height + mesh.position.y);
      mesh.userData = { feature, baseColor: color };
      groups[feature.kind].add(mesh);
      buildings.push(mesh);
      outlines.push(new THREE.EdgesGeometry(geometry, 30).translate(0, mesh.position.y, 0));
    }
    for (const [color, segments] of roads) {
      groups.road.add(new THREE.LineSegments(mergeGeometries(segments), new THREE.LineBasicMaterial({ color, clippingPlanes })));
      segments.forEach(geometry => geometry.dispose());
    }
    if (outlines.length) {
      groups.building.add(new THREE.LineSegments(mergeGeometries(outlines), new THREE.LineBasicMaterial({ color: "#819a9e", transparent: true, opacity: .35, clippingPlanes })));
      outlines.forEach(geometry => geometry.dispose());
    }
    for (const kind of ["park", "water"] as const) {
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
    const sceneState: SceneState = { scene, camera, renderer, controls, groups, buildings, model, route, span, initial, invalidate, setActive, view: "perspective", campusBounds };
    function render() {
      if (sceneState.focus) {
        const delta = sceneState.focus.clone().sub(controls.target).multiplyScalar(.12);
        controls.target.add(delta); camera.position.add(delta);
        if (controls.target.distanceTo(sceneState.focus)<.1) sceneState.focus=undefined;
      }
      const moved = controls.update();
      if (dirty || moved) {
        if (sceneState.view === "top") {
          framePlanes.forEach((plane, i) => projectCampusFramePlane(plane, groundTop, camera.position, projectedPlanes[i]));
          if (clippingPlanes.length === framePlanes.length) clippingPlanes.push(...projectedPlanes);
        } else {
          clippingPlanes.length = framePlanes.length;
        }
        renderer.render(scene,camera);
        updateNorthHeading();
        if (!ready) { ready = true; callbacks.current.onReady(); }
        dirty = false;
      }
      frame = undefined;
      if (framesToSettle > 0) framesToSettle--;
      if (moved || sceneState.focus || framesToSettle > 0) schedule();
    }
    state.current = sceneState;
    controls.addEventListener("change", invalidate);
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      if (!width || !height) return;
      renderer.setSize(width,height);
      const aspectChanged = camera.aspect !== width / height;
      camera.aspect = width / height;
      if (sceneState.view === "top" && aspectChanged && isAtTopFrame(sceneState)) fitTopView(sceneState);
      else { camera.updateProjectionMatrix(); invalidate(); }
    };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const raycaster = new THREE.Raycaster();
    const gesture = createMapClickGesture();
    const move = (event: PointerEvent) => {
      gesture.move(event);
      if (!event.buttons && event.pointerType !== "touch") return;
      framesToSettle = dampingFrames;
      schedule();
    };
    const up = (event: PointerEvent) => {
      if (!gesture.up(event) || model.children.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit = groups.building.visible ? raycaster.intersectObjects(buildings,false)
        .find(({ point }) => clippingPlanes.every(plane => plane.distanceToPoint(point) >= 0)) : null;
      if (hit) callbacks.current.onSelect(hit.object.userData.feature);
      else if (callbacks.current.onMapPoint) {
        const ground = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        if (ground && framePlanes.every(plane => plane.distanceToPoint(ground) >= 0)) callbacks.current.onMapPoint([ground.x, ground.z]);
      } else callbacks.current.onSelect(null);
    };
    renderer.domElement.addEventListener("pointerdown", gesture.down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointercancel", gesture.cancel);
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onError("The 3D graphics connection was interrupted. Reload the page to reconnect."); };
    renderer.domElement.addEventListener("webglcontextlost",lost);
    invalidate();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect(); controls.removeEventListener("change", invalidate); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown",gesture.down); renderer.domElement.removeEventListener("pointerup",up);
      renderer.domElement.removeEventListener("pointercancel",gesture.cancel);
      renderer.domElement.removeEventListener("pointermove",move);
      renderer.domElement.removeEventListener("webglcontextlost",lost);
      disposeObject(scene); renderer.dispose(); host.removeChild(renderer.domElement); state.current=null;
    };
  }, [campus]);

  useEffect(() => { state.current?.setActive(active); }, [active, campus]);
  useEffect(() => {
    const s=state.current; if(!s)return;
    for(const key of Object.keys(layers) as (keyof Layers)[]) s.groups[key].visible=layers[key] && !modelFiles.length;
    s.invalidate();
  }, [layers, campus, modelFiles]);
  useEffect(() => {
    const s = state.current; if(!s)return;
    let selectedMesh: THREE.Mesh | undefined;
    for(const mesh of s.buildings) {
      const isSelected = mesh.userData.feature.id === selected;
      if (isSelected) selectedMesh = mesh;
      const material=mesh.material as THREE.MeshStandardMaterial;
      material.color.set(isSelected ? "#317cff" : mesh.userData.baseColor);
      material.emissive.set(isSelected ? "#092649" : "#000000");
    }
    const feature=campus.features.find(f=>f.id===selected);
    if(feature) s.focus=new THREE.Vector3(feature.points.reduce((a,p)=>a+p[0],0)/feature.points.length,0,feature.points.reduce((a,p)=>a+p[1],0)/feature.points.length);
    if (s.view === "top") s.topSelectionTarget = selectedMesh ? new THREE.Box3().setFromObject(selectedMesh).getCenter(new THREE.Vector3()) : undefined;
    s.invalidate();
  }, [selected,campus]);
  useEffect(() => {
    const s=state.current; if(!s)return;
    const distance=s.camera.position.distanceTo(s.controls.target);
    s.view = view;
    s.controls.enableRotate=view!=="top";
    s.controls.mouseButtons.LEFT=view==="top"?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
    s.controls.touches.ONE=view==="top"?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
    if (view === "top") {
      s.perspectivePose = getCameraPose(s);
      s.topSelectionTarget = undefined;
      fitTopView(s);
      return;
    }
    s.controls.maxDistance = s.span * 3.2;
    s.camera.far = s.span * 14;
    s.camera.updateProjectionMatrix();
    if (s.perspectivePose) {
      const { position, target } = s.perspectivePose;
      if (s.topSelectionTarget) {
        s.controls.target.copy(s.topSelectionTarget);
        s.camera.position.copy(position).sub(target).add(s.topSelectionTarget);
        s.focus = undefined;
      } else {
        s.controls.target.copy(target);
        s.camera.position.copy(position);
      }
      s.topSelectionTarget = undefined;
      s.perspectivePose = undefined;
    } else s.camera.position.copy(s.controls.target).add(new THREE.Vector3(.5,.72,.65).normalize().multiplyScalar(distance));
    s.controls.update();
    s.invalidate();
  },[view,campus]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    disposeObject(s.route);
    s.route.clear();
    s.invalidate();
    if (modelFiles.length) return;
    const size = s.span * .032;
    if (routeStart) s.route.add(endpointMarker(routeStart, "A", "#073f75", size));
    if (routeDestination) s.route.add(endpointMarker(routeDestination, "B", "#841d51", size));
    if (routePath && routePath.length > 1) {
      const positions: number[] = [];
      const halfWidth = s.span * .0022;
      for (let i = 1; i < routePath.length; i++) {
        const [x, z] = routePath[i - 1];
        const [endX, endZ] = routePath[i];
        const length = Math.hypot(endX - x, endZ - z);
        const dx = (endZ - z) / length * halfWidth, dz = (x - endX) / length * halfWidth;
        positions.push(x + dx, 3, z + dz, endX + dx, 3, endZ + dz, endX - dx, 3, endZ - dz,
          x + dx, 3, z + dz, endX - dx, 3, endZ - dz, x - dx, 3, z - dz);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const path = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: "#007570", side: THREE.DoubleSide, depthTest: false, depthWrite: false, toneMapped: false }));
      path.renderOrder = 1;
      s.route.add(path);
    }
  }, [campus, modelFiles, routeStart, routeDestination, routePath]);
  useEffect(() => {
    const s = state.current;
    if (!s || !routeStart || !routeDestination || modelFiles.length) return;
    const points = [routeStart, routeDestination, ...(routePath ?? [])];
    const box = new THREE.Box3().setFromPoints(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(110, Math.hypot(size.x, size.z) * .6) / (Math.tan(THREE.MathUtils.degToRad(s.camera.fov / 2)) * Math.min(1, s.camera.aspect));
    s.focus = undefined;
    s.controls.target.copy(center);
    const offset = view === "top" ? new THREE.Vector3(0, radius, .01) : new THREE.Vector3(.5, .72, .65).normalize().multiplyScalar(radius);
    s.camera.position.copy(center).add(offset);
    s.controls.update();
    s.invalidate();
  }, [campus, modelFiles, routeStart, routeDestination, routePath, view]);
  useEffect(()=>{
    const s=state.current; if(!s||!action||lastAction.current===action)return;
    lastAction.current=action;
    if(action.type==="reset") {s.controls.target.set(0,0,0); s.camera.position.copy(s.initial); s.focus=undefined;}
    if(action.type==="zoomIn"||action.type==="zoomOut") {
      const offset=s.camera.position.clone().sub(s.controls.target).multiplyScalar(action.type==="zoomIn"?.75:1.3);
      offset.clampLength(s.controls.minDistance,s.controls.maxDistance); s.camera.position.copy(s.controls.target).add(offset);
    }
    if(action.type==="focus"&&selected) {
      const mesh=s.buildings.find(m=>m.userData.feature.id===selected);
      if(mesh) {const center=new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());s.controls.target.copy(center);s.camera.position.copy(center).add(new THREE.Vector3(130,150,160));s.focus=undefined;}
    }
    s.controls.update();
    s.invalidate();
  },[action,selected]);
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
  },[modelFiles,campus]);
  useEffect(()=>{ upAxisRef.current=upAxis; const s=state.current; if(s?.model.children.length) callbacks.current.onModelInfo(fitModel(s,upAxis)); },[upAxis]);
  return <div className="scene-canvas" ref={container}/>;
}
