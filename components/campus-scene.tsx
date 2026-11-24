"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Campus, Feature, Layers, Point, ViewMode, ViewerAction } from "@/lib/types";
import { createMapClickGesture } from "@/lib/map-click-gesture";

type SceneState = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
  controls: OrbitControls; groups: Record<keyof Layers, THREE.Group>; buildings: THREE.Mesh[];
  model: THREE.Group; span: number; focus?: THREE.Vector3; initial: THREE.Vector3; invalidate: () => void;
  route: THREE.Group;
};

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

export default function CampusScene({ campus, layers, selected, onSelect, onMapPoint, routeStart, routeDestination, routePath, view, action, modelFile, onError, onModelError, onReady }: {
  campus: Campus; layers: Layers; selected: string | null; onSelect: (f: Feature | null) => void;
  onMapPoint?: (point: Point) => void; routeStart?: Point; routeDestination?: Point; routePath?: Point[];
  view: ViewMode; action: ViewerAction | null; modelFile: File | null;
  onError: (error: string) => void; onModelError: () => void; onReady: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);
  const lastAction = useRef<ViewerAction | null>(null);
  const callbacks = useRef({ onSelect, onMapPoint, onError, onModelError, onReady });
  useEffect(() => { callbacks.current = { onSelect, onMapPoint, onError, onModelError, onReady }; }, [onSelect, onMapPoint, onError, onModelError, onReady]);

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
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const span = Math.max(campus.width, campus.depth);
    const camera = new THREE.PerspectiveCamera(38, 1, 1, span * 14);
    const initial = new THREE.Vector3(span * .58, span * .9, span * .82);
    camera.position.copy(initial);
    const controls = new OrbitControls(camera, renderer.domElement);
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
    const ground = new THREE.Mesh(new THREE.BoxGeometry(campus.width, 8, campus.depth), new THREE.MeshStandardMaterial({ color: "#dce8dc", roughness: 1 }));
    ground.position.y = -5; scene.add(ground);
    const groundEdge = new THREE.LineSegments(new THREE.EdgesGeometry(ground.geometry), new THREE.LineBasicMaterial({ color: "#bed0c7", transparent: true, opacity: .6 }));
    groundEdge.position.copy(ground.position); scene.add(groundEdge);
    const buildings: THREE.Mesh[] = [];
    const roads = new Map<string, THREE.BufferGeometry[]>();
    const outlines: THREE.BufferGeometry[] = [];
    const surfaces = { park: [] as THREE.BufferGeometry[], water: [] as THREE.BufferGeometry[] };
    for (const feature of campus.features) {
      const points = feature.points;
      if (points.length < 2) continue;
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
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .02 }));
      mesh.position.y = 1;
      mesh.userData = { feature, baseColor: color };
      groups[feature.kind].add(mesh);
      buildings.push(mesh);
      outlines.push(new THREE.EdgesGeometry(geometry, 30).translate(0, mesh.position.y, 0));
    }
    for (const [color, segments] of roads) {
      groups.road.add(new THREE.LineSegments(mergeGeometries(segments), new THREE.LineBasicMaterial({ color })));
      segments.forEach(geometry => geometry.dispose());
    }
    if (outlines.length) {
      groups.building.add(new THREE.LineSegments(mergeGeometries(outlines), new THREE.LineBasicMaterial({ color: "#819a9e", transparent: true, opacity: .35 })));
      outlines.forEach(geometry => geometry.dispose());
    }
    for (const kind of ["park", "water"] as const) {
      const geometries = surfaces[kind];
      if (!geometries.length) continue;
      const color = kind === "water" ? "#9dcbd1" : "#a6c7ae";
      groups[kind].add(new THREE.Mesh(mergeGeometries(geometries), new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .02 })));
      geometries.forEach(geometry => geometry.dispose());
    }
    const model = new THREE.Group();
    const route = new THREE.Group();
    scene.add(model, route);
    let frame: number | undefined;
    let ready = false;
    let dirty = false;
    let framesToSettle = 0;
    const dampingFrames = Math.ceil(Math.log(.001) / Math.log(1 - controls.dampingFactor));
    const schedule = () => { frame ??= requestAnimationFrame(render); };
    const invalidate = () => { dirty = true; schedule(); };
    const sceneState: SceneState = { scene, camera, renderer, controls, groups, buildings, model, route, span, initial, invalidate };
    function render() {
      if (sceneState.focus) {
        const delta = sceneState.focus.clone().sub(controls.target).multiplyScalar(.12);
        controls.target.add(delta); camera.position.add(delta);
        if (controls.target.distanceTo(sceneState.focus)<.1) sceneState.focus=undefined;
      }
      const moved = controls.update();
      if (dirty || moved) {
        renderer.render(scene,camera);
        if (!ready) { ready = true; callbacks.current.onReady(); }
        dirty = false;
      }
      frame = undefined;
      if (framesToSettle > 0) framesToSettle--;
      if (moved || sceneState.focus || framesToSettle > 0) schedule();
    }
    state.current = sceneState;
    controls.addEventListener("change", invalidate);
    const resize = () => { const { width, height } = host.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width,height); camera.aspect = width/height; camera.updateProjectionMatrix(); invalidate(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const raycaster = new THREE.Raycaster();
    const gesture = createMapClickGesture();
    const move = (event: PointerEvent) => {
      if (!event.buttons && event.pointerType !== "touch") return;
      framesToSettle = dampingFrames;
      schedule();
    };
    const up = (event: PointerEvent) => {
      if (!gesture.up(event) || model.children.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit = groups.building.visible ? raycaster.intersectObjects(buildings,false)[0] : null;
      if (hit) callbacks.current.onSelect(hit.object.userData.feature);
      else if (callbacks.current.onMapPoint) {
        const ground = raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Vector3());
        if (ground && Math.abs(ground.x) <= campus.width / 2 && Math.abs(ground.z) <= campus.depth / 2) callbacks.current.onMapPoint([ground.x, ground.z]);
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

  useEffect(() => {
    const s=state.current; if(!s)return;
    for(const key of Object.keys(layers) as (keyof Layers)[]) s.groups[key].visible=layers[key] && !modelFile;
    s.invalidate();
  }, [layers, campus, modelFile]);
  useEffect(() => {
    const s = state.current; if(!s)return;
    for(const mesh of s.buildings) {
      const material=mesh.material as THREE.MeshStandardMaterial;
      material.color.set(mesh.userData.feature.id===selected ? "#317cff" : mesh.userData.baseColor);
      material.emissive.set(mesh.userData.feature.id===selected ? "#092649" : "#000000");
    }
    if(selected) {
      const feature=campus.features.find(f=>f.id===selected);
      if(feature) s.focus=new THREE.Vector3(feature.points.reduce((a,p)=>a+p[0],0)/feature.points.length,0,feature.points.reduce((a,p)=>a+p[1],0)/feature.points.length);
    }
    s.invalidate();
  }, [selected,campus]);
  useEffect(() => {
    const s=state.current; if(!s)return;
    const distance=s.camera.position.distanceTo(s.controls.target);
    s.controls.enableRotate=view!=="top";
    s.controls.mouseButtons.LEFT=view==="top"?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
    s.controls.touches.ONE=view==="top"?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
    s.renderer.domElement.setAttribute("aria-label", `Interactive 3D campus map. Drag to ${view==="top"?"pan":"orbit"}, scroll to zoom, click buildings to inspect. Use the adjacent buttons for camera controls.`);
    s.camera.position.copy(s.controls.target).add(view==="top" ? new THREE.Vector3(0,distance,.01) : new THREE.Vector3(.5,.72,.65).normalize().multiplyScalar(distance));
    s.controls.update();
    s.invalidate();
  },[view,campus]);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    disposeObject(s.route);
    s.route.clear();
    s.invalidate();
    if (modelFile) return;
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
  }, [campus, modelFile, routeStart, routeDestination, routePath]);
  useEffect(() => {
    const s = state.current;
    if (!s || !routeStart || !routeDestination || modelFile) return;
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
  }, [campus, modelFile, routeStart, routeDestination, routePath, view]);
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
    s.invalidate();
    if(!modelFile)return;
    const load=async()=>{
      try {
        const extension=modelFile.name.split(".").pop()?.toLowerCase();
        let object: THREE.Object3D;
        if(extension==="stl") {
          const {STLLoader}=await import("three/addons/loaders/STLLoader.js");
          const geometry=new STLLoader().parse(await modelFile.arrayBuffer()); geometry.computeVertexNormals();
          object=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:"#83a9d4",roughness:.5,metalness:.12,side:THREE.DoubleSide}));
        } else if(extension==="glb") {
          const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
          // Self-contained binary glTF only; external model resources are blocked.
          const manager=new THREE.LoadingManager(); manager.setURLModifier(url=>{if(!url.startsWith("blob:")&&!url.startsWith("data:"))throw new Error("Use a self-contained GLB without external resources.");return url;});
          object=(await new GLTFLoader(manager).parseAsync(await modelFile.arrayBuffer(),"")).scene;
        } else throw new Error("Choose a binary .glb or .stl file.");
        if(cancelled){disposeObject(object);return;}
        let box=new THREE.Box3().setFromObject(object);
        const maxSize=Math.max(...box.getSize(new THREE.Vector3()).toArray());
        if(!Number.isFinite(maxSize)||maxSize<=0) {disposeObject(object);throw new Error("The model contains no usable geometry.");}
        object.scale.multiplyScalar(s.span*.55/maxSize);
        box=new THREE.Box3().setFromObject(object);
        const center=box.getCenter(new THREE.Vector3());
        object.position.sub(new THREE.Vector3(center.x,box.min.y,center.z));
        s.model.add(object);s.controls.target.set(0,s.span*.12,0);s.camera.position.copy(s.initial);s.invalidate();callbacks.current.onReady();
      }catch{if(!cancelled){callbacks.current.onModelError();callbacks.current.onError("Could not open this model. Choose a valid STL or self-contained GLB file.");}}
    };
    void load();
    return ()=>{cancelled=true;disposeObject(s.model);s.model.clear();};
  },[modelFile,campus]);
  return <div className="scene-canvas" ref={container}/>;
}
