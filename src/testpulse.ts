import { Context } from 'mocha';

export interface CaseOptions {
  platform?: string;
  version?: string;
  tags?: string[];
}

/**
 * Tags the currently-running Mocha test with a TestPulse case key.
 * Unlike Jest/Jasmine, Mocha has no implicit "current test" global
 * accessible from arbitrary code -- the only way to reach the running
 * test outside a custom reporter's own Runner-event listeners is via
 * `this` inside a non-arrow `it()`/hook function body (`this.test`),
 * confirmed via Mocha's own issue tracker (mochajs/mocha#794, #3485).
 * `context` is that Mocha `Context`; this function records the
 * properties directly on `context.test` (the `Test` instance the
 * reporter's Runner-event listeners will later read them off of, in
 * the same process -- this synchronous same-process handoff is exactly
 * what `--parallel` mode's worker/main IPC boundary breaks, which is
 * why `--parallel` is unsupported, not a limitation of this function
 * itself).
 */
export function Case(context: Context, caseKey: string, opts?: CaseOptions): void {
  const test = context.test ?? context.currentTest;
  if (!test) {
    throw new Error(
      'testpulse-mocha: Case() was called with no currently-running test -- ' +
        'call it from within a non-arrow it()/hook function body, using `this` as the context argument',
    );
  }

  const properties: Record<string, string> = test.testpulseProperties ?? {};
  properties.testpulse_case_key = caseKey;
  if (opts?.platform !== undefined) {
    properties.testpulse_platform = opts.platform;
  }
  if (opts?.version !== undefined) {
    properties.testpulse_version = opts.version;
  }
  if (opts?.tags !== undefined) {
    properties.testpulse_tags = opts.tags.join(',');
  }
  test.testpulseProperties = properties;
}
