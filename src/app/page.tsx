"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AlertCircle, ArrowRight, ArrowUp, Bot, BriefcaseBusiness, Calendar, Check, CheckCircle2, ChevronRight, Clock, Download, FileText, LoaderCircle, MessageSquare, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Upload, Users, X } from "lucide-react";
import { STAGES, type ActionPreview, type AssistantContext, type AssistantReply, type Candidate, type ConfirmationResult, type Job, type ResumeDraft, type ResumeFields, type Workspace } from "@/lib/types";

type View = "assistant" | "intake" | "candidates";
type ActionState = { status: "pending" | "confirming" | "cancelling" | "applied" | "cancelled" | "expired"; message?: string };
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; rows?: AssistantReply["rows"]; action?: ActionPreview; error?: boolean };
const EMPTY: Workspace = { jobs: [], candidates: [], interviews: [], activities: [] };
const VIEW_TITLES: Record<View, [string, string]> = {
  assistant: ["招聘助手", "用自然语言查询信息、整理安排和推进招聘事项"],
  intake: ["简历入库", "提取简历字段，核对后建立候选人申请档案"],
  candidates: ["候选人台账", "集中查看岗位申请、招聘进度和处理记录"]
};

class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.error || body.message || `请求未完成（${response.status}）`, response.status);
  return body as T;
}
const json = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
const messageOf = (error: unknown) => error instanceof Error ? error.message : "操作未完成，请稍后重试。";
const splitSkills = (value: string) => [...new Set(value.split(/[，,、\n]/).map(item => item.trim()).filter(Boolean))];
const SLOT_LABELS: Record<string, string> = { candidate: "候选人", candidateName: "候选人姓名", candidateId: "候选人 ID", date: "日期", time: "时间", round: "面试轮次", stage: "招聘阶段", job: "申请岗位", interviewer: "面试官", location: "地点" };
function dateLabel(value?: string | null) {
  if (!value) return "未设置";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}
function StageBadge({ stage }: { stage: string }) { return <span className={`stage-badge ${stage === "已淘汰" ? "muted" : ["Offer", "待入职", "已入职"].includes(stage) ? "green" : "purple"}`}>{stage}</span>; }
function EmptyState({ icon, title, text, children }: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return <div className="empty-state"><span>{icon || <FileText size={24} />}</span><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>;
}

