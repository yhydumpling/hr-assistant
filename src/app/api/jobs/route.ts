import { createJob } from "@/server/db";
import { apiError, jsonBody, jsonResponse } from "@/app/api/_shared";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try { return jsonResponse({ job: await createJob(await jsonBody(request)) }, 201); }
  catch (error) { return apiError(error); }
}
