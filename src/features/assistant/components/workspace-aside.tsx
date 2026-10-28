"use client";

import { Calendar, ChevronRight, Clock, ShieldCheck } from "lucide-react";
import type { Workspace } from "@/lib/types";
import { dateLabel } from "@/lib/format";

export function WorkspaceAside({ workspace, onOpen }: { workspace: Workspace; onOpen: (id: string) => void }) {
  const interviews = [...workspace.interviews].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)).slice(0, 5);
  const activities = [...workspace.activities].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  return <><section className="panel side-panel"><div className="side-heading"><span><Calendar size={17} />面试安排</span><span className="count-chip">{workspace.interviews.length}</span></div><p className="section-caption">当前工作区的面试日程</p>{interviews.length ? <div className="schedule-list">{interviews.map(interview => <button key={interview.id} className="schedule-item" onClick={() => onOpen(interview.candidateId)}><div className="schedule-date"><strong>{interview.date.slice(5).replace("-", "/")}</strong><span>{interview.time}</span></div><div><strong>{interview.candidateName}<span>{interview.round}</span></strong><p>{interview.interviewer} · {interview.location}</p></div><ChevronRight size={13} /></button>)}</div> : <div className="side-empty"><Calendar size={22} /><p>还没有面试安排</p><small>可以请助手整理一场面试</small></div>}</section>
    <section className="panel side-panel"><div className="side-heading"><span><Clock size={17} />最近处理记录</span></div><p className="section-caption">已保存操作的实际反馈</p>{activities.length ? <div className="activity-list">{activities.map(activity => <button className="activity-item" key={activity.id} onClick={() => onOpen(activity.candidateId)}><span className="activity-dot" /><div><strong>{activity.title}</strong><p>{activity.detail}</p><time>{dateLabel(activity.createdAt)}</time></div></button>)}</div> : <div className="side-empty"><Clock size={22} /><p>暂时没有处理记录</p><small>确认变更或入库后会显示在这里</small></div>}</section>
    <div className="local-mode-note"><ShieldCheck size={17} /><div><strong>本地指令模式</strong><p>支持明确的查询、阶段更新和面试安排。遇到缺失信息，助手会继续询问。</p></div></div></>;
}
