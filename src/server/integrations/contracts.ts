/** Connector boundary. No raw resume, attachment or credential is part of these payloads. */
export type IntegrationResult =
  | { ok: true; externalId: string }
  | { ok: false; code: "INTEGRATION_DISABLED" | "DELIVERY_FAILED"; message: string };

export type CandidateSync = {
  applicationId: string;
  name: string;
  jobTitle: string;
  stage: string;
};

export type InterviewNotice = {
  applicationId: string;
  candidateName: string;
  round: string;
  startsAt: string;
  location: string;
  /** Enterprise member IDs must be supplied by the authorized organization's mapping. */
  recipientMemberIds: string[];
};

export interface RecruitmentSoftwareConnector {
  syncApplication(payload: CandidateSync): Promise<IntegrationResult>;
}

export interface EnterpriseWeChatConnector {
  notifyInterview(payload: InterviewNotice): Promise<IntegrationResult>;
}
