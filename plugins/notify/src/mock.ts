import type {
  NotificationRequest,
  NotificationResult,
} from "@kata-agent/domain";

export async function sendNotification(
  params: NotificationRequest,
): Promise<NotificationResult> {
  return {
    schemaVersion: "0.1",
    channel: params.channel,
    purpose: params.purpose,
    status: params.dryRun ? "dry-run" : "sent",
    sent: params.dryRun ? false : true,
    messageId: params.dryRun ? undefined : "mock-notification",
    providerResponse: params.dryRun ? "dry-run" : "mock sent",
    deliveredAt: new Date().toISOString(),
  };
}
