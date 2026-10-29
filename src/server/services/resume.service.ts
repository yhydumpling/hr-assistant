import type { ResumeDraft } from "@/lib/types";
import { RESUME_FIELD_DEFINITIONS, RESUME_FIELD_KEYS, RESUME_SCHEMA_VERSION } from "@/lib/resume-schema";
import { MAX_TEXT_LENGTH, readResumeDocument } from "@/server/parsers/resume-document";
import { parseResumeText } from "@/server/parsers/resume-parser";

export { MAX_FILE_BYTES } from "@/server/parsers/resume-document";

export async function parseResumeInput(file: File | null, pastedText: string): Promise<ResumeDraft> {
  const document = await readResumeDocument(file, pastedText);
  // Preserve the extracted source. Layout cleanup happens on a separate copy.
  const rawText = document.rawText.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (rawText.includes("\0")) throw new Error("提取文字中包含无效控制符，请重新导出文件或粘贴文字。");
  if (rawText.length < 20) throw new Error("可读取的简历文本不足 20 字。扫描件请先转成可选中的文字。");
  if (rawText.length > MAX_TEXT_LENGTH) throw new Error("简历文本超过 50,000 字，请先精简内容。");
  const parsed = parseResumeText(rawText);
  return {
    ...parsed,
    schemaVersion: RESUME_SCHEMA_VERSION,
    rawText,
    source: document.source,
    sourceName: file?.name || "粘贴的简历文本",
    missingFields: RESUME_FIELD_KEYS.filter(key => parsed.fieldResults[key].status === "missing").map(key => RESUME_FIELD_DEFINITIONS[key].label),
    warnings: [...document.warnings, ...parsed.warnings],
    mode: "rule",
  };
}
