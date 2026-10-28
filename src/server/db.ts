import { randomUUID, createHash } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { STAGES } from "@/lib/types";
import type { ActionPreview, Activity, Candidate, ConfirmationResult, Interview, Job, ParsedIntent, ResumeFields, Stage, Workspace } from "@/lib/types";

type Row = Record<string, unknown>;
const globalDb = globalThis as typeof globalThis & { tsinPortfolioPool?: Pool };
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "HttpError"; }
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "请求内容必须是对象。");
  return value as Record<string, unknown>;
}

export function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw new HttpError(400, `请填写有效的${label}。`);
  }
  const result = value.trim();
  if ((required && !result) || result.length > max || result.includes("\0")) throw new HttpError(400, `${label}${required ? "不能为空，且" : ""}不能超过 ${max} 字。`);
  return result;
}

export function validId(value: unknown, label = "记录 ID"): string {
  const result = text(value, label, 120, true);
  if (!/^[a-zA-Z0-9_-]+$/.test(result)) throw new HttpError(400, `${label}格式无效。`);
  return result;
}

export function validateFields(value: unknown): ResumeFields {
  const input = record(value);
  if (!Array.isArray(input.skills) || input.skills.length > 40) throw new HttpError(400, "技能须为不超过 40 项的列表。");
  const years = input.yearsOfExperience;
  if (years !== null && (typeof years !== "number" || !Number.isFinite(years) || years < 0 || years > 80)) throw new HttpError(400, "工作年限须为 0—80 之间的数值，未知时留空。");
  const fields: ResumeFields = {
    name: text(input.name, "姓名", 60, true), phone: text(input.phone, "电话", 40),
    email: text(input.email, "邮箱", 150), city: text(input.city, "城市", 80),
    education: text(input.education, "学历", 200), currentTitle: text(input.currentTitle, "当前职位", 120),
    yearsOfExperience: years as number | null,
    skills: [...new Set(input.skills.map(item => text(item, "技能", 80, true)))],
  };
  if (fields.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) throw new HttpError(400, "请填写有效邮箱，或清空待核实内容。");
  return fields;
}

function database(): Pool {
  if (globalDb.tsinPortfolioPool) return globalDb.tsinPortfolioPool;
  if (!process.env.DATABASE_URL?.trim()) throw new HttpError(503, "尚未配置 PostgreSQL。请复制 .env.example、配置 DATABASE_URL，并运行 pnpm db:init 初始化数据库。");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on("error", error => console.error("PostgreSQL idle connection error:", error.message));
  globalDb.tsinPortfolioPool = pool;
  return pool;
}

function databaseError(error: unknown): Error {
  if (error instanceof HttpError) return error;
  const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT", "28P01", "3D000", "57P03"].includes(code)) return new HttpError(503, "无法连接 PostgreSQL，请检查 DATABASE_URL 和数据库服务，再运行 pnpm db:init。");
  if (code === "42P01") return new HttpError(503, "PostgreSQL 表尚未初始化，请先运行 pnpm db:init。");
  if (code === "23505") return new HttpError(409, "记录发生重复冲突，请刷新后重试。");
  return error instanceof Error ? error : new Error("Database request failed");
}

async function query(sql: string, values: unknown[] = [], client?: PoolClient) {
  try { return client ? await client.query<Row>(sql, values) : await database().query<Row>(sql, values); }
  catch (error) { throw databaseError(error); }
}

async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
  let client: PoolClient;
  try { client = await database().connect(); }
  catch (error) { throw databaseError(error); }
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* Preserve the original transaction error. */ }
    throw databaseError(error);
  } finally { client.release(); }
}

