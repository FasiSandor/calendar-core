import {createHash} from "node:crypto";

export type CalendarEventInput={
  title:string;
  startsAt?:string|null;
  endsAt?:string|null;
  date?:string|null;
  allDay?:boolean;
  timezone?:string;
  category?:string|null;
  location?:string|null;
  note?:string|null;
  sourceApp?:string|null;
  sourceRecordId?:string|null;
  sourceUrl?:string|null;
  googleEventId?:string|null;
  metadata?:Record<string,unknown>|null;
};

export function normalizeText(v?:string|null){
  return (v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("hu-HU").replace(/[^a-z0-9]+/g," ").trim();
}

export function dedupeKey(x:CalendarEventInput){
  const time=x.allDay?"allday":(x.startsAt||"").slice(0,16);
  const raw=[x.date||"",time,normalizeText(x.title),normalizeText(x.location)].join("|");
  return createHash("sha256").update(raw).digest("hex");
}

export function eventRow(x:CalendarEventInput){
  const timezone=x.timezone||"Europe/Budapest";
  const allDay=!!x.allDay;
  if(!x.title?.trim())throw new Error("missing_title");
  if(allDay&&!x.date)throw new Error("missing_date");
  if(!allDay&&(!x.startsAt||!x.endsAt))throw new Error("missing_time");
  if(!allDay&&new Date(x.endsAt!).getTime()<=new Date(x.startsAt!).getTime())throw new Error("invalid_time_range");

  return {
    title:x.title.trim(),
    starts_at:allDay?null:x.startsAt,
    ends_at:allDay?null:x.endsAt,
    event_date:allDay?x.date:null,
    all_day:allDay,
    timezone,
    category:x.category||"work",
    location:x.location||"",
    note:x.note||"",
    source_app:x.sourceApp||null,
    source_record_id:x.sourceRecordId||null,
    google_event_id:x.googleEventId||null,
    dedupe_key:dedupeKey(x),
    metadata:x.metadata||{}
  };
}
