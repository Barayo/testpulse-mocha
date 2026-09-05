import { Case } from './testpulse';
import { Attach } from './testpulseAttach';
import { TestPulseReporter } from './reporter';

/**
 * This package's main entry point is itself the `TestPulseReporter`
 * constructor, not merely an object of named exports. Mocha's CLI
 * coerces a `.mocharc.js`'s `reporter` field to a string type even when
 * set via a config file rather than `--reporter` directly (confirmed by
 * reading `lib/cli/run-option-metadata.js`'s `TYPES.string` list, which
 * includes `'reporter'` -- a real, empirically-confirmed constraint: a
 * live function/class value assigned to `reporter` in `.mocharc.js`
 * still gets coerced through yargs' string handling and fails with
 * "Could not load reporter" naming the stringified class body).
 * `reporter: 'testpulse-mocha'` therefore resolves via
 * `require('testpulse-mocha')`, and Mocha uses THAT value directly as
 * the reporter constructor (`lib/mocha.js`'s `Mocha.prototype.reporter`:
 * a string reporter name is `require()`'d and used as-is). Case/Attach/
 * TestPulseReporter remain available as ordinary properties on this
 * same exported function for
 * `const { Case, Attach, TestPulseReporter } = require('testpulse-mocha')`.
 */
type TestPulseModuleExports = typeof TestPulseReporter & {
  Case: typeof Case;
  Attach: typeof Attach;
  TestPulseReporter: typeof TestPulseReporter;
};

const testpulseMocha = TestPulseReporter as TestPulseModuleExports;
testpulseMocha.Case = Case;
testpulseMocha.Attach = Attach;
testpulseMocha.TestPulseReporter = TestPulseReporter;

export = testpulseMocha;
