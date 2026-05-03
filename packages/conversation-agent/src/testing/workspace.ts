import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

export type TestingWorkspaceStatus = "ready" | "empty" | "unknown";

export interface TestingWorkspaceSummary {
  root: string;
  name: string;
  status: TestingWorkspaceStatus;
  featureCount: number;
  specCount: number;
  caseAssetCount: number;
  reportCount: number;
  featureFiles: string[];
}

function readWorkspaceName(root: string): string {
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) return basename(root);

  try {
    const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { name?: string };
    return parsed.name?.trim() || basename(root);
  } catch {
    return basename(root);
  }
}

function walkFiles(root: string, dir: string): string[] {
  const full = join(root, dir);
  if (!existsSync(full) || !statSync(full).isDirectory()) return [];

  const files: string[] = [];
  for (const entry of readdirSync(full, { withFileTypes: true })) {
    const child = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function countByExtension(files: string[], extensions: string[]): number {
  return files.filter((file) => extensions.some((ext) => file.endsWith(ext))).length;
}

export function discoverTestingWorkspace(root = process.cwd()): TestingWorkspaceSummary {
  const featureFiles = walkFiles(root, "features")
    .filter((file) => file.endsWith(".feature"))
    .map((file) => relative(root, join(root, file)));
  const testFiles = [...walkFiles(root, "tests"), ...walkFiles(root, "e2e")];
  const caseFiles = [...walkFiles(root, "test-cases"), ...walkFiles(root, "cases")];
  const reportFiles = [...walkFiles(root, "reports"), ...walkFiles(root, "artifacts")];

  const featureCount = featureFiles.length;
  const specCount = countByExtension(testFiles, [".spec.ts", ".test.ts"]);
  const caseAssetCount = countByExtension(caseFiles, [".md", ".xmind", ".json"]);
  const reportCount = countByExtension(reportFiles, [".html", ".json", ".md"]);
  const total = featureCount + specCount + caseAssetCount + reportCount;

  return {
    root,
    name: readWorkspaceName(root),
    status: total > 0 ? "ready" : "empty",
    featureCount,
    specCount,
    caseAssetCount,
    reportCount,
    featureFiles,
  };
}
