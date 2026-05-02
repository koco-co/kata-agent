export type { FeatureLocation } from "./paths";
export { artifactPath, featureDir } from "./paths";
export type { ArtifactIndex, WriteArtifactOptions } from "./store";
export {
  createFeatureWorkspace,
  indexExistingArtifact,
  indexExistingArtifactInFeatureDir,
  readArtifactIndex,
  readArtifactVerified,
  writeArtifact,
  writeArtifactInFeatureDir,
} from "./store";
export { readJsonArtifact, writeJsonArtifact } from "./validation";
