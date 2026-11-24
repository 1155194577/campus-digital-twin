"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpRight, Box, Building2, Check, ChevronDown, ChevronRight, Compass, Crosshair, Expand, FileBox, Info, Layers3, Leaf, LoaderCircle, Map, MapPin, Minus, MousePointer2, Move3D, Plus, RotateCcw, Search, SlidersHorizontal, Upload, Waves, X } from "lucide-react";
import type { Campus, Feature, Layers, Point, ViewMode, ViewerAction } from "@/lib/types";
import { buildWalkingGraph, distance, findWalkingRoute, formatEndpoint, parseEndpoint } from "@/lib/walking-route";
import RoutePlanner, { type EndpointSlot } from "./route-planner";

const CampusScene = dynamic(() => import("./campus-scene"), { ssr: false });
const campuses = [{id:"hkstp",short:"HKSTP",name:"Hong Kong Science Park",tag:"Science & innovation"},{id:"cuhk",short:"CUHK",name:"The Chinese University of Hong Kong",tag:"Education & research"}];
const layerOptions = [{key:"building",name:"Buildings",icon:Building2,color:"#b7c7cd"},{key:"road",name:"Roads & pathways",icon:Map,color:"#c2c9c3"},{key:"park",name:"Green spaces",icon:Leaf,color:"#92b79d"},{key:"water",name:"Water bodies",icon:Waves,color:"#8abcc6"}] as const;

