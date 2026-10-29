import type { EnterpriseWeChatConnector, IntegrationResult, RecruitmentSoftwareConnector } from "./contracts";

export const EXTERNAL_INTEGRATIONS = [
  { id: "recruitment-software", name: "招聘软件", enabled: false },
  { id: "wecom", name: "企业微信", enabled: false },
] as const;

function disabled(name: string): IntegrationResult {
  return { ok: false, code: "INTEGRATION_DISABLED", message: `${name}接入默认关闭。请在获得合作授权后配置适配器、凭证与数据字段映射。` };
}

/** Disabled adapters perform no network requests or background delivery. */
export const recruitmentSoftware: RecruitmentSoftwareConnector = {
  async syncApplication() { return disabled("招聘软件"); },
};

export const enterpriseWeChat: EnterpriseWeChatConnector = {
  async notifyInterview() { return disabled("企业微信"); },
};
