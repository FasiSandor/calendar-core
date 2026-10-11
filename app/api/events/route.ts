import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {adminDb} from "@/lib/supabase";
import {CalendarEventInput,eventRow} from "@/lib/events";

export async function GET(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const from=req.nextUrl.searchParams.get("from");
  const to=req.nextUrl.searchParams.get("to");
  const db=adminDb();
  let q=db.from("calendar_events").select("*").eq("status","active").order("event_date",{ascending:true}).order("starts_at",{ascending:true});
  if(from)q=q.or(`event_date.gte.${from},starts_at.gte.${from}`);
  if(to)q=q.or(`event_date.lt.${to},starts_at.lt.${to}`);
  const {data,error}=await q;
  if(error)return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({items:data||[]});
}

export async function POST(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const x=await req.json() as CalendarEventInput;
    const row=eventRow(x);
    const db=adminDb();

    if(row.source_app&&row.source_record_id){
      const existing=await db.from("calendar_events")
        .select("*")
        .eq("source_app",row.source_app)
        .eq("source_record_id",row.source_record_id)
        .maybeSingle();
      if(existing.error)return NextResponse.json({error:existing.error.message},{status:500});
      if(existing.data){
        const updated=await db.from("calendar_events").update({...row,updated_at:new Date().toISOString()}).eq("id",existing.data.id).select("*").single();
        if(updated.error)return NextResponse.json({error:updated.error.message},{status:500});
        return NextResponse.json(updated.data,{status:200});
      }
    }

    const duplicate=await db.from("calendar_events").select("*").eq("dedupe_key",row.dedupe_key).eq("status","active").limit(1);
    if(duplicate.error)return NextResponse.json({error:duplicate.error.message},{status:500});
    if(duplicate.data?.[0])return NextResponse.json({...duplicate.data[0],deduplicated:true},{status:200});

    const created=await db.from("calendar_events").insert(row).select("*").single();
    if(created.error)return NextResponse.json({error:created.error.message},{status:500});
    return NextResponse.json(created.data,{status:201});
  }catch(e:any){
    return NextResponse.json({error:e?.message||"invalid_request"},{status:400});
  }
}
