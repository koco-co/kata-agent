import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type HardRuleSource = "default" | "global" | "project" | "run";

export interface HardRule {
  id: string;
  description: string;
  enabled: boolean;
  source?: HardRuleSource;
  nonNegotiable?: boolean;
}

export interface RuleSet {
  schemaVersion: "0.1";
  rules: HardRule[];
}

export interface LoadRuleSetOptions {
  rootDir: string;
  project: string;
  runRules?: HardRule[];
}

export const DEFAULT_HARD_RULES: HardRule[] = [
  {
    id: "no-hardcoded-absolute-paths",
    description: "no hardcoded absolute paths",
    enabled: true,
    source: "default",
    nonNegotiable: true,
  },
  {
    id: "no-hardcoded-credentials",
    description: "no hardcoded credentials, cookies, tokens, or internal service URLs",
    enabled: true,
    source: "default",
    nonNegotiable: true,
  },
  {
    id: "tests-use-temp-dirs",
    description: "tests that create files must use temporary directories and clean them up",
    enabled: true,
    source: "default",
    nonNegotiable: true,
  },
  {
    id: "assertions-must-be-concrete",
    description: "generated automation must not weaken assertions to make tests pass",
    enabled: true,
    source: "default",
    nonNegotiable: true,
  },
];

export function loadRuleSet(options: LoadRuleSetOptions): RuleSet {
  assertProjectSegment(options.project);
  const merged = new Map<string, HardRule>();
  applyRules(merged, DEFAULT_HARD_RULES, "default");
  applyRules(
    merged,
    readRuleFile(join(options.rootDir, "rules", "global.json")),
    "global",
  );
  applyRules(
    merged,
    readRuleFile(
      join(options.rootDir, "projects", options.project, "rules.json"),
    ),
    "project",
  );
  applyRules(merged, options.runRules ?? [], "run");
  return {
    schemaVersion: "0.1",
    rules: [...merged.values()],
  };
}

function readRuleFile(path: string): HardRule[] {
  if (!existsSync(path)) return [];
  const value = JSON.parse(readFileSync(path, "utf8")) as Partial<RuleSet>;
  return Array.isArray(value.rules) ? value.rules : [];
}

function applyRules(
  target: Map<string, HardRule>,
  rules: HardRule[],
  source: HardRuleSource,
): void {
  for (const rule of rules) {
    const previous = target.get(rule.id);
    target.set(rule.id, {
      ...previous,
      ...rule,
      source,
      nonNegotiable: previous?.nonNegotiable ?? rule.nonNegotiable ?? false,
    });
  }
}

function assertProjectSegment(project: string): void {
  if (
    project === "" ||
    project === "." ||
    project === ".." ||
    project.includes("/") ||
    project.includes("\\") ||
    /^[a-z]:/i.test(project)
  ) {
    throw new Error("Rule Store project must be a single path segment");
  }
}
