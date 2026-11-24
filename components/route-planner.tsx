import type { WalkingRoute } from "@/lib/walking-route";

export type EndpointSlot = "start" | "destination";

export default function RoutePlanner({ start, destination, choosing, onChoose, onClear, estimate, route }: {
  start: string | null; destination: string | null;
  choosing: EndpointSlot; onChoose: (slot: EndpointSlot) => void; onClear: () => void;
  estimate: number | null; route: WalkingRoute | null;
}) {
  return <section className="route-planner" aria-label="Walking route planner">
    <div className="route-endpoints">
      {([["start", "A", "Start", start], ["destination", "B", "Destination", destination]] as const).map(([slot, marker, label, value]) =>
        <button className="route-endpoint" type="button" key={slot} aria-pressed={choosing === slot} onClick={() => onChoose(slot)}>
          <span className={`route-badge ${slot}`} aria-hidden="true">{marker}</span>
          <span><strong>{label}</strong><span>{value ?? "Not set"}</span></span>
        </button>)}
      <button className="secondary-button" type="button" onClick={onClear} disabled={!start && !destination}>Clear</button>
    </div>
    <p>Choose {choosing === "start" ? "a start" : "a destination"} from the directory or click the map.</p>
    <div className="route-summary" aria-live="polite">
      {estimate !== null && <p><strong>{Math.round(estimate).toLocaleString()} m</strong> straight-line estimate</p>}
      {route ? <>
        <p><strong>{Math.round(route.length).toLocaleString()} m</strong> on mapped paths · {route.steps} mapped stair ways · {route.crossings} mapped crossing features · {route.tactile} features tagged with tactile paving</p>
        {route.offsets.some(offset => offset >= 1) && <p>Endpoint gaps, not included: A {Math.round(route.offsets[0])} m · B {Math.round(route.offsets[1])} m. Connections to the path are not verified.</p>}
      </> : estimate !== null && <p>No connected mapped path found near both points.</p>}
    </div>
    <p className="route-limitations">Mapped data only, verify on site. The snapshot has no terrain or slope model, and may omit steps, crossings or tactile paving. This is not an accessibility-verified route.</p>
  </section>;
}