export default function CampusApp() {
  const [campusId,setCampusId]=useState("hkstp");
  const [campus,setCampus]=useState<Campus|null>(null);
  const [loading,setLoading]=useState(true);
  const [sceneReady,setSceneReady]=useState(false);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [locationReady,setLocationReady]=useState(false);
  const [planning,setPlanning]=useState(false);
  const [choosing,setChoosing]=useState<EndpointSlot>("start");
  const [startKey,setStartKey]=useState<string|null>(null);
  const [destinationKey,setDestinationKey]=useState<string|null>(null);
  const [layers,setLayers]=useState<Layers>({building:true,road:true,park:true,water:true});
  const [view,setView]=useState<ViewMode>("perspective");
  const [action,setAction]=useState<ViewerAction|null>(null);
  const [tab,setTab]=useState<"explore"|"models">("explore");
  const [modelFile,setModelFile]=useState<File|null>(null);
  const [info,setInfo]=useState(false);
  const [mobileDirectory,setMobileDirectory]=useState(false);
  const upload=useRef<HTMLInputElement>(null);
  const viewer=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const params = new URLSearchParams(window.location.search);
    const requestedCampus = campuses.find(item => item.id === params.get("campus"));
    const start = params.get("start"), destination = params.get("destination");
    const plan = params.get("plan") === "1" || !!start || !!destination;
    if (requestedCampus) setCampusId(requestedCampus.id);
    setSelectedId(params.get("selected"));
    setStartKey(start); setDestinationKey(destination);
    setPlanning(plan);
    if (plan) setView("top");
    if (start && !destination) setChoosing("destination");
    setLocationReady(true);
  },[]);
  useEffect(()=>{
    if (!locationReady) return;
    const url = new URL(window.location.href);
    for (const [key, value] of [["campus", campusId === "hkstp" && !planning && !selectedId ? null : campusId], ["selected", selectedId], ["plan", planning ? "1" : null], ["start", startKey], ["destination", destinationKey]] as const) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
  },[campusId, selectedId, planning, startKey, destinationKey, locationReady]);
  useEffect(()=>{
    if (!locationReady) return;
    const controller=new AbortController();
    setCampus(null);setLoading(true);setSceneReady(false);setError("");setQuery("");setModelFile(null);setAction(null);
    fetch(`/data/${campusId}.json`,{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error("Campus data could not be loaded. Please try again.");return r.json();}).then(data=>{setCampus(data);setLoading(false);}).catch(e=>{if(e.name!=="AbortError"){setError(e.message);setLoading(false);}});
    return ()=>controller.abort();
  },[campusId, locationReady]);
  const activeCampus = campus?.id === campusId ? campus : null;
  const selected=activeCampus?.features.find(f=>f.id===selectedId)??null;
  const start=useMemo(()=>activeCampus?parseEndpoint(activeCampus,startKey):null,[activeCampus,startKey]);
  const destination=useMemo(()=>activeCampus?parseEndpoint(activeCampus,destinationKey):null,[activeCampus,destinationKey]);
  const graph=useMemo(()=>activeCampus?buildWalkingGraph(activeCampus):null,[activeCampus]);
  const route=useMemo(()=>graph&&start&&destination?findWalkingRoute(graph,activeCampus?.walkDetails,start.point,destination.point):null,[graph,activeCampus,start,destination]);
  const endpointLabel=(endpoint:typeof start)=>{
    if (!endpoint) return null;
    const feature = activeCampus?.features.find(f => f.id === endpoint.featureId);
    return feature?.name || feature?.localName || (feature?.kind === "building" ? "Mapped building" : "Map point");
  };
  const buildings=useMemo(()=>campus?.features.filter(f=>f.kind==="building")??[],[campus]);
  const named=useMemo(()=>buildings.filter(f=>f.name).sort((a,b)=>a.name.localeCompare(b.name)),[buildings]);
  const filtered=useMemo(()=>named.filter(f=>`${f.name} ${f.localName}`.toLowerCase().includes(query.toLowerCase())),[named,query]);
  const ready=useCallback(()=>setSceneReady(true),[]);
  const showError=useCallback((message:string)=>{setError(message);setSceneReady(true);},[]);
  const clearFailedModel=useCallback(()=>setModelFile(null),[]);
  const putEndpoint=useCallback((key:string)=>{
    if (choosing === "start") {
      setStartKey(key);
      if (!destination) setChoosing("destination");
    } else {
      setDestinationKey(key);
      if (!start) setChoosing("start");
    }
  },[choosing,destination,start]);
  const onMapPoint=useCallback((point:Point)=>putEndpoint(formatEndpoint({point})!),[putEndpoint]);
  const select=useCallback((feature:Feature|null)=>{
    if (planning && tab === "explore" && feature) putEndpoint(feature.id);
    else setSelectedId(feature?.id??null);
    setMobileDirectory(false);
  },[planning,putEndpoint,tab]);
  const clearRoute=()=>{setStartKey(null);setDestinationKey(null);setChoosing("start");};
  const togglePlanner=()=>{
    if (planning) clearRoute();
    else {
      setView("top");
      if (selected) {setStartKey(selected.id);setChoosing("destination");}
    }
    setPlanning(!planning);
  };
  const command=(type:ViewerAction["type"])=>{
    if(type==="focus")setView("perspective");
    setAction({type,at:Date.now()});
  };
  const chooseModel=(file?:File)=>{
    if(!file)return;
    if(!/\.(stl|glb)$/i.test(file.name)){setError("Please choose an STL or self-contained GLB model.");return;}
    if(file.size>50*1024*1024){setError("This model is too large. Please choose a file smaller than 50 MB.");return;}
    setError("");setSelectedId(null);setModelFile(file);setSceneReady(false);setTab("models");
  };
  const exportData=()=>{
    if(!campus)return;
    const file=new Blob([JSON.stringify({type:"FeatureCollection",attribution:"© OpenStreetMap contributors (ODbL)",snapshot:campus.fetchedAt,features:campus.features.map(f=>({type:"Feature",id:f.id,properties:{name:f.name,kind:f.kind,height:f.height,heightEstimated:f.heightEstimated},geometry:{type:f.kind==="road"?"LineString":"Polygon",coordinates:f.kind==="road"?f.points.map(p=>[p[0]/(111320*Math.cos(campus.center[0]*Math.PI/180))+campus.center[1],campus.center[0]-p[1]/111320]):[f.points.map(p=>[p[0]/(111320*Math.cos(campus.center[0]*Math.PI/180))+campus.center[1],campus.center[0]-p[1]/111320])]}}))})],{type:"application/geo+json"});
    const url=URL.createObjectURL(file);const link=document.createElement("a");link.href=url;link.download=`${campus.id}-campus.geojson`;link.click();URL.revokeObjectURL(url);
  };
  const current=campuses.find(c=>c.id===campusId)!;
  return <div className="app-shell">
    <aside className="rail" aria-label="Main navigation">
      <Link className="brand-mark" href="/" aria-label="Campus Atlas home"><Layers3 size={25}/></Link>
      <div className="rail-divider"/>
      <button className={tab==="explore"?"rail-button active":"rail-button"} title="Campus explorer" aria-label="Campus explorer" onClick={()=>{setTab("explore");setModelFile(null);}}><Map size={21}/></button>
      <button className={tab==="models"?"rail-button active":"rail-button"} title="3D model viewer" aria-label="3D model viewer" onClick={()=>setTab("models")}><Box size={21}/></button>
      <button className="rail-button rail-bottom" title="About this twin" aria-label="About this twin" onClick={()=>setInfo(true)}><Info size={20}/></button>
      <div className="avatar">CA</div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="identity"><strong>Campus Atlas<span className="beta">BETA</span></strong><span className="topbar-divider"/><span className="product-label">Digital twin workspace</span></div>
        <div className="topbar-actions"><span className="snapshot-pill"><span/>Geographic snapshot</span><button className="icon-button" aria-label="About data sources" onClick={()=>setInfo(true)}><Info size={18}/></button><a className="github-link" href="https://github.com/1155194577/py-touch-mapper-hk" target="_blank" rel="noreferrer">Project sources<ArrowUpRight size={14}/></a></div>
      </header>
      <div className="page-heading"><div><div className="eyebrow">YOUR CAMPUS, IN CONTEXT</div><h1>{tab==="explore"?"A new perspective on campus.":"Bring your models into view."}</h1><p>{tab==="explore"?"Explore the places, buildings and spaces that connect us.":"Inspect a scan or printable model, right in your browser."}</p></div><button className="secondary-button export-button" onClick={exportData} disabled={!campus||loading}><ArrowDownToLine size={16}/>Export map data</button></div>
      <main className={`main-workspace ${planning&&tab==="explore"?"planning-workspace":""}`}>
        <section className={`directory ${mobileDirectory?"mobile-open":""}`} aria-label="Campus directory">
          <div className="directory-heading"><span className="section-label">WORKSPACE</span><button className="icon-button mobile-close" onClick={()=>setMobileDirectory(false)} aria-label="Close directory"><X size={17}/></button></div>
          <div className="campus-select"><span className="campus-icon"><Building2 size={21}/></span><div><label htmlFor="campus">Campus location</label><div className="select-wrap"><select id="campus" value={campusId} onChange={e=>{setCampusId(e.target.value);setSelectedId(null);clearRoute();}} aria-label="Campus location">{campuses.map(c=><option key={c.id} value={c.id}>{c.short} campus</option>)}</select><ChevronDown size={14}/></div></div></div>
          <div className="directory-tabs"><button className={tab==="explore"?"selected":""} onClick={()=>{setTab("explore");setModelFile(null);}}>Explore campus</button><button className={tab==="models"?"selected":""} onClick={()=>setTab("models")}>My models</button></div>
          {tab==="explore"?<>
            <div className="layer-heading"><h2>Map layers</h2><SlidersHorizontal size={15}/></div>
            <div className="layers">{layerOptions.map(({key,name,icon:Icon,color})=><label className="layer-row" key={key}><span className="layer-symbol" style={{color}}><Icon size={17}/></span><span>{name}</span><input type="checkbox" checked={layers[key]} onChange={e=>setLayers({...layers,[key]:e.target.checked})}/><span className="custom-check">{layers[key]&&<Check size={12}/>}</span></label>)}</div>
            <div className="directory-rule"/>
            <div className="layer-heading"><h2>Building directory</h2><span className="count">{named.length}</span></div>
            <label className="search-field"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a building…" aria-label="Find a building"/>{query&&<button onClick={()=>setQuery("")} aria-label="Clear search"><X size={13}/></button>}</label>
            <div className="building-list" aria-live="polite">{loading?<div className="list-message">Loading campus…</div>:filtered.length?filtered.map(f=><button className={`building-row ${selected?.id===f.id?"selected":""}`} key={f.id} onClick={()=>{setLayers(l=>({...l,building:true}));select(f);}}><span className="building-icon"><Building2 size={16}/></span><span><strong>{f.name}</strong><small>{f.category==="yes"?"Campus building":f.category.replaceAll("_"," ")}</small></span><ChevronRight size={13}/></button>):<div className="list-message">No buildings found. Try another name.</div>}</div>
          </>:<div className="model-panel"><div className="model-art"><FileBox size={40} strokeWidth={1.2}/></div><h2>Your models, a closer look.</h2><p>Open a scanned object or printable model to orbit, zoom and inspect it in 3D.</p><button className="primary-button" onClick={()=>upload.current?.click()}><Upload size={15}/>Open 3D model</button><small>STL or self-contained GLB · up to 50 MB</small>{modelFile&&<div className="loaded-model"><FileBox size={17}/><span>{modelFile.name}<small>{(modelFile.size/1024/1024).toFixed(2)} MB · Local file</small></span><button className="icon-button" onClick={()=>{setModelFile(null);setError("");}} aria-label="Remove model"><X size={15}/></button></div>}<div className="privacy-note"><Check size={14}/>Your model stays on this device.</div></div>}
          <button className="secondary-button mobile-export" onClick={exportData} disabled={!campus||loading}><ArrowDownToLine size={15}/>Export map data</button>
          <div className="directory-footer"><span className="small-dot"/>Built on open geographic data<button onClick={()=>setInfo(true)} aria-label="Read map attribution"><ArrowUpRight size={13}/></button></div>
        </section>
        <section className="map-section">
          {tab==="explore"&&<div className="route-toolbar"><button className="secondary-button" type="button" aria-expanded={planning} onClick={togglePlanner}>{planning?"Close route planner":"Plan route"}</button></div>}
          {tab==="explore"&&planning&&<RoutePlanner start={endpointLabel(start)} destination={endpointLabel(destination)} choosing={choosing} onChoose={setChoosing} onClear={clearRoute} estimate={start&&destination?distance(start.point,destination.point):null} route={route}/>}
          <div className="map-toolbar"><div className="map-breadcrumb"><span className="toolbar-icon"><MapPin size={16}/></span><strong>{modelFile?modelFile.name:current.short}</strong><ChevronRight size={13}/><span>{modelFile?"Model viewer":"Campus overview"}</span></div><div className="view-switch" aria-label="Map view"><button className={view==="perspective"?"selected":""} onClick={()=>setView("perspective")}><Box size={14}/>3D</button><button className={view==="top"?"selected":""} onClick={()=>setView("top")}><Map size={14}/>Top</button></div><button className="icon-button mobile-directory-toggle" aria-label="Open campus directory" onClick={()=>setMobileDirectory(true)}><Layers3 size={18}/></button></div>
          <div className={`viewer ${planning&&start&&destination&&tab==="explore"?"route-shown":""}`} ref={viewer}>
            {activeCampus&&!loading&&<CampusScene campus={activeCampus} layers={layers} selected={planning?null:selected?.id??null} onSelect={select} onMapPoint={planning&&tab==="explore"?onMapPoint:undefined} routeStart={planning&&tab==="explore"?start?.point:undefined} routeDestination={planning&&tab==="explore"?destination?.point:undefined} routePath={planning&&tab==="explore"?route?.points:undefined} view={view} action={action} modelFile={modelFile} onError={showError} onModelError={clearFailedModel} onReady={ready}/>}
            {(loading||!sceneReady)&&!error&&<div className="loading-overlay"><LoaderCircle className="spin" size={28}/><strong>Bringing campus into focus</strong><span>Preparing your 3D view…</span></div>}
            {error&&<div className="error-banner" role="alert"><Info size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError("")}><X size={16}/></button></div>}
            <div className="map-title"><span className="map-kicker">{modelFile?"LOCAL MODEL":"CAMPUS DIGITAL TWIN"}</span><h2>{modelFile?modelFile.name:current.name}</h2><p>{modelFile?"Your geometry. A different perspective.":campus?.subtitle}</p></div>
            <div className="compass" aria-label="North indicator"><span>N</span><Compass size={34} strokeWidth={1.15}/></div>
            <div className="map-controls"><button title="Zoom in" aria-label="Zoom in" onClick={()=>command("zoomIn")}><Plus size={19}/></button><button title="Zoom out" aria-label="Zoom out" onClick={()=>command("zoomOut")}><Minus size={19}/></button><span/><button title="Reset view" aria-label="Reset view" onClick={()=>{setView("perspective");command("reset");}}><RotateCcw size={17}/></button><button title="Fullscreen" aria-label="Toggle fullscreen" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void viewer.current?.requestFullscreen().catch(()=>setError("Fullscreen is unavailable in this browser."));}}><Expand size={17}/></button></div>
            {selected&&!planning&&!modelFile&&<article className="feature-card"><div className="feature-card-top"><span><Building2 size={15}/>BUILDING DETAILS</span><button className="icon-button" aria-label="Close building details" onClick={()=>setSelectedId(null)}><X size={16}/></button></div><h3>{selected.name||"Mapped building"}</h3>{selected.localName&&selected.localName!==selected.name&&<p className="local-name">{selected.localName}</p>}<div className="feature-facts"><div><span>Height {selected.heightEstimated?"(estimated)":"(mapped)"}</span><strong>{selected.height.toFixed(1)}<small> m</small></strong></div><div><span>Footprint</span><strong>{selected.area?.toLocaleString()}<small> m²</small></strong></div></div><p className="height-note">{selected.heightEstimated?"Height inferred from levels, or a 14 m default. Not survey-grade.":"Height supplied by OpenStreetMap contributors."}</p><button className="primary-button" onClick={()=>command("focus")}><Crosshair size={15}/>Focus building</button><a className="osm-link" href={`https://www.openstreetmap.org/${selected.id.split("/").slice(0,2).join("/")}`} target="_blank" rel="noreferrer">View source feature<ArrowUpRight size={12}/></a></article>}
            <div className="map-bottom"><div className="map-legend"><span><i style={{background:"#b7c7cd"}}/>Built environment</span><span><i style={{background:"#92b79d"}}/>Landscape</span><span><i style={{background:"#8abcc6"}}/>Water</span></div><div className="interaction-hint"><MousePointer2 size={13}/>Drag to {view==="top"?"pan":"orbit"}<span>·</span>Scroll to zoom<span>·</span>Click to inspect</div></div>
            <a className="attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
          </div>
          <div className="stats-strip"><div className="stat"><span className="stat-icon"><Building2 size={20}/></span><div><span>Mapped buildings</span><strong>{loading?"—":buildings.length}<small>across this area</small></strong></div></div><div className="stat"><span className="stat-icon green"><Leaf size={20}/></span><div><span>Landscape features</span><strong>{loading?"—":campus?.features.filter(f=>f.kind==="park").length}<small>green spaces</small></strong></div></div><div className="stat"><span className="stat-icon blue"><Move3D size={20}/></span><div><span>Spatial reference</span><strong className="text-stat">WGS 84<small>Real-world coordinates</small></strong></div></div><div className="stat snapshot-stat"><span className="stat-icon"><Layers3 size={20}/></span><div><span>Data snapshot</span><strong className="text-stat">{campus?new Date(campus.fetchedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—"}<small>Not live sensor data</small></strong></div></div></div>
        </section>
      </main>
      <footer className="page-footer"><span>Connected places. New possibilities.</span><span>Next.js <i/> Three.js <button onClick={()=>setInfo(true)}>About the data<ArrowUpRight size={12}/></button></span></footer>
    </div>
    <input ref={upload} className="hidden-input" type="file" accept=".stl,.glb" aria-label="Upload 3D model" onChange={e=>{chooseModel(e.target.files?.[0]);e.target.value="";}}/>
    {info&&<div className="modal-backdrop" onClick={()=>setInfo(false)}><section className="info-modal" role="dialog" aria-modal="true" aria-labelledby="about-title" onClick={e=>e.stopPropagation()}><div className="modal-heading"><Layers3 size={23}/><button className="icon-button" aria-label="Close about dialog" onClick={()=>setInfo(false)}><X size={20}/></button></div><div className="eyebrow">A SHARED VIEW OF PLACE</div><h2 id="about-title">Welcome to Campus Atlas.</h2><p>A geographic digital twin of Hong Kong Science Park and the CUHK campus, built with Next.js and Three.js.</p><h3>Real geography. Honest detail.</h3><p>Buildings, roads, green spaces and water are snapshots from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, licensed under ODbL. Heights use mapped values where available, otherwise building levels × 3.5 m or a 14 m default. The snapshot does not model terrain elevation, complex multipolygon holes or unclosed rings.</p><h3>Your own models</h3><p>Open local STL or self-contained GLB files from My models. Files are processed on your device, never uploaded. There is no live telemetry, scan backend or print dispatch connected.</p><div className="modal-links"><a href="https://github.com/1155194577/py-touch-mapper-hk" target="_blank" rel="noreferrer">Map project<ArrowUpRight size={14}/></a><a href="https://github.com/1155194577/3d-print" target="_blank" rel="noreferrer">3D print project<ArrowUpRight size={14}/></a></div><button className="primary-button" onClick={()=>setInfo(false)}>Explore the campus<ChevronRight size={15}/></button></section></div>}
  </div>;
}
