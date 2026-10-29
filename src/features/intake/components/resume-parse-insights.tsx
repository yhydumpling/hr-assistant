import { AlertCircle, FileText } from "lucide-react";
import type { ResumeDraft } from "@/lib/types";
import { RESUME_FIELD_DEFINITIONS, RESUME_FIELD_KEYS, type ResumeFieldResult } from "@/lib/resume-schema";

const STATUS_LABELS: Record<ResumeFieldResult["status"], string> = {
  found: "已提取", review: "待核对", missing: "未找到",
};

export function ExtractionStatus({ status, modified = false }: { status: ResumeFieldResult["status"]; modified?: boolean }) {
  return <small className={`resume-field-status ${modified ? "modified" : status}`}>{modified ? "已修改" : STATUS_LABELS[status]}</small>;
}

export function ResumeParseInsights({ draft }: { draft: ResumeDraft }) {
  const counts = { found: 0, review: 0, missing: 0 };
  for (const key of RESUME_FIELD_KEYS) counts[draft.fieldResults[key].status] += 1;
  const format = draft.source.format === "text" ? "粘贴文本" : draft.source.format.toUpperCase();
  return <div className="resume-parse-insights">
    <div className="resume-parse-summary">
      <div className="resume-source-format"><FileText size={14} /><span>{format}{draft.source.pageCount ? ` · ${draft.source.pageCount} 页` : ""}{draft.source.encoding ? ` · ${draft.source.encoding}` : ""}</span></div>
      <div className="resume-parse-counts" aria-label="解析时的字段统计"><small>解析时</small><span>已提取 <strong>{counts.found}</strong></span><span>待核对 <strong>{counts.review}</strong></span><span>未找到 <strong>{counts.missing}</strong></span></div>
    </div>
    {draft.warnings.length > 0 && <div className="resume-parse-warnings"><AlertCircle size={15} /><ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
    <details className="resume-evidence-panel">
      <summary>查看字段依据与文本<span>本次解析记录</span></summary>
      <div className="resume-evidence-body">
        <p className="resume-evidence-note">以下保留提取时的结果，修改后的资料以表单为准。“已提取”仍需核对；“未找到”可留空或对照原文补充。</p>
        {RESUME_FIELD_KEYS.map(key => {
          const result = draft.fieldResults[key];
          const value = draft.fields[key];
          const display = Array.isArray(value) ? value.join("、") : value === null || value === "" ? "留空" : key === "yearsOfExperience" ? `${value} 年` : String(value);
          return <article className="resume-field-evidence" key={key}>
            <div><strong>{RESUME_FIELD_DEFINITIONS[key].label}</strong><ExtractionStatus status={result.status} /></div>
            <p className="resume-extracted-value">提取值：{display}</p>
            {result.note && <p>{result.note}</p>}
            {result.candidates.length > 1 && <p className="resume-candidate-values">候选内容：{result.candidates.join(" / ")}</p>}
            {result.evidence.map((evidence, index) => <blockquote key={`${evidence.line}-${index}`}><small>文本第 {evidence.line} 行</small><span>{evidence.text}</span></blockquote>)}
          </article>;
        })}
        <details className="resume-text-panel"><summary>查看整理后的完整文本</summary><p>行号对应下方整理后的文本，不代表 PDF 或 Word 中的视觉行号。</p><ol>{draft.normalizedText.split("\n").map((line, index) => <li key={index}><span>{line || " "}</span></li>)}</ol></details>
      </div>
    </details>
  </div>;
}
