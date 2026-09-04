import type { FastifyInstance } from "fastify";

/** Setting keys for complaint automation (typed settings). */
export const COMPLAINT_SETTING_KEYS = {
  AUTOMATION_ENABLED_FROM: "complaints.automation.enabled_from",
} as const;

export interface ComplaintConfig {
  automationEnabledFrom: Date | null;
}

const K = COMPLAINT_SETTING_KEYS;

/** Load complaint config from typed settings (first typed-settings consumer). */
export async function loadComplaintConfig(fastify: FastifyInstance): Promise<ComplaintConfig> {
  const s = fastify.settings;
  const enabledFromRaw = await s.get(K.AUTOMATION_ENABLED_FROM);
  const parsedFrom = enabledFromRaw ? new Date(enabledFromRaw) : null;
  return {
    automationEnabledFrom: parsedFrom && !Number.isNaN(parsedFrom.getTime()) ? parsedFrom : null,
  };
}
