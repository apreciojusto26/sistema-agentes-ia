import { describe, expect, it } from 'vitest';

// Task 1.6: prove the vitest runner actually runs in this project before any
// real suite depends on it. Delete once Phase 7's real suites exist if this
// becomes redundant — kept trivial and dependency-free on purpose.
describe('vitest runner', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
