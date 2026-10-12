import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";
import {CalendarEventInput,eventRow} from "@/lib/events";

const verifyUrl=()=>process.env.NOTIFICATION_CENTER_VERIFY_URL||
  "https://syzpkrypgcwiyzzzlzzi.supabase.co/functions/v1/notification-center";

function clean(v:any,max=4000){return String(v??"").trim().slice(0,max)}

async function verifyToken(token:string){
  if(!token)return false;
  try{
    const r=await fetch(verifyUrl(),{
      method:"POST",
      headers:{"content-type":"application/json","x-notification-token":token},
      body:JSON.stringify({action:"status"}),
      cache:"no-store"
    });
    if(!r.ok)return false;
    const j=await r.json().catch(()=>({}));
    return !!j?.ok&&!!j?.paired;
  }catch{return false}
}

function defaultEnd(start:string|null|undefined,end:string|null|undefined){
  if(end)return end;
  if(!start)return null;
  const d=new Date(start);
  if(Number.isNaN(d.getTime()))return null;
  return new Date(d.getTime()+60*60*1000).toISOString();
}

export async function POST(req:NextRequest){
  const token=clean(req.headers.get("x-notification-token"),300);
  if(!(await verifyToken(token)))return NextResponse.json({error:"unauthorized"},{status:401});

  try{
    const x=await req.json();
    const decision=x.decision==="auto"?"auto":x.decision==="review"?"review":"ignore";
    if(decision==="ignore")return NextResponse.json({ok:true,mode:"ignored"});

    const itemId=clean(x.itemId,300),title=clean(x.title,500);
    if(!itemId||!title)return NextResponse.json({error:"missing_fields"},{status:400});
    const sourceApp="notification-center";
    const sourceUrl=clean(x.sourceUrl,1200)||null;
    const allDay=!!x.allDay;
    const date=allDay?clean(x.date,10)||null:null;
    const startsAt=!allDay&&x.startsAt?new Date(x.startsAt).toISOString():null;
    const endsAt=!allDay?defaultEnd(startsAt,x.endsAt?new Date(x.endsAt).toISOString():null):null;
    const category=["work","personal","family","sport"].includes(x.category)?x.category:"personal";
    const payload={
      platform:clean(x.platform,80)||null,
      sender:clean(x.sender,300)||null,
      receivedAt:clean(x.receivedAt,80)||null,
      reason:clean(x.reason,1200)||null,
      confidence:clean(x.confidence,40)||null
    };
    const sql=db();

    if(decision==="review"){
      if(allDay&&!/^\d{4}-\d{2}-\d{2}$/.test(date||""))return NextResponse.json({error:"invalid_date"},{status:400});
      if(!allDay&&!startsAt)return NextResponse.json({error:"invalid_start"},{status:400});
      const confidence=x.confidence==="probable"?"probable":"uncertain";
      const rows=await sql`
        insert into calendar_core.calendar_suggestions
          (source_app,source_record_id,source_url,title,summary,event_date,starts_at,ends_at,all_day,timezone,location,confidence,payload)
        values(
          ${sourceApp},${itemId},${sourceUrl},${title},${clean(x.summary)||null},
          ${date},${startsAt},${endsAt},${allDay},'Europe/Budapest',
          ${clean(x.location,500)||null},${confidence},${JSON.stringify(payload)}::jsonb
        )
        on conflict(source_app,source_record_id) do update set
          source_url=excluded.source_url,title=excluded.title,summary=excluded.summary,
          event_date=excluded.event_date,starts_at=excluded.starts_at,ends_at=excluded.ends_at,
          all_day=excluded.all_day,location=excluded.location,confidence=excluded.confidence,payload=excluded.payload
        returning *
      `;
      return NextResponse.json({ok:true,mode:"review",suggestion:rows[0]});
    }

    const input:CalendarEventInput={
      title,
      startsAt,
      endsAt,
      date,
      allDay,
      timezone:"Europe/Budapest",
      category,
      location:clean(x.location,500),
      note:clean(x.summary),
      sourceApp,
      sourceRecordId:itemId,
      sourceUrl,
      metadata:payload
    };

    const coreKey=process.env.CALENDAR_CORE_API_KEY||"";
    if(!coreKey)return NextResponse.json({error:"core_not_configured"},{status:503});
    const target=new URL("/api/events",req.url);
    const coreRes=await fetch(target,{
      method:"POST",
      headers:{"content-type":"application/json","x-calendar-core-key":coreKey},
      body:JSON.stringify(input),
      cache:"no-store"
    });
    const event=await coreRes.json().catch(()=>null);
    if(!coreRes.ok||!event?.id){
      return NextResponse.json({error:event?.error||"core_event_failed"},{status:coreRes.status||502});
    }

    await sql`
      insert into calendar_core.calendar_event_sources(event_id,source_app,source_record_id,source_url,source_payload)
      values(${event.id},${sourceApp},${itemId},${sourceUrl},${JSON.stringify(payload)}::jsonb)
      on conflict(source_app,source_record_id) do update set
        event_id=excluded.event_id,source_url=excluded.source_url,source_payload=excluded.source_payload
    `;

    return NextResponse.json({ok:true,mode:"created",event});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"invalid_request"},{status:400});
  }
}
