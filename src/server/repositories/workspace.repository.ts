import type { Activity, Candidate, Interview, Job, ResumeFields, Workspace } from "@/lib/types";
import { query, transaction } from "@/server/db/client";
import { HttpError } from "@/server/errors";
import { CANDIDATE_SELECT, candidateFromRow, id, iso, jobFromRow, parseJson } from "@/server/repositories/mappers";

export type PreparedCandidate = {
  jobId: string;
  fields: ResumeFields;
  rawText: string;
  token: string;
  fingerprint: string;
  file?: { bytes: Uint8Array; name: string; mime: string };
};

export async function getWorkspace(): Promise<Workspace> {
  const jobRows = await query("SELECT * FROM jobs ORDER BY created_at,id");
  const candidateRows = await query(`${CANDIDATE_SELECT} ORDER BY c.created_at DESC,c.id DESC`);
  const interviewRows = await query("SELECT i.*,i.date::text AS date,to_char(i.time,'HH24:MI') AS time,c.fields_json FROM interviews i JOIN candidates c ON c.id=i.candidate_id ORDER BY i.date,i.time,i.id");
  const activityRows = await query("SELECT * FROM activities ORDER BY created_at DESC,id DESC LIMIT 200");
  const interviews: Interview[] = interviewRows.rows.map(row => ({ id: String(row.id), candidateId: String(row.candidate_id), candidateName: parseJson<ResumeFields>(row.fields_json).name, round: String(row.round) as Interview["round"], date: String(row.date), time: String(row.time), interviewer: String(row.interviewer), location: String(row.location), createdAt: iso(row.created_at) }));
  const activities: Activity[] = activityRows.rows.map(row => ({ id: String(row.id), candidateId: String(row.candidate_id), title: String(row.title), detail: String(row.detail), createdAt: iso(row.created_at) }));
  return { jobs: jobRows.rows.map(jobFromRow), candidates: candidateRows.rows.map(candidateFromRow), interviews, activities };
}

export async function insertJob(input: { title: string; description: string; requiredSkills: string[] }): Promise<Job> {
  const { title, description, requiredSkills } = input;
  const result = await query("INSERT INTO jobs(id,title,required_skills,description,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(title) DO NOTHING RETURNING *", [id("job"), title, JSON.stringify(requiredSkills), description, new Date().toISOString()]);
  if (!result.rows.length) throw new HttpError(409, "已经有同名岗位，请使用现有岗位或更明确的名称。");
  return jobFromRow(result.rows[0]);
}

export async function insertCandidate(input: PreparedCandidate): Promise<Candidate> {
  const { jobId, fields, rawText, token, fingerprint } = input;
  return transaction(async client => {
    const job = await query("SELECT id FROM jobs WHERE id=$1", [jobId], client);
    if (!job.rows.length) throw new HttpError(404, "岗位不存在，请重新选择岗位。");
    const candidateId = id("candidate");
    const now = new Date().toISOString();
    const inserted = await query("INSERT INTO candidates(id,job_id,fields_json,stage,next_action,next_action_at,source_name,raw_text,file_blob,file_mime,file_name,confirmation_token,submission_hash,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(confirmation_token) DO NOTHING RETURNING id", [candidateId, jobId, JSON.stringify(fields), "简历筛选", "人工初筛", null, input.file?.name || "粘贴的简历文本", rawText, input.file ? Buffer.from(input.file.bytes) : null, input.file?.mime || null, input.file?.name || null, token, fingerprint, now, now], client);
    if (!inserted.rows.length) {
      const existing = (await query(`${CANDIDATE_SELECT} WHERE c.confirmation_token=$1`, [token], client)).rows[0];
      if (!existing || existing.submission_hash !== fingerprint) throw new HttpError(409, "这个确认令牌已经用于另一份内容，请重新解析简历。");
      return candidateFromRow(existing);
    }
    await query("INSERT INTO activities(id,candidate_id,title,detail,created_at) VALUES($1,$2,$3,$4,$5)", [id("activity"), candidateId, "人工确认简历入库", `${fields.name} · 已核对规则提取结果并建立应聘档案。`, now], client);
    return candidateFromRow((await query(`${CANDIDATE_SELECT} WHERE c.id=$1`, [candidateId], client)).rows[0]);
  });
}

export async function readOriginalFile(candidateId: string) {
  const row = (await query("SELECT file_blob,file_name,file_mime FROM candidates WHERE id=$1", [candidateId])).rows[0];
  if (!row) throw new HttpError(404, "档案不存在。");
  if (!(row.file_blob instanceof Uint8Array)) throw new HttpError(404, "此档案由文本录入，没有原始文件。");
  return { bytes: new Uint8Array(row.file_blob), name: String(row.file_name || "resume"), mime: String(row.file_mime || "application/octet-stream") };
}
