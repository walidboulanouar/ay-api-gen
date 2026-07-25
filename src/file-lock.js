/**
 * File Lock.
 * Advisory exclusive lock for read-modify-write cycles on a shared JSON
 * file (settings.local.json, registry.json). Two concurrent `ay-api-gen`
 * invocations (e.g. a CI regen overlapping a local run) both read the same
 * stale content, both write, and the second write silently clobbers the
 * first's addition — a lost update, not corruption (B-09).
 *
 * Implemented with atomic exclusive file creation (`wx` flag — fails with
 * EEXIST if the lock file already exists) rather than a dependency: this
 * is the same primitive every `proper-lockfile`-style package is built on,
 * and the project has no other need for a locking library.
 */

import { openSync, closeSync, unlinkSync, statSync } from "node:fs";

const DEFAULT_ACQUIRE_TIMEOUT_MS = 30000; // generous: covers a slow interactive confirm prompt
const DEFAULT_STALE_MS = 15000; // a lock older than this is assumed to be from a crashed process
const RETRY_DELAY_MS = 50;

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function acquireLock(lockPath, { timeoutMs, staleMs }) {
  const start = Date.now();

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      closeSync(fd);
      return;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;

      // Break locks abandoned by a crashed/killed process instead of
      // deadlocking forever.
      try {
        const age = Date.now() - statSync(lockPath).mtimeMs;
        if (age > staleMs) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        // Lock file vanished between the failed open and this stat — the
        // holder just released it. Retry immediately.
        continue;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`Timed out waiting for lock: ${lockPath} (held by another ay-api-gen process for over ${timeoutMs}ms)`);
      }
      await sleep(RETRY_DELAY_MS);
    }
  }
}

function releaseLock(lockPath) {
  try {
    unlinkSync(lockPath);
  } catch {
    // Already gone — nothing to clean up.
  }
}

/**
 * Run `fn` while holding an exclusive advisory lock on `<path>.lock`.
 * The lock directory must already exist (callers already `mkdirSync` the
 * parent before writing the target file).
 * @param {string} path - the file being protected (lock is path + ".lock")
 * @param {() => Promise<any>|any} fn
 * @param {object} opts - { timeoutMs, staleMs }
 */
export async function withFileLock(path, fn, opts = {}) {
  const lockPath = `${path}.lock`;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_ACQUIRE_TIMEOUT_MS;
  const staleMs = opts.staleMs ?? DEFAULT_STALE_MS;

  await acquireLock(lockPath, { timeoutMs, staleMs });
  try {
    return await fn();
  } finally {
    releaseLock(lockPath);
  }
}
