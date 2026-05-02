import type {
  NotificationRequest,
  NotificationResult,
} from "../../../packages/domain/src/index";

export async function sendNotification(
  params: NotificationRequest,
): Promise<NotificationResult> {
  const dryRun = params.dryRun === true;

  return {
    schemaVersion: "0.1",
    channel: params.channel,
    purpose: params.purpose,
    status: dryRun ? "dry-run" : "sent",
    sent: !dryRun,
    providerResponse: dryRun ? "dry-run" : "ok",
    deliveredAt: new Date().toISOString(),
    ...(dryRun ? {} : { messageId: "mock-notification" }),
  };
}
