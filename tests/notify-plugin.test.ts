import { describe, expect, test } from "bun:test";
import { assertValidSchema } from "@kata-agent/domain";
import { sendNotification } from "../plugins/notify/src/mock";

describe("notify plugin", () => {
  test("mock notify sends without error", async () => {
    const result = await sendNotification({
      channel: "dingtalk",
      purpose: "automation-result",
      title: "Test Run",
      body: "All passed",
    });

    expect(result.sent).toBe(true);
    expect(result.status).toBe("sent");
    assertValidSchema("NotificationResult", result);
  });
});
