type CoreEventRow=Record<string,any>;

const endpoint=process.env.GOOGLE_SYNC_BRIDGE_URL||
  "https://syzpkrypgcwiyzzzlzzi.supabase.co/functions/v1/naptar-gmail-realtime";

const preferredGoogleAccount="fsanyi73@gmail.com";

function key(){
  return process.env.CALENDAR_CORE_API_KEY||"";
}

export async function googleUpsert(event:CoreEventRow){
  const k=key();
  if(!k)return {ok:false,error:"missing_calendar_core_api_key"};
  try{
    const r=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json","x-calendar-core-key":k},
      body:JSON.stringify({action:"calendar_core_upsert",event,preferred_account_email:preferredGoogleAccount}),
      cache:"no-store"
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok)return {ok:false,error:String(j?.message||j?.error||("http_"+r.status)),status:r.status};
    if(String(j?.account_email||"").toLowerCase()!==preferredGoogleAccount){
      return {ok:false,error:"google_destination_account_mismatch",status:502};
    }
    return {ok:true,...j};
  }catch(e:any){
    return {ok:false,error:String(e?.message||"google_bridge_unreachable")};
  }
}

export async function googleDelete(calendarCoreId:string,googleEventId?:string|null){
  const k=key();
  if(!k)return {ok:false,error:"missing_calendar_core_api_key"};
  try{
    const r=await fetch(endpoint,{
      method:"POST",
      headers:{"content-type":"application/json","x-calendar-core-key":k},
      body:JSON.stringify({action:"calendar_core_delete",calendar_core_id:calendarCoreId,google_event_id:googleEventId||null}),
      cache:"no-store"
    });
    const j=await r.json().catch(()=>({}));
    if(!r.ok)return {ok:false,error:String(j?.message||j?.error||("http_"+r.status)),status:r.status};
    return {ok:true,...j};
  }catch(e:any){
    return {ok:false,error:String(e?.message||"google_bridge_unreachable")};
  }
}
