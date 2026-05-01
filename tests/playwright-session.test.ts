import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { rmSync } from "fs";
import {
  loadStorageState,
  saveStorageState,
} from "../plugins/playwright/src/session";

describe("browser session management", () => {
  test("save and load storage state round-trips cookie data", () => {
    const testDir = mkdtempSync(join(tmpdir(), "kata-session-"));
    const state = {
      cookies: [
        {
          name: "test",
          value: "val",
          domain: ".example.com",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: false,
          sameSite: "Lax" as const,
        },
      ],
      origins: [],
    };
    const statePath = join(testDir, "state.json");
    saveStorageState(state, statePath);
    const loaded = loadStorageState(statePath);
    expect(loaded.cookies).toEqual(state.cookies);
    rmSync(testDir, { recursive: true });
  });
});
