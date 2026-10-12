import {NextRequest,NextResponse} from "next/server";
import {db} from "@/lib/db";

const allowed=new Set(["szemelyes-kozpont","kerekcsere-app","havi-nyersanyag"]);

export async function POST(req:NextRequest){
  const supplied=req.headers.get("x-calendar-source-key")||"";
  const expected=process.env.CALENDAR_SOURCE_API_KEY||"";
  if(!expected||supplied!==expected)return NextResponse.json({error:"unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body||!allowed.has(String(body.sourceApp||"")))return NextResponse.json({error:"invalid_source"},{status:400});
  const coreKey=process.env.CALENDAR_CORE_API_KEY||"";
  if(!coreKey)return NextResponse.json({error:"core_not_configured"},{status:503});

  if(body.deleted===true){
    const sourceApp=String(body.sourceApp||""),sourceRecordId=String(body.sourceRecordId||"");
    if(!sourceRecordId)return NextResponse.json({error:"missing_source_record_id"},{status:400});
    const rows=await db()`
      select id from calendar_core.calendar_events
      where source_app=${sourceApp} and source_record_id=${sourceRecordId} and status='active'
      limit 1
    `;
    if(!rows[0])return NextResponse.json({ok:true,deleted:false});
    const target=new URL("/api/events/"+encodeURIComponent(String(rows[0].id)),req.url);
    const r=await fetch(target,{method:"DELETE",headers:{"x-calendar-core-key":coreKey},cache:"no-store"});
    if(r.status===204)return NextResponse.json({ok:true,deleted:true});
    const text=await r.text();
    return new NextResponse(text,{status:r.status,headers:{"content-type":r.headers.get("content-type")||"application/json"}});
  }

  const target=new URL("/api/events",req.url);
  const r=await fetch(target,{
    method:"POST",
    headers:{"content-type":"application/json","x-calendar-core-key":coreKey},
    body:JSON.stringify(body),
    cache:"no-store"
  });
  const text=await r.text();
  return new NextResponse(text,{status:r.status,headers:{"content-type":r.headers.get("content-type")||"application/json"}});
}
