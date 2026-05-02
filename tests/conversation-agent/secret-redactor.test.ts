import { describe, expect, test } from "bun:test";
import { SecretRedactor } from "../../packages/conversation-agent/src/secret-redactor";

// ---------------------------------------------------------------------------
// SecretRedactor — Unit Tests
// ---------------------------------------------------------------------------

describe("SecretRedactor", () => {
  const redactor = new SecretRedactor();

  // -----------------------------------------------------------------------
  // Pattern 1: OpenAI API keys
  // -----------------------------------------------------------------------
  test("redacts OpenAI API key pattern (sk-...)", () => {
    const input = "My key is sk-abc123def456ghi789jkl012 and it's secret.";
    const expected = "My key is [REDACTED] and it's secret.";
    expect(redactor.redact(input)).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // Pattern 2: JWT tokens
  // -----------------------------------------------------------------------
  test("redacts JWT token", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3j6JkMXcNvz4kYvFYw7S7Q7X7Q7X7Q7X";
    const input = `Token: ${jwt} is in this text.`;
    const expected = "Token: [REDACTED] is in this text.";
    expect(redactor.redact(input)).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // Pattern 3: PEM blocks
  // -----------------------------------------------------------------------
  test("redacts PEM block", () => {
    const pem = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0gM
-----END RSA PRIVATE KEY-----`;
    const input = `Here is a key:\n${pem}\nEnd.`;
    const expected = `Here is a key:\n[REDACTED]\nEnd.`;
    expect(redactor.redact(input)).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // Pattern 4: password=/token=/secret=/api_key assignments
  // -----------------------------------------------------------------------
  test("redacts password= assignment value", () => {
    const input = "password=supersecret123!@# and other text";
    const expected = "password=[REDACTED] and other text";
    expect(redactor.redact(input)).toBe(expected);
  });

  test("redacts token= assignment value", () => {
    const input = "token=ghp_abcdefghijklmnopqrstuvwxyz12345";
    const expected = "token=[REDACTED]";
    expect(redactor.redact(input)).toBe(expected);
  });

  test("redacts secret= assignment value", () => {
    const input = "secret: mySecretKey123!";
    const expected = "secret: [REDACTED]";
    expect(redactor.redact(input)).toBe(expected);
  });

  test("redacts api_key assignment value", () => {
    const input = "api_key=1234567890abcdef1234";
    const expected = "api_key=[REDACTED]";
    expect(redactor.redact(input)).toBe(expected);
  });

  test("redacts apikey assignment value", () => {
    const input = 'apikey="A1b2C3d4E5f6G7h8I9j0"';
    const expected = 'apikey="[REDACTED]"';
    expect(redactor.redact(input)).toBe(expected);
  });

  test("redacts api-key assignment value (hyphenated)", () => {
    const input = "api-key=MySecretToken12345!";
    const expected = "api-key=[REDACTED]";
    expect(redactor.redact(input)).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // Pattern 5: Signed URL query params
  // -----------------------------------------------------------------------
  test("redacts signed URL query params (sig=)", () => {
    const input =
      "https://example.com/file?name=test&sig=abcdef1234567890&expires=12345";
    const expected =
      "https://example.com/file?name=test&sig=[REDACTED]&expires=12345";
    expect(redactor.redact(input)).toBe(expected);
  });

  test("redacts X-Amz-Security-Token in query params", () => {
    const input =
      "https://s3.amazonaws.com/bucket/key?X-Amz-Security-Token=IQoJb3JpZ2luX2VjEJ&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE";
    const expected =
      "https://s3.amazonaws.com/bucket/key?X-Amz-Security-Token=[REDACTED]&X-Amz-Credential=[REDACTED]";
    expect(redactor.redact(input)).toBe(expected);
  });

  test("redacts token= in URL query params", () => {
    const input = "https://service.com/api?token=ghp_abc123def456&format=json";
    const expected =
      "https://service.com/api?token=[REDACTED]&format=json";
    expect(redactor.redact(input)).toBe(expected);
  });

  // -----------------------------------------------------------------------
  // Pattern 6: No secrets — original text unchanged
  // -----------------------------------------------------------------------
  test("returns original text unchanged when no secrets found", () => {
    const input = "Hello, this is a harmless message with no secrets.";
    expect(redactor.redact(input)).toBe(input);
  });

  test("does not redact URLs with no sensitive params", () => {
    const input = "Visit https://example.com/path?name=foo&value=bar for info";
    expect(redactor.redact(input)).toBe(input);
  });

  test("does not redact file paths", () => {
    const input = "The file is at /home/user/projects/my-app/package.json";
    expect(redactor.redact(input)).toBe(input);
  });

  // -----------------------------------------------------------------------
  // Generic long alphanumeric strings
  // -----------------------------------------------------------------------
  test("redacts generic long alphanumeric string (40+ chars)", () => {
    const input =
      "somekey a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6";
    const expected =
      "somekey [REDACTED]";
    expect(redactor.redact(input)).toBe(expected);
  });

  test("does not redact URLs with standard path segments", () => {
    // URLs with path-like segments should not be caught by generic pattern
    const input = "https://github.com/org/repo/blob/main/src/index.ts";
    expect(redactor.redact(input)).toBe(input);
  });

  test("does not redact version strings", () => {
    const input = "version 1.2.3.4.5.6.7.8.9.0";
    expect(redactor.redact(input)).toBe(input);
  });

  // -----------------------------------------------------------------------
  // Multiple patterns in one text
  // -----------------------------------------------------------------------
  test("redacts multiple different patterns in one text", () => {
    const input = `API key: sk-abc123def456ghi789jkl012
Token: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3j6JkMXcNvz4kYvFYw7S7Q7X7Q7X7Q7X
Secret: password=MyP@ssw0rd!2024`;
    const expected = `API key: [REDACTED]
Token: [REDACTED]
Secret: password=[REDACTED]`;
    expect(redactor.redact(input)).toBe(expected);
  });
});
