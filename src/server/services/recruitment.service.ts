import { createHash } from "node:crypto";
import type { Candidate, Job } from "@/lib/types";
import { HttpError } from "@/server/errors";
import { record, text, validId, validateFields } from "@/server/validation";
import { insertCandidate, insertJob, readOriginalFile } from "@/server/repositories/workspace.repository";
import { MAX_FILE_BYTES } from "@/server/services/resume.service";

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
  const rawText = text(input.rawText, "简历原文", 50_000, true);
  if (rawText.length < 20) throw new HttpError(400, "简历原文不足 20 字，请先解析并核对简历。");
  const token = validId(input.confirmationToken, "确认令牌");
  if (token.length < 8) throw new HttpError(400, "确认令牌无效，请重新解析简历。");
  if (input.file && (!input.file.bytes.length || input.file.bytes.length > MAX_FILE_BYTES)) throw new HttpError(400, "原文件不能为空或超过 4 MB。");
  const fingerprint = createHash("sha256").update(JSON.stringify({ jobId, fields, rawText, name: input.file?.name || "" })).update(input.file?.bytes || new Uint8Array()).digest("hex");
  return insertCandidate({ jobId, fields, rawText, token, fingerprint, file: input.file });
}

export async function getOriginalFile(candidateId: string) {
  return readOriginalFile(validId(candidateId, "档案 ID"));
}
