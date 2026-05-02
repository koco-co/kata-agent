export interface NotificationRequest {
  channel: "dingtalk";
  title: string;
  body: string;
}

export interface NotificationResult {
  schemaVersion: "0.1";
  channel: "dingtalk";
  sent: boolean;
  messageId?: string;
}
