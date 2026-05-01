import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import { SCHEMA_REGISTRY, type SchemaName } from "./schemas";

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validators = new Map<SchemaName, ValidateFunction>();

function repoRoot(): string {
  return join(import.meta.dir, "..", "..", "..");
}

export function getSchemaValidator(name: SchemaName): ValidateFunction {
  const existing = validators.get(name);
  if (existing) return existing;
  const schemaPath = join(repoRoot(), SCHEMA_REGISTRY[name]);
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const validator = ajv.compile(schema);
  validators.set(name, validator);
  return validator;
}

export function validateSchema(
  name: SchemaName,
  value: unknown,
): SchemaValidationResult {
  const validate = getSchemaValidator(name);
  const valid = validate(value);
  return {
    valid,
    errors: (validate.errors ?? []).map(
      (error) => `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
    ),
  };
}

export function assertValidSchema(name: SchemaName, value: unknown): void {
  const result = validateSchema(name, value);
  if (!result.valid) {
    throw new Error(
      `SCHEMA_VALIDATION_FAILED ${name}: ${result.errors.join("; ")}`,
    );
  }
}
