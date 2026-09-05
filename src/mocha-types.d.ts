// Mocha ships no bundled type declarations of its own, and the
// DefinitelyTyped `@types/mocha` package declares global `describe`/
// `it`/`before`/`after`/... ambient functions that collide with
// `@types/jest`'s identically-named globals, since this package's own
// test suite runs under Jest (the same reasoning as
// testpulse-jasmine's `jasmine-globals.d.ts`, adapted here to Mocha's
// module shape rather than a single global namespace). Only the
// surface this package actually calls or type-checks against is
// declared here -- deliberately not a full re-declaration of Mocha's
// public API.
declare module 'mocha' {
  export class Suite {
    title: string;
    parent?: Suite;
    constructor(title: string, parentContext?: Context, isRoot?: boolean);
    fullTitle(): string;
  }

  export class Test {
    title: string;
    parent?: Suite;
    duration?: number;
    state?: 'passed' | 'failed';
    pending?: boolean;
    err?: Error;
    /** Set by testpulse.Case()/testpulseAttach.Attach() on the currently-running test. */
    testpulseProperties?: Record<string, string>;
    constructor(title: string, fn?: (...args: unknown[]) => unknown);
    fullTitle(): string;
  }

  export class Context {
    test?: Test;
    currentTest?: Test;
    runnable(): Test;
    runnable(runnable: Test): Context;
  }

  export interface MochaOptions {
    parallel?: boolean;
    reporterOption?: Record<string, unknown>;
    reporterOptions?: Record<string, unknown>;
    [key: string]: unknown;
  }

  export interface RunnerConstants {
    EVENT_RUN_BEGIN: string;
    EVENT_RUN_END: string;
    EVENT_TEST_BEGIN: string;
    EVENT_TEST_END: string;
    EVENT_TEST_FAIL: string;
    EVENT_TEST_PASS: string;
    EVENT_TEST_PENDING: string;
    EVENT_SUITE_BEGIN: string;
    EVENT_SUITE_END: string;
    [key: string]: string;
  }

  export class Runner {
    static readonly constants: RunnerConstants;
    on(event: string, listener: (...args: never[]) => void): this;
    once(event: string, listener: (...args: never[]) => void): this;
  }
}