export default function Home() {
  const [view, setView] = useState<View>("assistant");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState("");
  const [notice, setNotice] = useState("");
  const [jobModal, setJobModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: "welcome", role: "assistant", text: "你好，我是 TSIN 招聘助手。\n你可以查询候选人、面试安排和处理记录。需要推进阶段或安排面试时，我会先整理变更内容，等你确认后再执行。" }]);
  const [now, setNow] = useState(0);
  const chatBottom = useRef<HTMLDivElement>(null);
  const chatTextarea = useRef<HTMLTextAreaElement>(null);
  const data = workspace || EMPTY;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const next = await request<Workspace>("/api/workspace");
      setWorkspace(next); setWorkspaceError("");
      return next;
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload().catch(error => setWorkspaceError(messageOf(error))); }, [reload]);
  useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 10_000); return () => window.clearInterval(timer); }, []);
  useEffect(() => { chatBottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, chatBusy]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 5_000); return () => window.clearTimeout(timer); }, [notice]);

  async function refreshAfterWrite() {
    try { await reload(); }
    catch (error) { setWorkspaceError(`操作已保存，但工作台刷新失败：${messageOf(error)} 请点击“刷新”重新读取。`); }
  }
  async function sendMessage(event: FormEvent) {
    event.preventDefault(); const text = chatInput.trim();
    if (!text || chatBusy || activeAction || !workspace) return;
    setMessages(all => [...all, { id: crypto.randomUUID(), role: "user", text }]);
    setChatInput("");
    if (/^(?:取消(?:这(?:项|次)(?:操作|安排))?|取消吧|算了|不改了|先不改了|不用了|不安排了|不用安排了)[。！!\s]*$/.test(text)) {
      setContext(null);
      const pending = [...messages].reverse().find(message => message.action && actionStates[message.action.id]?.status === "pending")?.action;
      if (pending) await handleAction(pending, "cancel");
      else setMessages(all => [...all, { id: crypto.randomUUID(), role: "assistant", text: "已结束当前补充。当前没有待确认的操作，也没有执行新的变更。" }]);
      return;
    }
    setChatBusy(true);
    try {
      const reply = await request<AssistantReply>("/api/assistant", json({ message: text, ...(context ? { context } : {}) }));
      setContext(reply.context ?? null);
      if (reply.action) setActionStates(all => all[reply.action!.id] ? all : ({ ...all, [reply.action!.id]: { status: "pending" } }));
      setMessages(all => [...all, { id: crypto.randomUUID(), role: "assistant", text: reply.message, rows: reply.rows, action: reply.action }]);
    } catch (error) {
      setMessages(all => [...all, { id: crypto.randomUUID(), role: "assistant", text: `这次请求未完成：${messageOf(error)} 请重新发送或补充。`, error: true }]);
    } finally { setChatBusy(false); }
  }
  async function handleAction(action: ActionPreview, operation: "confirm" | "cancel") {
    const state = actionStates[action.id];
    if (activeAction || chatBusy || state?.status !== "pending") return;
    if (!Number.isFinite(Date.parse(action.expiresAt)) || Date.parse(action.expiresAt) <= Date.now()) {
      setActionStates(all => ({ ...all, [action.id]: { status: "expired", message: "预览已过期，请重新描述这项操作。" } }));
      if (operation === "cancel") setMessages(all => [...all, { id: crypto.randomUUID(), role: "assistant", text: "这项操作预览已经过期，不能再执行。已结束当前事项。" }]);
      return;
    }
    setActiveAction(action.id);
    setActionStates(all => ({ ...all, [action.id]: { status: operation === "confirm" ? "confirming" : "cancelling" } }));
    try {
      const result = await request<ConfirmationResult>(`/api/assistant/${operation}`, json({ actionId: action.id }));
      setActionStates(all => ({ ...all, [action.id]: { status: operation === "confirm" ? "applied" : "cancelled", message: result.message } }));
      setContext(null);
      if (operation === "cancel") setMessages(all => [...all, { id: crypto.randomUUID(), role: "assistant", text: result.message }]);
      if (operation === "confirm") await refreshAfterWrite();
    } catch (error) {
      const final = error instanceof ApiError && [404, 409, 410].includes(error.status);
      setActionStates(all => ({ ...all, [action.id]: { status: final ? "expired" : "pending", message: messageOf(error) } }));
    } finally { setActiveAction(null); }
  }
  function fillExample(text: string) { setChatInput(text); chatTextarea.current?.focus(); }
  function followCandidate(candidate: Candidate) {
    setSelectedId(null); setView("assistant"); setContext(null);
    setChatInput(`${candidate.name}现在到哪一步？候选人ID：${candidate.id}`);
  }
  const exampleCandidate = data.candidates.find(candidate => candidate.id === "candidate_chen") || data.candidates.find(candidate => !data.interviews.some(interview => interview.candidateId === candidate.id)) || data.candidates[0];
  const examples = ["今天有哪些面试？", "有哪些候选人需要跟进？", "最近进行了哪些操作？", `${exampleCandidate?.name || "林演示"}通过简历筛选，请安排明天15:00一面`];
  const selectedCandidate = data.candidates.find(candidate => candidate.id === selectedId);

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={event => { event.preventDefault(); setView("assistant"); }}><span className="brand-symbol"><Sparkles size={23} /></span><span><strong>TSIN<span className="brand-dot">.</span></strong><small>招聘协作工作台</small></span></a>
      <div className="workspace-label">我的工作台</div>
      <nav aria-label="主要导航">
        <button className={view === "assistant" ? "active" : ""} onClick={() => setView("assistant")}><MessageSquare size={18} /><span>招聘助手</span><span className="nav-mark">主入口</span></button>
        <button className={view === "intake" ? "active" : ""} onClick={() => setView("intake")}><FileText size={18} /><span>简历入库</span></button>
        <button className={view === "candidates" ? "active" : ""} onClick={() => setView("candidates")}><Users size={18} /><span>候选人台账</span><span className="nav-count">{data.candidates.length}</span></button>
      </nav>
      <div className="sidebar-note"><ShieldCheck size={17} /><strong>每次变更，先确认</strong><p>助手提出操作建议，<br />最终由你确认执行。</p></div>
      <div className="sidebar-foot"><span className="avatar">HR</span><div><strong>招聘负责人</strong><small><i />本地工作区</small></div></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div><div className="breadcrumb">工作台 <ChevronRight size={13} /> {VIEW_TITLES[view][0]}</div><h1>{VIEW_TITLES[view][0]}</h1></div><div className="topbar-actions"><span className="mode-pill"><i />本地指令模式</span><button className="button secondary compact" onClick={() => setJobModal(true)}><BriefcaseBusiness size={16} />岗位配置<span>{data.jobs.length}</span></button><button className="icon-button" title="刷新工作台" aria-label="刷新工作台" disabled={loading} onClick={() => void reload().catch(error => setWorkspaceError(messageOf(error)))}><RefreshCw size={17} className={loading ? "spin" : ""} /></button></div></header>
      {workspaceError && <div className="global-error" role="alert"><AlertCircle size={17} /><span>{workspaceError}</span><button onClick={() => void reload().catch(error => setWorkspaceError(messageOf(error)))} disabled={loading}>重新读取</button></div>}
      <div className="page-intro"><p>{VIEW_TITLES[view][1]}</p><span><ShieldCheck size={14} />候选人资料仅用于当前招聘工作区</span></div>

      {loading && !workspace ? <div className="initial-loading"><LoaderCircle size={26} className="spin" /><p>正在读取工作区…</p></div> : !workspace ? <EmptyState icon={<AlertCircle size={25} />} title="工作区暂时无法读取" text="请确认本地服务正常运行，再重新读取。"><button className="button primary" onClick={() => void reload().catch(error => setWorkspaceError(messageOf(error)))}>重新读取</button></EmptyState> : <div className={`content-grid ${view !== "assistant" ? "wide-main" : ""}`}>
        <div className="primary-content">
          {view === "assistant" && <section className="chat-panel panel">
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
              {context && <div className="context-note"><AlertCircle size={15} /><span>正在补充：{context.missing.map(key => SLOT_LABELS[key] || key).join("、") || "上一项招聘事项"}</span><button onClick={() => setContext(null)} disabled={chatBusy || Boolean(activeAction)} title="结束补充，开始新事项" aria-label="结束补充，开始新事项"><X size={14} /></button></div>}
              <div className="quick-prompts"><span>试着说</span>{examples.map(example => <button key={example} onClick={() => fillExample(example)} disabled={chatBusy || Boolean(activeAction)} title={example}>{example}</button>)}</div>
              <form className="compose-box" onSubmit={sendMessage}><textarea ref={chatTextarea} aria-label="招聘事项" value={chatInput} onChange={event => setChatInput(event.target.value)} placeholder={context ? "继续补充姓名、日期、时间、面试官或地点…" : "例如：林演示通过简历筛选，安排明天15:00一面…"} maxLength={3000} rows={2} disabled={chatBusy || Boolean(activeAction)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><div className="compose-footer"><span><ShieldCheck size={13} />本地指令处理，不调用外部模型</span><button type="submit" className="send-button" disabled={!chatInput.trim() || chatBusy || Boolean(activeAction)} aria-label="发送招聘事项">{chatBusy ? <LoaderCircle size={19} className="spin" /> : <ArrowUp size={20} />}</button></div></form>
              <p className="compose-hint">Enter 发送 · Shift + Enter 换行 · 点击例句只填入，不会自动发送</p>
            </div>
          </section>}
          {view === "intake" && <ResumeIntake jobs={data.jobs} onNewJob={() => setJobModal(true)} onCreated={async candidate => { setWorkspace(current => current ? { ...current, candidates: [candidate, ...current.candidates.filter(item => item.id !== candidate.id)] } : current); await refreshAfterWrite(); setView("candidates"); setSelectedId(candidate.id); setNotice("候选人申请已保存，可以在台账中继续跟进。"); }} />}
          {view === "candidates" && <CandidateLedger candidates={data.candidates} jobs={data.jobs} onOpen={setSelectedId} onIntake={() => setView("intake")} />}
        </div>
        {view === "assistant" && <aside className="context-sidebar"><WorkspaceAside workspace={data} onOpen={setSelectedId} /></aside>}
      </div>}
      <footer className="page-footer"><span>TSIN · 招聘流程协作原型</span><span>结构化信息 · 人工确认 · 操作可追溯</span></footer>
    </main>
    {jobModal && <JobModal jobs={data.jobs} onClose={() => setJobModal(false)} onCreated={async job => { setWorkspace(current => current ? { ...current, jobs: [job, ...current.jobs.filter(item => item.id !== job.id)] } : current); await refreshAfterWrite(); setNotice(`岗位「${job.title}」已创建。`); }} />}
    {selectedCandidate && <CandidateDrawer candidate={selectedCandidate} workspace={data} onClose={() => setSelectedId(null)} onFollow={() => followCandidate(selectedCandidate)} />}
    {notice && <div className="toast" role="status"><CheckCircle2 size={18} />{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div>}
  </div>;
}

function ActionCard({ action, state, now, disabled, onAction }: { action: ActionPreview; state?: ActionState; now: number; disabled: boolean; onAction: (operation: "confirm" | "cancel") => void }) {
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

function WorkspaceAside({ workspace, onOpen }: { workspace: Workspace; onOpen: (id: string) => void }) {
  const interviews = [...workspace.interviews].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).slice(0, 5);
  const activities = [...workspace.activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  return <><section className="panel side-panel"><div className="side-heading"><span><Calendar size={17} />面试安排</span><span className="count-chip">{workspace.interviews.length}</span></div><p className="section-caption">当前工作区的面试日程</p>{interviews.length ? <div className="schedule-list">{interviews.map(interview => <button key={interview.id} className="schedule-item" onClick={() => onOpen(interview.candidateId)}><div className="schedule-date"><strong>{interview.date.slice(5).replace("-", "/")}</strong><span>{interview.time}</span></div><div><strong>{interview.candidateName}<span>{interview.round}</span></strong><p>{interview.interviewer} · {interview.location}</p></div><ChevronRight size={13} /></button>)}</div> : <div className="side-empty"><Calendar size={22} /><p>还没有面试安排</p><small>可以请助手整理一场面试</small></div>}</section>
    <section className="panel side-panel"><div className="side-heading"><span><Clock size={17} />最近处理记录</span></div><p className="section-caption">已保存操作的实际反馈</p>{activities.length ? <div className="activity-list">{activities.map(activity => <button className="activity-item" key={activity.id} onClick={() => onOpen(activity.candidateId)}><span className="activity-dot" /><div><strong>{activity.title}</strong><p>{activity.detail}</p><time>{dateLabel(activity.createdAt)}</time></div></button>)}</div> : <div className="side-empty"><Clock size={22} /><p>暂时没有处理记录</p><small>确认变更或入库后会显示在这里</small></div>}</section>
    <div className="local-mode-note"><ShieldCheck size={17} /><div><strong>本地指令模式</strong><p>支持明确的查询、阶段更新和面试安排。遇到缺失信息，助手会继续询问。</p></div></div></>;
}

function ResumeIntake({ jobs, onNewJob, onCreated }: { jobs: Job[]; onNewJob: () => void; onCreated: (candidate: Candidate) => Promise<void> }) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [parsedFile, setParsedFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<ResumeDraft | null>(null);
  const [fields, setFields] = useState<ResumeFields | null>(null);
  const [skillsText, setSkillsText] = useState("");
  const [jobId, setJobId] = useState(jobs[0]?.id || "");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (!jobs.some(job => job.id === jobId)) setJobId(jobs[0]?.id || ""); }, [jobs, jobId]);
  const selectedJob = jobs.find(job => job.id === jobId);
  const rawText = draft?.rawText.toLowerCase() || "";
  const hits = selectedJob?.requiredSkills.filter(skill => rawText.includes(skill.toLowerCase())) || [];
  const missing = selectedJob?.requiredSkills.filter(skill => !rawText.includes(skill.toLowerCase())) || [];
  function clearDraft() { setDraft(null); setFields(null); setParsedFile(null); setToken(""); setError(""); }
  function field<K extends keyof ResumeFields>(key: K, value: ResumeFields[K]) { setFields(current => current ? { ...current, [key]: value } : current); }
  async function parse(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (mode === "file" && !file) { setError("请先选择一份简历文件。"); return; }
    if (mode === "text" && !text.trim()) { setError("请先粘贴简历文本。"); return; }
    if (mode === "file" && file && (!/\.(pdf|docx|txt)$/i.test(file.name) || file.size > 4 * 1024 * 1024)) { setError("请选择不超过 4 MB 的 PDF、DOCX 或 TXT 文件。"); return; }
    setBusy("parse"); setError(""); setDraft(null); setFields(null);
    try {
      const form = new FormData();
      if (mode === "file" && file) form.set("file", file); else form.set("text", text.trim());
      const result = await request<{ draft: ResumeDraft }>("/api/resumes/parse", { method: "POST", body: form });
      setDraft(result.draft); setFields(result.draft.fields); setSkillsText(result.draft.fields.skills.join("，")); setParsedFile(mode === "file" ? file : null); setToken(crypto.randomUUID());
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(null); }
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy || !draft || !fields || !token) return;
    if (!jobId || !fields.name.trim()) { setError("请填写候选人姓名，并选择申请岗位。"); return; }
    setBusy("save"); setError("");
    try {
      const form = new FormData();
      form.set("jobId", jobId); form.set("fields", JSON.stringify({ ...fields, name: fields.name.trim(), skills: splitSkills(skillsText) })); form.set("text", draft.rawText); form.set("confirmationToken", token);
      if (parsedFile) form.set("file", parsedFile);
      const result = await request<{ candidate: Candidate }>("/api/candidates", { method: "POST", body: form });
      await onCreated(result.candidate);
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(null); }
  }
  return <div className="intake-layout"><section className="panel intake-source"><div className="section-heading"><span className="step-badge">01</span><div><h2>添加简历资料</h2><p>支持文本 PDF、DOCX、TXT</p></div></div><form onSubmit={parse}>
    <div className="segmented" aria-label="简历来源"><button type="button" className={mode === "file" ? "active" : ""} disabled={Boolean(busy)} onClick={() => { setMode("file"); clearDraft(); }}><Upload size={15} />上传文件</button><button type="button" className={mode === "text" ? "active" : ""} disabled={Boolean(busy)} onClick={() => { setMode("text"); clearDraft(); }}><FileText size={15} />粘贴文本</button></div>
    {mode === "file" ? <><input ref={input} hidden type="file" accept=".pdf,.docx,.txt" disabled={Boolean(busy)} onChange={event => { setFile(event.target.files?.[0] || null); clearDraft(); }} /><button type="button" className={`upload-area ${file ? "has-file" : ""}`} disabled={Boolean(busy)} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) { setFile(event.dataTransfer.files[0] || null); clearDraft(); } }}><span><FileText size={28} /></span><strong>{file ? file.name : "点击选择或拖入简历"}</strong><small>{file ? `${(file.size / 1024).toFixed(1)} KB · 点击重新选择` : "单份不超过 4 MB"}</small></button><p className="input-note">扫描件和图片 OCR 尚未实现，请使用可提取文本的简历。</p></> : <label className="field source-text"><span>简历原文</span><textarea value={text} onChange={event => { setText(event.target.value); clearDraft(); }} disabled={Boolean(busy)} rows={13} placeholder={"姓名：林演示\n邮箱：demo@example.com\n工作经验：3年\n教育背景：本科\n技能：Python、FastAPI、PostgreSQL\n…"} /></label>}
    <button className="button primary full" type="submit" disabled={Boolean(busy) || (mode === "file" ? !file : !text.trim())}>{busy === "parse" ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{busy === "parse" ? "正在提取简历字段…" : "提取字段并核对"}</button></form><div className="gentle-note"><ShieldCheck size={16} /><p>使用本地规则提取。保存前请核对字段，不会自动推进招聘阶段。</p></div></section>
    <section className="panel intake-review"><div className="section-heading"><span className="step-badge">02</span><div><h2>核对并建立申请档案</h2><p>原文关键词只用于辅助核实</p></div></div>
      {error && <div className="inline-error" role="alert"><AlertCircle size={16} />{error}</div>}
      {!draft || !fields ? <EmptyState icon={<FileText size={28} />} title={busy === "parse" ? "正在读取简历" : "核对结果会显示在这里"} text="先添加文件或粘贴文本，再提取并核对候选人资料。" /> : <form onSubmit={save}>
        <div className="review-source"><FileText size={15} /><span>{draft.sourceName}</span><span className="small-mode">本地规则</span></div>
        <div className="form-grid"><label className="field"><span>姓名 <b>*</b></span><input value={fields.name} required disabled={Boolean(busy)} onChange={event => field("name", event.target.value)} /></label><label className="field"><span>申请岗位 <b>*</b></span><select value={jobId} disabled={Boolean(busy) || !jobs.length} onChange={event => setJobId(event.target.value)}>{!jobs.length && <option value="">请先创建岗位</option>}{jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><label className="field"><span>联系电话</span><input value={fields.phone} disabled={Boolean(busy)} onChange={event => field("phone", event.target.value)} /></label><label className="field"><span>邮箱</span><input type="email" value={fields.email} disabled={Boolean(busy)} onChange={event => field("email", event.target.value)} /></label><label className="field"><span>所在城市</span><input value={fields.city} disabled={Boolean(busy)} onChange={event => field("city", event.target.value)} /></label><label className="field"><span>工作年限</span><input type="number" min="0" max="80" step="0.5" value={fields.yearsOfExperience ?? ""} disabled={Boolean(busy)} onChange={event => field("yearsOfExperience", event.target.value === "" ? null : Number(event.target.value))} /></label><label className="field"><span>学历 / 教育背景</span><input value={fields.education} disabled={Boolean(busy)} onChange={event => field("education", event.target.value)} /></label><label className="field"><span>当前职位</span><input value={fields.currentTitle} disabled={Boolean(busy)} onChange={event => field("currentTitle", event.target.value)} /></label><label className="field span-two"><span>技能（逗号分隔）</span><input value={skillsText} disabled={Boolean(busy)} onChange={event => setSkillsText(event.target.value)} /></label></div>
        {draft.missingFields.length > 0 && <div className="missing-note"><AlertCircle size={14} />原始解析待核对：{draft.missingFields.join("、")}</div>}
        {!jobs.length && <button className="text-button" type="button" onClick={onNewJob}><Plus size={14} />先创建一个岗位</button>}
        {selectedJob && <div className="keyword-panel"><div><h3>与「{selectedJob.title}」对照</h3><small>依据原文关键词展示，不代表能力结论</small></div><p><span className="keyword-label"><Check size={13} />原文命中</span>{hits.length ? hits.map(skill => <span key={skill} className="skill-chip hit">{skill}</span>) : <small>暂未命中要求关键词</small>}</p><p><span className="keyword-label"><AlertCircle size={13} />原文未提及</span>{missing.length ? missing.map(skill => <span key={skill} className="skill-chip missing">{skill}</span>) : <small>要求关键词均有提及，仍需人工核实</small>}</p></div>}
        <div className="review-actions"><span>核对无误后保存到当前工作区</span><button className="button primary" type="submit" disabled={Boolean(busy) || !jobId || !fields.name.trim()}>{busy === "save" ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy === "save" ? "正在保存…" : "确认保存"}</button></div>
      </form>}
    </section></div>;
}

function CandidateLedger({ candidates, jobs, onOpen, onIntake }: { candidates: Candidate[]; jobs: Job[]; onOpen: (id: string) => void; onIntake: () => void }) {
  const [query, setQuery] = useState(""); const [job, setJob] = useState(""); const [stage, setStage] = useState("");
  const filtered = useMemo(() => candidates.filter(candidate => (!job || candidate.jobId === job) && (!stage || candidate.stage === stage) && `${candidate.name} ${candidate.phone} ${candidate.email} ${candidate.jobTitle} ${candidate.id}`.toLowerCase().includes(query.trim().toLowerCase())), [candidates, job, stage, query]);
  return <section className="panel ledger-panel"><div className="ledger-heading"><div><h2>候选人申请<span>{candidates.length}</span></h2><p>每条记录对应一位候选人对一个岗位的申请</p></div><button className="button primary" onClick={onIntake}><Plus size={16} />添加简历</button></div><div className="ledger-filters"><label className="search-field"><Search size={16} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索姓名、联系方式、岗位或 ID" aria-label="搜索候选人" /></label><select aria-label="按岗位筛选" value={job} onChange={event => setJob(event.target.value)}><option value="">全部岗位</option>{jobs.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select><select aria-label="按阶段筛选" value={stage} onChange={event => setStage(event.target.value)}><option value="">全部阶段</option>{STAGES.map(item => <option key={item} value={item}>{item}</option>)}</select></div>
    {filtered.length ? <div className="table-scroll"><table className="candidate-table"><thead><tr><th>候选人</th><th>申请岗位</th><th>当前阶段</th><th>下一步</th><th>最近更新</th><th /></tr></thead><tbody>{filtered.map(candidate => <tr key={candidate.id}><td><button className="candidate-link" onClick={() => onOpen(candidate.id)}><span className="candidate-avatar">{candidate.name.slice(0, 1)}</span><span><strong>{candidate.name}</strong><small>{candidate.email || candidate.phone || "联系方式待补充"}</small></span></button></td><td><strong className="table-job">{candidate.jobTitle}</strong><small className="table-sub">{candidate.currentTitle || "职位待补充"}</small></td><td><StageBadge stage={candidate.stage} /></td><td><span className="next-action">{candidate.nextAction || "待跟进"}</span>{candidate.nextActionAt && <small className="table-sub">{dateLabel(candidate.nextActionAt)}</small>}</td><td className="table-time">{dateLabel(candidate.updatedAt)}</td><td><button className="icon-button" aria-label={`查看${candidate.name}档案`} onClick={() => onOpen(candidate.id)}><ChevronRight size={16} /></button></td></tr>)}</tbody></table></div> : <EmptyState icon={<Users size={28} />} title={candidates.length ? "没有找到符合条件的申请" : "从第一份简历开始"} text={candidates.length ? "试试调整关键词、岗位或招聘阶段。" : "导入一份示例简历，核对信息后就可以请助手推进招聘事项。"}>{!candidates.length && <button className="button primary" onClick={onIntake}><Plus size={16} />添加简历</button>}</EmptyState>}
    <div className="table-footer"><span>显示 {filtered.length} 条申请记录</span><span>阶段更新与面试安排请在招聘助手中发起</span></div></section>;
}

function JobModal({ jobs, onClose, onCreated }: { jobs: Job[]; onClose: () => void; onCreated: (job: Job) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [skills, setSkills] = useState(""); const [description, setDescription] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { const result = await request<{ job: Job }>("/api/jobs", json({ title: title.trim(), requiredSkills: splitSkills(skills), description: description.trim() })); await onCreated(result.job); setTitle(""); setSkills(""); setDescription(""); }
    catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="job-modal panel" role="dialog" aria-modal="true" aria-labelledby="job-modal-title"><div className="modal-heading"><div><span className="eyebrow">JOB CONFIGURATION</span><h2 id="job-modal-title">岗位配置</h2><p>明确岗位要求，便于简历核对与申请管理</p></div><button className="icon-button" aria-label="关闭岗位配置" disabled={busy} onClick={onClose}><X size={19} /></button></div><div className="job-modal-content"><section className="existing-jobs"><h3>当前岗位 <span>{jobs.length}</span></h3>{jobs.length ? jobs.map(job => <article key={job.id}><span><BriefcaseBusiness size={17} /></span><div><strong>{job.title}</strong><p>{job.description || "暂无补充描述"}</p><div className="skill-list">{job.requiredSkills.map(skill => <span className="skill-chip" key={skill}>{skill}</span>)}</div></div></article>) : <p className="subtle-text">当前还没有岗位，请在下方创建。</p>}</section><form onSubmit={save} className="new-job-form"><h3><Plus size={16} />新增岗位</h3><label className="field"><span>岗位名称 <b>*</b></span><input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} placeholder="例如：AI 应用开发工程师" /></label><label className="field"><span>要求技能 <b>*</b></span><input required value={skills} onChange={event => setSkills(event.target.value)} disabled={busy} placeholder="Python、FastAPI、PostgreSQL，逗号分隔" /></label><label className="field"><span>职责与要求</span><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} placeholder="描述具体工作、经验或能力要求…" /></label>{error && <div className="inline-error" role="alert"><AlertCircle size={15} />{error}</div>}<div className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>完成</button><button className="button primary" type="submit" disabled={busy || !title.trim() || !splitSkills(skills).length}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}创建岗位</button></div></form></div></section></div>;
}

