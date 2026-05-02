import { describe, expect, test } from "bun:test";
import {
  buildDingTalkPayload,
  sendDingTalkNotification,
  signedDingTalkUrl,
} from "../plugins/notify/src/dingtalk";

describe("real DingTalk notify plugin", () => {
  test("builds markdown payload without leaking webhook secret", () => {
    const payload = buildDingTalkPayload({
      channel: "dingtalk",
      purpose: "confirmation",
      title: "需求澄清待确认",
      body: "请确认保存按钮文案。",
      atMobiles: ["13800000000"],
    });
    expect(payload.msgtype).toBe("markdown");
    expect(payload.markdown.title).toBe("需求澄清待确认");
    expect(payload.markdown.text).toContain("请确认保存按钮文案");
    expect(payload.at.atMobiles).toEqual(["13800000000"]);
    expect(JSON.stringify(payload)).not.toContain("secret");
  });

  test("adds DingTalk signature query parameters", () => {
    const url = signedDingTalkUrl(
      "https://oapi.dingtalk.com/robot/send?access_token=token",
      "secret",
      1777600000000,
    );
    const parsed = new URL(url);
    expect(parsed.searchParams.get("timestamp")).toBe("1777600000000");
    expect(parsed.searchParams.get("sign")).toBeTruthy();
    expect(parsed.toString()).not.toContain("secret");
  });

  test("posts signed webhook and returns schema-safe result", async () => {
    let calledUrl = "";
    let authHeader = "";
    const result = await sendDingTalkNotification(
      {
        channel: "dingtalk",
        purpose: "confirmation",
        title: "需求澄清待确认",
        body: "请确认保存按钮文案。",
        sourceArtifactRef: "ConfirmationDraft:abc",
      },
      {
        webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=token",
        secret: "secret",
        now: () => 1777600000000,
        fetchImpl: async (url, init) => {
          calledUrl = String(url);
          authHeader = String(
            (init?.headers as Record<string, string>)["content-type"],
          );
          expect(init?.method).toBe("POST");
          expect(String(init?.body)).toContain("需求澄清待确认");
          return Response.json({
            errcode: 0,
            errmsg: "ok",
            requestId: "req-1",
          });
        },
      },
    );
    expect(calledUrl).toContain("timestamp=1777600000000");
    expect(calledUrl).toContain("sign=");
    expect(calledUrl).not.toContain("secret");
    expect(authHeader).toBe("application/json");
    expect(result.status).toBe("sent");
    expect(result.sent).toBe(true);
    expect(result.messageId).toBe("req-1");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  test("dry-run skips network", async () => {
    let called = false;
    const result = await sendDingTalkNotification(
      {
        channel: "dingtalk",
        purpose: "automation-result",
        title: "Automation passed",
        body: "Run completed",
        dryRun: true,
      },
      {
        webhookUrl: "https://oapi.dingtalk.com/robot/send?access_token=token",
        fetchImpl: async () => {
          called = true;
          return Response.json({ errcode: 0 });
        },
      },
    );
    expect(called).toBe(false);
    expect(result.status).toBe("dry-run");
    expect(result.sent).toBe(false);
  });
});
