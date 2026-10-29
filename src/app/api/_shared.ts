import { HttpError } from "@/server/errors";
import { record } from "@/server/validation";

export async function jsonBody(request: Request) {
  try { return record(await request.json()); }
  catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, "请求体不是有效的 JSON 对象。"); }
}

export async function formBody(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 5 * 1024 * 1024) throw new HttpError(413, "上传内容过大，单份文件不能超过 4 MB。");
  try { return await request.formData(); }
  catch { throw new HttpError(400, "无法读取表单，请重新选择文件或粘贴文本。"); }
}

export function jsonResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiError(error: unknown) {
  if (error instanceof HttpError) return jsonResponse({ error: error.message }, error.status);
  console.error("HR Assistant API request failed:", error instanceof Error ? error.message : "Unknown error");
  return jsonResponse({ error: "本地服务处理失败，请稍后重试；若持续失败，请查看服务终端。" }, 500);
}
