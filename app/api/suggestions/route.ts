import {NextRequest,NextResponse} from "next/server";
import {createHash} from "crypto";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";
import {googleUpsert} from "@/lib/google-sync";

function clean(v:any,max=4000){return String(v??"").trim().slice(0,max)}
function contentKey(x:any){
  return createHash("sha256").update([
    x.event_date||"",
    x.starts_at||"",
    clean(x.title).toLowerCase(),
    clean(x.location).toLowerCase()
  ].join("|")).digest("hex");
}

export async function GET(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const sql=db();
    const rows=await sql`
      select * from calendar_core.calendar_suggestions
      where status='pending'
      order by created_at desc
      limit 50
    `;
    return NextResponse.json({items:rows});
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}

export async function POST(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const x=await req.json();
    const sourceApp=clean(x.sourceApp,120),sourceRecordId=clean(x.sourceRecordId,300),title=clean(x.title,500);
    if(!sourceApp||!sourceRecordId||!title)return NextResponse.json({error:"missing_fields"},{status:400});
    const allDay=!!x.allDay;
    const eventDate=allDay?clean(x.date,10)||null:null;
    const startsAt=!allDay&&x.startsAt?new Date(x.startsAt).toISOString():null;
    const endsAt=!allDay&&x.endsAt?new Date(x.endsAt).toISOString():null;
    if(allDay&&!/^\d{4}-\d{2}-\d{2}$/.test(eventDate||""))return NextResponse.json({error:"invalid_date"},{status:400});
    if(!allDay&&!startsAt)return NextResponse.json({error:"invalid_start"},{status:400});
    const confidence=x.confidence==="probable"?"probable":"uncertain";
    const sql=db();
    const rows=await sql`
      insert into calendar_core.calendar_suggestions
        (source_app,source_record_id,source_url,title,summary,event_date,starts_at,ends_at,all_day,timezone,location,confidence,payload)
      values(
        ${sourceApp},${sourceRecordId},${clean(x.sourceUrl,1200)||null},${title},${clean(x.summary)||null},
        ${eventDate},${startsAt},${endsAt},${allDay},${clean(x.timezone,80)||"Europe/Budapest"},
        ${clean(x.location,500)||null},${confidence},${JSON.stringify(x.payload||{})}::jsonb
      )
      on conflict(source_app,source_record_id) do update set
        source_url=excluded.source_url,title=excluded.title,summary=excluded.summary,event_date=excluded.event_date,
        starts_at=excluded.starts_at,ends_at=excluded.ends_at,all_day=excluded.all_day,timezone=excluded.timezone,
        location=excluded.location,confidence=excluded.confidence,payload=excluded.payload
      returning *
    `;
    return NextResponse.json(rows[0],{status:201});
  }catch(e:any){return NextResponse.json({error:e?.message||"invalid_request"},{status:400})}
}

export async function PATCH(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const id=req.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({error:"missing_id"},{status:400});
  try{
    const body=await req.json();
    const action=body?.action;
    const sql=db();
    const found=await sql`select * from calendar_core.calendar_suggestions where id=${id} limit 1`;
    const s:any=found[0];
    if(!s)return NextResponse.json({error:"not_found"},{status:404});
    if(s.status!=="pending")return NextResponse.json({suggestion:s,alreadyDecided:true});

    if(action==="reject"){
      const rows=await sql`
        update calendar_core.calendar_suggestions set status='rejected',decided_at=now()
        where id=${id} returning *
      `;
      return NextResponse.json({suggestion:rows[0]});
    }
    if(action!=="accept")return NextResponse.json({error:"invalid_action"},{status:400});

    let endsAt=s.ends_at;
    if(!s.all_day&&!endsAt)endsAt=new Date(new Date(s.starts_at).getTime()+60*60*1000).toISOString();
    const key=contentKey(s);
    const exact=await sql`
      select * from calendar_core.calendar_events
      where source_app=${s.source_app} and source_record_id=${s.source_record_id} and status='active'
      limit 1
    `;
    let event:any=exact[0];
    if(!event){
      const dup=await sql`
        select * from calendar_core.calendar_events where dedupe_key=${key} and status='active' limit 1
      `;
      event=dup[0];
    }
    if(!event){
      const requestedCategory=String(s.payload?.category||"");
      const category=["work","personal","family","sport"].includes(requestedCategory)
        ?requestedCategory
        :(s.source_app==="watch"?"work":"personal");
      const created=await sql`
        insert into calendar_core.calendar_events
          (title,starts_at,ends_at,event_date,all_day,timezone,category,location,note,source_app,source_record_id,dedupe_key,metadata)
        values(
          ${s.title},${s.all_day?null:s.starts_at},${s.all_day?null:endsAt},${s.all_day?s.event_date:null},
          ${s.all_day},${s.timezone||"Europe/Budapest"},${category},${s.location||""},${s.summary||""},
          ${s.source_app},${s.source_record_id},${key},
          ${JSON.stringify({suggestionId:id,sourceUrl:s.source_url,...(s.payload||{})})}::jsonb
        )
        returning *
      `;
      event=created[0];
    }
    await sql`
      insert into calendar_core.calendar_event_sources(event_id,source_app,source_record_id,source_url,source_payload)
      values(${event.id},${s.source_app},${s.source_record_id},${s.source_url},${JSON.stringify(s.payload||{})}::jsonb)
      on conflict(source_app,source_record_id) do update set event_id=excluded.event_id,source_url=excluded.source_url,source_payload=excluded.source_payload
    `;
    const g:any=await googleUpsert(event);
    if(g?.ok&&g.google_event_id){
      const synced=await sql`
        update calendar_core.calendar_events
        set google_event_id=${String(g.google_event_id)},updated_at=now()
        where id=${event.id}
        returning *
      `;
      event=synced[0]||event;
      await sql`
        insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
        values(${event.id},'google',${String(g.google_event_id)},'primary',now(),'linked',
          ${JSON.stringify({account_email:g.account_email||null,html_link:g.html_link||null})}::jsonb,now())
        on conflict(event_id,provider) do update set
          external_id=excluded.external_id,last_synced_at=now(),sync_state='linked',metadata=excluded.metadata,updated_at=now()
      `;
    }else{
      await sql`
        insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
        values(${event.id},'google',${String(event.google_event_id||("pending:"+event.id))},'primary',null,'error',
          ${JSON.stringify({error:g?.error||"google_sync_failed"})}::jsonb,now())
        on conflict(event_id,provider) do update set sync_state='error',metadata=excluded.metadata,updated_at=now()
      `;
    }
    const decided=await sql`
      update calendar_core.calendar_suggestions set status='accepted',accepted_event_id=${event.id},decided_at=now()
      where id=${id} returning *
    `;
    return NextResponse.json({suggestion:decided[0],event,googleSync:g});
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}
