import { randomUUID } from "node:crypto";
import { STAGES } from "@/lib/types";
import type { ActionPreview, AssistantContext, AssistantReply, Candidate, ParsedIntent, Workspace } from "@/lib/types";
import { getWorkspace, HttpError, record, saveAction, text } from "@/server/db";
import { interpretMessage, shanghaiToday } from "@/server/intent";

const KINDS = new Set(["query_interviews", "query_followups", "query_candidate", "query_job", "query_activity", "update_stage", "schedule_interview", "unknown"]);
const ROUNDS = new Set(["一面", "复试", "终面"]);

function safeContext(value: unknown): AssistantContext | undefined {
  if (value === undefined || value === null) return undefined;
  const input = record(value);
  const raw = record(input.intent);
  if (!KINDS.has(String(raw.kind))) throw new HttpError(400, "对话上下文无效，请重新描述问题。");
  const intent: ParsedIntent = { kind: raw.kind as ParsedIntent["kind"] };
  const limits = { candidateName: 60, candidateId: 120, jobTitle: 100, date: 10, time: 5, interviewer: 80, location: 160 } as const;
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (raw[key] !== undefined) intent[key] = text(raw[key], "上下文", limits[key]);
  }
  if (raw.stage !== undefined) {
    if (!STAGES.includes(raw.stage as ParsedIntent["stage"] & string)) throw new HttpError(400, "上下文中的招聘阶段无效。");
    intent.stage = raw.stage as ParsedIntent["stage"];
  }
  if (raw.round !== undefined) {
    if (!ROUNDS.has(String(raw.round))) throw new HttpError(400, "上下文中的面试轮次无效。");
    intent.round = raw.round as ParsedIntent["round"];
  }
  if (typeof raw.limit === "number" && Number.isFinite(raw.limit)) intent.limit = Math.max(1, Math.min(20, Math.floor(raw.limit)));
  if (!Array.isArray(input.missing) || input.missing.length > 6 || input.missing.some(item => !["candidate", "date", "time", "round", "stage", "job"].includes(String(item)))) throw new HttpError(400, "对话缺失字段无效，请重新描述。");
  return { intent, missing: input.missing.map(String) };
}

function clarification(intent: ParsedIntent, missing: string[], message: string, candidates?: Candidate[]): AssistantReply {
  return { kind: "clarification", message, context: { intent, missing }, ...(candidates ? { rows: candidates.map(candidate => ({ title: `${candidate.name} · ${candidate.jobTitle}`, detail: `档案 ID：${candidate.id}；当前阶段：${candidate.stage}` })) } : {}) };
}

function resolveCandidate(intent: ParsedIntent, workspace: Workspace): { candidate: Candidate } | { reply: AssistantReply } {
  if (!intent.candidateId && !intent.candidateName) return { reply: clarification(intent, ["candidate"], "你要操作或查询哪一位候选人？请提供完整姓名或档案 ID。") };
  let found = intent.candidateId
    ? workspace.candidates.filter(candidate => candidate.id === intent.candidateId)
    : workspace.candidates.filter(candidate => candidate.name === intent.candidateName);
  if (intent.jobTitle && !intent.candidateId) found = found.filter(candidate => candidate.jobTitle === intent.jobTitle);
  if (!found.length) return { reply: clarification(intent, ["candidate"], `数据库中没有找到对应档案${intent.jobTitle ? `（${intent.jobTitle}）` : ""}。请核对姓名，或提供候选人台账里的档案 ID。`) };
  if (found.length > 1) return { reply: clarification(intent, ["candidate"], "找到多个同名应聘档案。请补充岗位名称或完整档案 ID，确认你指的是哪一条。", found) };
  return { candidate: found[0] };
}

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split("-").map(Number);
  const actual = new Date(Date.UTC(year, month - 1, day));
  return actual.getUTCFullYear() === year && actual.getUTCMonth() === month - 1 && actual.getUTCDate() === day;
}

function timeLabel(value: string | null) {
  if (!value) return "未指定时间";
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)) + "（北京时间）";
}

