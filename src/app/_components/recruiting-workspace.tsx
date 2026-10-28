"use client";

import { useEffect, useState } from "react";
import { AlertCircle, BriefcaseBusiness, CheckCircle2, ChevronRight, FileText, LoaderCircle, MessageSquare, RefreshCw, ShieldCheck, Sparkles, Users, X } from "lucide-react";
import type { Candidate } from "@/lib/types";
import { messageOf } from "@/lib/api-client";
import { EmptyState } from "@/components/ui/empty-state";
import { AssistantPanel } from "@/features/assistant/components/assistant-panel";
import { WorkspaceAside } from "@/features/assistant/components/workspace-aside";
import type { AssistantDraft } from "@/features/assistant/hooks/use-assistant";
import { ResumeIntake } from "@/features/intake/components/resume-intake";
import { CandidateLedger } from "@/features/candidates/components/candidate-ledger";
import { CandidateDrawer } from "@/features/candidates/components/candidate-drawer";
import { JobDialog } from "@/features/jobs/components/job-dialog";
import { useWorkspace } from "@/hooks/use-workspace";

type View = "assistant" | "intake" | "candidates";
const VIEW_TITLES: Record<View, [string, string]> = {
  assistant: ["招聘助手", "用自然语言查询信息、整理安排和推进招聘事项"],
  intake: ["简历入库", "提取简历字段，核对后建立候选人申请档案"],
  candidates: ["候选人台账", "集中查看岗位申请、招聘进度和处理记录"]
};

/** Application composition root: features share data through explicit callbacks. */
export function RecruitingWorkspace() {
  const [view, setView] = useState<View>("assistant");
  const [notice, setNotice] = useState("");
  const [jobModal, setJobModal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [assistantDraft, setAssistantDraft] = useState<AssistantDraft | null>(null);
  const { workspace, data, loading, workspaceError, setWorkspaceError,
    setWorkspace, reload, refreshAfterWrite } = useWorkspace();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function followCandidate(candidate: Candidate) {
    setSelectedId(null);
    setView("assistant");
    setAssistantDraft({ id: crypto.randomUUID(), text: `${candidate.name}现在到哪一步？候选人ID：${candidate.id}` });
  }
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
          <div hidden={view !== "assistant"}><AssistantPanel workspace={data} onChanged={refreshAfterWrite} draft={assistantDraft} /></div>
          {view === "intake" && <ResumeIntake jobs={data.jobs} onNewJob={() => setJobModal(true)} onCreated={async candidate => { setWorkspace(current => current ? { ...current, candidates: [candidate, ...current.candidates.filter(item => item.id !== candidate.id)] } : current); await refreshAfterWrite(); setView("candidates"); setSelectedId(candidate.id); setNotice("候选人申请已保存，可以在台账中继续跟进。"); }} />}
          {view === "candidates" && <CandidateLedger candidates={data.candidates} jobs={data.jobs} onOpen={setSelectedId} onIntake={() => setView("intake")} />}
        </div>
        {view === "assistant" && <aside className="context-sidebar"><WorkspaceAside workspace={data} onOpen={setSelectedId} /></aside>}
      </div>}
      <footer className="page-footer"><span>TSIN · 招聘流程协作原型</span><span>结构化信息 · 人工确认 · 操作可追溯</span></footer>
    </main>
    {jobModal && <JobDialog jobs={data.jobs} onClose={() => setJobModal(false)} onCreated={async job => { setWorkspace(current => current ? { ...current, jobs: [job, ...current.jobs.filter(item => item.id !== job.id)] } : current); await refreshAfterWrite(); setNotice(`岗位「${job.title}」已创建。`); }} />}
    {selectedCandidate && <CandidateDrawer candidate={selectedCandidate} workspace={data} onClose={() => setSelectedId(null)} onFollow={() => followCandidate(selectedCandidate)} />}
    {notice && <div className="toast" role="status"><CheckCircle2 size={18} />{notice}<button aria-label="关闭提示" onClick={() => setNotice("")}><X size={15} /></button></div>}
  </div>;

}
