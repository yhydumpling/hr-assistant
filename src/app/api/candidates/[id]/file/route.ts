import { getOriginalFile } from "@/server/services/recruitment.service";
import { apiError } from "@/app/api/_shared";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const file = await getOriginalFile(id);
    const safeName = file.name.replace(/[\r\n\0]/g, "");
    const encodedName = encodeURIComponent(safeName).replace(/['()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const disposition = file.mime === "application/pdf" ? "inline" : "attachment";
    return new Response(new Uint8Array(file.bytes), { headers: { "Content-Type": file.mime, "Content-Disposition": `${disposition}; filename="resume"; filename*=UTF-8''${encodedName}`, "Content-Length": String(file.bytes.byteLength), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return apiError(error); }
}