function query(intent: ParsedIntent, workspace: Workspace): AssistantReply {
  const limit = Math.max(1, Math.min(20, intent.limit || 10));
  let selected: Candidate | undefined;
  if (intent.candidateName || intent.candidateId || intent.kind === "query_candidate") {
    const result = resolveCandidate(intent, workspace);
    if ("reply" in result) return result.reply;
    selected = result.candidate;
  }
  if (intent.date && !validDate(intent.date)) return clarification(intent, ["date"], "日期无效，请提供如 2026-11-03 这样的完整日期。");
  if (intent.kind === "query_candidate" && selected) {
    return { kind: "answer", context: null, message: `已读取「${selected.name}」的应聘档案。`, rows: [
      { title: `${selected.name} · ${selected.jobTitle}`, detail: `当前阶段：${selected.stage}；下一步：${selected.nextAction}；跟进时间：${timeLabel(selected.nextActionAt)}；档案 ID：${selected.id}` },
    ] };
  }
  if (intent.kind === "query_interviews") {
    const today = shanghaiToday(new Date());
    const items = workspace.interviews.filter(interview => (intent.date ? interview.date === intent.date : interview.date >= today) && (!selected || interview.candidateId === selected.id));
    return { kind: "answer", context: null, message: `${intent.date ? `${intent.date}（北京时间）` : "今天起"}${selected ? `「${selected.name}」` : ""}已登记 ${items.length} 场面试。${items.length > limit ? `以下显示前 ${limit} 场。` : ""}`, rows: items.slice(0, limit).map(interview => ({ title: `${interview.candidateName} · ${interview.round}`, detail: `${interview.date} ${interview.time}（北京时间）；面试官：${interview.interviewer}；地点：${interview.location}` })) };
  }
  if (intent.kind === "query_followups") {
    const items = workspace.candidates.filter(candidate => !["已入职", "已淘汰"].includes(candidate.stage) && (!selected || candidate.id === selected.id) && (!intent.date || (candidate.nextActionAt && shanghaiToday(new Date(candidate.nextActionAt)) === intent.date)));
    return { kind: "answer", context: null, message: `${intent.date ? `${intent.date}（北京时间）` : "当前"}已登记 ${items.length} 条未结束档案的跟进事项。${items.length > limit ? `以下显示前 ${limit} 条。` : ""}`, rows: items.slice(0, limit).map(candidate => ({ title: `${candidate.name} · ${candidate.jobTitle}`, detail: `${candidate.nextAction}；${timeLabel(candidate.nextActionAt)}；阶段：${candidate.stage}` })) };
  }
  if (intent.kind === "query_job") {
    const jobs = intent.jobTitle ? workspace.jobs.filter(job => job.title === intent.jobTitle) : workspace.jobs;
    if (!jobs.length) return { ...clarification(intent, ["job"], "没有找到这个岗位，请补充下列现有岗位的完整名称。"), rows: workspace.jobs.map(job => ({ title: job.title, detail: job.description })) };
    return { kind: "answer", context: null, message: "以下人数按当前应聘档案统计，同一人应聘不同岗位会分别计数。", rows: jobs.slice(0, limit).map(job => {
      const candidates = workspace.candidates.filter(candidate => candidate.jobId === job.id);
      const stages = STAGES.map(stage => { const count = candidates.filter(candidate => candidate.stage === stage).length; return count ? `${stage} ${count} 人` : ""; }).filter(Boolean).join("；");
      return { title: `${job.title} · ${candidates.length} 份应聘档案`, detail: stages || "暂无应聘档案。" };
    }) };
  }
  if (intent.kind === "query_activity") {
    const items = workspace.activities.filter(activity => (!selected || activity.candidateId === selected.id) && (!intent.date || shanghaiToday(new Date(activity.createdAt)) === intent.date));
    return { kind: "answer", context: null, message: `从当前保存的最近 200 条记录中找到 ${items.length} 条符合条件的操作。以下最多显示 ${limit} 条。`, rows: items.slice(0, limit).map(activity => ({ title: activity.title, detail: `${activity.detail} · ${new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "short", timeStyle: "short", hour12: false }).format(new Date(activity.createdAt))}（北京时间）` })) };
  }
  return { kind: "unsupported", context: null, message: "目前支持查询面试、跟进、候选人阶段、岗位人数和操作记录。请描述你想查看哪一项。" };
}

