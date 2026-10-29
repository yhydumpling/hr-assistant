import { createHash } from "node:crypto";
import type { Candidate, Job } from "@/lib/types";
import { RESUME_FIELD_KEYS, type ResumeReview } from "@/lib/resume-schema";
import { HttpError } from "@/server/errors";
import { record, text, validId, validateFields } from "@/server/validation";
import { insertCandidate, insertJob, readOriginalFile } from "@/server/repositories/workspace.repository";
import { MAX_FILE_BYTES, parseResumeInput } from "@/server/services/resume.service";

export { getWorkspace } from "@/server/repositories/workspace.repository";

export async function createJob(value: unknown): Promise<Job> {
  const input = record(value);
  const title = text(input.title, "岗位名称", 100, true);
  const description = text(input.description, "岗位描述", 6000, true);
  if (!Array.isArray(input.requiredSkills) || input.requiredSkills.length > 30) throw new HttpError(400, "必备技能须为不超过 30 项的列表。");
  const requiredSkills = [...new Set(input.requiredSkills.map(skill => text(skill, "技能", 80, true)))];
  return insertJob({ title, description, requiredSkills });
}

export async function createCandidate(input: { jobId: string; fields: unknown; rawText: string; confirmationToken: string; file?: { bytes: Uint8Array; name: string; mime: string } }): Promise<Candidate> {
  const jobId = validId(input.jobId, "岗位 ID");
  const fields = validateFields(input.fields);
  const submittedText = text(input.rawText, "简历原文", 50_000, true);
  const token = validId(input.confirmationToken, "确认令牌");
  if (token.length < 8) throw new HttpError(400, "确认令牌无效，请重新解析简历。");
  if (input.file && (!input.file.bytes.length || input.file.bytes.length > MAX_FILE_BYTES)) throw new HttpError(400, "原文件不能为空或超过 4 MB。");
  let draft;
  try {
    // Rebuild evidence on the server from the submitted source, never trust client metadata.
    const originalFile = input.file ? new File([new Uint8Array(input.file.bytes)], input.file.name, { type: input.file.mime }) : null;
    draft = await parseResumeInput(originalFile, submittedText);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : "无法核对简历来源，请重新解析。");
  }
  if (input.file && draft.rawText !== submittedText) throw new HttpError(400, "原件与提取文本不一致，请重新解析后保存。");
  const rawText = draft.rawText;
  const comparable = (value: unknown) => JSON.stringify(Array.isArray(value) ? value.map(String).map(skill => skill.toLowerCase()).sort() : value);
  const review: ResumeReview = {
    schemaVersion: draft.schemaVersion, source: draft.source, normalizedText: draft.normalizedText,
    fieldResults: draft.fieldResults, warnings: draft.warnings, extractedFields: draft.fields,
    correctedFields: RESUME_FIELD_KEYS.filter(key => comparable(draft.fields[key]) !== comparable(fields[key])),
  };
  const fingerprint = createHash("sha256").update(JSON.stringify({ jobId, fields, rawText, name: input.file?.name || "" })).update(input.file?.bytes || new Uint8Array()).digest("hex");
  return insertCandidate({ jobId, fields, rawText, token, fingerprint, review, file: input.file });
}

export async function getOriginalFile(candidateId: string) {
  return readOriginalFile(validId(candidateId, "档案 ID"));
}
