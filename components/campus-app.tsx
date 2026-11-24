"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import { preload } from "react-dom";
import { ArrowDownToLine, ArrowUpRight, Box, Building2, Check, ChevronDown, ChevronRight, Crosshair, Expand, FileBox, Info, Layers3, Leaf, LoaderCircle, Map, MapPin, Minus, MousePointer2, Move3D, Plus, RotateCcw, Search, SlidersHorizontal, Upload, Waves, X } from "lucide-react";
import { partColors } from "@/lib/types";
import type { Campus, Feature, Layers, ModelInfo, UpAxis, ViewMode, ViewerAction } from "@/lib/types";
import PrintComparison from "./print-comparison";

type SceneProps = ComponentProps<typeof import("./campus-scene").default>;
const CampusScene = dynamic(async () => {
  const { default: Scene } = await import("./campus-scene");
  return function SceneWhenReady({ campus, ...props }: Omit<SceneProps, "campus"> & { campus: Campus | null }) {
    return campus ? <Scene campus={campus} {...props}/> : null;
  };
}, { ssr: false });
const formatSize = (value: number) => value.toLocaleString("en-GB", { maximumFractionDigits: value < 100 ? 1 : 0 });
const initialCampusId = "hkstp";
const campuses = [{id:"hkstp",short:"HKSTP",name:"Hong Kong Science Park",tag:"Science & innovation"},{id:"cuhk",short:"CUHK",name:"The Chinese University of Hong Kong",tag:"Education & research"}];
const layerOptions = [{key:"building",name:"Buildings",icon:Building2,color:"#b7c7cd"},{key:"road",name:"Roads & pathways",icon:Map,color:"#c2c9c3"},{key:"park",name:"Green spaces",icon:Leaf,color:"#92b79d"},{key:"water",name:"Water bodies",icon:Waves,color:"#8abcc6"}] as const;

