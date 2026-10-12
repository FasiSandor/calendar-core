import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";
import {CalendarEventInput,eventRow} from "@/lib/events";
import {googleUpsert,googleDelete} from "@/lib/google-sync";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  try{
    const rows=await db()`select * from calendar_core.calendar_events where id=${id} limit 1`;
    if(!rows[0])return NextResponse.json({error:"not_found"},{status:404});
    const g:any=await googleUpsert(rows[0]);
    if(g?.ok&&g.google_event_id){
      const synced=await db()`
        update calendar_core.calendar_events set google_event_id=${String(g.google_event_id)},updated_at=now()
        where id=${rows[0].id} returning *
      `;
      await db()`
        insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
        values(${rows[0].id},'google',${String(g.google_event_id)},'primary',now(),'linked',
          ${JSON.stringify({account_email:g.account_email||null,html_link:g.html_link||null})}::jsonb,now())
        on conflict(event_id,provider) do update set
          external_id=excluded.external_id,last_synced_at=now(),sync_state='linked',metadata=excluded.metadata,updated_at=now()
      `;
      return NextResponse.json(synced[0]||rows[0]);
    }
    await db()`
      insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
      values(${rows[0].id},'google',${String(rows[0].google_event_id||("pending:"+rows[0].id))},'primary',null,'error',
        ${JSON.stringify({error:g?.error||"google_sync_failed"})}::jsonb,now())
      on conflict(event_id,provider) do update set sync_state='error',metadata=excluded.metadata,updated_at=now()
    `;
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
        metadata=${JSON.stringify(r.metadata)}::jsonb,
        updated_at=now(),
        version=version+1
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
    const sql=db();
    const current=await sql`select * from calendar_core.calendar_events where id=${id} and status='active' limit 1`;
    if(!current[0])return NextResponse.json({error:"not_found"},{status:404});
    const g:any=await googleDelete(String(id),current[0].google_event_id||null);
    const rows=await sql`
      update calendar_core.calendar_events
      set status='deleted',deleted_at=now(),updated_at=now(),version=version+1
      where id=${id} and status='active'
      returning id
    `;
    if(!rows[0])return NextResponse.json({error:"not_found"},{status:404});
    if(g?.ok){
      await sql`update calendar_core.calendar_sync_links set sync_state='deleted',updated_at=now() where event_id=${id} and provider='google'`;
    }else{
      await sql`
        insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
        values(${id},'google',${String(current[0].google_event_id||("pending:"+id))},'primary',null,'delete_error',
          ${JSON.stringify({error:g?.error||"google_delete_failed"})}::jsonb,now())
        on conflict(event_id,provider) do update set sync_state='delete_error',metadata=excluded.metadata,updated_at=now()
      `;
    }
    return new NextResponse(null,{status:204});
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}
