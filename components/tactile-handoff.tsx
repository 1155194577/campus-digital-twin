import { useState } from "react";

export default function TactileHandoff({ bounds, command, onExport }: { bounds: string; command: string; onExport: () => void }) {
  const [feedback, setFeedback] = useState("");
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(`${label} copied.`);
    } catch {
      setFeedback(`Copy was blocked. Select the ${label.toLowerCase()} field and copy it manually.`);
    }
  }
  return <section className="tactile-handoff" aria-label="Tactile map handoff">
    <p>Run this command in <a href="https://github.com/1155194577/py-touch-mapper-hk#readme" target="_blank" rel="noreferrer">Touch Mapper</a> with a new output directory. It recreates the area from OpenStreetMap and requests Hong Kong tactile guide paths where available; it does not print the planned route line or endpoint markers.</p>
    <div className="tactile-field">
      <label>Bounds (west south east north)<input readOnly value={bounds} onFocus={e=>e.target.select()}/></label>
      <button className="secondary-button" type="button" onClick={()=>void copy(bounds, "Bounds")}>Copy bounds</button>
    </div>
    <div className="tactile-field">
      <label>Touch Mapper command<input readOnly value={command} onFocus={e=>e.target.select()}/></label>
      <button className="secondary-button" type="button" onClick={()=>void copy(command, "Command")}>Copy command</button>
    </div>
    <button className="secondary-button" type="button" onClick={onExport}>Export area GeoJSON</button>
    <p>GeoJSON contains mapped lines and complete footprints in this area, plus any planned endpoints and mapped path. Footprints that cross the boundary are omitted.</p>
    <span role="status">{feedback}</span>
  </section>;
}
