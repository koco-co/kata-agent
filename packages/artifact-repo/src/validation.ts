import type { ArtifactRef, SchemaName } from "../../domain/src/index";
import { assertValidSchema } from "../../domain/src/index";
import type { FeatureLocation } from "./paths";
import type { WriteArtifactOptions } from "./store";
import { readArtifactVerified, writeArtifact } from "./store";

export function writeJsonArtifact<T>(
  location: FeatureLocation,
  schemaName: SchemaName,
  relativePath: string,
  value: T,
  createdBy: string,
  options: WriteArtifactOptions = {},
): ArtifactRef {
  assertValidSchema(schemaName, value);
  return writeArtifact(
    location,
    schemaName,
    relativePath,
    `${JSON.stringify(value, null, 2)}\n`,
    createdBy,
    options,
  );
}

export function readJsonArtifact<T>(
  location: FeatureLocation,
  ref: ArtifactRef,
  schemaName: SchemaName,
): T {
  const value = JSON.parse(readArtifactVerified(location, ref)) as T;
  assertValidSchema(schemaName, value);
  return value;
}
