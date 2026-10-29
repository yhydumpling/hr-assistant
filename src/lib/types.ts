import type { ResumeFields, ResumeParseDetails, ResumeReview } from "@/lib/resume-schema";
export type { ResumeFields } from "@/lib/resume-schema";

export const STAGES = ["简历筛选", "待一面", "待复试", "Offer", "待入职", "已入职", "已淘汰"] as const;
export type Stage = (typeof STAGES)[number];
export type InterviewRound = "一面" | "复试" | "终面";

export type Job = {
  id: string;
  title: string;
  requiredSkills: string[];
  description: string;
  createdAt: string;
};

export type ResumeDraft = ResumeParseDetails & {
  fields: ResumeFields;
  rawText: string;
  sourceName: string;
  missingFields: string[];
  mode: "rule";
};

// A record represents one application to one job; it is not a global person identity.
export type Candidate = ResumeFields & {
  id: string;
  jobId: string;
  jobTitle: string;
  stage: Stage;
  nextAction: string;
  nextActionAt: string | null;
  version: number;
  sourceName: string;
  rawText: string;
  hasFile: boolean;
  resumeReview?: ResumeReview | null;
  createdAt: string;
  updatedAt: string;
};

export type Interview = {
  id: string;
  candidateId: string;
  candidateName: string;
  round: InterviewRound;
  date: string;
  time: string;
  interviewer: string;
  location: string;
  createdAt: string;
};

export type Activity = {
  id: string;
  candidateId: string;
  title: string;
  detail: string;
  createdAt: string;
};

export type Workspace = {
  jobs: Job[];
  candidates: Candidate[];
  interviews: Interview[];
  activities: Activity[];
};

export type IntentKind =
  | "query_interviews" | "query_followups" | "query_candidate"
  | "query_job" | "query_activity" | "update_stage"
  | "schedule_interview" | "compose_email" | "unknown";

export type ParsedIntent = {
  kind: IntentKind;
  candidateName?: string;
  candidateId?: string;
  jobTitle?: string;
  stage?: Stage;
  round?: InterviewRound;
  date?: string;
  time?: string;
  interviewer?: string;
  location?: string;
  limit?: number;
  emailRequested?: boolean;
  recipientEmail?: string;
  cc?: string[];
};

export type EmailDraft = {
  id: string;
  candidateId: string;
  candidateName: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
};

export type AssistantContext = {
  intent: ParsedIntent;
  missing: string[];
};

export type ActionPreview = {
  id: string;
  kind: "update_stage" | "schedule_interview";
  title: string;
  candidateId: string;
  candidateName: string;
  changes: { label: string; before?: string; after: string }[];
  expiresAt: string;
};

export type AssistantReply = {
  kind: "answer" | "clarification" | "action" | "unsupported";
  message: string;
  context?: AssistantContext | null;
  action?: ActionPreview;
  rows?: { title: string; detail: string }[];
  emailDraft?: EmailDraft;
};

export type ConfirmationResult = {
  message: string;
  alreadyApplied?: boolean;
  emailDraft?: EmailDraft;
};
