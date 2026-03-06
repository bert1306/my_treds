import { NextRequest, NextResponse } from "next/server";
import { getSessionIfOwned } from "@/lib/session";
import { generatePromptForSession } from "@/lib/prompt-service";

/** GET /api/sessions/[id]/prompt?deviceId=xxx&presetId=trends (или templateSlug=trends). 404/403 если не владелец. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const deviceId = req.nextUrl.searchParams.get("deviceId");
    const presetId = req.nextUrl.searchParams.get("presetId");
    const templateSlug = req.nextUrl.searchParams.get("templateSlug");

    const owned = await getSessionIfOwned(sessionId, deviceId);
    if (owned.status === "not_found") {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (owned.status === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const prompt = await generatePromptForSession(sessionId, {
      presetId: presetId ?? undefined,
      templateSlug: templateSlug ?? undefined,
    });

    return NextResponse.json({ prompt });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
