import { confirmAction, validId } from "@/server/db";
import { apiError, jsonBody, jsonResponse } from "@/app/api/_shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { const body = await jsonBody(request); return jsonResponse(await confirmAction(validId(body.actionId, "操作 ID"))); }
  catch (error) { return apiError(error); }
}
