// RED-before-GREEN for queue.ts (spec R3 "Concurrency Serialization"; design
// §1 "queue.ts — global 'scrape' lock, per-slug 'generate:{slug}' lock").
// Written before queue.ts exists.
import { describe, test, expect } from 'vitest';
import { JobQueue, SCRAPE_LOCK_KEY, generateLockKey } from './queue';

describe('JobQueue', () => {
  test('global scrape lock: a second concurrent scrape is rejected while one runs', () => {
    const q = new JobQueue();
    expect(q.tryAcquire(SCRAPE_LOCK_KEY, 'job-1')).toBe(true);
    expect(q.tryAcquire(SCRAPE_LOCK_KEY, 'job-2')).toBe(false);
  });

  test('scrape lock is acquirable again after release', () => {
    const q = new JobQueue();
    q.tryAcquire(SCRAPE_LOCK_KEY, 'job-1');
    q.release(SCRAPE_LOCK_KEY);
    expect(q.tryAcquire(SCRAPE_LOCK_KEY, 'job-2')).toBe(true);
  });

  test('per-slug generate lock: same-slug concurrent generate is rejected', () => {
    const q = new JobQueue();
    const key = generateLockKey('vinopop-descorchador');
    expect(q.tryAcquire(key, 'job-a')).toBe(true);
    expect(q.tryAcquire(key, 'job-b')).toBe(false);
  });

  test('different-slug generate locks are independent and both acquirable concurrently', () => {
    const q = new JobQueue();
    expect(q.tryAcquire(generateLockKey('slug-a'), 'job-a')).toBe(true);
    expect(q.tryAcquire(generateLockKey('slug-b'), 'job-b')).toBe(true);
  });

  test('scrape lock and a generate lock never contend with each other', () => {
    const q = new JobQueue();
    expect(q.tryAcquire(SCRAPE_LOCK_KEY, 'job-1')).toBe(true);
    expect(q.tryAcquire(generateLockKey('slug-a'), 'job-2')).toBe(true);
  });

  test('isLocked/holder reflect current lock state', () => {
    const q = new JobQueue();
    expect(q.isLocked(SCRAPE_LOCK_KEY)).toBe(false);
    expect(q.holder(SCRAPE_LOCK_KEY)).toBeUndefined();
    q.tryAcquire(SCRAPE_LOCK_KEY, 'job-1');
    expect(q.isLocked(SCRAPE_LOCK_KEY)).toBe(true);
    expect(q.holder(SCRAPE_LOCK_KEY)).toBe('job-1');
  });

  test('release() on a key with no lock held is a harmless no-op', () => {
    const q = new JobQueue();
    expect(() => q.release(SCRAPE_LOCK_KEY)).not.toThrow();
  });

  test('onNextRelease resolves the next time the key is released, and only for waiters registered before that release', async () => {
    const q = new JobQueue();
    const key = generateLockKey('slug-a');
    q.tryAcquire(key, 'job-a');

    let resolved = false;
    const waiter = q.onNextRelease(key).then(() => {
      resolved = true;
    });

    expect(resolved).toBe(false);
    q.release(key);
    await waiter;
    expect(resolved).toBe(true);

    // A second release with no new waiters registered must not throw or hang anything.
    q.tryAcquire(key, 'job-b');
    expect(() => q.release(key)).not.toThrow();
  });
});
