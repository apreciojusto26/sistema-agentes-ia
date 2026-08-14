// Map-based concurrency locks (spec R3 "Concurrency Serialization"; design
// §1/§7). Two lock families share this same primitive:
//   - the global SCRAPE_LOCK_KEY ('scrape') — max 1 concurrent scrape,
//     because scrape.js's CONFIG.outputDir ('./output') is a single fixed
//     path (design §7 step 2).
//   - a per-slug generate lock (`generate:{slug}`) — max 1 concurrent
//     generate PER SLUG; different slugs may run concurrently.
//
// This module is intentionally just the primitive: synchronous
// tryAcquire/release plus an opt-in `onNextRelease` wait-list. The actual
// "create the job as status:'queued' and start it when the lock frees up"
// orchestration (design §7 step 5) is a route/registry-level concern layered
// on top — kept out of this module so the lock semantics stay trivially
// testable in isolation.

export const SCRAPE_LOCK_KEY = 'scrape';

/** Global, not per-slug (R6) — admin/.staged/content.json is a single fixed
 * path, same structural reason SCRAPE_LOCK_KEY is global. */
export const CONTENT_LOCK_KEY = 'content';

export function generateLockKey(slug: string): string {
  return `generate:${slug}`;
}

export class JobQueue {
  #locks = new Map<string, string>();
  #waiters = new Map<string, Array<() => void>>();

  /** Non-blocking. Returns true and records `holderId` iff the key was free. */
  tryAcquire(key: string, holderId: string): boolean {
    if (this.#locks.has(key)) return false;
    this.#locks.set(key, holderId);
    return true;
  }

  /** Releasing a key with no lock held is a harmless no-op. */
  release(key: string): void {
    this.#locks.delete(key);
    const waiters = this.#waiters.get(key);
    if (waiters && waiters.length > 0) {
      this.#waiters.delete(key);
      for (const resolve of waiters) resolve();
    }
  }

  isLocked(key: string): boolean {
    return this.#locks.has(key);
  }

  holder(key: string): string | undefined {
    return this.#locks.get(key);
  }

  /**
   * Resolves the next time `key` is released. Does NOT itself acquire the
   * lock — callers must still `tryAcquire` after this resolves (another
   * waiter or a fresh acquire could win the race first).
   */
  onNextRelease(key: string): Promise<void> {
    return new Promise((resolve) => {
      const list = this.#waiters.get(key) ?? [];
      list.push(resolve);
      this.#waiters.set(key, list);
    });
  }
}
