import {createClient} from "@supabase/supabase-js";

export function adminDb(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error("missing_supabase_env");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
