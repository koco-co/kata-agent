// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — IntentBias
// Lightweight keyword/regex-based workflow/project/feature extraction
// from natural language. Provides context hints for the model — does NOT
// make decisions.
// ---------------------------------------------------------------------------

/** Result of an intent analysis. All fields are optional hints. */
export interface IntentResult {
  workflow?: string;
  project?: string;
  feature?: string;
  sourceUrl?: string;
  isResume?: boolean;
  hasExternalEffects?: boolean;
}

// ---- Keywords ------------------------------------------------------------

const RESUME_PREFIXES = ["继续", "resume", "继续刚才", "接着"];

const EXTERNAL_EFFECT_KEYWORDS = [
  "同步",
  "sync",
  "禅道",
  "zentao",
  "钉钉",
  "dingtalk",
  "蓝湖写回",
  "writeback",
];

const WORKFLOW_KEYWORDS: Array<{ regex: RegExp; workflow: string }> = [
  { regex: /回归测试|跑.*测试|运行.*测试|test\s*run|regression/i, workflow: "test-run" },
  { regex: /测试用例|test\s*case/i, workflow: "test-case-gen" },
  { regex: /生成.*脚本|ui\s*script|playwright\s*script/i, workflow: "ui-script-gen" },
  { regex: /静态扫描|测试风险|scan/i, workflow: "test-scan" },
  { regex: /\bbug\b|缺陷/, workflow: "bug-report-gen" },
  { regex: /测试报告|执行报告|report/i, workflow: "test-report" },
  { regex: /xmind|脑图/i, workflow: "test-export-xmind" },
  { regex: /需求|requirement/i, workflow: "requirement-spec-gen" },
];

// ---- URL extraction ------------------------------------------------------

const URL_PATTERN = /https?:\/\/[^\s'"<>,]+/i;

// ---- Project / feature extraction ----------------------------------------

const PROJECT_PATTERN = /项目\s*([^\s，。,\.]{1,20})/;

const FEATURE_MODULE_PATTERN = /([\u4e00-\u9fffA-Za-z0-9_-]{2,30})(?:模块|功能)/;

// Chinese pattern: text BEFORE 功能 (e.g. "登录功能" → "登录")
// Require at least 2 Chinese characters to avoid matching prepositions
const FEATURE_CHINESE_PATTERN = /([\u4e00-\u9fff]{2,30})功能/;
const FEATURE_ENGLISH_PATTERN = /feature\s+([^\s，。,\.:：]{1,30})/i;

function normalizeFeatureCandidate(candidate: string): string {
  const stopWords = [
    "一下",
    "帮我",
    "请",
    "为",
    "对",
    "把",
    "将",
    "运行",
    "执行",
    "跑",
    "测试",
    "的",
  ];
  let normalized = candidate;

  for (const word of stopWords) {
    const index = normalized.lastIndexOf(word);
    if (index >= 0) {
      normalized = normalized.slice(index + word.length);
    }
  }

  return normalized.trim() || candidate;
}

// ---- IntentBias class ----------------------------------------------------

/**
 * Lightweight intent analyzer that extracts workflow, project, feature, and
 * other context hints from natural language using keyword/regex patterns.
 * Does NOT use AI or make decisions — only provides hints for downstream
 * processing.
 */
export class IntentBias {
  /**
   * Analyze a user text and return detected intent hints.
   */
  analyze(text: string): IntentResult {
    const result: IntentResult = {};

    // 1. Resume detection (prefix match)
    const trimmed = text.trimStart();
    for (const prefix of RESUME_PREFIXES) {
      if (trimmed.startsWith(prefix)) {
        result.isResume = true;
        break;
      }
    }

    // 2. External effects detection (substring match)
    if (this._containsAny(text, EXTERNAL_EFFECT_KEYWORDS)) {
      result.hasExternalEffects = true;
    }

    // 3. Workflow detection
    for (const entry of WORKFLOW_KEYWORDS) {
      if (entry.regex.test(text)) {
        result.workflow = entry.workflow;
        break;
      }
    }

    // 4. Project extraction
    const projectMatch = text.match(PROJECT_PATTERN);
    if (projectMatch?.[1]) {
      result.project = projectMatch[1];
    }

    // 5. Feature extraction
    const featureModuleMatch = text.match(FEATURE_MODULE_PATTERN);
    if (featureModuleMatch?.[1]) {
      result.feature = normalizeFeatureCandidate(featureModuleMatch[1]);
    } else {
      const featureChineseMatch = text.match(FEATURE_CHINESE_PATTERN);
      if (featureChineseMatch?.[1]) {
        result.feature = featureChineseMatch[1];
      } else {
        const featureEnglishMatch = text.match(FEATURE_ENGLISH_PATTERN);
        if (featureEnglishMatch?.[1]) {
          result.feature = featureEnglishMatch[1];
        }
      }
    }

    // 6. URL extraction
    const urlMatch = text.match(URL_PATTERN);
    if (urlMatch?.[0]) {
      result.sourceUrl = urlMatch[0];
    }

    // If no workflow keyword matched, explicitly set workflow to undefined
    // (property already undefined from object creation)
    return result;
  }

  /** Check if text contains any of the given keywords (case-insensitive for ASCII). */
  private _containsAny(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        return true;
      }
    }
    return false;
  }
}
