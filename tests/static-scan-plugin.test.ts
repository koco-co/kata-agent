import { describe, expect, test } from "bun:test";
import type { StaticScanInput } from "../packages/domain/src/index";
import { scanStaticDiff } from "../plugins/static-scan/src/scan";

describe("static-scan plugin", () => {
  test("creates reproducible risk points from added diff lines", () => {
    const input: StaticScanInput = {
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      diffText: [
        "diff --git a/src/app.ts b/src/app.ts",
        "+++ b/src/app.ts",
        "+console.log('debug')",
        "+const value: any = payload",
      ].join("\n"),
    };

    const report = scanStaticDiff(input);

    expect(report.riskPoints.map((risk) => risk.category)).toEqual([
      "debug-code",
      "unsafe-code",
    ]);
    expect(report.riskPoints[0]?.filePath).toBe("src/app.ts");
  });

  test("reports target file line numbers from unified diff hunks", () => {
    const report = scanStaticDiff({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      diffText: [
        "diff --git a/src/app.ts b/src/app.ts",
        "+++ b/src/app.ts",
        "@@ -40,6 +120,7 @@",
        "+console.log('debug')",
      ].join("\n"),
    });

    expect(report.riskPoints[0]?.line).toBe(120);
  });

  test("flags package dependencies only inside dependency sections", () => {
    const report = scanStaticDiff({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      diffText: [
        "diff --git a/package.json b/package.json",
        "+++ b/package.json",
        "@@ -1,9 +1,12 @@",
        " {",
        '+  "repository": "git+https://example/repo.git",',
        '   "engines": {',
        '+    "node": ">=20"',
        "   },",
        '   "dependencies": {',
        '+    "left-pad": "^1.3.0"',
        "   }",
        " }",
      ].join("\n"),
    });

    expect(report.riskPoints.map((risk) => risk.category)).toEqual([
      "dependency-risk",
    ]);
    expect(report.riskPoints[0]?.evidence).toBe('+    "left-pad": "^1.3.0"');
  });

  test("does not turn scan findings into issue drafts", () => {
    const report = scanStaticDiff({
      schemaVersion: "0.1",
      project: "demo",
      feature: "rule-config",
      sourceRepoRef: "SourceRepoRef:abc",
      diffText: "+eval(userInput)",
    });

    expect("confirmedForSync" in report).toBe(false);
    expect(report.riskPoints[0]?.category).toBe("unsafe-code");
  });
});
