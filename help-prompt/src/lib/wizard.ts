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
    options: [
      { label: "Разработчик", value: "developer" },
      { label: "Продакт-менеджер", value: "pm" },
      { label: "Аналитик", value: "analyst" },
      { label: "Студент", value: "student" },
      { label: "Маркетолог", value: "marketer" },
      { label: "Учитель / наставник", value: "teacher" },
      { label: "Другое", value: "other" },
      { label: "Не указывать", value: "none" },
    ],
  },
  {
    stepIndex: 3,
    type: "choice",
    question: "Какой уровень детализации ответа нужен?",
    dataKey: "detailLevel",
    options: [
      { label: "Краткий обзор", value: "brief" },
      { label: "Подробное объяснение", value: "detailed" },
      { label: "Пошаговая инструкция", value: "stepwise" },
      { label: "Сравнение вариантов", value: "compare" },
    ],
  },
  {
    stepIndex: 4,
    type: "text",
    question: "Дополнительный контекст (тема, данные, ситуация). Можно пропустить.",
    dataKey: "context",
    optional: true,
  },
];

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

/** Мастер завершён, если пройдены все обязательные шаги и хотя бы начат последний (optional) */
export function isWizardCompleted(collected: CollectedMap): boolean {
  return getNextStepIndex(collected) >= WIZARD_STEPS.length;
}

/** Текущий шаг для отображения: вопрос, тип, опции (если choice). Если мастер завершён — null. */
export function getCurrentStep(collected: CollectedMap): {
  stepIndex: number;
  type: WizardStepType;
  question: string;
  dataKey: string;
  options?: WizardChoice[];
  optional?: boolean;
} | null {
  const idx = getNextStepIndex(collected);
  if (idx >= WIZARD_STEPS.length) return null;
  const step = WIZARD_STEPS[idx];
  const options = getStepOptions(step, collected);
  if (step.type === "choice" && !options) return null; // для шага 2 ещё нет goal — не должно случиться при пошаговом прохождении
  return {
    stepIndex: step.stepIndex,
    type: step.type,
    question: step.question,
    dataKey: step.dataKey,
    options,
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

export function getPresetById(id: string): TopPreset | undefined {
  return TOP_PRESETS.find((p) => p.id === id);
}

export { WIZARD_STEPS };
