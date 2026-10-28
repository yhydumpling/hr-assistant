import { confirmAction } from "@/server/services/assistant.service";
import { apiError, jsonBody, jsonResponse } from "@/app/api/_shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { const body = await jsonBody(request); return jsonResponse(await confirmAction(body.actionId)); }
  catch (error) { return apiError(error); }
}
