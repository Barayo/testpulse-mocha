// Fixture for the case-tagging end-to-end test (test/e2e/case.e2e.test.ts).
//
// `reporter` must be a resolvable module-specifier STRING, not a live
// function/class value -- confirmed via a real repro that Mocha's CLI
// coerces `.mocharc.js`'s `reporter` field through yargs' string-typed
// option handling regardless of source (lib/cli/run-option-metadata.js's
// TYPES.string includes 'reporter'), so a class value assigned directly
// fails with "Could not load reporter" naming the stringified class
// body. `require.resolve(...)` here (evaluated in THIS file's own
// module context) turns the relative path into an absolute string
// before Mocha's own require.resolve() ever sees it, sidestepping the
// "relative to mocha's own lib file" resolution trap a bare relative
// string would hit. A real npm consumer just uses `reporter: 'testpulse-mocha'`
// (see README) -- this absolute-path form is fixture-only plumbing.
module.exports = {
  spec: 'spec/*.spec.js',
  reporter: require.resolve('../../../dist'),
  reporterOptions: {},
};
