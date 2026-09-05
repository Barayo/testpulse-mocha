// Fixture for the unmatched/failOnUnmatched end-to-end test
// (test/e2e/submission.e2e.test.ts). Deliberately separate from
// fixtures/tagged (which case.e2e.test.ts also uses) -- sharing one
// directory between test files that run in separate parallel Jest
// workers risks a race where each file's own .testpulse cleanup deletes
// the other's result marker mid-run.
module.exports = {
  spec: 'spec/*.spec.js',
  reporter: require.resolve('../../../dist'),
  reporterOptions: {},
};
