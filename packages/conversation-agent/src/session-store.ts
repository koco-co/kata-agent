// ---------------------------------------------------------------------------
// @kata-agent/conversation-agent — SessionStore with JSONL persistence,
// atomic lock files, stale-lock recovery, and session archival.
// ---------------------------------------------------------------------------

import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import { join, dirname } from "path";
import type { ChatMessage } from "./types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_MESSAGES = 200;
const DEFAULT_MAX_SESSION_SIZE = 5 * 1024 * 1024; // 5 MB
const STALE_LOCK_MS = 30_000; // 30 seconds
const MAX_LOCK_RETRIES = 10;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface SessionStoreOptions {
  maxMessages?: number;
  maxSessionSize?: number;
}

// ---------------------------------------------------------------------------
// SessionStore
// ---------------------------------------------------------------------------

export class SessionStore {
  private dir: string;
  private maxMessages: number;
  private maxSessionSize: number;

  constructor(dir: string, options?: SessionStoreOptions) {
    this.dir = dir;
    this.maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;
    this.maxSessionSize = options?.maxSessionSize ?? DEFAULT_MAX_SESSION_SIZE;
  }

  // ---- Path helpers -------------------------------------------------------

  private lockPath(sessionId: string): string {
    return join(this.dir, ".kata-agent", "sessions", `${sessionId}.lock`);
  }

  private sessionPath(sessionId: string): string {
    return join(this.dir, `${sessionId}.jsonl`);
  }

  private archivePath(sessionId: string): string {
    return join(this.dir, `${sessionId}.archive.jsonl`);
  }

  // ---- Lock management ----------------------------------------------------

  /**
   * Acquire an atomic lock for the given session.
   * Retries with exponential backoff up to MAX_LOCK_RETRIES attempts.
   * Recovers from stale locks (dead PID or lock older than STALE_LOCK_MS).
   */
  private async acquireLock(sessionId: string): Promise<void> {
    const lockPath = this.lockPath(sessionId);
    mkdirSync(dirname(lockPath), { recursive: true });

    const lockData = JSON.stringify({
      pid: process.pid,
      timestamp: Date.now(),
    });

    for (let attempt = 0; attempt < MAX_LOCK_RETRIES; attempt++) {
      try {
        // Atomic create — fails with EEXIST if file exists
        writeFileSync(lockPath, lockData, { flag: "wx" });
        return;
      } catch (err: unknown) {
        const nodeErr = err as NodeJS.ErrnoException;
        if (nodeErr.code !== "EEXIST") throw err;

        // Lock exists — check for staleness
        if (this.isLockStale(lockPath)) {
          // Remove stale lock and retry
          try {
            unlinkSync(lockPath);
          } catch {
            // Race: someone else removed it — that's fine
          }
          continue; // retry immediately
        }

        // Lock held by another live process — exponential backoff
        if (attempt < MAX_LOCK_RETRIES - 1) {
          const delay = Math.min(100 * Math.pow(2, attempt), 2000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Failed to acquire lock for session "${sessionId}" after ${MAX_LOCK_RETRIES} attempts`,
    );
  }

  /**
   * Release the lock for the given session (only if we own it).
   */
  private releaseLock(sessionId: string): void {
    const lockPath = this.lockPath(sessionId);
    try {
      const content = readFileSync(lockPath, "utf-8");
      const lock = JSON.parse(content);
      if (lock.pid === process.pid) {
        unlinkSync(lockPath);
      }
    } catch {
      // Lock already gone or unreadable — nothing to do
    }
  }

  /**
   * Check whether an existing lock file is stale.
   * A lock is stale if the owning process is dead (ESRCH) or the lock
   * was created more than STALE_LOCK_MS ago.
   */
  private isLockStale(lockPath: string): boolean {
    try {
      const content = readFileSync(lockPath, "utf-8");
      const lock = JSON.parse(content);

      // Check whether the owning process is still alive
      try {
        process.kill(lock.pid, 0);
      } catch {
        // ESRCH — process does not exist
        return true;
      }

      // Process is alive — check timestamp
      if (Date.now() - lock.timestamp > STALE_LOCK_MS) {
        return true;
      }

      return false;
    } catch {
      // Can't read or parse the lock file — treat as stale
      return true;
    }
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Append a single message to the session's JSONL file.
   * If the total message count exceeds `maxMessages`, the oldest messages
   * are automatically archived to `{sessionId}.archive.jsonl`.
   */
  async appendMessage(
    sessionId: string,
    message: ChatMessage,
  ): Promise<void> {
    await this.acquireLock(sessionId);
    try {
      const sPath = this.sessionPath(sessionId);
      mkdirSync(dirname(sPath), { recursive: true });

      // Append the message as a single JSON line
      appendFileSync(sPath, JSON.stringify(message) + "\n", "utf-8");

      // Check archival threshold
      const messages = this.readMessagesUnsafe(sPath);
      if (messages.length > this.maxMessages) {
        this.archiveMessages(sPath, sessionId, messages);
      }
    } finally {
      this.releaseLock(sessionId);
    }
  }

  /**
   * Read all messages from the session's JSONL file.
   */
  async readMessages(sessionId: string): Promise<ChatMessage[]> {
    await this.acquireLock(sessionId);
    try {
      return this.readMessagesUnsafe(this.sessionPath(sessionId));
    } finally {
      this.releaseLock(sessionId);
    }
  }

  // ---- Internal helpers ---------------------------------------------------

  /**
   * Read messages without acquiring the lock (caller must hold it).
   */
  private readMessagesUnsafe(sPath: string): ChatMessage[] {
    if (!existsSync(sPath)) {
      return [];
    }

    const raw = readFileSync(sPath, "utf-8");
    const lines = raw.trim().split("\n").filter(Boolean);
    return lines.map((line) => JSON.parse(line) as ChatMessage);
  }

  /**
   * Archive the oldest messages and rewrite the session file with only
   * the most recent `maxMessages` messages.
   */
  private archiveMessages(
    sPath: string,
    sessionId: string,
    messages: ChatMessage[],
  ): void {
    const overflow = messages.length - this.maxMessages;
    const toArchive = messages.slice(0, overflow);
    const toKeep = messages.slice(overflow);

    // Append archived messages
    if (toArchive.length > 0) {
      const archiveLines = toArchive
        .map((m) => JSON.stringify(m))
        .join("\n") + "\n";
      const aPath = this.archivePath(sessionId);
      mkdirSync(dirname(aPath), { recursive: true });
      appendFileSync(aPath, archiveLines, "utf-8");
    }

    // Rewrite session file with kept messages
    const keepLines = toKeep
      .map((m) => JSON.stringify(m))
      .join("\n") + "\n";
    writeFileSync(sPath, keepLines, "utf-8");
  }
}