function normalizeBuildingName(name: string) {
  return name.normalize("NFKC").toLowerCase().replace(/['‘’ʼ.]/g,"").replace(/[\p{P}\s]+/gu," ").trim();
}

export default function CampusApp() {
  preload(`/data/${initialCampusId}.json`, { as: "fetch", crossOrigin: "anonymous" });
  const [campusId,setCampusId]=useState(initialCampusId);
  const [campus,setCampus]=useState<Campus|null>(null);
  const [loading,setLoading]=useState(true);
  const [sceneReady,setSceneReady]=useState(false);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [selected,setSelected]=useState<Feature|null>(null);
  const [layers,setLayers]=useState<Layers>({building:true,road:true,park:true,water:true});
  const [view,setView]=useState<ViewMode>("perspective");
  const [comparePrint,setComparePrint]=useState(false);
  const [action,setAction]=useState<ViewerAction|null>(null);
  const [tab,setTab]=useState<"explore"|"models">("explore");
  const [modelFiles,setModelFiles]=useState<File[]>([]);
  const [dragging,setDragging]=useState(false);
  const [modelInfo,setModelInfo]=useState<ModelInfo|null>(null);
  const [upAxis,setUpAxis]=useState<UpAxis>("z");
  const [mobileDirectory,setMobileDirectory]=useState(false);
  const upload=useRef<HTMLInputElement>(null);
  const viewer=useRef<HTMLDivElement>(null);
  const directoryToggle=useRef<HTMLButtonElement>(null);
  const aboutDialog=useRef<HTMLDialogElement>(null);
  const search=useRef<HTMLInputElement>(null);
  const detailsHeading=useRef<HTMLHeadingElement>(null);
  const detailsTrigger=useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{
    const controller=new AbortController();
    setCampus(null);setLoading(true);setSceneReady(false);setError("");setSelected(null);setQuery("");setModelFiles([]);setAction(null);
    fetch(`/data/${campusId}.json`,{signal:controller.signal}).then(r=>{if(!r.ok)throw new Error("Campus data could not be loaded. Please try again.");return r.json();}).then(data=>{setCampus(data);setLoading(false);}).catch(e=>{if(e.name!=="AbortError"){setError(e.message);setLoading(false);}});
    return ()=>controller.abort();
  },[campusId]);
  const buildings=useMemo(()=>campus?.features.filter(f=>f.kind==="building")??[],[campus]);
  const named=useMemo(()=>buildings.filter(f=>f.name).sort((a,b)=>a.name.localeCompare(b.name)),[buildings]);
  const footprintsByName=useMemo(()=>{
    const groups=new globalThis.Map<string,Feature[]>();
    for(const feature of named) {
      const group=groups.get(feature.name);
      if(group)group.push(feature);
      else groups.set(feature.name,[feature]);
    }
    return groups;
  },[named]);
  const filtered=useMemo(()=>{
    const search=normalizeBuildingName(query);
    return named.filter(f=>normalizeBuildingName(`${f.name} ${f.localName??""}`).includes(search));
  },[named,query]);
  const ready=useCallback(()=>setSceneReady(true),[]);
  const showError=useCallback((message:string)=>{setError(message);setSceneReady(true);},[]);
  const clearFailedModel=useCallback(()=>setModelFiles([]),[]);
  const select=useCallback((feature:Feature|null)=>{detailsTrigger.current=null;setSelected(feature);setMobileDirectory(false);},[]);
  const showInfo=()=>aboutDialog.current?.showModal();
  const closeInfo=()=>aboutDialog.current?.close();
  const closeDetails=()=>{
    setSelected(null);
    const trigger=detailsTrigger.current;
    if (trigger) (trigger.getClientRects().length ? trigger : directoryToggle.current)?.focus();
    detailsTrigger.current=null;
  };
  useEffect(()=>{
    if (selected && detailsTrigger.current) detailsHeading.current?.focus();
  },[selected]);
  const command=(type:ViewerAction["type"])=>{
    if(type==="focus")setView("perspective");
    setAction({type,at:Date.now()});
  };
  const chooseModels=(list?:FileList|null)=>{
    const files=Array.from(list??[]);
    if(!files.length)return;
    if(files.some(file=>!/\.(stl|glb)$/i.test(file.name))){setError("Please choose STL or self-contained GLB models.");return;}
    if(files.length>1&&files.some(file=>/\.glb$/i.test(file.name))){setError("Open one GLB at a time; several STL parts can be opened together.");return;}
    if(files.reduce((total,file)=>total+file.size,0)>50*1024*1024){setError("This model is too large. Please choose files smaller than 50 MB in total.");return;}
    setError("");setSelected(null);setUpAxis(/\.stl$/i.test(files[0].name)?"z":"y");setModelFiles(files);setModelInfo(null);setSceneReady(false);setTab("models");
  };
  const removeModel=(file:File)=>{setModelFiles(files=>files.filter(item=>item!==file));setError("");};
  const modelName=modelFiles.length>1?`${modelFiles.length} parts`:modelFiles[0]?.name;
  const exportData=()=>{
    if(!campus)return;
    const file=new Blob([JSON.stringify({type:"FeatureCollection",attribution:"© OpenStreetMap contributors (ODbL)",snapshot:campus.fetchedAt,features:campus.features.map(f=>({type:"Feature",id:f.id,properties:{name:f.name,kind:f.kind,height:f.height,heightEstimated:f.heightEstimated},geometry:{type:f.kind==="road"?"LineString":"Polygon",coordinates:f.kind==="road"?f.points.map(p=>[p[0]/(111320*Math.cos(campus.center[0]*Math.PI/180))+campus.center[1],campus.center[0]-p[1]/111320]):[f.points.map(p=>[p[0]/(111320*Math.cos(campus.center[0]*Math.PI/180))+campus.center[1],campus.center[0]-p[1]/111320])]}}))})],{type:"application/geo+json"});
    const url=URL.createObjectURL(file);const link=document.createElement("a");link.href=url;link.download=`${campus.id}-campus.geojson`;link.click();URL.revokeObjectURL(url);
  };
  const current=campuses.find(c=>c.id===campusId)!;
  const printMode=comparePrint&&tab==="explore";
  const showPrint=printMode&&campus&&!loading;
  return <div className="app-shell">
    <a className="skip-to-map" href="#map-view">Skip to map controls</a>
    <aside className="rail" aria-label="Main navigation">
      <Link className="brand-mark" href="/" aria-label="Campus Atlas home"><Layers3 size={25}/></Link>
      <div className="rail-divider"/>
      <button className={tab==="explore"?"rail-button active":"rail-button"} title="Campus explorer" aria-label="Campus explorer" aria-pressed={tab==="explore"} onClick={()=>{setTab("explore");setModelFiles([]);}}><Map size={21}/></button>
      <button className={tab==="models"?"rail-button active":"rail-button"} title="3D model viewer" aria-label="3D model viewer" aria-pressed={tab==="models"} onClick={()=>setTab("models")}><Box size={21}/></button>
      <button className="rail-button rail-bottom" title="About this twin" aria-label="About this twin" onClick={showInfo}><Info size={20}/></button>
      <div className="avatar">CA</div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <div className="identity"><strong>Campus Atlas<span className="beta">BETA</span></strong><span className="topbar-divider"/><span className="product-label">Digital twin workspace</span></div>
        <div className="topbar-actions"><span className="snapshot-pill"><span/>Geographic snapshot</span><button className="icon-button" aria-label="About data sources" onClick={showInfo}><Info size={18}/></button><a className="github-link" href="https://github.com/1155194577/py-touch-mapper-hk" target="_blank" rel="noreferrer">Project sources<ArrowUpRight size={14}/></a></div>
      </header>
      <main>
      <div className="page-heading"><div><div className="eyebrow">YOUR CAMPUS, IN CONTEXT</div><h1>{tab==="explore"?"A new perspective on campus.":"Bring your models into view."}</h1><p>{tab==="explore"?"Explore the places, buildings and spaces that connect us.":"Inspect a scan or printable model, right in your browser."}</p></div><button className="secondary-button export-button" onClick={exportData} disabled={!campus||loading}><ArrowDownToLine size={16}/>Export map data</button></div>
      <div className="main-workspace">
        <section className={`directory ${mobileDirectory?"mobile-open":""}`} aria-label="Campus directory">
          <div className="directory-heading"><span className="section-label">WORKSPACE</span><button className="icon-button mobile-close" onClick={()=>setMobileDirectory(false)} aria-label="Close directory"><X size={17}/></button></div>
          <div className="campus-select"><span className="campus-icon"><Building2 size={21}/></span><div><label htmlFor="campus">Campus location</label><div className="select-wrap"><select id="campus" value={campusId} onChange={e=>setCampusId(e.target.value)} aria-label="Campus location">{campuses.map(c=><option key={c.id} value={c.id}>{c.short} campus</option>)}</select><ChevronDown size={14}/></div></div></div>
          <div className="directory-tabs"><button className={tab==="explore"?"selected":""} aria-pressed={tab==="explore"} onClick={()=>{setTab("explore");setModelFiles([]);}}>Explore campus</button><button className={tab==="models"?"selected":""} aria-pressed={tab==="models"} onClick={()=>setTab("models")}>My models</button></div>
          {tab==="explore"?<>
            <div className="layer-heading"><h2>Map layers</h2><SlidersHorizontal size={15}/></div>
            <div className="layers">{layerOptions.map(({key,name,icon:Icon,color})=><label className="layer-row" key={key}><span className="layer-symbol" style={{color}}><Icon size={17}/></span><span>{name}</span><input type="checkbox" checked={layers[key]} onChange={e=>setLayers({...layers,[key]:e.target.checked})}/><span className="custom-check">{layers[key]&&<Check size={12}/>}</span></label>)}</div>
            <div className="directory-rule"/>
            <div className="layer-heading"><h2>Building directory</h2><span className="count">{named.length}</span></div>
            <div className="search-field"><Search size={15}/><input ref={search} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find a building…" aria-label="Find a building"/>{query&&<button onClick={()=>{setQuery("");search.current?.focus();}} aria-label="Clear search"><X size={13}/></button>}</div>
            <div className="visually-hidden" role="status">{loading?"Loading campus":`${filtered.length} buildings found`}</div>
            <div className="building-list">{loading?<div className="list-message">Loading campus…</div>:filtered.length?filtered.map(f=>{
              const footprints=footprintsByName.get(f.name)??[];
              const sameArea=footprints.filter(other=>other.area===f.area);
              const footprintLabel=footprints.length>1&&(f.area!=null&&sameArea.length===1?`${f.area.toLocaleString()} m²`:`Footprint ${footprints.indexOf(f)+1}`);
              return <button className={`building-row ${selected?.id===f.id?"selected":""}`} key={f.id} aria-expanded={selected?.id===f.id} onClick={e=>{setLayers(l=>({...l,building:true}));select(f);if(e.detail===0){detailsTrigger.current=e.currentTarget;if(selected?.id===f.id)detailsHeading.current?.focus();}}}><span className="building-icon"><Building2 size={16}/></span><span><strong>{f.name}</strong><small>{f.category==="yes"?"Campus building":f.category.replaceAll("_"," ")}{footprintLabel&&<span style={{textTransform:"none"}}> · {footprintLabel}</span>}</small></span><ChevronRight size={13}/></button>;
            }):<div className="list-message">No buildings found. Try another name.</div>}</div>
          </>:<div className="model-panel"><div className="model-art"><FileBox size={40} strokeWidth={1.2}/></div><h2>Your models, a closer look.</h2><p>Open a scanned object or printable model to orbit, zoom and inspect it in 3D.</p><button className="primary-button" onClick={()=>upload.current?.click()}><Upload size={15}/>Open 3D model</button><small>STL or self-contained GLB · up to 50 MB · or drop files on the viewer</small><small>Select several STL parts (e.g. map-ways + map-rest) to view them together.</small>{modelFiles.map(file=><div className="loaded-model" key={file.name+file.lastModified}><FileBox size={17}/><span>{file.name}<small>{(file.size/1024/1024).toFixed(2)} MB · Local file</small></span><button className="icon-button" onClick={()=>removeModel(file)} aria-label={`Remove ${file.name}`}><X size={15}/></button></div>)}{modelFiles.length>0&&<div className="axis-setting"><div className="axis-heading"><span>Up axis</span><div className="view-switch" role="group" aria-label="Model up axis"><button className={upAxis==="z"?"selected":""} aria-pressed={upAxis==="z"} onClick={()=>setUpAxis("z")}>Z up</button><button className={upAxis==="y"?"selected":""} aria-pressed={upAxis==="y"} onClick={()=>setUpAxis("y")}>Y up</button></div></div><p>STL opens Z-up, as slicers expect; GLB opens Y-up, per glTF. Switch if the model lies on its side.</p></div>}<div className="privacy-note"><Check size={14}/>Your model stays on this device.</div></div>}
          <button className="secondary-button mobile-export" onClick={exportData} disabled={!campus||loading}><ArrowDownToLine size={15}/>Export map data</button>
          <div className="directory-footer"><span className="small-dot"/>Built on open geographic data<button onClick={showInfo} aria-label="Read map attribution"><ArrowUpRight size={13}/></button></div>
        </section>
        <section className="map-section" id="map-view" aria-labelledby={showPrint?"print-heading":"map-title"} tabIndex={-1}>
          <div className="map-toolbar">
            <div className="map-breadcrumb"><span className="toolbar-icon"><MapPin size={16}/></span><strong>{modelName??current.short}</strong><ChevronRight size={13}/><span>{modelFiles.length?"Model viewer":printMode?"Print comparison":"Campus overview"}</span></div>
            <div className="view-switch" role="group" aria-label="Map view">
              <button className={!printMode&&view==="perspective"?"selected":""} aria-pressed={!printMode&&view==="perspective"} onClick={()=>{setComparePrint(false);setView("perspective");}}><Box size={14}/>3D</button>
              <button className={!printMode&&view==="top"?"selected":""} aria-pressed={!printMode&&view==="top"} onClick={()=>{setComparePrint(false);setView("top");}}><Map size={14}/>Top</button>
              {tab==="explore"&&<button className={printMode?"selected":""} aria-pressed={printMode} disabled={!campus||loading} onClick={()=>setComparePrint(true)}>Compare print</button>}
            </div>
            <button ref={directoryToggle} className="icon-button mobile-directory-toggle" aria-label="Open campus directory" onClick={()=>setMobileDirectory(true)}><Layers3 size={18}/></button>
          </div>
          <div className={dragging?"viewer dragging":"viewer"} ref={viewer} onDragOver={e=>{if(!e.dataTransfer.types.includes("Files"))return;e.preventDefault();setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);chooseModels(e.dataTransfer.files);}}>
            {showPrint&&<PrintComparison campus={campus} layers={layers} selected={selected}/>}
            <div className="campus-map-view" hidden={Boolean(showPrint)} onDragOver={e=>{if(!e.dataTransfer.types.includes("Files"))return;e.preventDefault();setDragging(true);}} onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null))setDragging(false);}} onDrop={e=>{e.preventDefault();setDragging(false);chooseModels(e.dataTransfer.files);}}>
            <CampusScene campus={loading ? null : campus} layers={layers} selected={selected?.id??null} onSelect={select} view={view} action={action} modelFiles={modelFiles} upAxis={upAxis} active={!showPrint} onError={showError} onModelError={clearFailedModel} onReady={ready} onModelInfo={setModelInfo}/>
            {(loading||!sceneReady)&&!error&&<div className="loading-overlay" role="status"><LoaderCircle className="spin" size={28}/><strong>{modelFiles.length?"Opening your model":"Bringing campus into focus"}</strong><span>Preparing your 3D view…</span></div>}
            {error&&<div className="error-banner" role="alert"><Info size={17}/><span>{error}</span><button aria-label="Dismiss error" onClick={()=>setError("")}><X size={16}/></button></div>}
            <div className="map-title"><span className="map-kicker">{modelFiles.length?"LOCAL MODEL":"CAMPUS DIGITAL TWIN"}</span><h2 id="map-title">{modelName??current.name}</h2><p>{modelFiles.length?"Your geometry. A different perspective.":campus?.subtitle}</p></div>
            <div className="map-controls"><button title="Zoom in" aria-label="Zoom in" onClick={()=>command("zoomIn")}><Plus size={19}/></button><button title="Zoom out" aria-label="Zoom out" onClick={()=>command("zoomOut")}><Minus size={19}/></button><span/><button title="Reset view" aria-label="Reset view" onClick={()=>{setView("perspective");command("reset");}}><RotateCcw size={17}/></button><button title="Fullscreen" aria-label="Toggle fullscreen" onClick={()=>{if(document.fullscreenElement)void document.exitFullscreen();else void viewer.current?.requestFullscreen().catch(()=>setError("Fullscreen is unavailable in this browser."));}}><Expand size={17}/></button></div>
            {selected&&!modelFiles.length&&<article className="feature-card"><div className="feature-card-top"><span><Building2 size={15}/>BUILDING DETAILS</span><button className="icon-button" aria-label="Close building details" onClick={closeDetails}><X size={16}/></button></div><h3 ref={detailsHeading} tabIndex={-1}>{selected.name||"Mapped building"}</h3>{selected.localName&&selected.localName!==selected.name&&<p className="local-name">{selected.localName}</p>}<div className="feature-facts"><div><span>Height {selected.heightEstimated?"(estimated)":"(mapped)"}</span><strong>{selected.height.toFixed(1)}<small> m</small></strong></div><div><span>Footprint</span><strong>{selected.area?.toLocaleString()}<small> m²</small></strong></div></div><p className="height-note">{selected.heightEstimated?"Height inferred from levels, or a 14 m default. Not survey-grade.":"Height supplied by OpenStreetMap contributors."}</p><button className="primary-button" onClick={()=>command("focus")}><Crosshair size={15}/>Focus building</button><a className="osm-link" href={`https://www.openstreetmap.org/${selected.id.split("/").slice(0,2).join("/")}`} target="_blank" rel="noreferrer">View source feature<ArrowUpRight size={12}/></a></article>}
            <p className="scene-keyboard-help" id="scene-keyboard-help">Arrow keys pan. {view==="perspective"&&"Shift + arrow keys orbit. "}Tab to the zoom and reset controls.</p>
            <div className="map-bottom">{modelFiles.length?(modelFiles.length>1?<div className="map-legend">{modelFiles.map((file,index)=><span key={file.name+file.lastModified}><i style={{background:partColors[index%partColors.length]}}/>{file.name}</span>)}</div>:<span/>):<div className="map-legend"><span><i style={{background:"#b7c7cd"}}/>Built environment</span><span><i style={{background:"#92b79d"}}/>Landscape</span><span><i style={{background:"#8abcc6"}}/>Water</span></div>}<div className="interaction-hint"><MousePointer2 size={13}/>Drag to orbit<span>·</span>Scroll to zoom{!modelFiles.length&&<><span>·</span>Click to inspect</>}</div></div>
            <a className="attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>
            </div>
          </div>
          <div className="stats-strip">{modelFiles.length?(modelInfo?<><div className="stat"><span className="stat-icon"><Box size={20}/></span><div><span>Model parts</span><strong>{modelInfo.parts}<small>{modelInfo.parts===1?"single mesh":"shared origin"}</small></strong></div></div><div className="stat"><span className="stat-icon green"><Layers3 size={20}/></span><div><span>Triangles</span><strong>{modelInfo.triangles.toLocaleString("en-GB")}<small>surface faces</small></strong></div></div><div className="stat"><span className="stat-icon blue"><Move3D size={20}/></span><div><span>Size · width × depth × height</span><strong className="text-stat">{modelInfo.size.map(formatSize).join(" × ")}<small>{/\.stl$/i.test(modelFiles[0].name)?"File units · usually mm":"File units · metres in glTF"}</small></strong></div></div><div className="stat snapshot-stat"><span className="stat-icon"><FileBox size={20}/></span><div><span>Up axis</span><strong className="text-stat">{upAxis.toUpperCase()} up<small>{upAxis==="z"?"Print-bed convention":"glTF convention"}</small></strong></div></div></>:<div className="stat"><div><span>Model</span><strong className="text-stat">Measuring…</strong></div></div>):<><div className="stat"><span className="stat-icon"><Building2 size={20}/></span><div><span>Mapped buildings</span><strong>{loading?"—":buildings.length}<small>across this area</small></strong></div></div><div className="stat"><span className="stat-icon green"><Leaf size={20}/></span><div><span>Landscape features</span><strong>{loading?"—":campus?.features.filter(f=>f.kind==="park").length}<small>green spaces</small></strong></div></div><div className="stat"><span className="stat-icon blue"><Move3D size={20}/></span><div><span>Spatial reference</span><strong className="text-stat">WGS 84<small>Real-world coordinates</small></strong></div></div><div className="stat snapshot-stat"><span className="stat-icon"><Layers3 size={20}/></span><div><span>Data snapshot</span><strong className="text-stat">{campus?new Date(campus.fetchedAt).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}):"—"}<small>Not live sensor data</small></strong></div></div></>}</div>
        </section>
      </div>
      </main>
      <footer className="page-footer"><span>Connected places. New possibilities.</span><span>Next.js <i/> Three.js <button onClick={showInfo}>About the data<ArrowUpRight size={12}/></button></span></footer>
    </div>
    <input ref={upload} className="hidden-input" type="file" accept=".stl,.glb" multiple aria-label="Upload 3D model" onChange={e=>{chooseModels(e.target.files);e.target.value="";}}/>
    <dialog ref={aboutDialog} className="modal-backdrop" aria-labelledby="about-title" onClick={e=>{if(e.target===e.currentTarget)closeInfo();}}><section className="info-modal"><div className="modal-heading"><Layers3 size={23}/><button className="icon-button" aria-label="Close about dialog" onClick={closeInfo}><X size={20}/></button></div><div className="eyebrow">A SHARED VIEW OF PLACE</div><h2 id="about-title">Welcome to Campus Atlas.</h2><p>A geographic digital twin of Hong Kong Science Park and the CUHK campus, built with Next.js and Three.js.</p><h3>Real geography. Honest detail.</h3><p>Buildings, roads, green spaces and water are snapshots from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>, licensed under ODbL. Heights use mapped values where available, otherwise building levels × 3.5 m or a 14 m default. Terrain is flat; complex multipolygon holes and unclosed rings are not modeled.</p><h3>Your own models</h3><p>Open local STL or self-contained GLB files from My models. Files are processed on your device, never uploaded. There is no live telemetry, scan backend or print dispatch connected.</p><div className="modal-links"><a href="https://github.com/1155194577/py-touch-mapper-hk" target="_blank" rel="noreferrer">Map project<ArrowUpRight size={14}/></a><a href="https://github.com/1155194577/3d-print" target="_blank" rel="noreferrer">3D print project<ArrowUpRight size={14}/></a></div><button className="primary-button" onClick={closeInfo}>Explore the campus<ChevronRight size={15}/></button></section></dialog>
  </div>;
}
