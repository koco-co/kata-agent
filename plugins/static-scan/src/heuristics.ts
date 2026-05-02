import type { RiskPoint } from "@kata-agent/domain";

type RiskCategory = RiskPoint["category"];

interface RiskDefinition {
  severity: RiskPoint["severity"];
  title: string;
  description: string;
  recommendation: string;
}

const RISK_DEFINITIONS: Record<RiskCategory, RiskDefinition> = {
  "debug-code": {
    severity: "P2",
    title: "Debug code added",
    description: "Added debug code can leak runtime noise or halt execution.",
    recommendation: "Remove debug statements before release.",
  },
  "unsafe-code": {
    severity: "P1",
    title: "Unsafe code added",
    description: "Added dynamic or untyped code can hide runtime failures.",
    recommendation: "Replace unsafe code with typed, explicit logic.",
  },
  "missing-test-signal": {
    severity: "P3",
    title: "Missing test signal",
    description: "The change lacks an obvious test signal.",
    recommendation: "Add focused tests for this change.",
  },
  "state-risk": {
    severity: "P2",
    title: "Persistent browser state added",
    description: "Added browser storage access can create sticky cross-session state.",
    recommendation: "Validate persistence behavior and clear state in tests.",
  },
  "dependency-risk": {
    severity: "P2",
    title: "Dependency added",
    description: "Added dependencies can introduce supply-chain or bundle risk.",
    recommendation: "Review dependency necessity, license, and security posture.",
  },
};

const DEPENDENCY_SECTIONS = new Set([
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
]);

function diffFilePath(line: string): string | undefined {
  if (!line.startsWith("+++ b/")) return undefined;
  return line.slice("+++ b/".length).split(/\s+/)[0];
}

function hunkTargetLine(line: string): number | undefined {
  const match = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  return match ? Number(match[1]) : undefined;
}

function isPackageDependencyLine(
  content: string,
  filePath: string | undefined,
  packageSection: string | undefined,
): boolean {
  if (!filePath?.endsWith("package.json")) return false;
  if (!packageSection || !DEPENDENCY_SECTIONS.has(packageSection)) return false;
  return /^\s*"[^"]+"\s*:\s*"[^"]+"\s*,?\s*$/.test(content);
}

function nextPackageSection(
  content: string,
  filePath: string | undefined,
  packageSection: string | undefined,
): string | undefined {
  if (!filePath?.endsWith("package.json")) return undefined;
  if (/^\s*}\s*,?\s*$/.test(content)) return undefined;
  const sectionMatch = content.match(/^\s*"([^"]+)"\s*:\s*\{\s*$/);
  return sectionMatch ? sectionMatch[1] : packageSection;
}

function riskCategories(
  content: string,
  filePath: string | undefined,
  packageSection: string | undefined,
): RiskCategory[] {
  const categories: RiskCategory[] = [];
  if (/\bconsole\.log\b|\bdebugger\b/.test(content)) {
    categories.push("debug-code");
  }
  if (/\beval\s*\(|:\s*any\b|\bas\s+any\b/.test(content)) {
    categories.push("unsafe-code");
  }
  if (/\blocalStorage\b|\bsessionStorage\b/.test(content)) {
    categories.push("state-risk");
  }
  if (isPackageDependencyLine(content, filePath, packageSection)) {
    categories.push("dependency-risk");
  }
  return categories;
}

function riskPoint(
  index: number,
  category: RiskCategory,
  evidence: string,
  filePath: string | undefined,
  line: number | undefined,
): RiskPoint {
  const definition = RISK_DEFINITIONS[category];
  return {
    id: `RISK-${String(index).padStart(3, "0")}`,
    severity: definition.severity,
    category,
    title: definition.title,
    description: definition.description,
    ...(filePath ? { filePath } : {}),
    ...(line ? { line } : {}),
    evidence,
    recommendation: definition.recommendation,
  };
}

export function scanDiffLines(lines: string[]): RiskPoint[] {
  const risks: RiskPoint[] = [];
  let currentFile: string | undefined;
  let targetLine: number | undefined;
  let packageSection: string | undefined;

  for (const line of lines) {
    const headerPath = diffFilePath(line);
    if (headerPath) {
      currentFile = headerPath;
      targetLine = undefined;
      packageSection = undefined;
      continue;
    }

    const nextTargetLine = hunkTargetLine(line);
    if (nextTargetLine !== undefined) {
      targetLine = nextTargetLine;
      packageSection = undefined;
      continue;
    }

    if (line.startsWith("+") && !line.startsWith("+++")) {
      const content = line.slice(1);
      for (const category of riskCategories(content, currentFile, packageSection)) {
        risks.push(
          riskPoint(risks.length + 1, category, line, currentFile, targetLine),
        );
      }
      packageSection = nextPackageSection(content, currentFile, packageSection);
      if (targetLine !== undefined) targetLine += 1;
      continue;
    }

    if (line.startsWith(" ")) {
      packageSection = nextPackageSection(
        line.slice(1),
        currentFile,
        packageSection,
      );
      if (targetLine !== undefined) targetLine += 1;
    }
  }

  return risks;
}
