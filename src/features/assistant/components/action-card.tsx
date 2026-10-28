"use client";

import { ArrowRight, Check, Clock, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { ActionPreview } from "@/lib/types";
import { dateLabel } from "@/lib/format";
import type { ActionState } from "../hooks/use-assistant";

export function ActionCard({ action, state, now, disabled, onAction }: { action: ActionPreview; state?: ActionState; now: number; disabled: boolean; onAction: (operation: "confirm" | "cancel") => void }) {
  const status = state?.status || "pending";
  const expired = status === "expired" || (status === "pending" && (!Number.isFinite(Date.parse(action.expiresAt)) || (now > 0 && Date.parse(action.expiresAt) <= now)));
  const terminal = ["applied", "cancelled"].includes(status) || expired;
  const busy = ["confirming", "cancelling"].includes(status);
  return <div className={`action-card ${terminal ? "resolved" : ""}`}>
    <div className="action-card-title"><span><ShieldCheck size={16} />{status === "applied" ? "操作已处理" : status === "cancelled" ? "操作已取消" : expired ? "预览已失效" : "待你确认"}</span><small>{action.kind === "schedule_interview" ? "面试安排" : "阶段更新"}</small></div>
    <h3>{action.title}</h3><p className="action-candidate">{action.candidateName}<code>{action.candidateId}</code></p>
    <dl className="change-list">{action.changes.map((change, index) => <div key={`${change.label}-${index}`}><dt>{change.label}</dt><dd>{change.before && <><span>{change.before}</span><ArrowRight size={13} /></>}<strong>{change.after}</strong></dd></div>)}</dl>
    {state?.message && <p className={`action-feedback ${status === "pending" || expired ? "warning-text" : ""}`}>{state.message}</p>}
    {expired && !state?.message && <p className="action-feedback warning-text">预览已过期，请重新描述这项操作。</p>}
    {!terminal && <div className="action-card-footer"><span><Clock size={12} />有效至 {dateLabel(action.expiresAt)}</span><div><button className="button secondary compact" disabled={disabled || busy} onClick={() => onAction("cancel")}>{status === "cancelling" ? <LoaderCircle size={14} className="spin" /> : <X size={14} />}取消</button><button className="button primary compact" disabled={disabled || busy} onClick={() => onAction("confirm")}>{status === "confirming" ? <LoaderCircle size={14} className="spin" /> : <Check size={14} />}确认执行</button></div></div>}
  </div>;
}
