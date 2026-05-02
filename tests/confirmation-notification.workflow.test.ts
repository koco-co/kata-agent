import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "bun:test";
import YAML from "yaml";
import { featureDir } from "../packages/artifact-repo/src/index";
import {
  createRuntimeServices,
  type WorkflowDefinition,
} from "../packages/workflow-engine/src/index";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function loadWorkflow(): WorkflowDefinition {
  return YAML.parse(
    readFileSync(
      join(import.meta.dir, "..", "workflows", "test-case-gen.yaml"),
      "utf8",
    ),
  ) as WorkflowDefinition;
}

describe("confirmation notification workflow", () => {
  test("sends confirmation notification before waiting for manual import", async () => {
    const rootDir = mkdtempSync(join(tmpdir(), "kata-agent-notify-"));
    roots.push(rootDir);
    const location = { rootDir, project: "demo", feature: "rule-config" };
    const { executor } = createRuntimeServices({
      rootDir,
      mode: "mock",
      notifyMode: "mock",
    });

    const result = await executor.start({
      location,
      definition: loadWorkflow(),
      runId: "run-confirmation-notify",
      sourceUrl: "mock://poor-prd",
    });

    const dir = featureDir(location);
    expect(result.state.status).toBe("waiting");
    expect(result.state.currentNode).toBe("await-confirmation-result");
    expect(
      existsSync(
        join(dir, "requirement/clarifications/confirmation-draft.md"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(
          dir,
          "requirement/clarifications/confirmation-notification-result.json",
        ),
      ),
    ).toBe(true);
    expect(
      existsSync(
        join(dir, "requirement/confirmed/confirmation-result.json"),
      ),
    ).toBe(false);

    const notification = JSON.parse(
      readFileSync(
        join(
          dir,
          "requirement/clarifications/confirmation-notification-result.json",
        ),
        "utf8",
      ),
    ) as { purpose: string; status: string };
    expect(notification.purpose).toBe("confirmation");
    expect(notification.status).toBe("sent");

    const trace = readFileSync(
      join(dir, "traces/run-confirmation-notify.jsonl"),
      "utf8",
    );
    expect(trace).toContain('"nodeId":"send-confirmation-notification"');
    expect(trace).toContain('"nodeId":"await-confirmation-result"');
  });
});
