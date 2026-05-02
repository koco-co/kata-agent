export type NotificationPurpose =
  | "confirmation"
  | "automation-result"
  | "issue-sync"
  | "lanhu-writeback";

export type NotificationDeliveryStatus = "dry-run" | "sent" | "failed" | "skipped";

export interface NotificationRequest {
  channel: "dingtalk";
  purpose: NotificationPurpose;
  title: string;
  body: string;
  sourceArtifactRef?: string;
  atMobiles?: string[];
  dryRun?: boolean;
}

export interface NotificationResult {
  schemaVersion: "0.1";
  channel: "dingtalk";
  purpose: NotificationPurpose;
  status: NotificationDeliveryStatus;
  sent: boolean;
  messageId?: string;
  providerResponse?: string;
  deliveredAt: string;
}
