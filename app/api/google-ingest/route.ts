import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";

const txt=(v:any,n=4000)=>String(v??"").trim().slice(0,n);

export async function POST(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const x=await req.json().catch(()=>({}));
  const account=txt(x.accountEmail,320).toLowerCase();
  const googleId=txt(x.googleEventId,500);
  const coreId=txt(x.calendarCoreId,80)||null;
  if(!account||!googleId)return NextResponse.json({error:"missing_identity"},{status:400});
  try{
    const sql=db();
    let event:any=null;
    if(coreId){
      const r=await sql`select * from calendar_core.calendar_events where id=${coreId} limit 1`;
      event=r[0]||null;
    }
    if(!event){
      const r=await sql`
        select e.* from calendar_core.calendar_sync_links l
        join calendar_core.calendar_events e on e.id=l.event_id
        where l.provider='google' and l.external_id=${googleId} limit 1
      `;
      event=r[0]||null;
    }
    if(x.deleted===true){
      if(event){
        await sql`update calendar_core.calendar_events set status='deleted',deleted_at=now(),updated_at=now(),version=version+1 where id=${event.id}`;
        await sql`update calendar_core.calendar_sync_links set sync_state='deleted',last_synced_at=now(),updated_at=now() where event_id=${event.id} and provider='google'`;
      }
      return NextResponse.json({ok:true,deleted:!!event,eventId:event?.id||null});
    }
    const allDay=!!x.allDay;
    const eventDate=allDay?txt(x.eventDate,10):null;
    const startsAt=!allDay&&x.startsAt?new Date(x.startsAt).toISOString():null;
    const endsAt=!allDay&&x.endsAt?new Date(x.endsAt).toISOString():null;
    if(allDay&&!/^\d{4}-\d{2}-\d{2}$/.test(eventDate||""))return NextResponse.json({error:"invalid_date"},{status:400});
    if(!allDay&&!startsAt)return NextResponse.json({error:"invalid_start"},{status:400});
    const title=txt(x.title,500)||"Google-esemény";
    // Google has no equivalent of Core's calendar categories. Preserve the
    // category assigned by the originating app when its event returns via Google.
    const category=event&&event.source_app!=="google"
      ?event.category
      :["work","personal","family","sport"].includes(x.category)?x.category:"personal";
    if(event){
      const r=await sql`
        update calendar_core.calendar_events set
          title=${title},starts_at=${startsAt},ends_at=${endsAt},event_date=${eventDate},all_day=${allDay},
          timezone='Europe/Budapest',category=${category},location=${txt(x.location,500)},note=${txt(x.note)},
          google_event_id=${googleId},status='active',deleted_at=null,updated_at=now(),version=version+1
        where id=${event.id} returning *
      `;
      event=r[0];
    }else{
      const r=await sql`
        insert into calendar_core.calendar_events
          (title,starts_at,ends_at,event_date,all_day,timezone,category,location,note,source_app,source_record_id,google_event_id,dedupe_key,status)
        values(${title},${startsAt},${endsAt},${eventDate},${allDay},'Europe/Budapest',${category},
          ${txt(x.location,500)},${txt(x.note)},'google',${account+":"+googleId},${googleId},md5(${account+":"+googleId}),'active')
        returning *
      `;
      event=r[0];
    }
    await sql`
      insert into calendar_core.calendar_sync_links(event_id,provider,external_id,calendar_id,last_synced_at,sync_state,metadata,updated_at)
      values(${event.id},'google',${googleId},'primary',now(),'linked',${JSON.stringify({account_email:account,origin:"google",html_link:x.htmlLink||null})}::jsonb,now())
      on conflict(event_id,provider) do update set external_id=excluded.external_id,last_synced_at=now(),sync_state='linked',metadata=excluded.metadata,updated_at=now()
    `;
    return NextResponse.json({ok:true,event});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"invalid_request"},{status:400});
  }
}
