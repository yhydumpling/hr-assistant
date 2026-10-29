import { createCandidate } from "@/server/services/recruitment.service";
import { MAX_FILE_BYTES } from "@/server/services/resume.service";
import { HttpError } from "@/server/errors";
import { text } from "@/server/validation";
import { apiError, formBody, jsonResponse } from "@/app/api/_shared";
export const runtime = "nodejs";
const MIME_BY_EXTENSION: Record<string, string> = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", txt: "text/plain" };
export async function POST(request: Request) {
  try {
    const form = await formBody(request);
    let fields: unknown;
    try { fields = JSON.parse(text(form.get("fields"), "简历字段", 12_000, true)); }
    catch { throw new HttpError(400, "简历字段无效，请重新解析并核对。"); }
    const entry = form.get("file");
    let file: { bytes: Uint8Array; name: string; mime: string } | undefined;
    if (entry !== null) {
      if (!(entry instanceof File) || !entry.size || entry.size > MAX_FILE_BYTES) throw new HttpError(400, "原文件无效、为空或超过 4 MB。");
      const extension = entry.name.split(".").pop()?.toLowerCase() || "";
      if (!MIME_BY_EXTENSION[extension]) throw new HttpError(400, "原文件只支持 PDF、DOCX、TXT。");
      const name = text(entry.name.replace(/[\\/]/g, "_").replace(/[\r\n]/g, ""), "文件名", 240, true);
      file = { bytes: new Uint8Array(await entry.arrayBuffer()), name, mime: MIME_BY_EXTENSION[extension] };
    }
    const candidate = await createCandidate({ jobId: text(form.get("jobId"), "岗位 ID", 120, true), fields, rawText: text(form.get("text"), "简历原文", 50_000, true), confirmationToken: text(form.get("confirmationToken"), "确认令牌", 120, true), file });
    return jsonResponse({ candidate }, 201);
  } catch (error) { return apiError(error); }
}
