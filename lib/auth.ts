import {NextRequest} from "next/server";

export function isAuthorized(req:NextRequest){
  const expected=process.env.CALENDAR_CORE_API_KEY;
  if(!expected)return false;
  const supplied=req.headers.get("x-calendar-core-key");
  return !!supplied&&supplied===expected;
}
