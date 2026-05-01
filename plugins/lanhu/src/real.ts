import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  LanhuFetchInput,
  RequirementSourceBundle,
} from "../../../packages/domain/src/index";

export interface LanhuFetchContext {
  rootDir: string;
  project: string;
  feature: string;
  cookie?: string;
  fetchImpl?: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
}

function sha256(content: string): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchLanhuRequirement(
  input: LanhuFetchInput,
  context: LanhuFetchContext,
): Promise<RequirementSourceBundle> {
  const fetchImpl = context.fetchImpl ?? fetch;
  const response = await fetchImpl(input.url, {
    headers: context.cookie ? { cookie: context.cookie } : {},
  });
  if (!response.ok) {
    throw new Error(`PLUGIN_NETWORK_TRANSIENT ${response.status}`);
  }
  const html = await response.text();
  const text = stripHtml(html);
  const sourceDir = join(
    context.rootDir,
    "projects",
    context.project,
    "features",
    context.feature,
    "sources",
    "lanhu",
  );
  mkdirSync(sourceDir, { recursive: true });
  const rawPath = join(sourceDir, "raw.html");
  writeFileSync(rawPath, html);
  return {
    schemaVersion: "0.1",
    sourceType: "lanhu",
    sourceUrl: input.url,
    title: text.slice(0, 80) || "Lanhu Requirement",
    textBlocks: [{ id: "SRC-001", title: "Lanhu HTML Text", content: text }],
    images: [],
    rawFiles: [
      {
        id: "RAW-HTML",
        path: "sources/lanhu/raw.html",
        mediaType: "text/html",
        hash: sha256(html),
      },
    ],
    fetchedAt: new Date().toISOString(),
  };
}
