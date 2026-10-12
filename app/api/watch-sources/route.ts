import {NextRequest,NextResponse} from "next/server";
import {isAuthorized} from "@/lib/auth";
import {db} from "@/lib/db";

function clean(v:any,max=1200){return String(v??"").trim().slice(0,max)}
const kinds=new Set(["email","email_domain","person","messenger_group","facebook_group","web","institution","other"]);
const modes=new Set(["auto","review","watch"]);

export async function GET(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const sql=db();
    const groups=await sql`
      select id,group_key,title,source_type,watch_type,default_mode,status,metadata,created_at,updated_at
      from calendar_core.watch_groups
      order by title
    `;
    const sources=await sql`
      select id,group_id,kind,label,match_value,source_url,mode,status,origin,metadata,created_at,updated_at
      from calendar_core.watch_sources
      order by label
    `;
    return NextResponse.json({groups,sources});
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}

export async function POST(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  try{
    const x=await req.json();
    const kind=clean(x.kind,40),label=clean(x.label,500),mode=modes.has(x.mode)?x.mode:"review";
    if(!kinds.has(kind)||!label)return NextResponse.json({error:"invalid_source"},{status:400});
    const matchValue=clean(x.matchValue,1000)||null,sourceUrl=clean(x.sourceUrl,1200)||null;
    if(!matchValue&&!sourceUrl)return NextResponse.json({error:"missing_match"},{status:400});
    const groupId=clean(x.groupId,80)||null;
    const sql=db();
    const rows=await sql`
      insert into calendar_core.watch_sources(group_id,kind,label,match_value,source_url,mode,status,origin,metadata)
      values(${groupId},${kind},${label},${matchValue},${sourceUrl},${mode},'active','manual',${JSON.stringify(x.metadata||{})}::jsonb)
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
    const x=await req.json();
    const sql=db();
    const old=await sql`select * from calendar_core.watch_sources where id=${id} limit 1`;
    if(!old[0])return NextResponse.json({error:"not_found"},{status:404});
    const o:any=old[0];
    const kind=x.kind!==undefined&&kinds.has(x.kind)?x.kind:o.kind;
    const label=x.label!==undefined?clean(x.label,500):o.label;
    const mode=x.mode!==undefined&&modes.has(x.mode)?x.mode:o.mode;
    const status=x.status==="paused"?"paused":x.status==="active"?"active":o.status;
    const matchValue=x.matchValue!==undefined?(clean(x.matchValue,1000)||null):o.match_value;
    const sourceUrl=x.sourceUrl!==undefined?(clean(x.sourceUrl,1200)||null):o.source_url;
    const rows=await sql`
      update calendar_core.watch_sources set
        kind=${kind},label=${label},match_value=${matchValue},source_url=${sourceUrl},
        mode=${mode},status=${status},updated_at=now()
      where id=${id}
      returning *
    `;
    return NextResponse.json(rows[0]);
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}

export async function DELETE(req:NextRequest){
  if(!isAuthorized(req))return NextResponse.json({error:"unauthorized"},{status:401});
  const id=req.nextUrl.searchParams.get("id");
  if(!id)return NextResponse.json({error:"missing_id"},{status:400});
  try{
    const sql=db();
    const rows=await sql`
      update calendar_core.watch_sources set status='paused',updated_at=now()
      where id=${id} returning id
    `;
    if(!rows[0])return NextResponse.json({error:"not_found"},{status:404});
    return NextResponse.json({ok:true});
  }catch(e:any){return NextResponse.json({error:e?.message||"database_error"},{status:500})}
}
