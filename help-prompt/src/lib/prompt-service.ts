import { prisma } from "@/lib/prisma";
import { getTemplateBySlug, type PromptTemplate } from "@/lib/prompt-templates";
import { ROLE_OPTIONS } from "@/lib/wizard";

/** Маппинг detailLevel в человекочитаемый текст для промпта */
const DETAIL_LEVEL_LABELS: Record<string, string> = {
  brief: "краткий обзор, 5–7 тезисов",
  detailed: "подробное объяснение с примерами",
  stepwise: "пошаговая инструкция",
  compare: "сравнение вариантов",
};

const DEFAULT_DETAIL_LEVEL = "краткий обзор";

const ROLE_LABELS: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label])
);

/** Подстановка данных в тело шаблона. {{fieldName}} → data[fieldName]. Условный блок {{#role}}...{{/role}} выводится только если role задана и не "none". */
export function buildPromptFromTemplate(
  templateBody: string,
  data: Record<string, string>
): string {
  let out = templateBody;

  // Условный блок {{#role}}...{{/role}}
  const roleValue = (data.role ?? "").trim();
  const showRole = roleValue && roleValue !== "none";
  out = out.replace(/\{\{#role\}\}([\s\S]*?)\{\{\/role\}\}/g, (_, inner) =>
    showRole ? inner : ""
  );

  // Простые плейсхолдеры {{fieldName}}
  out = out.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const v = data[key];
    return typeof v === "string" ? v : "";
  });

  // Убрать лишние пустые строки (подряд более одной)
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

/** Сбор данных для подстановки: CollectedData по сессии + роль/имя из User. Возвращает плоский объект с человекочитаемыми detailLevel и role. */
export async function getCollectedDataForSession(
  sessionId: string
): Promise<Record<string, string>> {
  const [dataRows, session] = await Promise.all([
    prisma.collectedData.findMany({
      where: { sessionId },
      select: { key: true, value: true },
    }),
    prisma.session.findUnique({
      where: { id: sessionId },
      select: { user: { select: { role: true, name: true } } },
    }),
  ]);

  const raw: Record<string, string> = {};
  for (const r of dataRows) raw[r.key] = r.value ?? "";

  // Роль: из collected или из профиля пользователя
  let roleValue = raw.role?.trim();
  if (!roleValue && session?.user?.role) {
    roleValue = session.user.role.trim();
  }
  const roleLabel = roleValue ? ROLE_LABELS[roleValue] ?? roleValue : "";

  const detailLevelValue = raw.detailLevel?.trim() || "brief";
  const detailLevelLabel =
    DETAIL_LEVEL_LABELS[detailLevelValue] ?? DEFAULT_DETAIL_LEVEL;

  return {
    context: raw.context?.trim() ?? "",
    detailLevel: detailLevelLabel,
    role: roleLabel,
    goal: raw.goal?.trim() ?? "",
    goalDetail: raw.goalDetail?.trim() ?? "",
    name: session?.user?.name?.trim() ?? "",
  };
}

/** Правила авто-выбора шаблона по goal + goalDetail (preset id). */
const GOAL_DETAIL_TO_SLUG: Record<string, string> = {
  "analyze_trends": "trends",
  "info_explain": "formulate",
  "content_creative": "ideas",
  "improve_resize": "summary",
};

export function selectTemplateSlugByCollectedData(
  collected: Record<string, string>
): string {
  const goal = collected.goal?.trim() || "";
  const goalDetail = collected.goalDetail?.trim() || "";
  const key = `${goal}_${goalDetail}`;
  return GOAL_DETAIL_TO_SLUG[key] ?? "formulate";
}

export function getTemplateByPresetId(presetId: string): PromptTemplate | undefined {
  return getTemplateBySlug(presetId);
}

/** Генерация итогового промпта для сессии: сбор данных → выбор шаблона → подстановка. */
export async function generatePromptForSession(
  sessionId: string,
  options: { templateSlug?: string; presetId?: string } = {}
): Promise<string> {
  const data = await getCollectedDataForSession(sessionId);

  const slug =
    options.templateSlug?.trim() ||
    options.presetId?.trim() ||
    selectTemplateSlugByCollectedData(data);

  const template = getTemplateBySlug(slug);
  if (!template) {
    const fallback = getTemplateBySlug("formulate");
    if (!fallback) throw new Error("No prompt template found");
    return buildPromptFromTemplate(fallback.body, data);
  }

  return buildPromptFromTemplate(template.body, data);
}
