"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Campus, Feature, Layers, UpAxis, ViewMode, ViewerAction } from "@/lib/types";

type SceneState = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
  controls: OrbitControls; groups: Record<keyof Layers, THREE.Group>; buildings: THREE.Mesh[];
  model: THREE.Group; span: number; focus?: THREE.Vector3; initial: THREE.Vector3; invalidate: () => void;
  setActive: (active: boolean) => void;
};

function disposeObject(object: THREE.Object3D) {
  object.traverse(child => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
      child.geometry?.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((m: THREE.Material) => {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
        m.dispose();
      });
    }
  });
}

const partColors = ["#83a9d4", "#e3a65f", "#7fb38a", "#c48bc0"];

// STL files are Z-up by convention (slicers, 3d-print, py-touch-mapper); glTF is Y-up.
function fitModel(s: SceneState, upAxis: UpAxis, view: ViewMode) {
  const pivot = s.model.children[0];
  if (!pivot) return false;
  pivot.position.set(0, 0, 0); pivot.scale.setScalar(1);
  pivot.rotation.set(upAxis === "z" ? -Math.PI / 2 : 0, 0, 0);
  let box = new THREE.Box3().setFromObject(pivot);
  const maxSize = Math.max(...box.getSize(new THREE.Vector3()).toArray());
  if (!Number.isFinite(maxSize) || maxSize <= 0) return false;
  pivot.scale.setScalar(s.span * .55 / maxSize);
  box = new THREE.Box3().setFromObject(pivot);
  const center = box.getCenter(new THREE.Vector3());
  pivot.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  s.controls.target.set(0, (box.max.y - box.min.y) / 2, 0); s.camera.position.copy(s.initial); s.focus = undefined;
  if (view === "top") { const distance = s.camera.position.distanceTo(s.controls.target); s.camera.position.copy(s.controls.target).add(new THREE.Vector3(0, distance, .01)); }
  s.controls.update(); s.invalidate();
  return true;
}

export default function CampusScene({ campus, layers, selected, onSelect, view, action, modelFiles, upAxis, active, onError, onModelError, onReady }: {
  campus: Campus; layers: Layers; selected: string | null; onSelect: (f: Feature | null) => void;
  view: ViewMode; action: ViewerAction | null; modelFiles: File[]; upAxis: UpAxis; active: boolean;
  onError: (error: string) => void; onModelError: () => void; onReady: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);
  const lastAction = useRef<ViewerAction | null>(null);
  const callbacks = useRef({ onSelect, onError, onModelError, onReady });
  const upAxisRef = useRef(upAxis);
  const viewRef = useRef(view);
  useEffect(() => { callbacks.current = { onSelect, onError, onModelError, onReady }; }, [onSelect, onError, onModelError, onReady]);

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
    const model = new THREE.Group(); scene.add(model);
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
    const sceneState: SceneState = { scene, camera, renderer, controls, groups, buildings, model, span, initial, invalidate, setActive };
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
    let start = [0,0];
    const down = (event: PointerEvent) => { start = [event.clientX,event.clientY]; };
    const move = (event: PointerEvent) => {
      if (!event.buttons && event.pointerType !== "touch") return;
      framesToSettle = dampingFrames;
      schedule();
    };
    const up = (event: PointerEvent) => {
      if (Math.hypot(event.clientX-start[0], event.clientY-start[1]) > 5 || model.children.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit = groups.building.visible ? raycaster.intersectObjects(buildings,false)[0] : null;
      callbacks.current.onSelect(hit ? hit.object.userData.feature : null);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerup", up);
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onError("The 3D graphics connection was interrupted. Reload the page to reconnect."); };
    renderer.domElement.addEventListener("webglcontextlost",lost);
    invalidate();
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
      observer.disconnect(); controls.removeEventListener("change", invalidate); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown",down); renderer.domElement.removeEventListener("pointerup",up);
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
    viewRef.current=view;
    const s=state.current; if(!s)return;
    const distance=s.camera.position.distanceTo(s.controls.target);
    s.controls.enableRotate=view!=="top";
    s.controls.mouseButtons.LEFT=view==="top"?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;
    s.controls.touches.ONE=view==="top"?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
    s.camera.position.copy(s.controls.target).add(view==="top" ? new THREE.Vector3(0,distance,.01) : new THREE.Vector3(.5,.72,.65).normalize().multiplyScalar(distance));
    s.controls.update();
    s.invalidate();
  },[view,campus]);
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
        if(!fitModel(s,upAxisRef.current,viewRef.current)) {disposeObject(s.model);s.model.clear();throw new Error("The model contains no usable geometry.");}
        callbacks.current.onReady();
      }catch{if(!cancelled){callbacks.current.onModelError();callbacks.current.onError("Could not open this model. Choose a valid STL or self-contained GLB file.");}}
    };
    void load();
    return ()=>{cancelled=true;disposeObject(s.model);s.model.clear();};
  },[modelFiles,campus]);
  useEffect(()=>{ upAxisRef.current=upAxis; const s=state.current; if(s) fitModel(s,upAxis,viewRef.current); },[upAxis]);
  return <div className="scene-canvas" ref={container}/>;
}
