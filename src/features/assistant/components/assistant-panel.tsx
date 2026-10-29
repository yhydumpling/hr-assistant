"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, ArrowUp, Bot, CalendarDays, ListChecks, LoaderCircle, Mail, Search, X } from "lucide-react";
import type { Workspace } from "@/lib/types";
import { ActionCard } from "./action-card";
import { EmailDraftCard, emailDraftForm } from "./email-draft-card";
import type { useAssistant, AssistantDraft } from "../hooks/use-assistant";
import "./assistant-panel.css";

const SLOT_LABELS: Record<string, string> = {
  candidate: "候选人", candidateName: "候选人姓名", candidateId: "候选人 ID",
  date: "日期", time: "时间", round: "面试轮次", stage: "招聘阶段",
  job: "申请岗位", interviewer: "面试官", location: "地点", email: "收件邮箱", cc: "抄送邮箱"
};

export function AssistantPanel({ workspace, conversation, draft, compact = false, onClose }: {
  workspace: Workspace;
  conversation: ReturnType<typeof useAssistant>;
  draft?: AssistantDraft | null;
  compact?: boolean;
  onClose?: () => void;
}) {
  const { chatInput, setChatInput, context, clearContext, chatBusy, activeAction,
    actionStates, messages, now, sendMessage, handleAction, emailForms, updateEmailForm } = conversation;
  const messageViewport = useRef<HTMLDivElement>(null);
  const chatTextarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const element = messageViewport.current;
    if (!element) return;
    const latest = element.lastElementChild as HTMLElement | null;
    const top = latest && latest.offsetHeight > element.clientHeight * 0.85
      ? element.scrollTop + latest.getBoundingClientRect().top - element.getBoundingClientRect().top - 12
      : element.scrollHeight;
    element.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, [messages, chatBusy]);
  useEffect(() => { if (compact || draft) chatTextarea.current?.focus({ preventScroll: true }); }, [compact, draft]);
  function fillPrompt(text: string) { setChatInput(text); chatTextarea.current?.focus({ preventScroll: true }); }
  const candidate = workspace.candidates.find(item => item.id === "candidate_chen") || workspace.candidates[0];
  const candidateName = candidate?.name || "候选人";
  const candidateId = candidate ? `，候选人ID：${candidate.id}` : "";
  const prompts = [
    { label: "查询进度", icon: Search, text: candidate ? `${candidateName}现在什么进度？${candidateId}` : "有哪些候选人需要跟进？" },
    { label: "更新进度", icon: ListChecks, text: `更新${candidateName}的招聘阶段${candidateId}` },
    { label: "邀约面试", icon: CalendarDays, text: `邀约${candidateName}明天下午3点一面${candidateId}` },
    { label: "邀请邮件", icon: Mail, text: `给${candidateName}写面试邀请邮件${candidateId}` },
  ];
  return <section className={`chat-panel panel hr-assistant-panel ${compact ? "is-compact" : ""}`} aria-label="HR招聘助手对话">
    <div className="chat-panel-header"><div className="assistant-icon"><Bot size={23} /></div><div><h2>HR招聘助手</h2><p>查询进度 · 面试邀约 · 邮件抄送</p></div>{onClose && <button type="button" className="icon-button assistant-close" aria-label="收起招聘助手" onClick={onClose}><X size={19} /></button>}</div>
    <div ref={messageViewport} className="chat-messages" aria-live="polite" aria-relevant="additions text">
      {messages.map(message => <article className={`chat-message ${message.role} ${message.error ? "has-error" : ""}`} key={message.id}>
        <span className="message-avatar">{message.role === "assistant" ? <Bot size={18} /> : "HR"}</span>
        <div className="message-content"><div className="message-author">{message.role === "assistant" ? "HR招聘助手" : "你"}</div><div className="message-bubble">{message.text}</div>
          {message.rows && message.rows.length > 0 && <div className="answer-rows">{message.rows.map((row, index) => <div className="answer-row" key={`${message.id}-${index}`}><strong>{row.title}</strong><p>{row.detail}</p></div>)}</div>}
          {message.action && <ActionCard action={message.action} state={actionStates[message.action.id]} now={now} disabled={Boolean(activeAction) || chatBusy} onAction={operation => void handleAction(message.action!, operation)} />}
          {message.emailDraft && <EmailDraftCard draft={message.emailDraft} form={emailForms[message.emailDraft.id] || emailDraftForm(message.emailDraft)} onChange={form => updateEmailForm(message.emailDraft!.id, form)} />}
        </div>
      </article>)}
      {chatBusy && <article className="chat-message assistant"><span className="message-avatar"><Bot size={18} /></span><div className="message-content"><div className="message-author">HR招聘助手</div><div className="message-bubble typing"><LoaderCircle size={16} className="spin" />正在处理…</div></div></article>}
    </div>
    <div className="chat-compose">
      {context && <div className="context-note"><AlertCircle size={15} /><span>请补充{context.missing.map(key => SLOT_LABELS[key] || key).join("、") || "这项招聘事项的信息"}</span><button type="button" onClick={clearContext} disabled={chatBusy || Boolean(activeAction)} title="开始新事项" aria-label="结束补充，开始新事项"><X size={14} /></button></div>}
      <div className="quick-prompts assistant-prompts" aria-label="招聘快捷事项">{prompts.map(prompt => <button type="button" key={prompt.label} onClick={() => fillPrompt(prompt.text)} disabled={chatBusy || Boolean(activeAction)} title={prompt.text}><prompt.icon size={13} />{prompt.label}</button>)}</div>
      <form className="compose-box" onSubmit={sendMessage}>
        <textarea ref={chatTextarea} aria-label="招聘事项" value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder={context ? "继续补充姓名、时间、轮次或邮箱…" : "说说你要做什么：查询进度、更新阶段、邀约面试，或起草邮件并抄送…"} maxLength={3000} rows={compact ? 3 : 2} disabled={chatBusy || Boolean(activeAction)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} />
        <div className="compose-footer"><span>Enter 发送 · Shift + Enter 换行</span><button type="submit" className="send-button" disabled={!chatInput.trim() || chatBusy || Boolean(activeAction)} aria-label="发送招聘事项">{chatBusy ? <LoaderCircle size={19} className="spin" /> : <ArrowUp size={20} />}</button></div>
      </form>
    </div>
  </section>;
}
