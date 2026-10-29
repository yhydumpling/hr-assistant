import { STAGES } from "@/lib/types";
import type { ActionPreview, ConfirmationResult, ParsedIntent, Stage } from "@/lib/types";
import { query, transaction } from "@/server/db/client";
import { HttpError } from "@/server/errors";
import { CANDIDATE_SELECT, candidateFromRow, id, iso, parseJson } from "@/server/repositories/mappers";
import { buildInvitationDraft } from "@/server/services/email-draft";

export async function saveAction(preview: ActionPreview, candidateVersion: number, intent: ParsedIntent) {
  await query("INSERT INTO pending_actions(id,candidate_id,candidate_version,intent_json,preview_json,expires_at,status,created_at) VALUES($1,$2,$3,$4,$5,$6,'pending',$7)", [preview.id, preview.candidateId, candidateVersion, JSON.stringify(intent), JSON.stringify(preview), preview.expiresAt, new Date().toISOString()]);
}

export async function commitPendingAction(actionId: string): Promise<ConfirmationResult> {
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
    if (intent.kind === "schedule_interview" && intent.emailRequested && intent.round && intent.date && intent.time) {
      result.emailDraft = buildInvitationDraft(candidate, { round: intent.round, date: intent.date, time: intent.time, interviewer: intent.interviewer, location: intent.location }, intent);
      result.message += " 已生成邀请邮件草稿，尚未发送。";
    }
    await query("UPDATE pending_actions SET status='confirmed',result_json=$1 WHERE id=$2 AND status='pending'", [JSON.stringify(result), actionId], client);
    return result;
  });
}

export async function cancelPendingAction(actionId: string): Promise<{ message: string }> {
  return transaction(async client => {
    const row = (await query("SELECT status FROM pending_actions WHERE id=$1 FOR UPDATE", [actionId], client)).rows[0];
    if (!row) throw new HttpError(404, "确认卡不存在。");
    if (row.status === "confirmed") throw new HttpError(409, "这张卡已经执行，不能通过取消撤回。");
    if (row.status === "cancelled") return { message: "这个操作已经取消。" };
    await query("UPDATE pending_actions SET status='cancelled' WHERE id=$1 AND status='pending'", [actionId], client);
    return { message: "已取消，本次没有修改候选人档案。" };
  });
}
