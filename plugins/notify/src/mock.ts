import type {
  NotificationRequest,
  NotificationResult,
} from "../../../packages/domain/src/index";

export async function sendNotification(
  params: NotificationRequest,
): Promise<NotificationResult> {
  return {
    schemaVersion: "0.1",
    channel: params.channel,
    sent: true,
  };
}
