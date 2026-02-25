import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isOllamaAvailable } from "@/lib/llm";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const available = await isOllamaAvailable();
  return NextResponse.json({ available }, { status: 200 });
}
