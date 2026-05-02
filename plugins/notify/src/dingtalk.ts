import { createHmac } from "node:crypto";
import type {
  NotificationRequest,
  NotificationResult,
} from "@kata-agent/domain";

export interface DingTalkOptions {
  webhookUrl?: string;
  secret?: string;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  now?: () => number;
}

export interface DingTalkMarkdownPayload {
  msgtype: "markdown";
  markdown: {
    title: string;
    text: string;
  };
  at: {
    atMobiles: string[];
    isAtAll: false;
  };
}

export function buildDingTalkPayload(
  input: NotificationRequest,
): DingTalkMarkdownPayload {
  return {
    msgtype: "markdown",
    markdown: {
      title: input.title,
      text: `## ${input.title}\n\n${input.body}`,
    },
    at: {
      atMobiles: input.atMobiles ?? [],
      isAtAll: false,
    },
  };
}

export function signedDingTalkUrl(
  webhookUrl: string,
  secret: string | undefined,
  timestamp: number,
): string {
  if (!secret) return webhookUrl;
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = createHmac("sha256", secret)
    .update(stringToSign)
    .digest("base64");
  const url = new URL(webhookUrl);
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  return url.toString();
}

export async function sendDingTalkNotification(
  input: NotificationRequest,
  options: DingTalkOptions,
): Promise<NotificationResult> {
  const timestamp = options.now?.() ?? Date.now();
  const deliveredAt = new Date(timestamp).toISOString();
  if (input.dryRun) {
    return {
      schemaVersion: "0.1",
      channel: "dingtalk",
      purpose: input.purpose,
      status: "dry-run",
      sent: false,
      providerResponse: "dry-run",
      deliveredAt,
    };
  }
  if (!options.webhookUrl) {
    throw new Error("MISSING_SECRET DINGTALK_WEBHOOK_URL");
  }

  const url = signedDingTalkUrl(options.webhookUrl, options.secret, timestamp);
  const fetchImpl = options.fetchImpl ?? fetch;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(buildDingTalkPayload(input)),
  });
  const body = (await response.json().catch(() => ({}))) as {
    errcode?: number;
    errmsg?: string;
    requestId?: string;
  };
  if (!response.ok || body.errcode !== 0) {
    throw new Error(
      `PLUGIN_NETWORK_TRANSIENT DingTalk ${response.status} ${body.errmsg ?? "unknown"}`,
    );
  }
  return {
    schemaVersion: "0.1",
    channel: "dingtalk",
    purpose: input.purpose,
    status: "sent",
    sent: true,
    messageId: body.requestId,
    providerResponse: body.errmsg ?? "ok",
    deliveredAt,
  };
}
