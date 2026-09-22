import type { FastifyInstance } from "fastify";
import { createCallCenterService } from "src/modules/call-center/call-center.service";
import { createComplaintsService } from "src/modules/complaints/complaints.service";
import { createStripeWebhookWorker } from "src/modules/contracts/payment/stripe-webhook-worker.service";
import { createReportExecService } from "src/modules/reports/report-exec.service";

/**
 * The background cycles of the system, driven either by the in-process
 * scheduler plugin (single-service deployment) or by a dedicated worker
 * process. Every cycle is idempotent (advisory locks + status CAS + unique
 * constraints), so overlapping runs across replicas never duplicate work.
 *
 * Each cycle is isolated: a failure in one never prevents the others from
 * running. Logging is deliberately quiet — a line is emitted only when a cycle
 * actually did something, to avoid a noisy heartbeat.
 */
export function createBackgroundRunner(app: FastifyInstance) {
  const callCenter = createCallCenterService(app);
  const complaints = createComplaintsService(app);
  const reportExec = createReportExecService(app);
  const stripeWebhooks = createStripeWebhookWorker(app);

  async function runAllCycles(): Promise<void> {
    try {
      const cc = await callCenter.runCallCenterCycle();
      if (cc.callbacksPromoted) {
        app.log.info(cc, "call-center: cycle");
      }
    } catch (err) {
      app.log.error({ err }, "call-center: cycle failed");
    }
    try {
      const cm = await complaints.runComplaintCycle();
      if (cm.complaintsCreated || cm.slaWarnings || cm.slaBreaches) {
        app.log.info(cm, "complaint: cycle");
      }
    } catch (err) {
      app.log.error({ err }, "complaint: cycle failed");
    }
    try {
      const rp = await reportExec.runReportCycle();
      if (rp.scheduledReportsRun) {
        app.log.info(rp, "report: cycle");
      }
    } catch (err) {
      app.log.error({ err }, "report: cycle failed");
    }
    try {
      const sw = await stripeWebhooks.runStripeWebhookCycle();
      if (sw.processed) {
        app.log.info(sw, "stripe-webhook: cycle");
      }
    } catch (err) {
      app.log.error({ err }, "stripe-webhook: cycle failed");
    }
  }

  return { runAllCycles };
}
