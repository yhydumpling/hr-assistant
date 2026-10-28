import type { ResumeDraft, ResumeFields } from "@/lib/types";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TEXT_LENGTH = 50_000;
const SKILLS = [
  "Java", "Spring Boot", "MySQL", "Redis", "Kafka", "Python", "FastAPI",
  "PostgreSQL", "Node.js", "React", "TypeScript", "JavaScript", "Vue",
  "Next.js", "SQL", "Docker", "Git", "RAG", "Agent", "Figma", "Axure",
  "数据分析", "需求分析", "项目管理", "用户研究"
];

async function extractFile(file: File): Promise<string> {
  if (file.size > MAX_FILE_BYTES) throw new Error("单份简历不能超过 4 MB。");
  if (!file.size) throw new Error("文件为空，请重新选择。");
  const filename = file.name.toLowerCase();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (filename.endsWith(".txt")) return new TextDecoder("utf-8").decode(bytes);
  if (filename.endsWith(".docx")) {
    const { extractRawText } = await import("mammoth");
    return (await extractRawText({ buffer: Buffer.from(bytes) })).value;
  }
  if (filename.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const document = await getDocumentProxy(bytes);
    try {
      // Keep line boundaries so adjacent fields do not run into each other.
      return (await extractText(document, { mergePages: false })).text.join("\n");
    } finally {
      await document.destroy();
    }
  }
  throw new Error("请选择文本 PDF、DOCX 或 UTF-8 TXT 文件。图片与扫描件暂不支持。");
}

function field(text: string, labels: string, max = 100): string {
  return text.match(new RegExp(`(?:^|\\n)[ \\t]*(?:${labels})[ \\t]*[：:][ \\t]*([^\\n]{1,${max}})`, "i"))?.[1]?.trim() ?? "";
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = value.toLowerCase();
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasSkill(text: string, skill: string): boolean {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "i").test(text);
}

export async function parseResumeInput(file: File | null, pastedText: string): Promise<ResumeDraft> {
  let extracted: string;
  try {
    extracted = file ? await extractFile(file) : pastedText;
  } catch (error) {
    if (error instanceof Error && /4 MB|文件为空|请选择文本/.test(error.message)) throw error;
    throw new Error("无法读取这个文件，请确认文件有效，或改为粘贴简历文本。");
  }
  const rawText = extracted.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (rawText.length < 20) throw new Error("可读取的简历文本不足 20 字。扫描 PDF 请先转成文字。");
  if (rawText.length > MAX_TEXT_LENGTH) throw new Error("简历文本超过 50,000 字，请先精简内容。");

  const labeledSkills = field(rawText, "技能|专业技能|技术栈|核心技能", 500)
    .split(/[、，,;；|]/).map(item => item.trim()).filter(Boolean);
  const years = rawText.match(/(?:工作经验|从业年限|相关经验)[：:\s]*(\d{1,2}(?:\.\d)?)\s*年/);
  const fields: ResumeFields = {
    name: field(rawText, "姓名|候选人", 30) || rawText.match(/^([\u4e00-\u9fff]{2,4})\s*$/m)?.[1] || "",
    phone: rawText.match(/(?<!\d)1[3-9]\d{9}(?!\d)/)?.[0] ?? "",
    email: rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "",
    city: field(rawText, "所在城市|现居城市|现居地|城市", 50),
    education: field(rawText, "教育背景|教育经历|最高学历|学历", 150),
    currentTitle: field(rawText, "现任职位|目前职位|当前职位|职位", 80),
    yearsOfExperience: years ? Number(years[1]) : null,
    skills: unique([...labeledSkills, ...SKILLS.filter(skill => hasSkill(rawText, skill))]).slice(0, 40)
  };
  const missingFields = [
    !fields.name && "姓名", !fields.phone && !fields.email && "联系方式",
    !fields.education && "学历", fields.yearsOfExperience === null && "工作年限",
    !fields.skills.length && "技能"
  ].filter((item): item is string => Boolean(item));

  return { fields, rawText, sourceName: file?.name || "粘贴的简历文本", missingFields, mode: "rule" };
}
