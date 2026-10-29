"use client";

import { useState } from "react";
import { ArrowRight, Calendar, Clock, Download, FileText, MessageSquare, X } from "lucide-react";
import type { Candidate, Workspace } from "@/lib/types";
import { dateLabel } from "@/lib/format";
import { StageBadge } from "@/components/ui/stage-badge";
import { RESUME_FIELD_DEFINITIONS, RESUME_FIELD_KEYS } from "@/lib/resume-schema";

function SavedParseEvidence({ candidate }: { candidate: Candidate }) {
  const review = candidate.resumeReview;
  if (!review) return null;
  return <section className="drawer-section"><h3>提取与核对记录</h3><p className="subtle-text">{review.source.format.toUpperCase()} · 字段标准 {review.schemaVersion}{review.correctedFields.length ? ` · 保存前调整：${review.correctedFields.map(key => RESUME_FIELD_DEFINITIONS[key].label).join("、")}` : " · 人工确认保存"}</p><details><summary>查看提取时的字段依据</summary><p className="subtle-text">下列状态和证据对应自动提取时的结果；行号对应整理后文本。</p>{RESUME_FIELD_KEYS.map(key => {
    const result = review.fieldResults[key];
    return <div key={key} className="profile-activity"><div><strong>{RESUME_FIELD_DEFINITIONS[key].label} · {review.correctedFields.includes(key) ? "保存前已修改" : { found: "已提取", review: "需核对", missing: "未找到" }[result.status]}</strong><p>{result.note}</p>{result.evidence.map(item => <p key={`${item.line}:${item.text}`}>L{item.line} · {item.text}</p>)}</div></div>;
  })}<pre className="raw-resume">{review.normalizedText}</pre></details></section>;
}

export function CandidateDrawer({ candidate, workspace, onClose, onFollow }: { candidate: Candidate; workspace: Workspace; onClose: () => void; onFollow: () => void }) {
  const [tab, setTab] = useState<"profile" | "original">("profile");
  const activities = workspace.activities.filter(item => item.candidateId === candidate.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const interviews = workspace.interviews.filter(item => item.candidateId === candidate.id);
  const fileUrl = `/api/candidates/${encodeURIComponent(candidate.id)}/file`;
  return <div className="drawer-backdrop" onClick={event => { if (event.target === event.currentTarget) onClose(); }}><section className="candidate-drawer" role="dialog" aria-modal="true" aria-labelledby="candidate-drawer-title"><div className="drawer-top"><span className="eyebrow">APPLICATION PROFILE</span><button className="icon-button" aria-label="关闭候选人档案" onClick={onClose}><X size={19} /></button></div><div className="drawer-person"><span className="large-avatar">{candidate.name.slice(0, 1)}</span><div><h2 id="candidate-drawer-title">{candidate.name}</h2><p>{candidate.jobTitle}</p></div><StageBadge stage={candidate.stage} /></div><div className="candidate-id">申请 ID <code>{candidate.id}</code></div><div className="drawer-tabs"><button className={tab === "profile" ? "active" : ""} onClick={() => setTab("profile")}>申请档案</button><button className={tab === "original" ? "active" : ""} onClick={() => setTab("original")}>原始简历</button></div><div className="drawer-body">
    {tab === "profile" ? <><div className="follow-card"><span><Clock size={18} /></span><div><small>下一步</small><strong>{candidate.nextAction || "待跟进"}</strong><p>{candidate.nextActionAt ? dateLabel(candidate.nextActionAt) : "跟进时间尚未设置"}</p></div></div><dl className="profile-fields"><div><dt>电话</dt><dd>{candidate.phone || "待补充"}</dd></div><div><dt>邮箱</dt><dd>{candidate.email || "待补充"}</dd></div><div><dt>城市</dt><dd>{candidate.city || "待补充"}</dd></div><div><dt>工作年限</dt><dd>{candidate.yearsOfExperience === null ? "待补充" : `${candidate.yearsOfExperience} 年`}</dd></div><div><dt>教育背景</dt><dd>{candidate.education || "待补充"}</dd></div><div><dt>当前职位</dt><dd>{candidate.currentTitle || "待补充"}</dd></div></dl><section className="drawer-section"><h3>技能</h3><div className="skill-list">{candidate.skills.length ? candidate.skills.map(skill => <span className="skill-chip" key={skill}>{skill}</span>) : <p className="subtle-text">暂无已核对技能</p>}</div></section><section className="drawer-section"><h3>面试安排<span>{interviews.length}</span></h3>{interviews.length ? interviews.map(interview => <article className="profile-interview" key={interview.id}><Calendar size={17} /><div><strong>{interview.round} · {interview.date} {interview.time}</strong><p>{interview.interviewer} · {interview.location}</p></div></article>) : <p className="subtle-text">暂无面试安排</p>}</section><section className="drawer-section"><h3>关联处理记录<span>{activities.length}</span></h3>{activities.length ? activities.map(activity => <div className="profile-activity" key={activity.id}><span className="activity-dot" /><div><strong>{activity.title}</strong><p>{activity.detail}</p><time>{dateLabel(activity.createdAt)}</time></div></div>) : <p className="subtle-text">暂无关联记录</p>}</section></> : <><div className="original-header"><div><FileText size={17} /><strong>{candidate.sourceName || "粘贴文本"}</strong></div>{candidate.hasFile && <a className="button secondary compact" href={fileUrl} target="_blank" rel="noreferrer"><Download size={14} />下载原件</a>}</div><h3 className="raw-text-heading">提取原文</h3><pre className="raw-resume">{candidate.rawText || "暂无可显示的原文"}</pre><SavedParseEvidence candidate={candidate} /></>}
    </div><div className="drawer-footer"><button className="button primary full" onClick={onFollow}><MessageSquare size={16} />在助手中跟进<ArrowRight size={15} /></button></div></section></div>;
}
