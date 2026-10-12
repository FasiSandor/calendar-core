import {NextRequest,NextResponse} from "next/server";

const allowed=new Set(["szemelyes-kozpont","kerekcsere-app","havi-nyersanyag"]);

export async function POST(req:NextRequest){
  const supplied=req.headers.get("x-calendar-source-key")||"";
  const expected=process.env.CALENDAR_SOURCE_API_KEY||"";
  if(!expected||supplied!==expected)return NextResponse.json({error:"unauthorized"},{status:401});
  const body=await req.json().catch(()=>null);
  if(!body||!allowed.has(String(body.sourceApp||"")))return NextResponse.json({error:"invalid_source"},{status:400});
  const coreKey=process.env.CALENDAR_CORE_API_KEY||"";
  if(!coreKey)return NextResponse.json({error:"core_not_configured"},{status:503});
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
