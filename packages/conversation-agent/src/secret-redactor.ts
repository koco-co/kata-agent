// ---------------------------------------------------------------------------
// SecretRedactor — Centralised secret redaction for pre-provider & log output
// ---------------------------------------------------------------------------
//
// Single class owns ALL redaction patterns. Must be called:
//   1. On user messages BEFORE sending to model provider
//   2. Before writing to session log
// ---------------------------------------------------------------------------

/**
 * Compiled redaction rule.
 */
interface RedactRule {
  /** Regex to find secret spans in text */
  regex: RegExp;
  /**
   * Optional replacer — if not provided, the entire match is replaced with
   * "[REDACTED]". If provided, receives (fullMatch, ...groups) and returns a
   * replacement string.
   */
  replacer?: (...args: string[]) => string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default replacer: replace entire match with "[REDACTED]". */
function replaceAll(): string {
  return "[REDACTED]";
}

/**
 * Replacer for `key=value` / `key:value` assignments.
 * Preserves the key name, separator (with spaces), and any quotes.
 *
 * String.replace(regex, fn) passes: fn(fullMatch, p1, p2, p3, p4, p5, offset, str)
 *   p1 = key name
 *   p2 = separator + surrounding whitespace
 *   p3 = optional opening quote (or empty)
 *   p4 = full value
 *   p5 = (unused — inner repeated group, only last char)
 */
function replaceAssignment(
  _full: string,
  key: string,
  sep: string,
  quote: string,
): string {
  return `${key}${sep}${quote}[REDACTED]${quote}`;
}

/**
 * Replacer for URL query params — preserves the param name, redacts the value.
 * String.replace(regex, fn) passes: fn(fullMatch, p1, p2, offset, str)
 *   p1 = prefix (? or &)
 *   p2 = param name
 */
function replaceQueryParam(
  _full: string,
  prefix: string,
  paramName: string,
): string {
  return `${prefix}${paramName}=[REDACTED]`;
}

// ---------------------------------------------------------------------------
// Built-in rule definitions
//
// ORDER MATTERS: more specific patterns MUST come before less specific ones
// to prevent one rule from consuming text that another rule should handle.
//
// Pattern 5 (assignment rule) uses a tempered greedy token in the value
// capture group — each character is checked to NOT start another keyword
// assignment. This prevents "Secret: password=secretValue" from matching
// against the outer "Secret:" keyword instead of the inner "password=".
// ---------------------------------------------------------------------------

const ASSIGNMENT_KEYWORDS = "password|token|secret|api_key|apikey|api-key";
/** Single char that is allowed inside an assignment value */
const VALUE_CHARS = "[A-Za-z0-9_\\-@#$%^&*+=!?.,;:~]";

const RULES: RedactRule[] = [
  // 1. OpenAI API keys: sk- prefix + 20+ alphanumeric chars
  { regex: /\b(sk-[A-Za-z0-9]{20,})\b/g },

  // 2. JWT tokens: eyJ prefix, three dot-separated segments
  {
    regex:
      /\b(eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b/g,
  },

  // 3. PEM blocks: full PEM including BEGIN/END headers
  //    Handles multi-word key types like "RSA PRIVATE KEY", "EC PRIVATE KEY"
  {
    regex:
      /-----BEGIN\s+[A-Za-z\s]+KEY-----\s*[\s\S]*?-----END\s+[A-Za-z\s]+KEY-----/g,
  },

  // 4. Signed URL query params: sig=, token=, X-Amz-Security-Token=, etc.
  //    Runs BEFORE assignment rule to prevent `Token=value` inside
  //    `X-Amz-Security-Token=value` from being consumed as a key=value pair.
  {
    regex:
      /(\?|&)(sig|token|X-Amz-Security-Token|X-Amz-Credential)=[^&\s]+/gi,
    replacer: replaceQueryParam,
  },

  // 5. password=/token=/secret=/api_key assignments
  //
  //    Uses a tempered greedy token in the value group: each character in the
  //    value is checked to ensure it does NOT start another keyword assignment
  //    chain. This prevents "Secret: password=foo" from matching against the
  //    outer "Secret:" — the value `password=foo` would be rejected because
  //    `password=` matches the keyword pattern.
  //
  //    Groups:
  //      1. key name
  //      2. separator + surrounding whitespace
  //      3. optional opening quote
  //      4. full value (outer wrapper for the tempered token)
  //      5. (inner — only last char, ignored)
  //      \3  backreference to opening quote for closing match
  //
  {
    regex: new RegExp(
      `\\b(${ASSIGNMENT_KEYWORDS})` +
        `(\\s*[=:]\\s*)` +
        `(['"]?)` +
        `(` +
        `(?!\\b(?:${ASSIGNMENT_KEYWORDS})\\s*[=:])` +
        `${VALUE_CHARS}` +
        `){8,}` +
        `\\3`,
      "gi",
    ),
    replacer: replaceAssignment,
  },

  // 6. Generic long strings (40+ alnum chars) — but skip URLs, file paths,
  //    version strings, and dot-separated segment sequences.
  {
    regex: /\b([A-Za-z0-9_\-]{40,})\b/g,
    replacer: (_full: string, match: string): string => {
      // Skip if the match looks like a URL or contains path separators
      if (
        match.startsWith("http") ||
        match.startsWith("www") ||
        match.startsWith("//") ||
        match.startsWith("ftp") ||
        match.includes("://") ||
        match.includes("/") ||
        match.includes("\\") ||
        match.includes("..")
      ) {
        return _full;
      }

      // Skip if it looks like a version string (e.g. "1.2.3.4.5.6.7")
      if (/^\d[\d.]*\d$/.test(match)) {
        return _full;
      }

      // Skip if it looks like a file path (e.g. "home/user/project/file.ts")
      if (match.includes(".") && match.length > 40) {
        const segments = match.split(".");
        if (segments.length >= 3) {
          return _full;
        }
      }

      return "[REDACTED]";
    },
  },
];

// ---------------------------------------------------------------------------
// SecretRedactor
// ---------------------------------------------------------------------------

export class SecretRedactor {
  private rules: RedactRule[];

  constructor(rules?: RedactRule[]) {
    this.rules = rules ?? RULES;
  }

  /**
   * Return `text` with all known secret patterns replaced by `[REDACTED]`.
   */
  redact(text: string): string {
    let result = text;

    for (const rule of this.rules) {
      const replacer = rule.replacer ?? replaceAll;
      result = result.replace(rule.regex, replacer as any);
    }

    return result;
  }
}
