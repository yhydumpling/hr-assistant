import { randomUUID } from "node:crypto";
import type { Candidate, Job, ResumeFields, Stage } from "@/lib/types";
import type { DatabaseRow as Row } from "@/server/db/client";

export function id(prefix: string) { return `${prefix}_${randomUUID()}`; }
export function parseJson<T>(value: unknown): T { return (typeof value === "string" ? JSON.parse(value) : value) as T; }
export function iso(value: unknown): string { return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString(); }
export function jobFromRow(row: Row): Job {
  return { id: String(row.id), title: String(row.title), requiredSkills: parseJson<string[]>(row.required_skills), description: String(row.description), createdAt: iso(row.created_at) };
}
export function candidateFromRow(row: Row): Candidate {
  return { ...parseJson<ResumeFields>(row.fields_json), id: String(row.id), jobId: String(row.job_id), jobTitle: String(row.job_title), stage: String(row.stage) as Stage,
    nextAction: String(row.next_action), nextActionAt: row.next_action_at ? iso(row.next_action_at) : null,
    version: Number(row.version), sourceName: String(row.source_name), rawText: String(row.raw_text), hasFile: Boolean(row.has_file), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at) };
}
export const CANDIDATE_SELECT = "SELECT c.id,c.job_id,c.fields_json,c.stage,c.next_action,c.next_action_at,c.version,c.source_name,c.raw_text,c.confirmation_token,c.submission_hash,c.created_at,c.updated_at,j.title AS job_title,c.file_blob IS NOT NULL AS has_file FROM candidates c JOIN jobs j ON j.id=c.job_id";
