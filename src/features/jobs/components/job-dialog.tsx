"use client";

import { useState, type FormEvent } from "react";
import { AlertCircle, BriefcaseBusiness, LoaderCircle, Plus, X } from "lucide-react";
import type { Job } from "@/lib/types";
import { json, messageOf, request } from "@/lib/api-client";
import { splitSkills } from "@/lib/format";

export function JobDialog({ jobs, onClose, onCreated }: { jobs: Job[]; onClose: () => void; onCreated: (job: Job) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [skills, setSkills] = useState(""); const [description, setDescription] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try { const result = await request<{ job: Job }>("/api/jobs", json({ title: title.trim(), requiredSkills: splitSkills(skills), description: description.trim() })); await onCreated(result.job); setTitle(""); setSkills(""); setDescription(""); }
    catch (caught) { setError(messageOf(caught)); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section className="job-modal panel" role="dialog" aria-modal="true" aria-labelledby="job-modal-title"><div className="modal-heading"><div><span className="eyebrow">JOB CONFIGURATION</span><h2 id="job-modal-title">岗位配置</h2><p>明确岗位要求，便于简历核对与申请管理</p></div><button className="icon-button" aria-label="关闭岗位配置" disabled={busy} onClick={onClose}><X size={19} /></button></div><div className="job-modal-content"><section className="existing-jobs"><h3>当前岗位 <span>{jobs.length}</span></h3>{jobs.length ? jobs.map(job => <article key={job.id}><span><BriefcaseBusiness size={17} /></span><div><strong>{job.title}</strong><p>{job.description || "暂无补充描述"}</p><div className="skill-list">{job.requiredSkills.map(skill => <span className="skill-chip" key={skill}>{skill}</span>)}</div></div></article>) : <p className="subtle-text">当前还没有岗位，请在下方创建。</p>}</section><form onSubmit={save} className="new-job-form"><h3><Plus size={16} />新增岗位</h3><label className="field"><span>岗位名称 <b>*</b></span><input required maxLength={100} value={title} onChange={event => setTitle(event.target.value)} disabled={busy} placeholder="例如：AI 应用开发工程师" /></label><label className="field"><span>要求技能 <b>*</b></span><input required value={skills} onChange={event => setSkills(event.target.value)} disabled={busy} placeholder="Python、FastAPI、PostgreSQL，逗号分隔" /></label><label className="field"><span>职责与要求</span><textarea rows={3} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} placeholder="描述具体工作、经验或能力要求…" /></label>{error && <div className="inline-error" role="alert"><AlertCircle size={15} />{error}</div>}<div className="modal-actions"><button className="button secondary" type="button" disabled={busy} onClick={onClose}>完成</button><button className="button primary" type="submit" disabled={busy || !title.trim() || !splitSkills(skills).length}>{busy ? <LoaderCircle size={15} className="spin" /> : <Plus size={15} />}创建岗位</button></div></form></div></section></div>;
}
