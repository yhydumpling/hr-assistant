"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { ActionPreview, AssistantContext, AssistantReply, ConfirmationResult, Workspace } from "@/lib/types";
import { ApiError, json, messageOf, request } from "@/lib/api-client";

export type ActionState = {
  status: "pending" | "confirming" | "cancelling" | "applied" | "cancelled" | "expired";
  message?: string;
};
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  rows?: AssistantReply["rows"];
  action?: ActionPreview;
  error?: boolean;
};
export type AssistantDraft = { id: string; text: string };

export function useAssistant(workspace: Workspace, refreshAfterWrite: () => Promise<void>, draft?: AssistantDraft | null) {
  const [chatInput, setChatInput] = useState("");
  const [context, setContext] = useState<AssistantContext | null>(null);
  const [chatBusy, setChatBusy] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({});
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome", role: "assistant",
    text: "你好，我是 TSIN 招聘助手。\n你可以查询候选人、面试安排和处理记录。需要推进阶段或安排面试时，我会先整理变更内容，等你确认后再执行。"
  }]);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 10_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!draft) return;
    setContext(null);
    setChatInput(draft.text);
  }, [draft]);

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

  return {
    chatInput, setChatInput, context, clearContext: () => setContext(null),
    chatBusy, activeAction, actionStates, messages, now, sendMessage, handleAction
  };
}
