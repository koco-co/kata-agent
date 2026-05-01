import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  GAP_CATEGORIES,
  SCHEMA_REGISTRY,
  SCHEMA_NAMES,
  type ConfirmationResult,
  type TestPointSet,
} from "../packages/domain/src/index";

function readSchema(path: string): Record<string, any> {
  return JSON.parse(readFileSync(join(import.meta.dir, "..", path), "utf8"));
}

function expectEnum(
  schemaName: keyof typeof SCHEMA_REGISTRY,
  path: string[],
  values: string[],
): void {
  let current: any = readSchema(SCHEMA_REGISTRY[schemaName]);
  for (const segment of path) current = current?.[segment];
  expect(current?.enum, `${String(schemaName)} ${path.join(".")}`).toEqual(
    values,
  );
}

describe("domain contracts", () => {
  test("every SCHEMA_REGISTRY entry resolves to a real file", () => {
    for (const name of SCHEMA_NAMES) {
      const file = SCHEMA_REGISTRY[name];
      expect(
        existsSync(join(import.meta.dir, "..", file)),
        `${name} -> ${file}`,
      ).toBe(true);
    }
  });

  test("gap taxonomy is closed", () => {
    expect(GAP_CATEGORIES).toContain("automation-blocker");
    expect(GAP_CATEGORIES).toHaveLength(16);
  });

  test("required closed enum constraints are present in JSON Schemas", () => {
    expectEnum("FeatureManifest", ["properties", "status"], [
      "pending",
      "in-progress",
      "blocked",
      "completed",
      "archived",
    ]);
    expectEnum("RequirementSpec", ["properties", "status"], [
      "draft",
      "confirmed",
      "assumed",
      "blocked",
    ]);
    expectEnum(
      "RequirementSpec",
      ["properties", "openItems", "items", "properties", "status"],
      ["unconfirmed", "confirmed", "assumed", "deferred"],
    );
    expectEnum("WorkflowRunState", ["properties", "status"], [
      "created",
      "running",
      "waiting",
      "succeeded",
      "failed",
      "blocked",
      "cancelled",
    ]);
    expectEnum(
      "WorkflowRunState",
      ["properties", "nodes", "additionalProperties", "properties", "status"],
      [
        "pending",
        "ready",
        "running",
        "waiting",
        "succeeded",
        "failed",
        "skipped",
        "blocked",
        "cancelled",
      ],
    );
    expectEnum("TraceEvent", ["properties", "type"], [
      "enter",
      "exit",
      "gate-passed",
      "gate-failed",
      "node-skipped",
      "agent-call",
      "provider-call",
      "provider-cost-summary",
      "plugin-action",
      "artifact-write",
      "knowledge-consult",
      "knowledge-propose",
      "human-import",
    ]);
    expectEnum("PluginManifest", ["properties", "type"], [
      "requirement-source",
      "artifact-export",
      "automation",
      "notification",
      "issue-tracker",
      "rule-source",
    ]);
  });

  test("confirmation and test point types compile", () => {
    const confirmation: ConfirmationResult = {
      schemaVersion: "0.1",
      answers: [],
    };
    const points: TestPointSet = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "demo",
      points: [],
    };
    expect(confirmation.answers).toEqual([]);
    expect(points.points).toEqual([]);
  });

  test("workflow definition schema matches workflow yaml shape", () => {
    const schema = readSchema(SCHEMA_REGISTRY.WorkflowDefinition);
    expect(schema.properties?.nodes?.type).toBe("array");
    expect(schema.properties?.nodes?.items?.properties?.type?.enum).toEqual([
      "tool",
      "agent",
      "gate",
      "human",
      "artifact",
    ]);
  });
});
