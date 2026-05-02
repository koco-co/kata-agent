import { describe, expect, test } from "bun:test";
import type { IssueDraft } from "../packages/domain/src/index";
import { mockSyncIssueToZentao } from "../plugins/zentao/src/mock";
import { syncIssueToZentao } from "../plugins/zentao/src/real";

const draft: IssueDraft = {
  schemaVersion: "0.1",
  project: "demo",
  feature: "rule-config",
  sourceIssueDraftRef: "IssueDraft:abc",
  sourceBugReportRef: "BugReport:abc",
  sourceBugId: "BUG-001",
  title: "保存按钮点击无响应",
  severity: "P0",
  descriptionMarkdown: "保存按钮点击后无提示。",
  reproductionSteps: ["打开规则配置页", "点击保存按钮"],
  evidenceRefs: ["EVID-SS-001"],
  labels: ["automation"],
  confirmedForSync: true,
};

describe("Zentao plugin", () => {
  test("mock sync returns dry-run when requested", async () => {
    const result = await mockSyncIssueToZentao(
      { ...draft, confirmedForSync: false },
      {
        dryRun: true,
      },
    );
    expect(result.status).toBe("dry-run");
    expect(result.remoteId).toBeUndefined();
  });

  test("real sync rejects unconfirmed non-dry-run draft", async () => {
    await expect(
      syncIssueToZentao(
        { ...draft, confirmedForSync: false },
        {
          baseUrl: "https://zentao.example",
          token: "secret-token",
          dryRun: false,
          fetchImpl: async () => Response.json({ id: "1001" }),
        },
      ),
    ).rejects.toThrow("INVALID_INPUT IssueDraft must be confirmedForSync");
  });

  test("real sync posts confirmed draft without leaking token", async () => {
    const token = "secret-token";
    let requestBody = "";
    let auth = "";
    const result = await syncIssueToZentao(draft, {
      baseUrl: "https://zentao.example",
      token,
      dryRun: false,
      fetchImpl: async (_url, init) => {
        requestBody = String(init?.body);
        auth = String((init?.headers as Record<string, string>).authorization);
        return Response.json({ id: "1001", url: "/bug-view-1001.html" });
      },
    });
    expect(requestBody).toContain("保存按钮点击无响应");
    expect(auth).toBe(`Bearer ${token}`);
    expect(result.status).toBe("synced");
    expect(result.remoteId).toBe("1001");
    expect(result.remoteUrl).toBe("https://zentao.example/bug-view-1001.html");
    expect(JSON.stringify(result)).not.toContain(token);
  });
});
