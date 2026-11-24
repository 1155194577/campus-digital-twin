"use client";

import { useEffect, useMemo, useState } from "react";
import { formatMinutes, hongKongDateTime, meetingsByVenue, type Timetable } from "@/lib/cuhk-timetable";

const source = "https://github.com/cutopia-labs/cuhk-course-data/tree/427933d410e071917791b246fe1a17012e481e93";

export default function CourseTimetable({ selected, onSelect, onHighlights }: {
  selected: { id: string; name: string } | null;
  onSelect: (featureId: string | null) => void;
  onHighlights: (ids: ReadonlySet<string> | undefined) => void;
}) {
  const [when, setWhen] = useState(() => hongKongDateTime(new Date()));
  const [allDay, setAllDay] = useState(false);
  const [data, setData] = useState<Timetable | null>(null);
  const [failed, setFailed] = useState(false);
  const [unmapped, setUnmapped] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/cuhk-timetable.json", { signal: controller.signal }).then(response => {
      if (!response.ok) throw new Error("Timetable data unavailable");
      return response.json();
    }).then(setData).catch(() => {
      if (!controller.signal.aborted) setFailed(true);
    });
    return () => controller.abort();
  }, []);

  const groups = useMemo(() => data ? meetingsByVenue(data, when.date, allDay ? null : when.time) : null,
    [data, when, allDay]);
  const venues = useMemo(() => data?.venues.map(([name, id], index) => ({ name, id, index }))
    .sort((a, b) => a.name.localeCompare(b.name)) ?? [], [data]);
  const highlights = useMemo(() => new Set(venues.flatMap(({ id, index }) => id && groups?.has(index) ? [id] : [])),
    [venues, groups]);
  useEffect(() => { onHighlights(highlights); }, [highlights, onHighlights]);
  useEffect(() => () => onHighlights(undefined), [onHighlights]);
  useEffect(() => { if (selected) setUnmapped(null); }, [selected]);

  const activeIndex = selected ? venues.find(v => v.id === selected.id)?.index ?? -1 : unmapped;
  const visible = venues.filter(({ index }) => (activeIndex === null || activeIndex === index) && groups?.has(index));
  const activeName = selected?.name ?? venues.find(v => v.index === unmapped)?.name;

  return <section id="cuhk-timetable" className="course-timetable" aria-labelledby="timetable-heading">
    <div className="timetable-heading"><h2 id="timetable-heading">CUHK course timetable</h2><span>Hong Kong time (HKT)</span></div>
    <div className="timetable-controls">
      <label>Date<input type="date" value={when.date} required onChange={e => setWhen({ ...when, date: e.target.value })}/></label>
      <label>Time<input type="time" value={when.time} required disabled={allDay} onChange={e => setWhen({ ...when, time: e.target.value })}/></label>
      <button className="secondary-button" type="button" aria-pressed={allDay} onClick={() => setAllDay(!allDay)}>All day</button>
      <button className="secondary-button" type="button" onClick={() => { setWhen(hongKongDateTime(new Date())); setAllDay(false); }}>Now</button>
      <label>Building or venue<select value={activeIndex ?? ""} disabled={!data} onChange={e => {
        const index = e.target.value === "" ? null : Number(e.target.value);
        const id = index === null ? null : data?.venues[index][1] ?? null;
        onSelect(id);
        setUnmapped(id ? null : index);
      }}>
        <option value="">All buildings and venues</option>
        {activeIndex === -1 && <option value={-1}>{activeName} — no timetable venue</option>}
        {venues.map(({ name, id, index }) => <option key={index} value={index}>{name}{id ? "" : " (not mapped)"}</option>)}
      </select></label>
    </div>
    <p className="timetable-status" role="status">{failed ? "The timetable could not be loaded. Close and reopen it to retry." : !data ? "Loading timetable…" :
      !when.date || (!allDay && !when.time) ? "Choose a date and time, or select All day." :
      visible.length ? `${visible.length} ${visible.length === 1 ? "venue" : "venues"} with scheduled classes` :
      `No classes listed ${activeName ? `at ${activeName} ` : ""}for this ${allDay ? "date" : "date and time"}.`}</p>
    {visible.length > 0 && <div className="timetable-results">
      {visible.map(({ name, index, id }) => <details key={index} open={activeIndex === index}>
        <summary>{name} <span>{groups?.get(index)?.length} classes{id ? "" : " · not mapped"}</span></summary>
        {id && activeIndex !== index && <button className="secondary-button" type="button" onClick={() => onSelect(id)}>Select on map</button>}
        <ul>{groups?.get(index)?.map(({ code, title, section, term, location, start, end }) =>
          <li key={JSON.stringify([code, section, term, location, start, end])}>
            <strong>{code} · {title}</strong>
            <span>{formatMinutes(start)}–{formatMinutes(end)} · {section} · {location}</span>
            <small>{term}</small>
          </li>)}</ul>
      </details>)}
    </div>}
    <p className="timetable-note">Teal buildings have listed classes. <a href={source} target="_blank" rel="noreferrer">CUHK course-data snapshot</a> · Not live; verify rooms and dates with CUHK.</p>
  </section>;
}
