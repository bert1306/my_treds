import { NextResponse } from "next/server";
import { PROMPT_TEMPLATES } from "@/lib/prompt-templates";

/** GET /api/prompt-templates — список доступных шаблонов (slug, name). */
export async function GET() {
  const templates = PROMPT_TEMPLATES.map((t) => ({
    slug: t.slug,
    name: t.name,
  }));
  return NextResponse.json({ templates });
}
