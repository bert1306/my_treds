/**
 * Мастер (wizard) из ТЗ: 5 шагов для сбора данных перед чатом.
 * Ключи в CollectedData: goal, goalDetail, role, detailLevel, context (опционально).
 */

export type WizardStepType = "choice" | "text";

export type WizardChoice = { label: string; value: string };

export type WizardStep = {
  stepIndex: number;
  type: WizardStepType;
  question: string;
  dataKey: string;
  options?: WizardChoice[];
  /** Для шага 2: варианты зависят от goal; опции задаются в getStepOptions */
  dynamicOptionsFrom?: string;
  optional?: boolean;
};

export type CollectedMap = Record<string, string>;

/** Варианты роли (мастер и профиль) */
export const ROLE_OPTIONS: WizardChoice[] = [
  { label: "Разработчик", value: "developer" },
  { label: "Продакт-менеджер", value: "pm" },
  { label: "Аналитик", value: "analyst" },
  { label: "Студент", value: "student" },
  { label: "Маркетолог", value: "marketer" },
  { label: "Учитель / наставник", value: "teacher" },
  { label: "Другое", value: "other" },
  { label: "Не указывать", value: "none" },
];

const WIZARD_STEPS: WizardStep[] = [
  {
    stepIndex: 0,
    type: "choice",
    question: "Какова цель обращения к ИИ?",
    dataKey: "goal",
    options: [
      { label: "Получить информацию", value: "info" },
      { label: "Создать контент", value: "content" },
      { label: "Проанализировать данные", value: "analyze" },
      { label: "Проверить или улучшить", value: "improve" },
      { label: "Другое", value: "other" },
    ],
  },
  {
    stepIndex: 1,
    type: "choice",
    question: "Уточните задачу",
    dataKey: "goalDetail",
    dynamicOptionsFrom: "goal",
  },
  {
    stepIndex: 2,
    type: "choice",
    question: "Ваша роль (для адаптации стиля)?",
    dataKey: "role",
    options: ROLE_OPTIONS,
  },
  {
    stepIndex: 3,
    type: "choice",
    question: "Какой уровень детализации ответа нужен?",
    dataKey: "detailLevel",
    options: DETAIL_LEVEL_OPTIONS_FULL,
  },
  {
    stepIndex: 4,
    type: "text",
    question: "Дополнительный контекст (тема, данные, ситуация). Можно пропустить.",
    dataKey: "context",
    optional: true,
  },
];

/** В режиме пресета спрашиваем только: роль (если нет в профиле), детализация, контекст */
const PRESET_REMAINING_KEYS: string[] = ["role", "detailLevel", "context"];

/** Для пресета summary — только 2 варианта детализации (уровень сжатия). Остальные пресеты — все 4. */
const DETAIL_LEVEL_OPTIONS_FULL: WizardChoice[] = [
  { label: "Краткий обзор", value: "brief" },
  { label: "Подробное объяснение", value: "detailed" },
  { label: "Пошаговая инструкция", value: "stepwise" },
  { label: "Сравнение вариантов", value: "compare" },
];

const DETAIL_LEVEL_OPTIONS_SUMMARY: WizardChoice[] = [
  { label: "Краткий обзор", value: "brief" },
  { label: "Подробное объяснение", value: "detailed" },
];

/** Пресет по собранным goal+goalDetail (если совпадают с одним из TOP_PRESETS). */
export function getPresetIdFromCollected(collected: CollectedMap): string | null {
  const goal = collected.goal?.trim();
  const goalDetail = collected.goalDetail?.trim();
  if (!goal || !goalDetail) return null;
  const preset = TOP_PRESETS.find((p) => p.goal === goal && p.goalDetail === goalDetail);
  return preset?.id ?? null;
}