function id(prefix: string) { return `${prefix}_${randomUUID()}`; }
function parseJson<T>(value: unknown): T { return (typeof value === "string" ? JSON.parse(value) : value) as T; }
function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString(); }
function jobFromRow(row: Row): Job {
  return { id: String(row.id), title: String(row.title), requiredSkills: parseJson<string[]>(row.required_skills), description: String(row.description), createdAt: iso(row.created_at) };
}
function candidateFromRow(row: Row): Candidate {
  return { ...parseJson<ResumeFields>(row.fields_json), id: String(row.id), jobId: String(row.job_id), jobTitle: String(row.job_title), stage: String(row.stage) as Stage,
    nextAction: String(row.next_action), nextActionAt: row.next_action_at ? iso(row.next_action_at) : null,
    version: Number(row.version), sourceName: String(row.source_name), rawText: String(row.raw_text), hasFile: Boolean(row.has_file), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
const CANDIDATE_SELECT = "SELECT c.id,c.job_id,c.fields_json,c.stage,c.next_action,c.next_action_at,c.version,c.source_name,c.raw_text,c.confirmation_token,c.submission_hash,c.created_at,c.updated_at,j.title AS job_title,c.file_blob IS NOT NULL AS has_file FROM candidates c JOIN jobs j ON j.id=c.job_id";

export async function getWorkspace(): Promise<Workspace> {
  const jobRows = await query("SELECT * FROM jobs ORDER BY created_at,id");
  const candidateRows = await query(`${CANDIDATE_SELECT} ORDER BY c.created_at DESC,c.id DESC`);
  const interviewRows = await query("SELECT i.*,i.date::text AS date,to_char(i.time,'HH24:MI') AS time,c.fields_json FROM interviews i JOIN candidates c ON c.id=i.candidate_id ORDER BY i.date,i.time,i.id");
  const activityRows = await query("SELECT * FROM activities ORDER BY created_at DESC,id DESC LIMIT 200");
  const interviews: Interview[] = interviewRows.rows.map(row => ({ id: String(row.id), candidateId: String(row.candidate_id), candidateName: parseJson<ResumeFields>(row.fields_json).name, round: String(row.round) as Interview["round"], date: String(row.date), time: String(row.time), interviewer: String(row.interviewer), location: String(row.location), createdAt: iso(row.created_at) }));
  const activities: Activity[] = activityRows.rows.map(row => ({ id: String(row.id), candidateId: String(row.candidate_id), title: String(row.title), detail: String(row.detail), createdAt: iso(row.created_at) }));
  return { jobs: jobRows.rows.map(jobFromRow), candidates: candidateRows.rows.map(candidateFromRow), interviews, activities };
}

export async function createJob(value: unknown): Promise<Job> {
  const input = record(value);
  const title = text(input.title, "岗位名称", 100, true);
  const description = text(input.description, "岗位描述", 6000, true);
  if (!Array.isArray(input.requiredSkills) || input.requiredSkills.length > 30) throw new HttpError(400, "必备技能须为不超过 30 项的列表。");
  const requiredSkills = [...new Set(input.requiredSkills.map(skill => text(skill, "技能", 80, true)))];
  const result = await query("INSERT INTO jobs(id,title,required_skills,description,created_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT(title) DO NOTHING RETURNING *", [id("job"), title, JSON.stringify(requiredSkills), description, new Date().toISOString()]);
  if (!result.rows.length) throw new HttpError(409, "已经有同名岗位，请使用现有岗位或更明确的名称。");
  return jobFromRow(result.rows[0]);
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

export async function getOriginalFile(candidateId: string) {
  validId(candidateId, "档案 ID");
  const row = (await query("SELECT file_blob,file_name,file_mime FROM candidates WHERE id=$1", [candidateId])).rows[0];
  if (!row) throw new HttpError(404, "档案不存在。");
  if (!(row.file_blob instanceof Uint8Array)) throw new HttpError(404, "此档案由文本录入，没有原始文件。");
  return { bytes: new Uint8Array(row.file_blob), name: String(row.file_name || "resume"), mime: String(row.file_mime || "application/octet-stream") };
}

export async function saveAction(preview: ActionPreview, candidateVersion: number, intent: ParsedIntent) {
  await query("INSERT INTO pending_actions(id,candidate_id,candidate_version,intent_json,preview_json,expires_at,status,created_at) VALUES($1,$2,$3,$4,$5,$6,'pending',$7)", [preview.id, preview.candidateId, candidateVersion, JSON.stringify(intent), JSON.stringify(preview), preview.expiresAt, new Date().toISOString()]);
}

export async function confirmAction(actionId: string): Promise<ConfirmationResult> {
  validId(actionId, "操作 ID");
  return transaction(async client => {
    const action = (await query("SELECT * FROM pending_actions WHERE id=$1 FOR UPDATE", [actionId], client)).rows[0];
    if (!action) throw new HttpError(404, "确认卡不存在，请重新描述操作。");
    if (action.status === "confirmed") return { ...parseJson<ConfirmationResult>(action.result_json), alreadyApplied: true };
    if (action.status !== "pending") throw new HttpError(409, "这个操作已经取消，请重新描述操作。");
    if (Date.parse(iso(action.expires_at)) <= Date.now()) throw new HttpError(410, "确认卡已过期，请重新生成，核对最新档案后再确认。");
    const row = (await query(`${CANDIDATE_SELECT} WHERE c.id=$1 FOR UPDATE OF c`, [String(action.candidate_id)], client)).rows[0];
    if (!row) throw new HttpError(404, "候选人档案已不存在。");
    const candidate = candidateFromRow(row);
    if (candidate.version !== Number(action.candidate_version)) throw new HttpError(409, "档案在生成确认卡后已变化，请重新描述操作并核对新卡。");
    const intent = parseJson<ParsedIntent>(action.intent_json);
    const now = new Date().toISOString();
    let stage: Stage;
    let nextAction: string;
    let nextActionAt: string | null;
    let title: string;
    let detail: string;
    if (intent.kind === "schedule_interview") {
      if (!intent.round || !["一面", "复试", "终面"].includes(intent.round) || !intent.date || !intent.time || !/^\d{4}-\d{2}-\d{2}$/.test(intent.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(intent.time)) throw new HttpError(409, "确认卡内容不完整，请重新描述面试安排。");
      const startsAt = Date.parse(`${intent.date}T${intent.time}:00+08:00`);
      if (!Number.isFinite(startsAt) || startsAt < Date.now() - 60_000) throw new HttpError(409, "面试时间已经过去，请重新安排。");
      if ((await query("SELECT id FROM interviews WHERE candidate_id=$1 AND date=$2 AND time=$3", [candidate.id, intent.date, intent.time], client)).rows.length) throw new HttpError(409, "该档案在这个时间已有面试，请重新选择时间。");
      stage = intent.round === "一面" ? "待一面" : "待复试";
      nextAction = `参加${intent.round}`;
      nextActionAt = `${intent.date}T${intent.time}:00+08:00`;
      await query("INSERT INTO interviews(id,candidate_id,round,date,time,interviewer,location,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [id("interview"), candidate.id, intent.round, intent.date, intent.time, intent.interviewer || "HR", intent.location || "待确定", now], client);
      title = `确认安排${intent.round}`;
      detail = `${candidate.name} · ${intent.date} ${intent.time}（北京时间） · 面试官：${intent.interviewer || "HR"} · 地点：${intent.location || "待确定"}；阶段 ${candidate.stage} → ${stage}。`;
    } else if (intent.kind === "update_stage" && intent.stage && STAGES.includes(intent.stage)) {
      stage = intent.stage;
      nextAction = stage === "已入职" || stage === "已淘汰" ? "流程已结束" : "跟进招聘进展";
      nextActionAt = null;
      title = "确认更新招聘阶段";
      detail = `${candidate.name} · ${candidate.stage} → ${stage}。`;
    } else throw new HttpError(409, "确认卡操作不受支持，请重新描述。");
    const changed = await query("UPDATE candidates SET stage=$1,next_action=$2,next_action_at=$3,version=version+1,updated_at=$4 WHERE id=$5 AND version=$6 RETURNING id", [stage, nextAction, nextActionAt, now, candidate.id, candidate.version], client);
    if (changed.rowCount !== 1) throw new HttpError(409, "档案已变化，请重新生成确认卡。");
    await query("INSERT INTO activities(id,candidate_id,title,detail,created_at) VALUES($1,$2,$3,$4,$5)", [id("activity"), candidate.id, title, detail, now], client);
    const result: ConfirmationResult = { message: `已执行：${detail}` };
    await query("UPDATE pending_actions SET status='confirmed',result_json=$1 WHERE id=$2 AND status='pending'", [JSON.stringify(result), actionId], client);
    return result;
  });
}

export async function cancelAction(actionId: string): Promise<{ message: string }> {
  validId(actionId, "操作 ID");
  return transaction(async client => {
    const row = (await query("SELECT status FROM pending_actions WHERE id=$1 FOR UPDATE", [actionId], client)).rows[0];
    if (!row) throw new HttpError(404, "确认卡不存在。");
    if (row.status === "confirmed") throw new HttpError(409, "这张卡已经执行，不能通过取消撤回。");
    if (row.status === "cancelled") return { message: "这个操作已经取消。" };
    await query("UPDATE pending_actions SET status='cancelled' WHERE id=$1 AND status='pending'", [actionId], client);
    return { message: "已取消，本次没有修改候选人档案。" };
  });
}
