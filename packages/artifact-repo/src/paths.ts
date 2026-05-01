import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface FeatureLocation {
  rootDir: string;
  project: string;
  feature: string;
}

export function featureDir(location: FeatureLocation): string {
  return join(
    location.rootDir,
    "projects",
    location.project,
    "features",
    location.feature,
  );
}

export function artifactPath(
  location: FeatureLocation,
  relativePath: string,
): string {
  if (isAbsolute(relativePath)) {
    throw new Error(`Artifact path must be relative: ${relativePath}`);
  }
  const base = resolve(featureDir(location));
  const target = resolve(base, relativePath);
  const fromBase = relative(base, target);
  if (fromBase === ".." || fromBase.startsWith(`..${sep}`)) {
    throw new Error(`Artifact path escapes feature workspace: ${relativePath}`);
  }
  return target;
}
