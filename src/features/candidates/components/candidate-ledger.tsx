"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowDownWideNarrow, BriefcaseBusiness, CalendarDays, ChevronDown, ChevronRight, CircleDot, Columns3, Download, ExternalLink, Group, ListFilter, Mail, MapPin, MessageSquare, MoreHorizontal, Plus, Rows3, Search, Table2, Type, Users, X } from "lucide-react";
import { STAGES, type Candidate, type Job } from "@/lib/types";
import { dateLabel } from "@/lib/format";
import { StageBadge } from "@/components/ui/stage-badge";
import "./candidate-ledger.css";

type View = "all" | "active" | "closed";
type Sort = "updated" | "name" | "stage";
type ColumnKey = "job" | "stage" | "contact" | "city" | "education" | "nextAction" | "updatedAt" | "currentTitle" | "years" | "skills";
const COLUMNS = [
  { key: "job", label: "申请岗位", width: 164, icon: BriefcaseBusiness },
  { key: "stage", label: "招聘阶段", width: 116, icon: CircleDot },
  { key: "contact", label: "联系方式", width: 216, icon: Mail },
  { key: "city", label: "现居城市", width: 100, icon: MapPin },
  { key: "education", label: "最高教育层次", width: 148, icon: Type },
  { key: "nextAction", label: "下一步", width: 200, icon: CalendarDays },
  { key: "updatedAt", label: "更新时间", width: 138, icon: CalendarDays },
  { key: "currentTitle", label: "当前职位", width: 170, icon: Type },
  { key: "years", label: "工作年限", width: 100, icon: Type },
  { key: "skills", label: "技能", width: 260, icon: Type },
] as const;
const CLOSED_STAGES = new Set(["已入职", "已淘汰"]);
const DEFAULT_COLUMNS: ColumnKey[] = ["job", "stage", "contact", "city", "education", "nextAction", "updatedAt"];

