import { getWorkspace } from "@/server/services/recruitment.service";
import { apiError, jsonResponse } from "@/app/api/_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return jsonResponse(await getWorkspace()); }
  catch (error) { return apiError(error); }
}
