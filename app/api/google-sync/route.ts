import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";
import {googleUpsert} from "@/lib/google-sync";

export async function GET(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const sql=db();
    const rows=await sql`
      select
        count(*) filter (where e.status='active')::int as active_events,
        count(*) filter (where e.status='active' and l.sync_state='linked')::int as linked,
        count(*) filter (where e.status='active' and coalesce(l.sync_state,'')<>'linked')::int as pending_or_error,
        count(*) filter (where e.status='active' and e.source_app='teleki-workplan')::int as workplan_events,
        count(*) filter (where e.status='active' and e.source_app='teleki-workplan' and l.sync_state='linked')::int as workplan_linked
      from calendar_core.calendar_events e
      left join calendar_core.calendar_sync_links l on l.event_id=e.id and l.provider='google'
    `;
    return NextResponse.json(rows[0]||{});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"database_error"},{status:500});
  }
}

export async function POST(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const body=await req.json().catch(()=>({}));
    const onlyWorkplan=!!body.onlyWorkplan;
    const limit=Math.max(1,Math.min(Number(body.limit||100),250));
    const sql=db();
    const rows=await sql`
      select e.*
      from calendar_core.calendar_events e
      left join calendar_core.calendar_sync_links l on l.event_id=e.id and l.provider='google'
      where e.status='active'
        and (${onlyWorkplan}=false or e.source_app='teleki-workplan')
        and coalesce(l.sync_state,'')<>'linked'
      order by coalesce(e.starts_at,e.event_date::timestamptz),e.created_at
      limit ${limit}
    `;
    let linked=0,failed=0;
    const errors:any[]=[];
    for(const event of rows){
      const g:any=await googleUpsert(event);
      if(g?.ok&&g.google_event_id){
        await sql`
          update calendar_core.calendar_events
          set google_event_id=${String(g.google_event_id)},updated_at=now()
          where id=${event.id}
        `;
        await sql`
          insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
          values(${event.id},'google',${String(g.google_event_id)},'primary',now(),'linked',
            ${JSON.stringify({account_email:g.account_email||null,html_link:g.html_link||null})}::jsonb,now())
          on conflict(event_id,provider) do update set
            external_id=excluded.external_id,last_synced_at=now(),sync_state='linked',metadata=excluded.metadata,updated_at=now()
        `;
        linked++;
      }else{
        failed++;
        const err=String(g?.error||"google_sync_failed");
        errors.push({id:event.id,title:event.title,error:err});
        await sql`
          insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
          values(${event.id},'google',${String(event.google_event_id||("pending:"+event.id))},'primary',null,'error',
            ${JSON.stringify({error:err})}::jsonb,now())
          on conflict(event_id,provider) do update set sync_state='error',metadata=excluded.metadata,updated_at=now()
        `;
      }
    }
    return NextResponse.json({ok:true,processed:rows.length,linked,failed,errors:errors.slice(0,20)});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"database_error"},{status:500});
  }
}
