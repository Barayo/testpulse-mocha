export interface TestResultLike {
  title: string;
  classname: string;
  status: 'passed' | 'failed' | 'pending';
  duration: number;
  properties: Record<string, string> | null;
  failureMessage?: string;
  failureStack?: string;
}

/**
 * Escapes every value written into the report's element text or
 * attribute content, since this reporter builds JUnit XML directly
 * rather than delegating to a third-party writer (unlike, say, Maven's
 * plugin, which can rely on Surefire's own writer for this). Test
 * titles and failure messages routinely embed data from the code under
 * test, not just literal strings the test author wrote, so none of it
 * is trusted as already-safe. A `]]>` sequence needs no special
 * handling beyond the standard escapes below, since this builder never
 * emits a CDATA section for any value to begin with -- the `>` in
 * `]]>` is escaped like any other `>`.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Builds a JUnit XML report directly from Mocha test results --
 * specifically their `properties` field, populated by
 * testpulse.Case()/testpulseAttach.Attach() via `context.test.testpulseProperties`.
 * No dependency on mocha-junit-reporter (confirmed via its own README to
 * support only testsuite-level properties, with no per-testcase
 * mechanism) or any other third-party JUnit XML writer.
 */
export function buildJUnitXml(suiteName: string, results: TestResultLike[]): string {
  const failures = results.filter((r) => r.status === 'failed').length;
  const skipped = results.filter((r) => r.status === 'pending').length;

  const testcases = results
    .map((result) => {
      let body = '';
      const properties = result.properties;
      if (properties && Object.keys(properties).length > 0) {
        const props = Object.entries(properties)
          .map(([key, value]) => `<property name="${escapeXml(key)}" value="${escapeXml(String(value))}"/>`)
          .join('');
        body += `<properties>${props}</properties>`;
      }
      if (result.status === 'failed') {
        const message = result.failureMessage ? escapeXml(result.failureMessage) : 'test failed';
        const stack = result.failureStack ? escapeXml(result.failureStack) : '';
        body += `<failure message="${message}">${stack}</failure>`;
      } else if (result.status === 'pending') {
        body += '<skipped/>';
      }
      return `<testcase classname="${escapeXml(result.classname)}" name="${escapeXml(result.title)}" time="${result.duration / 1000}">${body}</testcase>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    `<testsuites><testsuite name="${escapeXml(suiteName)}" tests="${results.length}" failures="${failures}" errors="0" skipped="${skipped}">` +
    testcases +
    '</testsuite></testsuites>'
  );
}
