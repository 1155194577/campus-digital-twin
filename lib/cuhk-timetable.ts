export type Timetable = {
  venues: [name: string, featureId: string | null][];
  rooms: [venue: number, location: string][];
  courses: [code: string, title: string][];
  dates: string[][];
  terms: string[];
  meetings: [room: number, course: number, section: string, term: number, start: number, end: number, dates: number][];
};

export type Meeting = {
  code: string;
  title: string;
  section: string;
  term: string;
  location: string;
  start: number;
  end: number;
};

const hongKongClock = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Hong_Kong", dateStyle: "short", timeStyle: "short", hourCycle: "h23",
});

export function hongKongDateTime(now: Date) {
  const parts = hongKongClock.formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return { date: [part("year"), part("month"), part("day")].join("-"), time: [part("hour"), part("minute")].join(":") };
}

export function formatMinutes(minutes: number) {
  return [Math.floor(minutes / 60), minutes % 60].map(n => String(n).padStart(2, "0")).join(":");
}

export function meetingsByVenue(data: Timetable, date: string, time: string | null) {
  const [hours, minutes] = time?.split(":").map(Number) ?? [];
  const minute = hours * 60 + minutes;
  const matchingDates = data.dates.map(dates => dates.includes(date));
  const groups = new Map<number, Meeting[]>();
  for (const [room, course, section, term, start, end, dates] of data.meetings) {
    if (!matchingDates[dates] || (time !== null && !(start <= minute && minute < end))) continue;
    const [venue, location] = data.rooms[room];
    const [code, title] = data.courses[course];
    const meetings = groups.get(venue) ?? [];
    meetings.push({ code, title, section, term: data.terms[term], location, start, end });
    groups.set(venue, meetings);
  }
  for (const meetings of groups.values()) {
    meetings.sort((a, b) => a.start - b.start || a.code.localeCompare(b.code) || a.section.localeCompare(b.section));
  }
  return groups;
}
