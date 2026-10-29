import type { ResumeSource } from "@/lib/resume-schema";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_TEXT_LENGTH = 50_000;
const MAX_PDF_PAGES = 30;

type ResumeDocument = { rawText: string; source: ResumeSource; warnings: string[] };

function decodeText(bytes: Uint8Array): { text: string; encoding: NonNullable<ResumeSource["encoding"]> } {
  let encoding: NonNullable<ResumeSource["encoding"]> = "UTF-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "UTF-16LE";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "UTF-16BE";
  try {
    return { text: new TextDecoder(encoding, { fatal: true }).decode(bytes), encoding };
  } catch {
    if (encoding !== "UTF-8") throw new Error("TXT 编码无效，请另存为 UTF-8 后重试。");
    try {
      return { text: new TextDecoder("gb18030", { fatal: true }).decode(bytes), encoding: "GB18030" };
    } catch {
      throw new Error("无法确定 TXT 编码，请另存为 UTF-8 后重试。");
    }
  }
}

export async function readResumeDocument(file: File | null, pastedText: string): Promise<ResumeDocument> {
  if (!file) return { rawText: pastedText, source: { format: "text", method: "pasted-text" }, warnings: [] };
  if (file.size > MAX_FILE_BYTES) throw new Error("单份简历不能超过 4 MB。");
  if (!file.size) throw new Error("文件为空，请重新选择。");
  const extension = file.name.split(".").pop()?.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === "txt") {
    const { text, encoding } = decodeText(bytes);
    const controls = text.match(/[\u0000-\u0008\u000e-\u001f]/g)?.length || 0;
    if (text.includes("\0") || controls > Math.max(1, text.length * 0.01)) throw new Error("TXT 中包含非文本内容，请重新导出或粘贴文字。");
    return { rawText: text, source: { format: "txt", method: "text-decoder", encoding }, warnings: encoding === "GB18030" ? ["TXT 使用 GB18030 解码，请核对中文和特殊符号。"] : [] };
  }
  if (extension === "docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new Error("DOCX 内容与文件格式不符，请重新导出。");
    try {
      const { extractRawText } = await import("mammoth");
      const result = await extractRawText({ buffer: Buffer.from(bytes) });
      return { rawText: result.value, source: { format: "docx", method: "docx-text" }, warnings: result.messages.length ? ["文档转换存在提示，请对照原件检查表格、文本框及特殊内容。"] : [] };
    } catch {
      throw new Error("无法读取 DOCX，请确认文件有效，或改为粘贴简历文本。");
    }
  }
  if (extension === "pdf") {
    if (!new TextDecoder("ascii").decode(bytes.subarray(0, 1024)).includes("%PDF-")) throw new Error("PDF 内容与文件格式不符，请重新导出。");
    const { extractText, getDocumentProxy } = await import("unpdf");
    const document = await getDocumentProxy(bytes).catch(() => { throw new Error("无法读取 PDF；如有密码，请先解密或粘贴文字。"); });
    try {
      if (document.numPages > MAX_PDF_PAGES) throw new Error("简历 PDF 不能超过 30 页，请先精简内容。");
      const result = await extractText(document, { mergePages: false });
      const blankPages = result.text.flatMap((page, index) => page.trim().length < 5 ? [index + 1] : []);
      return {
        rawText: result.text.join("\n\f\n"),
        source: { format: "pdf", method: "pdf-text", pageCount: result.totalPages },
        warnings: ["PDF 按文本层读取；多栏、表格或文本框的阅读顺序请对照原件核对。", ...(blankPages.length ? [`第 ${blankPages.join("、")} 页可读取文字很少，图片内容需要先转成文字。`] : [])],
      };
    } catch (error) {
      if (error instanceof Error && /不能超过 30 页/.test(error.message)) throw error;
      throw new Error("无法提取 PDF 文字，请确认文件有效，或改为粘贴简历文本。");
    } finally {
      await document.destroy();
    }
  }
  throw new Error("请选择文本 PDF、DOCX 或 TXT 文件。图片与扫描件需要先转成文字。");
}
