import { describe, expect, test } from "bun:test";
import type { LanhuWritebackDraft } from "../packages/domain/src/index";
import { mockWriteLanhuRequirement } from "../plugins/lanhu-writeback/src/mock";
import { writeLanhuRequirement } from "../plugins/lanhu-writeback/src/real";

const draft: LanhuWritebackDraft = {
  schemaVersion: "0.1",
  project: "demo",
  feature: "rule-config",
  sourceRequirementSpecRef: "RequirementSpec:abc",
  targetUrl: "https://lanhu.example/prd/123",
  summaryMarkdown: "## 更新\n- REQ-001: 保存按钮文案为保存\n",
  changeRefs: ["REQ-001"],
  confirmedForWriteback: true,
  confirmedBy: "product-owner",
  confirmedAt: "2026-05-02T00:00:00.000Z",
};

describe("Lanhu writeback plugin", () => {
  test("mock writeback returns dry-run for CLI dryRun option", async () => {
    const result = await mockWriteLanhuRequirement(draft, { dryRun: true });
    expect(result.status).toBe("dry-run");
    expect(result.targetUrl).toBe(draft.targetUrl);
  });

  test("real writeback rejects unconfirmed non-dry-run draft", async () => {
    await expect(
      writeLanhuRequirement(
        { ...draft, confirmedForWriteback: false },
        {
          cookie: "secret-cookie",
          trustedDomains: ["lanhu.example"],
          dryRun: false,
          fetchImpl: async () => Response.json({ ok: true }),
        },
      ),
    ).rejects.toThrow(
      "INVALID_INPUT LanhuWritebackDraft must be confirmedForWriteback",
    );
  });

  test("real writeback refuses to send cookie to untrusted host", async () => {
    await expect(
      writeLanhuRequirement(
        { ...draft, targetUrl: "https://example.com/prd/123" },
        {
          cookie: "secret-cookie",
          trustedDomains: ["lanhu.example"],
          dryRun: false,
          fetchImpl: async () => Response.json({ ok: true }),
        },
      ),
    ).rejects.toThrow(
      "MISSING_SECRET refusing to send Lanhu writeback cookie to untrusted host",
    );
  });

  test("real writeback posts confirmed draft without leaking cookie", async () => {
    const secretCookie = "secret-cookie";
    let cookie = "";
    let body = "";
    const result = await writeLanhuRequirement(draft, {
      cookie: secretCookie,
      trustedDomains: ["lanhu.example"],
      dryRun: false,
      fetchImpl: async (_url, init) => {
        cookie = String((init?.headers as Record<string, string>).cookie);
        body = String(init?.body);
        return Response.json({ ok: true, url: "https://lanhu.example/prd/123" });
      },
    });
    expect(cookie).toBe(secretCookie);
    expect(body).toContain("保存按钮文案");
    expect(result.status).toBe("written");
    expect(JSON.stringify(result)).not.toContain(secretCookie);
  });
});
