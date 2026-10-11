import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {adminDb} from "@/lib/supabase";
import {CalendarEventInput,eventRow} from "@/lib/events";

export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  const {data,error}=await adminDb().from("calendar_events").select("*").eq("id",id).maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:500});
  if(!data)return NextResponse.json({error:"not_found"},{status:404});
  return NextResponse.json(data);
}

export async function PATCH(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  try{
    const x=await req.json() as CalendarEventInput;
    const row=eventRow(x);
    const {data,error}=await adminDb().from("calendar_events").update({...row,updated_at:new Date().toISOString()}).eq("id",id).select("*").maybeSingle();
    if(error)return NextResponse.json({error:error.message},{status:500});
    if(!data)return NextResponse.json({error:"not_found"},{status:404});
    return NextResponse.json(data);
  }catch(e:any){
    return NextResponse.json({error:e?.message||"invalid_request"},{status:400});
  }
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const {id}=await params;
  const {data,error}=await adminDb().from("calendar_events")
    .update({status:"deleted",deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()})
    .eq("id",id).select("id").maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:500});
  if(!data)return NextResponse.json({error:"not_found"},{status:404});
  return new NextResponse(null,{status:204});
}
