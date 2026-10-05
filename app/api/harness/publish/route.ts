import { NextResponse } from "next/server";
import { getRepo } from "@/lib/harness/repo";
import { publishConfig } from "@/lib/harness/config";
import { errorResponse } from "@/lib/harness/http";
import { getActingUser } from "@/lib/current-user";

/** Same as publishConfigAction, over HTTP: 403 not a GP, 400 invalid draft (validated in publishConfig). */
export async function POST(req: Request) {
  const draft = await req.json().catch(() => null);
  try {
    const config = await publishConfig(getRepo(), draft, await getActingUser());
    return NextResponse.json({ config });
  } catch (e) {
    return errorResponse(e, "publish harness config");
  }
}
