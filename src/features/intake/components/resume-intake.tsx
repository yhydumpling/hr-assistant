"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Check, FileText, LoaderCircle, Plus, ShieldCheck, Sparkles, Upload } from "lucide-react";
import type { Candidate, Job, ResumeDraft, ResumeFields } from "@/lib/types";
import { messageOf, request } from "@/lib/api-client";
import { splitSkills } from "@/lib/format";
import { hasCanonicalSkill, normalizeSkillName } from "@/lib/resume-skills";
import { RESUME_FIELD_DEFINITIONS, type ResumeFieldKey } from "@/lib/resume-schema";
import { EmptyState } from "@/components/ui/empty-state";
import { ExtractionStatus, ResumeParseInsights } from "./resume-parse-insights";
import "./resume-intake.css";

export function ResumeIntake({ jobs, onNewJob, onCreated }: { jobs: Job[]; onNewJob: () => void; onCreated: (candidate: Candidate) => Promise<void> }) {
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
  const reviewedSkills = [...new Set(splitSkills(skillsText).map(normalizeSkillName))];
  const hits = selectedJob?.requiredSkills.filter(skill => hasCanonicalSkill(reviewedSkills, skill)) || [];
  const missing = selectedJob?.requiredSkills.filter(skill => !hasCanonicalSkill(reviewedSkills, skill)) || [];
  function label(key: ResumeFieldKey, required = false) {
    const before = draft?.fields[key];
    const current = key === "skills" ? reviewedSkills : fields?.[key];
    const comparable = (value: unknown) => Array.isArray(value) ? JSON.stringify(value.map(String).map(normalizeSkillName).sort()) : JSON.stringify(value);
    return <span className="resume-field-label"><span>{RESUME_FIELD_DEFINITIONS[key].label}{required && <> <b>*</b></>}{key === "skills" && "（逗号分隔）"}</span>{draft && <ExtractionStatus status={draft.fieldResults[key].status} modified={comparable(before) !== comparable(current)} />}</span>;
  }
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
      form.set("jobId", jobId); form.set("fields", JSON.stringify({ ...fields, name: fields.name.trim(), skills: reviewedSkills })); form.set("text", draft.rawText); form.set("confirmationToken", token);
      if (parsedFile) form.set("file", parsedFile);
      const result = await request<{ candidate: Candidate }>("/api/candidates", { method: "POST", body: form });
      await onCreated(result.candidate);
    } catch (caught) { setError(messageOf(caught)); }
    finally { setBusy(null); }
  }
  return <div className="intake-layout"><section className="panel intake-source"><div className="section-heading"><span className="step-badge">01</span><div><h2>添加简历资料</h2><p>支持文本 PDF、DOCX、TXT</p></div></div><form onSubmit={parse}>
    <div className="segmented" aria-label="简历来源"><button type="button" className={mode === "file" ? "active" : ""} disabled={Boolean(busy)} onClick={() => { setMode("file"); clearDraft(); }}><Upload size={15} />上传文件</button><button type="button" className={mode === "text" ? "active" : ""} disabled={Boolean(busy)} onClick={() => { setMode("text"); clearDraft(); }}><FileText size={15} />粘贴文本</button></div>
    {mode === "file" ? <><input ref={input} hidden type="file" accept=".pdf,.docx,.txt" disabled={Boolean(busy)} onChange={event => { setFile(event.target.files?.[0] || null); clearDraft(); }} /><button type="button" className={`upload-area ${file ? "has-file" : ""}`} disabled={Boolean(busy)} onClick={() => input.current?.click()} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy) { setFile(event.dataTransfer.files[0] || null); clearDraft(); } }}><span><FileText size={28} /></span><strong>{file ? file.name : "点击选择或拖入简历"}</strong><small>{file ? `${(file.size / 1024).toFixed(1)} KB · 点击重新选择` : "单份不超过 4 MB"}</small></button><p className="input-note">PDF 需包含可选中文字，扫描件和图片请先转为文字。TXT 支持 UTF-8、带 BOM 的 UTF-16 和 GB18030 编码。</p></> : <label className="field source-text"><span>简历原文</span><textarea value={text} onChange={event => { setText(event.target.value); clearDraft(); }} disabled={Boolean(busy)} rows={13} placeholder={"姓名：林演示\n邮箱：demo@example.com\n工作经验：3年\n教育背景：本科\n技能：Python、FastAPI、PostgreSQL\n…"} /></label>}
    <button className="button primary full" type="submit" disabled={Boolean(busy) || (mode === "file" ? !file : !text.trim())}>{busy === "parse" ? <LoaderCircle size={17} className="spin" /> : <Sparkles size={17} />}{busy === "parse" ? "正在提取简历字段…" : "提取字段并核对"}</button></form><div className="gentle-note"><ShieldCheck size={16} /><p>使用本地规则提取。保存前请核对字段，不会自动推进招聘阶段。</p></div></section>
    <section className="panel intake-review"><div className="section-heading"><span className="step-badge">02</span><div><h2>核对并建立申请档案</h2><p>对照字段依据，不确定的信息可修改或留空</p></div></div>
      {error && <div className="inline-error" role="alert"><AlertCircle size={16} />{error}</div>}
      {!draft || !fields ? <EmptyState icon={<FileText size={28} />} title={busy === "parse" ? "正在读取简历" : "核对结果会显示在这里"} text="先添加文件或粘贴文本，再提取并核对候选人资料。" /> : <form onSubmit={save}>
        <div className="review-source"><FileText size={15} /><span>{draft.sourceName}</span><span className="small-mode">本地规则</span></div>
        <ResumeParseInsights draft={draft} />
        <div className="form-grid"><label className="field">{label("name", true)}<input value={fields.name} maxLength={RESUME_FIELD_DEFINITIONS.name.maxLength} required disabled={Boolean(busy)} onChange={event => field("name", event.target.value)} /></label><label className="field"><span>申请岗位 <b>*</b></span><select value={jobId} disabled={Boolean(busy) || !jobs.length} onChange={event => setJobId(event.target.value)}>{!jobs.length && <option value="">请先创建岗位</option>}{jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label><label className="field">{label("phone")}<input value={fields.phone} maxLength={RESUME_FIELD_DEFINITIONS.phone.maxLength} disabled={Boolean(busy)} onChange={event => field("phone", event.target.value)} /></label><label className="field">{label("email")}<input type="email" value={fields.email} maxLength={RESUME_FIELD_DEFINITIONS.email.maxLength} disabled={Boolean(busy)} onChange={event => field("email", event.target.value)} /></label><label className="field">{label("city")}<input value={fields.city} maxLength={RESUME_FIELD_DEFINITIONS.city.maxLength} disabled={Boolean(busy)} onChange={event => field("city", event.target.value)} /></label><label className="field">{label("yearsOfExperience")}<input type="number" min="0" max="80" step="any" value={fields.yearsOfExperience ?? ""} disabled={Boolean(busy)} onChange={event => field("yearsOfExperience", event.target.value === "" ? null : Number(event.target.value))} /></label><label className="field">{label("education")}<input value={fields.education} maxLength={RESUME_FIELD_DEFINITIONS.education.maxLength} disabled={Boolean(busy)} onChange={event => field("education", event.target.value)} /></label><label className="field">{label("currentTitle")}<input value={fields.currentTitle} maxLength={RESUME_FIELD_DEFINITIONS.currentTitle.maxLength} disabled={Boolean(busy)} onChange={event => field("currentTitle", event.target.value)} /></label><label className="field span-two">{label("skills")}<input value={skillsText} disabled={Boolean(busy)} onChange={event => setSkillsText(event.target.value)} /></label></div>
        {!jobs.length && <button className="text-button" type="button" onClick={onNewJob}><Plus size={14} />先创建一个岗位</button>}
        {selectedJob && <div className="keyword-panel"><div><h3>与「{selectedJob.title}」对照</h3><small>按当前技能字段对照，同义写法已统一；不代表能力结论</small></div><p><span className="keyword-label"><Check size={13} />已列出</span>{hits.length ? hits.map(skill => <span key={skill} className="skill-chip hit">{skill}</span>) : <small>技能字段中未列出岗位要求项</small>}</p><p><span className="keyword-label"><AlertCircle size={13} />待核对</span>{missing.length ? missing.map(skill => <span key={skill} className="skill-chip missing">{skill}</span>) : <small>要求项均已列出，仍需核实掌握情况</small>}</p></div>}
        <div className="review-actions"><span>核对无误后保存到当前工作区</span><button className="button primary" type="submit" disabled={Boolean(busy) || !jobId || !fields.name.trim()}>{busy === "save" ? <LoaderCircle size={16} className="spin" /> : <Check size={16} />}{busy === "save" ? "正在保存…" : "确认保存"}</button></div>
      </form>}
    </section></div>;
}
