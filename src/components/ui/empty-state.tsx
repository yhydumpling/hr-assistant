"use client";

import type { ReactNode } from "react";
import { FileText } from "lucide-react";

export function EmptyState({ icon, title, text, children }: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return <div className="empty-state"><span>{icon || <FileText size={24} />}</span><h3>{title}</h3>{text && <p>{text}</p>}{children}</div>;
}
