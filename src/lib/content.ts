import { createHash } from "crypto";
import { prisma } from "./prisma";

export function computeContentHash(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  return createHash("sha256").update(normalized).digest("hex");
}

async function addContentToThread(options: {
  threadId: string;
  source: string;
  title?: string;
  originalText: string;
  language: string;
}) {
  const normalized = options.originalText.trim();
  if (!normalized) throw new Error("Content is empty");

  const contentHash = computeContentHash(normalized);
  const existing = await prisma.contentItem.findFirst({
    where: { threadId: options.threadId, contentHash },
  });
  if (existing) {
    return { created: false as const, reason: "duplicate" as const, item: existing };
  }

  try {
    const item = await prisma.contentItem.create({
      data: {
        threadId: options.threadId,
        source: options.source,
        title: options.title,
        originalText: normalized,
        language: options.language,
        contentHash,
      },
    });
    return { created: true as const, item };
  } catch (error) {
    const duplicate =
      error instanceof Error && error.message.includes("UNIQUE constraint failed");
    if (duplicate) {
      const item = await prisma.contentItem.findFirst({
        where: { threadId: options.threadId, contentHash },
      });
      if (item) return { created: false as const, reason: "duplicate" as const, item };
    }
    throw error;
  }
}

export async function addTextContentToThread(options: {
  threadId: string;
  text: string;
  language: string;
  title?: string;
}) {
  const normalized = options.text.trim();
  if (!normalized) throw new Error("Content is empty");
  return addContentToThread({
    threadId: options.threadId,
    source: "TEXT_INPUT",
    title: options.title,
    originalText: normalized,
    language: options.language,
  });
}

export async function addUrlContentToThread(options: {
  threadId: string;
  url: string;
  title: string;
  originalText: string;
  language: string;
}) {
  return addContentToThread({
    threadId: options.threadId,
    source: "URL",
    title: options.url,
    originalText: options.originalText,
    language: options.language,
  });
}

