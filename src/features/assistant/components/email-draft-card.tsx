"use client";

import { useId, useState } from "react";
import { AlertCircle, Check, Copy, ExternalLink, Mail } from "lucide-react";
import type { EmailDraft } from "@/lib/types";

export type EmailDraftForm = { to: string; cc: string; subject: string; body: string };

export function emailDraftForm(draft: EmailDraft): EmailDraftForm {
  return { to: draft.to.join(", "), cc: draft.cc.join(", "), subject: draft.subject, body: draft.body };
}

function addresses(value: string, label: string, required = false): string[] {
  if (/[\r\n\0]/.test(value)) throw new Error(`${label}不能包含换行。`);
  const values = value.split(/[,，;；]/).map(item => item.trim()).filter(Boolean);
  const result = [...new Map(values.map(item => [item.toLowerCase(), item])).values()];
  if (required && !result.length) throw new Error("请填写收件邮箱。");
  if (result.length > 10) throw new Error(`${label}最多填写 10 个地址。`);
  if (result.some(item => item.length > 150 || !/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i.test(item))) throw new Error(`请检查${label}，多个邮箱用逗号分隔。`);
  return result;
}

export function EmailDraftCard({ draft, form, onChange }: { draft: EmailDraft; form: EmailDraftForm; onChange: (form: EmailDraftForm) => void }) {
  const uid = useId();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  function field(key: keyof EmailDraftForm, value: string) {
    setError(""); setNotice(""); setCopied(false);
    onChange({ ...form, [key]: value });
  }
  function openClient() {
    setError(""); setNotice("");
    try {
      const to = addresses(form.to, "收件人", true);
      const cc = addresses(form.cc, "抄送人").filter(item => !to.some(recipient => recipient.toLowerCase() === item.toLowerCase()));
      if (!form.subject.trim()) throw new Error("请填写邮件主题。");
      if (/[\r\n\0]/.test(form.subject)) throw new Error("邮件主题不能包含换行。");
      if (!form.body.trim()) throw new Error("请填写邮件正文。");
      const query = [cc.length ? `cc=${encodeURIComponent(cc.join(","))}` : "", `subject=${encodeURIComponent(form.subject.trim())}`, `body=${encodeURIComponent(form.body)}`].filter(Boolean).join("&");
      window.location.assign(`mailto:${to.map(item => encodeURIComponent(item)).join(",")}?${query}`);
      setNotice("已请求打开邮件客户端，请在客户端核对并发送。本应用没有发送邮件。");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "无法打开邮件客户端。"); }
  }
  async function copyBody() {
    setError(""); setNotice("");
    try { await navigator.clipboard.writeText(form.body); setCopied(true); }
    catch { setError("复制未完成，请直接选中正文复制。"); }
  }
  return <section className="email-draft-card" aria-labelledby={`${uid}-title`}>
    <div className="email-draft-heading"><span><Mail size={17} /><strong id={`${uid}-title`}>邀请邮件草稿</strong></span><small>未发送</small></div>
    <p className="email-draft-person">{draft.candidateName}</p>
    <div className="email-draft-fields">
      <label htmlFor={`${uid}-to`}>收件人<input id={`${uid}-to`} type="text" inputMode="email" value={form.to} maxLength={1600} onChange={event => field("to", event.target.value)} placeholder="candidate@example.com" /></label>
      <label htmlFor={`${uid}-cc`}>抄送<input id={`${uid}-cc`} type="text" inputMode="email" value={form.cc} maxLength={1600} onChange={event => field("cc", event.target.value)} placeholder="多个邮箱用逗号分隔" /></label>
      <label htmlFor={`${uid}-subject`}>主题<input id={`${uid}-subject`} value={form.subject} maxLength={240} onChange={event => field("subject", event.target.value)} /></label>
      <label htmlFor={`${uid}-body`}>正文<textarea id={`${uid}-body`} value={form.body} maxLength={6000} rows={8} onChange={event => field("body", event.target.value)} /></label>
    </div>
    {error && <p className="email-draft-error" role="alert"><AlertCircle size={14} />{error}</p>}
    {notice && <p className="email-draft-notice" role="status">{notice}</p>}
    <div className="email-draft-actions"><button type="button" className="button secondary compact" onClick={() => void copyBody()}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "已复制" : "复制正文"}</button><button type="button" className="button primary compact" onClick={openClient}><ExternalLink size={14} />在邮件客户端打开</button></div>
    <p className="email-draft-footnote">发送操作在你的邮件客户端完成。</p>
  </section>;
}
