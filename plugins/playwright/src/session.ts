import type { BrowserContext } from "playwright";
import * as fs from "fs";

export interface StorageState {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins: Array<{
    origin: string;
    localStorage: Array<{ name: string; value: string }>;
  }>;
}

export function saveStorageState(
  state: StorageState,
  statePath: string,
): void {
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

export function loadStorageState(statePath: string): StorageState {
  const raw = fs.readFileSync(statePath, "utf8");
  return JSON.parse(raw) as StorageState;
}

export function applyStorageState(
  context: BrowserContext,
  statePath: string,
): Promise<void> {
  const state = loadStorageState(statePath);
  return context.addCookies(state.cookies);
}
