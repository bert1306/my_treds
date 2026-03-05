import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentStep,
  getPresetById,
  isWizardCompleted,
  type CollectedMap,
} from "@/lib/wizard";

function collectedMapFromDb(
  rows: { key: string; value: string }[]
): CollectedMap {
  const map: CollectedMap = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/** POST /api/sessions/[id]/wizard/preset — применить топовый запрос (goal + goalDetail), вернуть текущий шаг мастера */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await req.json().catch(() => null);
    const presetId = typeof body?.preset === "string" ? body.preset.trim() : "";
    const preset = getPresetById(presetId);
    if (!preset) {
      return NextResponse.json(
        { error: "Unknown preset id" },
        { status: 400 }
      );
    }
    const rows = await prisma.collectedData.findMany({
      where: { sessionId },
      select: { key: true, value: true },
    });
    const collected = collectedMapFromDb(rows);
    const updates: Record<string, string> = {
      goal: preset.goal,
      goalDetail: preset.goalDetail,
    };
    for (const [key, value] of Object.entries(updates)) {
      await prisma.collectedData.upsert({
        where: { sessionId_key: { sessionId, key } },
        create: { sessionId, key, value },
        update: { value },
      });
    }
    const nextCollected: CollectedMap = { ...collected, ...updates };
    if (isWizardCompleted(nextCollected)) {
      return NextResponse.json({ completed: true });
    }
    const step = getCurrentStep(nextCollected);
    if (!step) {
      return NextResponse.json({ completed: true });
    }
    return NextResponse.json({
      completed: false,
      step: {
        stepIndex: step.stepIndex,
        type: step.type,
        question: step.question,
        dataKey: step.dataKey,
        options: step.options,
        optional: step.optional,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
