/**
 * Шаблоны промптов для MVP (4 кнопки). Вариант B: в коде, без таблицы в БД.
 * См. docs/PROMPT-TEMPLATES-MVP.md
 */

export type PromptTemplate = {
  slug: string;
  name: string;
  type: "user" | "system";
  body: string;
};

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    slug: "trends",
    name: "Расскажи про тренды 2026",
    type: "user",
    body: `Опиши ключевые тренды и изменения в области: {{context}}.
Уровень детализации: {{detailLevel}}. Формат ответа: {{detailLevelInstruction}}
{{#role}}Учти, что я {{role}} — адаптируй формулировки и примеры под мою сферу.{{/role}}`,
  },
  {
    slug: "formulate",
    name: "Помоги сформулировать задачу",
    type: "user",
    body: `Ты помогаешь составить один готовый запрос к ИИ. По вводным ниже сформируй один запрос, который пользователь сможет скопировать в чат (цель, контекст, критерии результата, формат ответа). Ответь только текстом этого запроса, без повтора вводных и без фраз вроде «Вот запрос» или «Готовый промпт».

Вводные пользователя:
Цель или вопрос: {{context}}
Уровень детализации ответа: {{detailLevel}}
{{#role}}Роль/сфера: {{role}}{{/role}}`,
  },
  {
    slug: "ideas",
    name: "Идеи для проекта",
    type: "user",
    body: `Нужны идеи по теме или проекту: {{context}}
Уровень детализации: {{detailLevel}}. Формат: {{detailLevelInstruction}} Список с короткими заголовками и при необходимости пояснениями.
{{#role}}Учти мою сферу/роль: {{role}} — идеи должны быть применимы в моём контексте.{{/role}}`,
  },
  {
    slug: "summary",
    name: "Краткое резюме",
    type: "user",
    body: `Сделай краткое резюме следующего текста или материала.
Исходный текст или описание: {{context}}
Уровень сжатия: {{detailLevel}}. {{detailLevelInstruction}} Сохрани главные факты, выводы и при необходимости действия. Не добавляй от себя то, чего нет в исходнике.
{{#role}}Учти, что я {{role}} — акценты в резюме могут быть под мои задачи.{{/role}}`,
  },
];

export function getTemplateBySlug(slug: string): PromptTemplate | undefined {
  return PROMPT_TEMPLATES.find((t) => t.slug === slug);
}

export const VALID_PRESET_IDS = PROMPT_TEMPLATES.map((t) => t.slug);
