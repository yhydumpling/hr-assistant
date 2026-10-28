import { HttpError } from "@/server/errors";
import { text } from "@/server/validation";
import { parseResumeInput } from "@/server/services/resume.service";
import { apiError, formBody, jsonResponse } from "@/app/api/_shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const form = await formBody(request);
    const entry = form.get("file");
    if (entry !== null && !(entry instanceof File)) throw new HttpError(400, "文件字段无效，请重新上传。");
    const pastedText = text(form.get("text"), "简历文本", 50_000);
    try { return jsonResponse({ draft: await parseResumeInput(entry instanceof File ? entry : null, pastedText) }); }
    catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "简历解析失败。"); }
  } catch (error) { return apiError(error); }
}
