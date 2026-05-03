import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { SessionStore } from "../../packages/conversation-agent/src/session-store";
import type { ChatMessage } from "../../packages/conversation-agent/src/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DIR = join(import.meta.dir, ".test-sessions");

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function makeMsg(role: string, content: string): ChatMessage {
  switch (role) {
    case "user":
      return { role: "user", content } as ChatMessage;
    case "assistant":
      return {
        role: "assistant",
        content,
        toolCalls: [],
      } as ChatMessage;
    case "tool":
      return {
        role: "tool",
        toolCallId: "tc-1",
        content,
      } as ChatMessage;
    default:
      return { role: "user", content } as ChatMessage;
  }
}

// ---------------------------------------------------------------------------
// beforeEach / afterEach
// ---------------------------------------------------------------------------

beforeAll(() => {
  cleanTestDir();
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  cleanTestDir();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SessionStore", () => {
  test("creates new session and appends messages, verifies they are readable", async () => {
    const store = new SessionStore(TEST_DIR);
    const sessionId = "test-session-1";

    const msg1 = makeMsg("user", "Hello!");
    const msg2 = makeMsg("assistant", "Hi there!");
    const msg3 = makeMsg("user", "How are you?");

    await store.appendMessage(sessionId, msg1);
    await store.appendMessage(sessionId, msg2);
    await store.appendMessage(sessionId, msg3);

    const messages = await store.readMessages(sessionId);
    expect(messages).toBeArray();
    expect(messages).toHaveLength(3);
    expect(messages[0]).toEqual(msg1);
    expect(messages[1]).toEqual(msg2);
    expect(messages[2]).toEqual(msg3);
  });

  test("recovers from stale lock files", async () => {
    const store = new SessionStore(TEST_DIR);
    const sessionId = "test-stale-lock";

    // Write a lock file for a dead PID
    const lockDir = join(TEST_DIR, ".kata-agent", "sessions");
    mkdirSync(lockDir, { recursive: true });
    const lockFile = join(lockDir, `${sessionId}.lock`);
    const staleLock = JSON.stringify({
      pid: process.pid + 999999, // extremely unlikely to be alive
      timestamp: Date.now(),
    });
    writeFileSync(lockFile, staleLock, { flag: "wx" });

    // Now append — should recover from the stale lock
    const msg = makeMsg("user", "This should work despite stale lock");
    await store.appendMessage(sessionId, msg);

    const messages = await store.readMessages(sessionId);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual(msg);
  });

  test("archives sessions after message limit", async () => {
    const store = new SessionStore(TEST_DIR, { maxMessages: 5 });
    const sessionId = "test-archive";

    // Write 7 messages
    const msgs: ChatMessage[] = [];
    for (let i = 0; i < 7; i++) {
      msgs.push(makeMsg("user", `Message ${i + 1}`));
    }
    for (const msg of msgs) {
      await store.appendMessage(sessionId, msg);
    }

    // Verify at most 5 messages remain
    const messages = await store.readMessages(sessionId);
    expect(messages.length).toBeLessThanOrEqual(5);

    // Verify the archive file exists
    const archiveFile = join(TEST_DIR, `${sessionId}.archive.jsonl`);
    expect(existsSync(archiveFile)).toBe(true);

    // Verify the remaining messages are the most recent ones
    // (messages 3-7, i.e., indices 2-6 of original, should remain)
    // But we need to check the content of remaining messages are the latest ones
    const remainingContents = messages.map((m: ChatMessage) =>
      "content" in m ? m.content : ""
    );
    expect(remainingContents).not.toContain("Message 1");
    expect(remainingContents).toContain("Message 7");
  });

  test("multiple sessions are isolated", async () => {
    const store = new SessionStore(TEST_DIR);
    const sessionA = "multi-a";
    const sessionB = "multi-b";

    await store.appendMessage(sessionA, makeMsg("user", "A1"));
    await store.appendMessage(sessionB, makeMsg("user", "B1"));
    await store.appendMessage(sessionA, makeMsg("user", "A2"));

    const msgsA = await store.readMessages(sessionA);
    const msgsB = await store.readMessages(sessionB);

    expect(msgsA).toHaveLength(2);
    expect(msgsB).toHaveLength(1);
    expect((msgsA[0] as any).content).toBe("A1");
    expect((msgsA[1] as any).content).toBe("A2");
    expect((msgsB[0] as any).content).toBe("B1");
  });

  test("saves session metadata and lists recent sessions", async () => {
    const store = new SessionStore(join(TEST_DIR, "metadata"));

    await store.appendMessage("meta-old", makeMsg("user", "旧消息 1"));
    await store.appendMessage("meta-old", makeMsg("assistant", "旧消息 2"));
    await store.saveMetadata("meta-old", {
      name: "较早会话",
      yolo: false,
      enabledToolsets: ["files"],
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    await store.appendMessage("meta-new", makeMsg("user", "新消息"));
    const saved = await store.saveMetadata("meta-new", {
      name: "较新会话",
      yolo: true,
      enabledToolsets: ["files", "shell"],
    });

    const recent = await store.getRecentSessions(10);

    expect(saved.sessionId).toBe("meta-new");
    expect(saved.name).toBe("较新会话");
    expect(saved.messageCount).toBe(1);
    expect(saved.yolo).toBe(true);
    expect(saved.enabledToolsets).toEqual(["files", "shell"]);
    expect(recent[0].sessionId).toBe("meta-new");
    expect(recent.map((session) => session.sessionId)).toContain("meta-old");
  });

  test("getRecentSessions respects the requested limit", async () => {
    const store = new SessionStore(join(TEST_DIR, "metadata-limit"));

    for (let i = 0; i < 12; i++) {
      await store.saveMetadata(`meta-limit-${i}`, {
        name: `会话 ${i}`,
        messageCount: i,
        yolo: false,
        enabledToolsets: ["files"],
      });
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    const recent = await store.getRecentSessions(10);

    expect(recent).toHaveLength(10);
    expect(recent[0].sessionId).toBe("meta-limit-11");
    expect(recent.some((session) => session.sessionId === "meta-limit-0")).toBe(false);
  });
});