export async function replyToAssistant(messageValue: unknown, contextValue?: unknown): Promise<AssistantReply> {
  const message = text(messageValue, "消息", 3000, true);
  const context = safeContext(contextValue);
  if (/^(?:取消|算了|不要了|不安排了|退出|停止)[。！!\s]*$/.test(message)) return { kind: "answer", context: null, message: "已停止本轮补充信息。已生成的确认卡，请使用卡片上的取消按钮取消。" };
  const workspace = await getWorkspace();
  const now = new Date();
  const intent = interpretMessage(message, workspace.candidates, workspace.jobs, now, context);
  if (intent.kind.startsWith("query_")) return query(intent, workspace);
  if (intent.kind !== "update_stage" && intent.kind !== "schedule_interview") return { kind: "unsupported", context: null, message: "这句话暂未识别。我采用本地规则，不连接外部模型。你可以说“明天有哪些面试”“林书妍现在什么阶段”，或“安排陈亦安明天下午3点一面”；写入前会先给出确认卡。" };
  const resolved = resolveCandidate(intent, workspace);
  if ("reply" in resolved) return resolved.reply;
  const candidate = resolved.candidate;
  const normalized: ParsedIntent = { ...intent, candidateId: candidate.id, candidateName: candidate.name, jobTitle: candidate.jobTitle };
  const changes: ActionPreview["changes"] = [];
  let title: string;
  if (intent.kind === "update_stage") {
    if (!intent.stage || !STAGES.includes(intent.stage)) return clarification(normalized, ["stage"], `要把「${candidate.name}」更新到哪个阶段？可选：${STAGES.join("、")}。`);
    if (intent.stage === candidate.stage) return { kind: "answer", context: null, message: `「${candidate.name}」目前已经是「${candidate.stage}」，无需重复更新。` };
    changes.push({ label: "招聘阶段", before: candidate.stage, after: intent.stage });
    if (candidate.nextActionAt) changes.push({ label: "旧跟进时间", before: timeLabel(candidate.nextActionAt), after: "清空；新阶段尚未指定跟进时间" });
    title = `更新「${candidate.name}」的招聘阶段`;
  } else {
    if (!intent.round || !ROUNDS.has(intent.round)) return clarification(normalized, ["round"], `要为「${candidate.name}」安排一面、复试还是终面？`);
    if (!intent.date) return clarification(normalized, ["date"], `安排「${candidate.name}」的${intent.round}，请补充日期，例如“明天”或“2026-11-03”。`);
    if (!validDate(intent.date)) return clarification({ ...normalized, date: undefined }, ["date"], "这个日期无效，请重新提供面试日期。");
    if (!intent.time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(intent.time)) return clarification({ ...normalized, time: undefined }, ["time"], `请补充 ${intent.date} 的面试开始时间，例如“下午3点”。`);
    const startsAt = Date.parse(`${intent.date}T${intent.time}:00+08:00`);
    if (startsAt < now.getTime() - 60_000) return clarification({ ...normalized, date: undefined, time: undefined }, ["date", "time"], "这个面试时间已经过去，请重新提供未来的日期和时间（北京时间）。");
    normalized.interviewer = text(intent.interviewer || "HR", "面试官", 80, true);
    normalized.location = text(intent.location || "待确定", "地点", 160, true);
    const stage = intent.round === "一面" ? "待一面" : "待复试";
    changes.push({ label: "招聘阶段", before: candidate.stage, after: stage }, { label: "面试轮次", after: intent.round }, { label: "面试时间（北京时间）", after: `${intent.date} ${intent.time}` }, { label: "面试官", after: `${normalized.interviewer}${intent.interviewer ? "" : "（未指定，默认）"}` }, { label: "地点 / 会议", after: `${normalized.location}${intent.location ? "" : "（未指定）"}` });
    title = `安排「${candidate.name}」的${intent.round}`;
  }
  const preview: ActionPreview = { id: `action_${randomUUID()}`, kind: intent.kind, title, candidateId: candidate.id, candidateName: candidate.name, changes, expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString() };
  await saveAction(preview, candidate.version, normalized);
  return { kind: "action", message: `请核对「${candidate.name} · ${candidate.jobTitle}」的确认卡。点击确认后才会更新数据库并写入操作记录；卡片有效期 10 分钟。`, context: null, action: preview };
}
