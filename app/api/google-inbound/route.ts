import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";

type Change={
  googleEventId:string;
  calendarCoreId?:string;
  status?:"confirmed"|"cancelled";
  title?:string;
  start?:{date?:string;dateTime?:string};
  end?:{date?:string;dateTime?:string};
  location?:string;
  description?:string;
  updated?:string;
};

export async function POST(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  let change:Change;
  try{change=await req.json()}catch{return NextResponse.json({error:"invalid_json"},{status:400})}
  const googleId=typeof change?.googleEventId==="string"?change.googleEventId.trim():"";
  if(!googleId||googleId.length>1024)return NextResponse.json({error:"invalid_google_id"},{status:400});
  if(change.status!=="confirmed"&&change.status!=="cancelled")return NextResponse.json({error:"invalid_status"},{status:400});
  try{
    const sql=db();
    // Only touch events already linked to this exact Google ID. Unknown calendar
    // events are deliberately not imported, to avoid duplicating app events.
    const matches=await sql`
      select e.*,l.external_id,l.sync_state
      from calendar_core.calendar_events e
      join calendar_core.calendar_sync_links l on l.event_id=e.id and l.provider='google'
      where l.external_id=${googleId} and e.google_event_id=${googleId}
      limit 2
    `;
    if(matches.length!==1)return NextResponse.json({ok:true,ignored:matches.length?"ambiguous_link":"not_linked"});
    const current=matches[0];
    if(change.calendarCoreId&&change.calendarCoreId!==String(current.id))
      return NextResponse.json({error:"identity_mismatch"},{status:409});
    if(current.status!=="active"||current.sync_state==="delete_error"||current.sync_state==="deleted")
      return NextResponse.json({ok:true,ignored:"deletion_pending_or_inactive"});
    const stamp=change.updated?new Date(change.updated):null;
    if(stamp&&Number.isNaN(stamp.getTime()))return NextResponse.json({error:"invalid_updated"},{status:400});
    const previous=typeof current.metadata?.google_inbound_updated==="string"
      ?new Date(current.metadata.google_inbound_updated):null;
    if(stamp&&previous&&!Number.isNaN(previous.getTime())&&stamp.getTime()<=previous.getTime())
      return NextResponse.json({ok:true,ignored:"stale_change"});
    if(change.status==="cancelled"){
      await sql`
        update calendar_core.calendar_events
        set status='deleted',deleted_at=now(),updated_at=now(),version=version+1,
          metadata=coalesce(metadata,'{}'::jsonb)||${JSON.stringify({google_inbound_updated:stamp?.toISOString()||new Date().toISOString(),google_deleted:true})}::jsonb
        where id=${current.id} and status='active'
      `;
      await sql`
        update calendar_core.calendar_sync_links set sync_state='deleted',updated_at=now()
        where event_id=${current.id} and provider='google'
      `;
      return NextResponse.json({ok:true,deleted:true});
    }
    const allDay=!!change.start?.date;
    const startAt=allDay?null:change.start?.dateTime;
    const endAt=allDay?null:change.end?.dateTime;
    const day=allDay?change.start?.date:null;
    if(allDay?!/^\\d{4}-\\d{2}-\\d{2}$/.test(day||""):(!startAt||!endAt||
      !Number.isFinite(Date.parse(startAt))||!Number.isFinite(Date.parse(endAt))||
      Date.parse(endAt)<=Date.parse(startAt)))
      return NextResponse.json({error:"invalid_event_time"},{status:400});
    const title=typeof change.title==="string"?change.title.slice(0,500):String(current.title);
    const location=typeof change.location==="string"?change.location.slice(0,1000):String(current.location||"");
    const note=typeof change.description==="string"?change.description.slice(0,4000):String(current.note||"");
    await sql`
      update calendar_core.calendar_events
      set title=${title},location=${location},note=${note},all_day=${allDay},
        event_date=${day},starts_at=${startAt},ends_at=${endAt},
        metadata=coalesce(metadata,'{}'::jsonb)||${JSON.stringify({google_inbound_updated:stamp?.toISOString()||new Date().toISOString()})}::jsonb,
        updated_at=now(),version=version+1
      where id=${current.id} and status='active'
    `;
    await sql`
      update calendar_core.calendar_sync_links set sync_state='linked',last_synced_at=now(),updated_at=now()
      where event_id=${current.id} and provider='google'
    `;
    return NextResponse.json({ok:true,updated:true});
  }catch(e:any){return NextResponse.json({error:"inbound_sync_failed"},{status:500})}
}