function exportCandidates(candidates: Candidate[], columns: ColumnKey[]) {
  const selectedColumns = COLUMNS.filter(column => columns.includes(column.key));
  const valueOf = (candidate: Candidate, key: ColumnKey): string => {
    if (key === "job") return candidate.jobTitle;
    if (key === "contact") return [candidate.email, candidate.phone].filter(Boolean).join(" / ");
    if (key === "nextAction") return [candidate.nextAction, candidate.nextActionAt ? dateLabel(candidate.nextActionAt) : ""].filter(Boolean).join(" / ");
    if (key === "years") return candidate.yearsOfExperience === null ? "" : String(candidate.yearsOfExperience);
    if (key === "skills") return candidate.skills.join("、");
    if (key === "updatedAt") return dateLabel(candidate.updatedAt);
    return candidate[key];
  };
  const csvCell = (value: string) => {
    // Quote CSV content and keep formula-like values as literal text in spreadsheets.
    const literal = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${literal.replaceAll('"', '""')}"`;
  };
  const rows = [["候选人", ...selectedColumns.map(column => column.label)], ...candidates.map(candidate => [candidate.name, ...selectedColumns.map(column => valueOf(candidate, column.key))])];
  const url = URL.createObjectURL(new Blob(["\uFEFF", rows.map(row => row.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "候选人台账.csv";
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function CandidateLedger({ candidates, jobs, onOpen, onIntake, onAsk }: {
  candidates: Candidate[]; jobs: Job[]; onOpen: (id: string) => void; onIntake: () => void; onAsk: (text: string) => void;
}) {
  const [view, setView] = useState<View>("all");
  const [query, setQuery] = useState("");
  const [job, setJob] = useState("");
  const [stage, setStage] = useState("");
  const [sort, setSort] = useState<Sort>("updated");
  const [grouped, setGrouped] = useState(false);
  const [compact, setCompact] = useState(false);
  const [columns, setColumns] = useState<ColumnKey[]>(DEFAULT_COLUMNS);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [menu, setMenu] = useState<{ candidate: Candidate; left: number; top: number } | null>(null);
  const selectAll = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return candidates.filter(candidate => (!job || candidate.jobId === job) && (!stage || candidate.stage === stage)
      && (view === "all" || (view === "closed" ? CLOSED_STAGES.has(candidate.stage) : !CLOSED_STAGES.has(candidate.stage)))
      && [candidate.name, candidate.phone, candidate.email, candidate.city, candidate.currentTitle, candidate.jobTitle, candidate.id, ...candidate.skills].join(" ").toLocaleLowerCase().includes(needle))
      .sort((left, right) => {
        const order = sort === "name" ? left.name.localeCompare(right.name, "zh-CN")
          : sort === "stage" ? STAGES.indexOf(left.stage) - STAGES.indexOf(right.stage)
          : right.updatedAt.localeCompare(left.updatedAt);
        return order || left.name.localeCompare(right.name, "zh-CN") || left.id.localeCompare(right.id);
      });
  }, [candidates, job, stage, query, view, sort]);
  const visibleColumns = COLUMNS.filter(column => columns.includes(column.key));
  const selectedRows = filtered.filter(candidate => selected.has(candidate.id));
  const allSelected = filtered.length > 0 && selectedRows.length === filtered.length;
  const activeCount = candidates.filter(candidate => !CLOSED_STAGES.has(candidate.stage)).length;
  const filterCount = Number(Boolean(job)) + Number(Boolean(stage));
  const groups = grouped ? STAGES.map(value => ({ name: value, rows: filtered.filter(candidate => candidate.stage === value) })).filter(group => group.rows.length) : [{ name: "", rows: filtered }];
  const rowNumbers = new Map(filtered.map((candidate, index) => [candidate.id, index + 1]));

  useEffect(() => { if (selectAll.current) selectAll.current.indeterminate = selectedRows.length > 0 && !allSelected; }, [allSelected, selectedRows.length]);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenu(null); };
    const closeOnScroll = () => setMenu(null);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", closeOnScroll);
    return () => { window.removeEventListener("keydown", close); window.removeEventListener("resize", closeOnScroll); };
  }, [menu]);

  function toggleSelected(id: string) { setSelected(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function toggleAll() { setSelected(current => { const next = new Set(current); for (const candidate of filtered) { if (allSelected) next.delete(candidate.id); else next.add(candidate.id); } return next; }); }
  function toggleColumn(key: ColumnKey) { setColumns(current => current.includes(key) ? current.filter(value => value !== key) : [...current, key]); }
  function toggleGroup(name: string) { setCollapsed(current => { const next = new Set(current); if (next.has(name)) next.delete(name); else next.add(name); return next; }); }
  function resetFilters() { setQuery(""); setJob(""); setStage(""); setView("all"); }
  function ask(candidate: Candidate, action: "query" | "update" | "invite") {
    const message = action === "query" ? `${candidate.name}现在是什么进度？` : action === "update" ? `更新${candidate.name}的招聘阶段` : `邀约${candidate.name}面试`;
    setMenu(null); onAsk(`${message}，候选人ID：${candidate.id}`);
  }
  function cell(candidate: Candidate, key: ColumnKey) {
    if (key === "job") return <span title={candidate.jobTitle}>{candidate.jobTitle}</span>;
    if (key === "stage") return <StageBadge stage={candidate.stage} />;
    if (key === "contact") return <div className="bitable-cell-stack"><span title={candidate.email}>{candidate.email || "—"}</span>{candidate.phone && <small>{candidate.phone}</small>}</div>;
    if (key === "nextAction") return <div className="bitable-cell-stack"><span title={candidate.nextAction}>{candidate.nextAction || "—"}</span>{candidate.nextActionAt && <small>{dateLabel(candidate.nextActionAt)}</small>}</div>;
    if (key === "updatedAt") return <time dateTime={candidate.updatedAt}>{dateLabel(candidate.updatedAt)}</time>;
    if (key === "years") return candidate.yearsOfExperience === null ? <span className="bitable-empty-value">—</span> : `${candidate.yearsOfExperience} 年`;
    if (key === "skills") return <span title={candidate.skills.join("、")}>{candidate.skills.join("、") || "—"}</span>;
    return candidate[key] ? <span title={candidate[key]}>{candidate[key]}</span> : <span className="bitable-empty-value">—</span>;
  }

  return <section className={`bitable-ledger ${compact ? "is-compact" : ""}`} aria-label="候选人台账">
    <div className="bitable-heading"><div><span className="bitable-heading-icon"><Table2 size={19} /></span><h2>候选人管理</h2><span className="bitable-total">{candidates.length} 条记录</span></div><button type="button" className="button primary compact" onClick={onIntake}><Plus size={15} />添加简历</button></div>
    <div className="bitable-view-tabs" role="tablist" aria-label="候选人视图">{([
      ["all", "全部候选人", candidates.length], ["active", "进行中", activeCount], ["closed", "已结束", candidates.length - activeCount],
    ] as const).map(([key, label, count]) => <button type="button" role="tab" id={`candidate-view-${key}`} aria-controls="candidate-grid-view" aria-selected={view === key} className={view === key ? "active" : ""} key={key} onClick={() => setView(key)}><Table2 size={14} />{label}<span>{count}</span></button>)}</div>
    <div className="bitable-toolbar">
      <label className="bitable-search"><Search size={15} /><input aria-label="搜索候选人" placeholder="搜索候选人、岗位、联系方式…" value={query} onChange={event => setQuery(event.target.value)} />{query && <button type="button" aria-label="清空搜索" onClick={() => setQuery("")}><X size={13} /></button>}</label>
      <div className="bitable-tools">
        <details className={`bitable-tool-popover ${filterCount ? "has-value" : ""}`}><summary><ListFilter size={14} />筛选{filterCount > 0 && <span>{filterCount}</span>}<ChevronDown size={12} /></summary><div className="bitable-popover-content bitable-filter-fields"><strong>筛选记录</strong><label>申请岗位<select aria-label="按岗位筛选" value={job} onChange={event => setJob(event.target.value)}><option value="">全部岗位</option>{jobs.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><label>招聘阶段<select aria-label="按阶段筛选" value={stage} onChange={event => setStage(event.target.value)}><option value="">全部阶段</option>{STAGES.map(item => <option key={item} value={item}>{item}</option>)}</select></label><button type="button" className="bitable-text-button" onClick={() => { setJob(""); setStage(""); }}>清除筛选</button></div></details>
        <label className="bitable-sort"><ArrowDownWideNarrow size={14} /><select aria-label="候选人排序" value={sort} onChange={event => setSort(event.target.value as Sort)}><option value="updated">最近更新</option><option value="name">姓名 A → Z</option><option value="stage">招聘阶段</option></select></label>
        <button type="button" className={`bitable-tool-button ${grouped ? "active" : ""}`} aria-pressed={grouped} onClick={() => setGrouped(value => !value)}><Group size={14} />{grouped ? "按阶段分组" : "分组"}</button>
        <details className="bitable-tool-popover bitable-column-popover"><summary><Columns3 size={14} />字段<ChevronDown size={12} /></summary><div className="bitable-popover-content bitable-column-list"><strong>显示字段</strong><label><input type="checkbox" checked disabled />候选人<span>固定</span></label>{COLUMNS.map(column => <label key={column.key}><input type="checkbox" checked={columns.includes(column.key)} onChange={() => toggleColumn(column.key)} />{column.label}</label>)}<button type="button" className="bitable-text-button" onClick={() => setColumns(DEFAULT_COLUMNS)}>恢复默认字段</button></div></details>
        <button type="button" className={`bitable-tool-button ${compact ? "active" : ""}`} aria-label={compact ? "切换为舒适行高" : "切换为紧凑行高"} title={compact ? "切换为舒适行高" : "切换为紧凑行高"} aria-pressed={compact} onClick={() => setCompact(value => !value)}><Rows3 size={14} /><span className="bitable-density-label">{compact ? "紧凑" : "行高"}</span></button>
      </div>
    </div>
    {selectedRows.length > 0 && <div className="bitable-selection-bar"><span>已选择 <strong>{selectedRows.length}</strong> 条记录</span><button type="button" onClick={() => exportCandidates(selectedRows, columns)}><Download size={14} />导出所选</button><button type="button" onClick={() => setSelected(new Set())}><X size={13} />取消选择</button></div>}
    <div className="bitable-scroll" id="candidate-grid-view" role="tabpanel" aria-labelledby={`candidate-view-${view}`} onScroll={() => { if (menu) setMenu(null); }}>
      <table className="bitable-table" style={{ minWidth: 40 + 174 + 84 + visibleColumns.reduce((total, column) => total + column.width, 0) }}>
        <colgroup><col style={{ width: 40 }} /><col style={{ width: 174 }} />{visibleColumns.map(column => <col key={column.key} style={{ width: column.width }} />)}<col style={{ width: 84 }} /></colgroup>
        <thead><tr><th className="bitable-index"><input ref={selectAll} type="checkbox" checked={allSelected} disabled={!filtered.length} onChange={toggleAll} aria-label="选择当前筛选下的所有候选人" /></th><th className="bitable-person-column"><span><Users size={13} />候选人</span></th>{visibleColumns.map(column => <th key={column.key}><span><column.icon size={13} />{column.label}</span></th>)}<th className="bitable-action-column"><span>操作</span></th></tr></thead>
        <tbody>{groups.map(group => <Fragment key={group.name || "all"}>
          {grouped && <tr className="bitable-group-row"><td colSpan={visibleColumns.length + 3}><button type="button" aria-expanded={!collapsed.has(group.name)} onClick={() => toggleGroup(group.name)}>{collapsed.has(group.name) ? <ChevronRight size={14} /> : <ChevronDown size={14} />}<StageBadge stage={group.name} /><span>{group.rows.length} 条记录</span></button></td></tr>}
          {(!grouped || !collapsed.has(group.name)) && group.rows.map(candidate => <tr className={selected.has(candidate.id) ? "is-selected" : ""} key={candidate.id}>
            <td className="bitable-index"><span>{rowNumbers.get(candidate.id)}</span><input type="checkbox" aria-label={`选择${candidate.name}，岗位${candidate.jobTitle}`} checked={selected.has(candidate.id)} onChange={() => toggleSelected(candidate.id)} /></td>
            <td className="bitable-person-column"><button type="button" className="bitable-person" onClick={() => onOpen(candidate.id)} title={`打开${candidate.name}的申请档案`}><span className="bitable-avatar">{candidate.name.slice(0, 1)}</span><strong>{candidate.name}</strong><ExternalLink size={12} /></button></td>
            {visibleColumns.map(column => <td key={column.key}>{cell(candidate, column.key)}</td>)}
            <td className="bitable-action-column"><div><button type="button" aria-label={`查询${candidate.name}的进度`} title="查询进度" onClick={() => ask(candidate, "query")}><MessageSquare size={15} /></button><button type="button" aria-label={`${candidate.name}的更多操作`} title="更多操作" aria-haspopup="menu" aria-expanded={menu?.candidate.id === candidate.id} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setMenu(current => current?.candidate.id === candidate.id ? null : { candidate, left: Math.max(8, Math.min(rect.right - 188, window.innerWidth - 196)), top: Math.max(8, Math.min(rect.bottom + 5, window.innerHeight - 190)) }); }}><MoreHorizontal size={17} /></button></div></td>
          </tr>)}
        </Fragment>)}{!filtered.length && <tr><td colSpan={visibleColumns.length + 3}><div className="bitable-empty"><Users size={27} /><strong>{candidates.length ? "没有符合条件的候选人" : "添加第一位候选人"}</strong><p>{candidates.length ? "调整搜索或筛选条件，查看其他申请记录。" : "上传简历并核对信息，即可建立候选人档案。"}</p><button type="button" className="bitable-text-button" onClick={candidates.length ? resetFilters : onIntake}>{candidates.length ? "清除搜索和筛选" : "添加简历"}</button></div></td></tr>}</tbody>
      </table>
    </div>
    <div className="bitable-footer"><span>共 {filtered.length} 条记录{filtered.length !== candidates.length ? ` / 全部 ${candidates.length} 条` : ""}{selectedRows.length > 0 ? ` · 已选择 ${selectedRows.length} 条` : ""}</span><span>{grouped ? `${groups.length} 个阶段分组` : "表格视图"}</span></div>
    {menu && createPortal(<div className="bitable-menu-backdrop" onClick={() => setMenu(null)}><div className="bitable-row-menu" role="menu" aria-label={`${menu.candidate.name}的操作`} style={{ left: menu.left, top: menu.top }} onClick={event => event.stopPropagation()}><span>{menu.candidate.name} · {menu.candidate.jobTitle}</span><button type="button" role="menuitem" onClick={() => ask(menu.candidate, "query")}><Search size={14} />查询进度</button><button type="button" role="menuitem" onClick={() => ask(menu.candidate, "update")}><CircleDot size={14} />更新招聘进度</button><button type="button" role="menuitem" onClick={() => ask(menu.candidate, "invite")}><CalendarDays size={14} />邀约面试</button><button type="button" role="menuitem" onClick={() => { onOpen(menu.candidate.id); setMenu(null); }}><ExternalLink size={14} />打开申请档案</button></div></div>, document.body)}
  </section>;
}
