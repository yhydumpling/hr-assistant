"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, ArrowUp, Bot, LoaderCircle, ShieldCheck, X } from "lucide-react";
import type { Workspace } from "@/lib/types";
import { ActionCard } from "./action-card";
import { useAssistant, type AssistantDraft } from "../hooks/use-assistant";

const SLOT_LABELS: Record<string, string> = {
  candidate: "候选人", candidateName: "候选人姓名", candidateId: "候选人 ID",
  date: "日期", time: "时间", round: "面试轮次", stage: "招聘阶段",
  job: "申请岗位", interviewer: "面试官", location: "地点"
};

export function AssistantPanel({ workspace, onChanged, draft }: {
  workspace: Workspace;
  onChanged: () => Promise<void>;
  draft?: AssistantDraft | null;
}) {
  const { chatInput, setChatInput, context, clearContext, chatBusy, activeAction,
    actionStates, messages, now, sendMessage, handleAction } = useAssistant(workspace, onChanged, draft);
  const chatBottom = useRef<HTMLDivElement>(null);
  const chatTextarea = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, chatBusy]);
  useEffect(() => { if (draft) chatTextarea.current?.focus(); }, [draft]);
  function fillExample(text: string) { setChatInput(text); chatTextarea.current?.focus(); }
  const exampleCandidate = workspace.candidates.find(candidate => candidate.id === "candidate_chen") ||
    workspace.candidates.find(candidate => !workspace.interviews.some(interview => interview.candidateId === candidate.id)) || workspace.candidates[0];
  const examples = ["今天有哪些面试？", "有哪些候选人需要跟进？", "最近进行了哪些操作？", `${exampleCandidate?.name || "林演示"}通过简历筛选，请安排明天15:00一面`];

  return <section className="chat-panel panel">
            <div className="chat-panel-header"><div className="assistant-icon"><Bot size={23} /></div><div><h2>把招聘事项交给助手整理</h2><p>查询即时返回 · 变更确认后执行</p></div><span className="small-label">TSIN ASSISTANT</span></div>
            <div className="chat-messages" aria-live="polite">
              {messages.map(message => <article className={`chat-message ${message.role} ${message.error ? "has-error" : ""}`} key={message.id}>
                <span className="message-avatar">{message.role === "assistant" ? <Bot size={18} /> : "HR"}</span><div className="message-content"><div className="message-author">{message.role === "assistant" ? "TSIN 招聘助手" : "你"}{message.role === "assistant" && <span>本地指令</span>}</div><div className="message-bubble">{message.text}</div>
                  {message.rows && message.rows.length > 0 && <div className="answer-rows">{message.rows.map((row, index) => <div className="answer-row" key={`${message.id}-${index}`}><strong>{row.title}</strong><p>{row.detail}</p></div>)}</div>}
                  {message.action && <ActionCard action={message.action} state={actionStates[message.action.id]} now={now} disabled={Boolean(activeAction) || chatBusy} onAction={operation => void handleAction(message.action!, operation)} />}
                </div>
              </article>)}
              {chatBusy && <article className="chat-message assistant"><span className="message-avatar"><Bot size={18} /></span><div className="message-content"><div className="message-author">TSIN 招聘助手</div><div className="message-bubble typing"><LoaderCircle size={16} className="spin" />正在整理招聘事项…</div></div></article>}
              <div ref={chatBottom} />
            </div>
            <div className="chat-compose">
              {context && <div className="context-note"><AlertCircle size={15} /><span>正在补充：{context.missing.map(key => SLOT_LABELS[key] || key).join("、") || "上一项招聘事项"}</span><button onClick={() => clearContext()} disabled={chatBusy || Boolean(activeAction)} title="结束补充，开始新事项" aria-label="结束补充，开始新事项"><X size={14} /></button></div>}
              <div className="quick-prompts"><span>试着说</span>{examples.map(example => <button key={example} onClick={() => fillExample(example)} disabled={chatBusy || Boolean(activeAction)} title={example}>{example}</button>)}</div>
              <form className="compose-box" onSubmit={sendMessage}><textarea ref={chatTextarea} aria-label="招聘事项" value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder={context ? "继续补充姓名、日期、时间、面试官或地点…" : "例如：林演示通过简历筛选，安排明天15:00一面…"} maxLength={3000} rows={2} disabled={chatBusy || Boolean(activeAction)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="compose-footer"><span><ShieldCheck size={13} />本地指令处理，不调用外部模型</span><button type="submit" className="send-button" disabled={!chatInput.trim() || chatBusy || Boolean(activeAction)} aria-label="发送招聘事项">{chatBusy ? <LoaderCircle size={19} className="spin" /> : <ArrowUp size={20} />}</button></div></form>
              <p className="compose-hint">Enter 发送 · Shift + Enter 换行 · 点击例句只填入，不会自动发送</p>
            </div>
          </section>;
}
