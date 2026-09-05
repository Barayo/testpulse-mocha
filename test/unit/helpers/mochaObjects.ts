import { Context, Suite, Test } from 'mocha';

/**
 * Builds a real Mocha `Test` + `Context` pair via Mocha's own classes
 * (`new Mocha.Test(title, fn)`, `new Mocha.Context()`), not hand-rolled
 * duck-typed fakes -- matching testpulse-jasmine's "use the real
 * library's own objects" discipline for its own unit tests. `context.test`
 * is wired up the same way Mocha's real `Context.prototype.runnable()`
 * does internally when a test actually runs.
 */
export function buildTestContext(title = 'a test', suiteTitle = 'a suite'): { context: Context; test: Test } {
  const suite = new Suite(suiteTitle);
  const test = new Test(title, function () {});
  test.parent = suite;
  const context = new Context();
  context.test = test;
  return { context, test };
}