function CandidateDrawer({ candidate, workspace, onClose, onFollow }: { candidate: Candidate; workspace: Workspace; onClose: () => void; onFollow: () => void }) {
  const [tab, setTab] = useState<"profile" | "original">("profile");
  const activities = workspace.activities.filter(item => item.candidateId === candidate.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const interviews = workspace.interviews.filter(item => item.candidateId === candidate.id);
  const fileUrl = `/api/candidates/${encodeURIComponent(candidate.id)}/file`;
  return <div className="drawer-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="candidate-drawer" role="dialog" aria-modal="true" aria-labelledby="candidate-drawer-title"><div className="drawer-top"><span className="eyebrow">APPLICATION PROFILE</span><button className="icon-button" aria-label="关闭候选人档案" onClick={onClose}><X size={19} /></button></div><div className="drawer-person"><span className="large-avatar">{candidate.name.slice(0, 1)}</span><div><h2 id="candidate-drawer-title">{candidate.name}</h2><p>{candidate.jobTitle}</p></div><StageBadge stage={candidate.stage} /></div><div className="candidate-id">申请 ID <code>{candidate.id}</code></div><div className="drawer-tabs"><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>申请档案</button><button className={tab === "original" ? "active" : ""} onClick={() => setTab("original")}>原始简历</button></div><div className="drawer-body">
    {tab === "profile" ? <><div className="follow-card"><span><Clock size={18} /></span><div><small>下一步</small><strong>{candidate.nextAction || "待跟进"}</strong><p>{candidate.nextActionAt ? dateLabel(candidate.nextActionAt) : "跟进时间尚未设置"}</p></div></div><dl className="profile-fields"><div><dt>电话</dt><dd>{candidate.phone || "待补充"}</dd></div><div><dt>邮箱</dt><dd>{candidate.email || "待补充"}</dd></div><div><dt>城市</dt><dd>{candidate.city || "待补充"}</dd></div><div><dt>工作年限</dt><dd>{candidate.yearsOfExperience === null ? "待补充" : `${candidate.yearsOfExperience} 年`}</dd></div><div><dt>教育背景</dt><dd>{candidate.education || "待补充"}</dd></div><div><dt>当前职位</dt><dd>{candidate.currentTitle || "待补充"}</dd></div></dl><section className="drawer-section"><h3>技能</h3><div className="skill-list">{candidate.skills.length ? candidate.skills.map(skill => <span className="skill-chip" key={skill}>{skill}</span>) : <p className="subtle-text">暂无已核对技能</p>}</div></section><section className="drawer-section"><h3>面试安排<span>{interviews.length}</span></h3>{interviews.length ? interviews.map(interview => <article className="profile-interview" key={interview.id}><Calendar size={17} /><div><strong>{interview.round} · {interview.date} {interview.time}</strong><p>{interview.interviewer} · {interview.location}</p></div></article>) : <p className="subtle-text">暂无面试安排</p>}</section><section className="drawer-section"><h3>关联处理记录<span>{activities.length}</span></h3>{activities.length ? activities.map(activity => <div className="profile-activity" key={activity.id}><span className="activity-dot" /><div><strong>{activity.title}</strong><p>{activity.detail}</p><time>{dateLabel(activity.createdAt)}</time></div></div>) : <p className="subtle-text">暂无关联记录</p>}</section></> : <><div className="original-header"><div><FileText size={17} /><strong>{candidate.sourceName || "粘贴文本"}</strong></div>{candidate.hasFile && <a className="button secondary compact" href={fileUrl} target="_blank" rel="noreferrer"><Download size={14} />下载原件</a>}</div><h3 className="raw-text-heading">提取原文</h3><pre className="raw-resume">{candidate.rawText || "暂无可显示的原文"}</pre></>}
    </div><div className="drawer-footer"><p><ShieldCheck size={14} />通过招聘助手发起变更，确认后执行</p><button className="button primary full" onClick={onFollow}><MessageSquare size={16} />在助手中跟进<ArrowRight size={15} /></button></div></section></div>;
}
