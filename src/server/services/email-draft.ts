import { randomUUID } from "node:crypto";
import type { Candidate, EmailDraft, InterviewRound, ParsedIntent } from "@/lib/types";
import { HttpError } from "@/server/errors";

export function normalizeEmail(value: unknown, label = "邮箱"): string {
  if (typeof value !== "string") throw new HttpError(400, `${label}格式无效，请提供完整邮箱地址。`);
  const email = value.trim();
  if (email.length > 150 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i.test(email)) throw new HttpError(400, `${label}格式无效，请提供如 hr@example.com 这样的完整地址。`);
  return email;
}

export function normalizeCc(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 10) throw new HttpError(400, "抄送邮箱须为不超过 10 项的列表。");
  const emails = value.map(item => normalizeEmail(item, "抄送邮箱"));
  return [...new Map(emails.map(email => [email.toLowerCase(), email])).values()];
}

export type InvitationDetails = {
  round: InterviewRound;
  date: string;
  time: string;
  interviewer?: string;
  location?: string;
};

/** This produces editable text only. No mail transport, delivery state or candidate mutation. */
export function buildInvitationDraft(candidate: Candidate, details: InvitationDetails, intent: Pick<ParsedIntent, "recipientEmail" | "cc">): EmailDraft {
  const recipient = normalizeEmail(intent.recipientEmail || candidate.email, "收件邮箱");
  const cc = normalizeCc(intent.cc || []).filter(email => email.toLowerCase() !== recipient.toLowerCase());
  return {
    id: `mail_${randomUUID()}`,
    candidateId: candidate.id,
    candidateName: candidate.name,
    to: [recipient],
    cc,
    subject: `${candidate.jobTitle} · ${details.round}邀请`,
    body: [
      `${candidate.name}，你好：`, "",
      `邀请你参加「${candidate.jobTitle}」岗位的${details.round}。`,
      `时间：${details.date} ${details.time}（北京时间）`,
      `面试官：${details.interviewer || "待确定"}`,
      `地点 / 会议：${details.location || "待确定，请补充会议链接或地址"}`,
      "", "请回复确认是否方便参加，如需调整时间，请与我们联系。", "", "招聘团队",
    ].join("\n"),
  };
}
