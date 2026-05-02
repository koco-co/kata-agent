import { describe, expect, test } from "bun:test";
import { assertValidSchema } from "@kata-agent/domain";
import { sendNotification } from "../plugins/notify/src/mock";

describe("notify plugin", () => {
  test("mock notify sends without error", async () => {
    const result = await sendNotification({
      channel: "dingtalk",
      title: "Test Run",
      body: "All passed",
    });

    expect(result.sent).toBe(true);
    assertValidSchema("NotificationResult", result);
  });
});
