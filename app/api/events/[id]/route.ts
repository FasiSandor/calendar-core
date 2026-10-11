import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";
import {CalendarEventInput,eventRow} from "@/lib/events";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  try{
    const rows=await db()`select * from calendar_core.calendar_events where id=${id} limit 1`;
    if(!rows[0])return NextResponse.json({error:"not_found"},{status:404});
    return NextResponse.json(rows[0]);
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  try{
    const x=await req.json() as CalendarEventInput;
    const r=eventRow(x);
    const rows=await db()`
      update calendar_core.calendar_events set
        title=${r.title}, starts_at=${r.starts_at}, ends_at=${r.ends_at},
        event_date=${r.event_date}, all_day=${r.all_day}, timezone=${r.timezone},
        category=${r.category}, location=${r.location}, note=${r.note},
        source_app=${r.source_app}, source_record_id=${r.source_record_id},
        google_event_id=${r.google_event_id}, dedupe_key=${r.dedupe_key},
        metadata=${JSON.stringify(r.metadata)}::jsonb
      where id=${id} and status='active'
      returning *
    `;
    if(!rows[0])return NextResponse.json({error:"not_found"},{status:404});
    return NextResponse.json(rows[0]);
  }catch(e:any){return NextResponse.json({error:e?.message||"invalid_request"},{status:400})}
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  try{
    const rows=await db()`
      update calendar_core.calendar_events
      set status='deleted',deleted_at=now()
      where id=${id} and status='active'
      returning id
    `;
    if(!rows[0])return NextResponse.json({error:"not_found"},{status:404});
    return new NextResponse(null,{status:204});
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}
