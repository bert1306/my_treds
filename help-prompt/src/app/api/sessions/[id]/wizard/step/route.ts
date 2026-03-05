import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getCurrentStep,
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

/** GET /api/sessions/[id]/wizard/step — текущий шаг мастера или { completed: true }. Роль из профиля подставляется, шаг «роль» пропускается. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const [dataRows, session] = await Promise.all([
      prisma.collectedData.findMany({
        where: { sessionId },
        select: { key: true, value: true },
      }),
      prisma.session.findUnique({
        where: { id: sessionId },
        select: { user: { select: { role: true } } },
      }),
    ]);
    const collected = collectedMapFromDb(dataRows);
    if (session?.user?.role && collected.role === undefined) {
      collected.role = session.user.role;
    }
    if (isWizardCompleted(collected)) {
      return NextResponse.json({ completed: true });
    }
    const step = getCurrentStep(collected);
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

/** POST /api/sessions/[id]/wizard/step — отправить ответ на текущий шаг. Body: { value: string } */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params;
    const body = await req.json().catch(() => null);
    const value = typeof body?.value === "string" ? body.value.trim() : "";
    const [dataRows, session] = await Promise.all([
      prisma.collectedData.findMany({
        where: { sessionId },
        select: { key: true, value: true },
      }),
      prisma.session.findUnique({
        where: { id: sessionId },
        select: { user: { select: { role: true } } },
      }),
    ]);
    const collected = collectedMapFromDb(dataRows);
    if (session?.user?.role && collected.role === undefined) {
      collected.role = session.user.role;
    }
    const current = getCurrentStep(collected);
    if (!current) {
      return NextResponse.json({ completed: true });
    }
    if (current.optional && value === "") {
      // пропуск опционального шага — записываем пустую строку
    } else if (current.type === "choice" && !value) {
      return NextResponse.json(
        { error: "Выберите вариант или укажите value" },
        { status: 400 }
      );
    } else if (current.type === "text" && !current.optional && !value) {
      return NextResponse.json(
        { error: "Введите текст" },
        { status: 400 }
      );
    }
    await prisma.collectedData.upsert({
      where: {
        sessionId_key: { sessionId, key: current.dataKey },
      },
      create: { sessionId, key: current.dataKey, value: value || "" },
      update: { value: value || "" },
    });
    const nextCollected = { ...collected, [current.dataKey]: value || "" };
    if (isWizardCompleted(nextCollected)) {
      return NextResponse.json({ completed: true });
    }
    const nextStep = getCurrentStep(nextCollected);
    if (!nextStep) {
      return NextResponse.json({ completed: true });
    }
    return NextResponse.json({
      completed: false,
      step: {
        stepIndex: nextStep.stepIndex,
        type: nextStep.type,
        question: nextStep.question,
        dataKey: nextStep.dataKey,
        options: nextStep.options,
        optional: nextStep.optional,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
