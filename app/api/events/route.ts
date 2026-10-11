import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";
import {CalendarEventInput,eventRow} from "@/lib/events";

function out(row:any){return row||null}

export async function GET(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const from=req.nextUrl.searchParams.get("from");
    const to=req.nextUrl.searchParams.get("to");
    const sql=db();
    const rows=await sql`
      select *
      from calendar_core.calendar_events
      where status='active'
        and (${from}::timestamptz is null or coalesce(starts_at,event_date::timestamptz) >= ${from}::timestamptz)
        and (${to}::timestamptz is null or coalesce(starts_at,event_date::timestamptz) < ${to}::timestamptz)
      order by coalesce(starts_at,event_date::timestamptz), created_at
    `;
    return NextResponse.json({items:rows});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"database_error"},{status:500});
  }
}

export async function POST(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const x=await req.json() as CalendarEventInput;
    const r=eventRow(x);
    const sql=db();

    if(r.source_app&&r.source_record_id){
      const rows=await sql`
        select * from calendar_core.calendar_events
        where source_app=${r.source_app} and source_record_id=${r.source_record_id} and status='active'
        limit 1
      `;
      if(rows[0]){
        const updated=await sql`
          update calendar_core.calendar_events set
            title=${r.title}, starts_at=${r.starts_at}, ends_at=${r.ends_at},
            event_date=${r.event_date}, all_day=${r.all_day}, timezone=${r.timezone},
            category=${r.category}, location=${r.location}, note=${r.note},
            google_event_id=${r.google_event_id}, dedupe_key=${r.dedupe_key},
            metadata=${JSON.stringify(r.metadata)}::jsonb
          where id=${rows[0].id}
          returning *
        `;
        return NextResponse.json(out(updated[0]),{status:200});
      }
    }

    const dup=await sql`
      select * from calendar_core.calendar_events
      where dedupe_key=${r.dedupe_key} and status='active'
      limit 1
    `;
    if(dup[0])return NextResponse.json({...dup[0],deduplicated:true},{status:200});

    const created=await sql`
      insert into calendar_core.calendar_events
        (title,starts_at,ends_at,event_date,all_day,timezone,category,location,note,source_app,source_record_id,google_event_id,dedupe_key,metadata)
      values
        (${r.title},${r.starts_at},${r.ends_at},${r.event_date},${r.all_day},${r.timezone},${r.category},${r.location},${r.note},${r.source_app},${r.source_record_id},${r.google_event_id},${r.dedupe_key},${JSON.stringify(r.metadata)}::jsonb)
      returning *
    `;

    if(r.source_app&&r.source_record_id){
      await sql`
        insert into calendar_core.calendar_event_sources(event_id,source_app,source_record_id,source_url,source_payload)
        values(${created[0].id},${r.source_app},${r.source_record_id},${x.sourceUrl||null},${JSON.stringify(x.metadata||{})}::jsonb)
        on conflict(source_app,source_record_id) do nothing
      `;
    }
    return NextResponse.json(out(created[0]),{status:201});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"invalid_request"},{status:400});
  }
}
