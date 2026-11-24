"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Campus, Feature, Layers, ViewMode, ViewerAction } from "@/lib/types";

type SceneState = {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer;
  controls: OrbitControls; groups: Record<keyof Layers, THREE.Group>; buildings: THREE.Mesh[];
  model: THREE.Group; span: number; focus?: THREE.Vector3; initial: THREE.Vector3;
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

export default function CampusScene({ campus, layers, selected, onSelect, view, action, modelFile, onError, onModelError, onReady }: {
  campus: Campus; layers: Layers; selected: string | null; onSelect: (f: Feature | null) => void;
  view: ViewMode; action: ViewerAction | null; modelFile: File | null;
  onError: (error: string) => void; onModelError: () => void; onReady: () => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const state = useRef<SceneState | null>(null);
  const lastAction = useRef<ViewerAction | null>(null);
  const callbacks = useRef({ onSelect, onError, onModelError, onReady });
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
    for (const feature of campus.features) {
      const points = feature.points;
      if (points.length < 2) continue;
      if (feature.kind === "road") {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p[0], .9, p[1]))), new THREE.LineBasicMaterial({ color: feature.category === "footway" || feature.category === "path" ? "#fefcf4" : "#bdc8c7" }));
        groups.road.add(line); continue;
      }
      const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p[0], -p[1])));
      const height = feature.kind === "building" ? feature.height : .4;
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      const color = feature.kind === "building" ? (feature.name ? "#d3dce0" : "#e1e6e4") : feature.kind === "water" ? "#9dcbd1" : "#a6c7ae";
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .85, metalness: .02 }));
      mesh.position.y = feature.kind === "building" ? 1 : feature.kind === "water" ? -.3 : .15;
      mesh.userData = { feature, baseColor: color };
      groups[feature.kind].add(mesh);
      if (feature.kind === "building") {
        buildings.push(mesh);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 30), new THREE.LineBasicMaterial({color:"#819a9e",transparent:true,opacity:.35}));
        mesh.add(edges);
      }
    }
    const model = new THREE.Group(); scene.add(model);
    state.current = { scene, camera, renderer, controls, groups, buildings, model, span, initial };
    const resize = () => { const { width, height } = host.getBoundingClientRect(); if (!width || !height) return; renderer.setSize(width,height); camera.aspect = width/height; camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const raycaster = new THREE.Raycaster();
    let start = [0,0];
    const down = (event: PointerEvent) => { start = [event.clientX,event.clientY]; };
    const up = (event: PointerEvent) => {
      if (Math.hypot(event.clientX-start[0], event.clientY-start[1]) > 5 || model.children.length) return;
      const rect = renderer.domElement.getBoundingClientRect();
      raycaster.setFromCamera(new THREE.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),camera);
      const hit = groups.building.visible ? raycaster.intersectObjects(buildings,false)[0] : null;
      callbacks.current.onSelect(hit ? hit.object.userData.feature : null);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    const lost = (event: Event) => { event.preventDefault(); callbacks.current.onError("The 3D graphics connection was interrupted. Reload the page to reconnect."); };
    renderer.domElement.addEventListener("webglcontextlost",lost);
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      if (state.current?.focus) {
        const delta = state.current.focus.clone().sub(controls.target).multiplyScalar(.12);
        controls.target.add(delta); camera.position.add(delta);
        if (controls.target.distanceTo(state.current.focus)<.1) state.current.focus=undefined;
      }
      controls.update(); renderer.render(scene,camera);
    };
    render(); callbacks.current.onReady();
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener("pointerdown",down); renderer.domElement.removeEventListener("pointerup",up);
      renderer.domElement.removeEventListener("webglcontextlost",lost);
      disposeObject(scene); renderer.dispose(); host.removeChild(renderer.domElement); state.current=null;
    };
  }, [campus]);

  useEffect(() => { const s=state.current; if(s) for(const key of Object.keys(layers) as (keyof Layers)[]) s.groups[key].visible=layers[key] && !modelFile; }, [layers, campus, modelFile]);
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
  },[action,selected]);
  useEffect(()=>{
    const s=state.current; if(!s)return;
    let cancelled=false;
    s.model.clear();
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
        s.model.add(object);s.controls.target.set(0,s.span*.12,0);s.camera.position.copy(s.initial);callbacks.current.onReady();
      }catch{if(!cancelled){callbacks.current.onModelError();callbacks.current.onError("Could not open this model. Choose a valid STL or self-contained GLB file.");}}
    };
    void load();
    return ()=>{cancelled=true;disposeObject(s.model);s.model.clear();};
  },[modelFile,campus]);
  return <div className="scene-canvas" ref={container}/>;
}