/** В режиме пресета — список ключей шагов, которые ещё нужно показать (роль из профиля считаем заполненной). */
export function getRemainingStepKeysForPreset(
  collected: CollectedMap,
  profileRole?: string | null
): string[] {
  const result: string[] = [];
  if (!collected.role?.trim() && !profileRole?.trim()) result.push("role");
  if (!collected.detailLevel?.trim()) result.push("detailLevel");
  if (collected.context === undefined) result.push("context");
  return result;
}

/** Варианты детализации цели в зависимости от выбора на шаге 1 */
const GOAL_DETAIL_OPTIONS: Record<string, WizardChoice[]> = {
  info: [
    { label: "Объяснить понятие или тему", value: "explain" },
    { label: "Ответить на конкретный вопрос", value: "answer" },
    { label: "Сравнить или разобрать варианты", value: "compare" },
    { label: "Другое", value: "other" },
  ],
  content: [
    { label: "Статья, пост", value: "article" },
    { label: "Деловое письмо или отчёт", value: "business" },
    { label: "Креативный текст", value: "creative" },
    { label: "Редактирование / улучшение текста", value: "edit" },
    { label: "SEO-контент", value: "seo" },
    { label: "Другое", value: "other" },
  ],
  analyze: [
    { label: "Описать тренды в данных", value: "trends" },
    { label: "Сравнить показатели", value: "compare" },
    { label: "Сформулировать гипотезы", value: "hypotheses" },
    { label: "Презентация результатов", value: "present" },
    { label: "Другое", value: "other" },
  ],
  improve: [
    { label: "Проверить текст", value: "proofread" },
    { label: "Улучшить формулировки", value: "rewrite" },
    { label: "Сократить или расширить", value: "resize" },
    { label: "Изменить тон или стиль", value: "style" },
    { label: "Другое", value: "other" },
  ],
  other: [
    { label: "Просто опишу в чате", value: "describe" },
  ],
};

/** Конфиг шага по dataKey (для пресет-режима, когда шаги идут не по порядку WIZARD_STEPS). */
const STEP_BY_KEY: Record<string, WizardStep> = {};
for (const s of WIZARD_STEPS) {
  STEP_BY_KEY[s.dataKey] = s;
}

function getStepOptions(step: WizardStep, collected: CollectedMap): WizardChoice[] | undefined {
  if (step.options) return step.options;
  if (step.dynamicOptionsFrom) {
    const key = step.dynamicOptionsFrom;
    const value = collected[key];
    return value ? GOAL_DETAIL_OPTIONS[value] ?? GOAL_DETAIL_OPTIONS.other : undefined;
  }
  return undefined;
}

/** Индекс следующего незаполненного шага; если все заполнены (с учётом optional) — возвращаем steps.length */
export function getNextStepIndex(collected: CollectedMap): number {
  for (let i = 0; i < WIZARD_STEPS.length; i++) {
    const step = WIZARD_STEPS[i];
    const value = collected[step.dataKey]?.trim();
    if (step.optional && (value === undefined || value === "")) continue; // optional пустой — считаем пройденным
    if (!value) return i;
  }
  return WIZARD_STEPS.length;
}

/** Мастер завершён: в полном режиме — все шаги; в пресет-режиме — роль, detailLevel и context (опц.) заполнены. */
export function isWizardCompleted(
  collected: CollectedMap,
  options?: { profileRole?: string | null }
): boolean {
  const presetId = getPresetIdFromCollected(collected);
  if (presetId) {
    const remaining = getRemainingStepKeysForPreset(collected, options?.profileRole);
    return remaining.length === 0;
  }
  return getNextStepIndex(collected) >= WIZARD_STEPS.length;
}

export type CurrentStepResult = {
  stepIndex: number;
  totalSteps: number;
  type: WizardStepType;
  question: string;
  dataKey: string;
  options?: WizardChoice[];
  optional?: boolean;
};

