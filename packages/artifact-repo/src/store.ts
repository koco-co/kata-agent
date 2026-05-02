import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import YAML from "yaml";
import type { ArtifactRef, FeatureManifest } from "../../domain/src/index";
import { artifactPath, featureDir, type FeatureLocation } from "./paths";

export interface ArtifactIndex {
  project: string;
  feature: string;
  artifacts: ArtifactRef[];
}

export interface WriteArtifactOptions {
  allowedScopes?: string[];
  project?: string;
  feature?: string;
}

const WRITE_SCOPE_PREFIXES: Record<string, string[]> = {
  "feature.sources": ["sources/"],
  "feature.requirement.drafts": ["requirement/drafts/"],
  "feature.requirement.clarif": ["requirement/clarifications/"],
  "feature.requirement.confirmed": ["requirement/confirmed/"],
  "feature.requirement.spec": ["requirement/spec/"],
  "feature.test-spec": ["test-spec/"],
  "feature.automation": ["automation/"],
  "feature.exports": ["exports/"],
  "feature.reports": ["reports/"],
};

function sha256(content: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function assertRelativeArtifactPath(relativePath: string): void {
  if (isAbsolute(relativePath) || relativePath.split("/").includes("..")) {
    throw new Error(
      `Artifact path must stay inside feature workspace: ${relativePath}`,
    );
  }
}

function assertWriteScopes(
  relativePath: string,
  allowedScopes: string[] | undefined,
): void {
  if (!allowedScopes?.length) return;
  const allowedPrefixes = allowedScopes.flatMap(
    (scope) => WRITE_SCOPE_PREFIXES[scope] ?? [],
  );
  if (!allowedPrefixes.some((prefix) => relativePath.startsWith(prefix))) {
    throw new Error(`FORBIDDEN_WRITE_SCOPE: ${relativePath}`);
  }
}

function artifactPathInFeatureDir(
  featureWorkspaceDir: string,
  relativePath: string,
): string {
  assertRelativeArtifactPath(relativePath);
  const base = resolve(featureWorkspaceDir);
  const target = resolve(base, relativePath);
  const fromBase = relative(base, target);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`)) {
    throw new Error(`Artifact path escapes feature workspace: ${relativePath}`);
  }
  return target;
}

function readArtifactIndexInFeatureDir(
  featureWorkspaceDir: string,
  project = "unknown",
  feature = "unknown",
): ArtifactIndex {
  const path = artifactPathInFeatureDir(
    featureWorkspaceDir,
    "artifact-index.json",
  );
  if (!existsSync(path)) return { project, feature, artifacts: [] };
  return JSON.parse(readFileSync(path, "utf8")) as ArtifactIndex;
}

export function writeArtifactInFeatureDir(
  featureWorkspaceDir: string,
  type: string,
  relativePath: string,
  content: string,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  assertWriteScopes(relativePath, options.allowedScopes);
  const path = artifactPathInFeatureDir(featureWorkspaceDir, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  const historyDir = artifactPathInFeatureDir(featureWorkspaceDir, ".history");
  mkdirSync(historyDir, { recursive: true });
  if (existsSync(path)) {
    const backupId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    const backupPath = artifactPathInFeatureDir(
      featureWorkspaceDir,
      `.history/${backupId}-${relativePath.replaceAll("/", "__")}`,
    );
    renameSync(path, backupPath);
  }
  writeFileSync(path, content);
  const ref: ArtifactRef = {
    id: `${type}:${randomUUID()}`,
    type,
    path: relativePath,
    schemaVersion: "0.1",
    createdBy,
    createdAt: new Date().toISOString(),
    hash: sha256(content),
  };
  const index = readArtifactIndexInFeatureDir(
    featureWorkspaceDir,
    options.project,
    options.feature,
  );
  const artifacts = index.artifacts.filter((item) => item.path !== relativePath);
  artifacts.push(ref);
  writeFileSync(
    artifactPathInFeatureDir(featureWorkspaceDir, "artifact-index.json"),
    JSON.stringify(
      {
        ...index,
        project: options.project ?? index.project,
        feature: options.feature ?? index.feature,
        artifacts,
      },
      null,
      2,
    ),
  );
  return ref;
}

export function indexExistingArtifactInFeatureDir(
  featureWorkspaceDir: string,
  type: string,
  relativePath: string,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  assertWriteScopes(relativePath, options.allowedScopes);
  const path = artifactPathInFeatureDir(featureWorkspaceDir, relativePath);
  if (!existsSync(path)) {
    throw new Error(`Artifact file does not exist: ${relativePath}`);
  }
  const ref: ArtifactRef = {
    id: `${type}:${randomUUID()}`,
    type,
    path: relativePath,
    schemaVersion: "0.1",
    createdBy,
    createdAt: new Date().toISOString(),
    hash: sha256(readFileSync(path)),
  };
  const index = readArtifactIndexInFeatureDir(
    featureWorkspaceDir,
    options.project,
    options.feature,
  );
  const artifacts = index.artifacts.filter((item) => item.path !== relativePath);
  artifacts.push(ref);
  writeFileSync(
    artifactPathInFeatureDir(featureWorkspaceDir, "artifact-index.json"),
    JSON.stringify(
      {
        ...index,
        project: options.project ?? index.project,
        feature: options.feature ?? index.feature,
        artifacts,
      },
      null,
      2,
    ),
  );
  return ref;
}

export function createFeatureWorkspace(location: FeatureLocation): string {
  const dir = featureDir(location);
  for (const child of [
    "sources/lanhu",
    "requirement/drafts",
    "requirement/clarifications",
    "requirement/confirmed",
    "requirement/spec",
    "test-spec",
    "exports/xmind",
    "reports",
    "traces",
    ".state",
    ".history",
  ]) {
    mkdirSync(artifactPath(location, child), { recursive: true });
  }
  const manifestPath = artifactPath(location, "feature.yaml");
  if (!existsSync(manifestPath)) {
    const manifest: FeatureManifest = {
      schemaVersion: "0.1",
      project: location.project,
      feature: location.feature,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    writeFileSync(manifestPath, YAML.stringify(manifest));
  }
  return dir;
}

export function readArtifactIndex(location: FeatureLocation): ArtifactIndex {
  const path = artifactPath(location, "artifact-index.json");
  if (!existsSync(path)) {
    return {
      project: location.project,
      feature: location.feature,
      artifacts: [],
    };
  }
  return JSON.parse(readFileSync(path, "utf8")) as ArtifactIndex;
}

export function writeArtifact(
  location: FeatureLocation,
  type: string,
  relativePath: string,
  content: string,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  createFeatureWorkspace(location);
  return writeArtifactInFeatureDir(
    featureDir(location),
    type,
    relativePath,
    content,
    createdBy,
    { ...options, project: location.project, feature: location.feature },
  );
}

export function indexExistingArtifact(
  location: FeatureLocation,
  type: string,
  relativePath: string,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  createFeatureWorkspace(location);
  return indexExistingArtifactInFeatureDir(
    featureDir(location),
    type,
    relativePath,
    createdBy,
    { ...options, project: location.project, feature: location.feature },
  );
}

export function readArtifactVerified(
  location: FeatureLocation,
  ref: ArtifactRef,
): string {
  const content = readFileSync(artifactPath(location, ref.path));
  const actual = sha256(content);
  if (actual !== ref.hash) {
    throw new Error(`Artifact hash mismatch: ${ref.path}`);
  }
  return content.toString("utf8");
}