/** Текущий шаг для отображения. В пресет-режиме: stepIndex/totalSteps относительные (1 из 3). */
export function getCurrentStep(
  collected: CollectedMap,
  options?: { profileRole?: string | null }
): CurrentStepResult | null {
  const presetId = getPresetIdFromCollected(collected);
  const profileRole = options?.profileRole;

  if (presetId) {
    const remaining = getRemainingStepKeysForPreset(collected, profileRole);
    if (remaining.length === 0) return null;
    const totalSteps = (!profileRole?.trim() ? 1 : 0) + 1 + 1; // роль (если спрашиваем) + detailLevel + context
    const stepIndex = totalSteps - remaining.length;
    const dataKey = remaining[0];
    const step = STEP_BY_KEY[dataKey];
    if (!step) return null;
    let stepOptions = getStepOptions(step, collected);
    if (dataKey === "detailLevel" && presetId === "summary") {
      stepOptions = DETAIL_LEVEL_OPTIONS_SUMMARY;
    }
    if (step.type === "choice" && !stepOptions) return null;
    return {
      stepIndex,
      totalSteps,
      type: step.type,
      question: step.question,
      dataKey: step.dataKey,
      options: stepOptions,
      optional: step.optional,
    };
  }

  const idx = getNextStepIndex(collected);
  if (idx >= WIZARD_STEPS.length) return null;
  const step = WIZARD_STEPS[idx];
  const stepOptions = getStepOptions(step, collected);
  if (step.type === "choice" && !stepOptions) return null;
  return {
    stepIndex: step.stepIndex,
    totalSteps: WIZARD_STEPS.length,
    type: step.type,
    question: step.question,
    dataKey: step.dataKey,
    options: stepOptions,
    optional: step.optional,
  };
}

/** Топовые запросы: по клику подставляют goal + goalDetail, мастер донастраивает остальное (роль, детализация, контекст) */
export type TopPreset = {
  id: string;
  label: string;
  goal: string;
  goalDetail: string;
};

export const TOP_PRESETS: TopPreset[] = [
  { id: "trends", label: "Расскажи про тренды 2026", goal: "analyze", goalDetail: "trends" },
  { id: "formulate", label: "Помоги сформулировать задачу", goal: "info", goalDetail: "explain" },
  { id: "ideas", label: "Идеи для проекта", goal: "content", goalDetail: "creative" },
  { id: "summary", label: "Краткое резюме", goal: "improve", goalDetail: "resize" },
];

/** Порядок пресетов по роли: релевантные для роли первыми. Без роли — общий топ (default). */
const ROLE_PRESET_PRIORITY: Record<string, string[]> = {
  developer: ["formulate", "ideas", "trends", "summary"],
  pm: ["ideas", "formulate", "trends", "summary"],
  analyst: ["trends", "formulate", "summary", "ideas"],
  student: ["formulate", "summary", "ideas", "trends"],
  marketer: ["ideas", "trends", "formulate", "summary"],
  teacher: ["formulate", "summary", "ideas", "trends"],
  other: ["formulate", "ideas", "trends", "summary"],
  none: ["trends", "formulate", "ideas", "summary"],
  default: ["trends", "formulate", "ideas", "summary"],
};

/** Топовые кнопки с учётом роли: если роль задана — порядок по ROLE_PRESET_PRIORITY, иначе общий топ. */
export function getTopPresetsForRole(role: string | null | undefined): TopPreset[] {
  const order = role && role in ROLE_PRESET_PRIORITY
    ? ROLE_PRESET_PRIORITY[role]
    : ROLE_PRESET_PRIORITY.default;
  const byId = new Map(TOP_PRESETS.map((p) => [p.id, p]));
  const result: TopPreset[] = [];
  for (const id of order) {
    const p = byId.get(id);
    if (p) result.push(p);
  }
  for (const p of TOP_PRESETS) {
    if (!result.includes(p)) result.push(p);
  }
  return result;
}

export function getPresetById(id: string): TopPreset | undefined {
  return TOP_PRESETS.find((p) => p.id === id);
}

export { WIZARD_STEPS };
