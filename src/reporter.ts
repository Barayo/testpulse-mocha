import * as path from 'path';
import { MochaOptions, Runner, Test } from 'mocha';
import { redacted, redactUrl, ReporterOptions, resolveConfig, ResolvedConfig } from './config';
import { getCases, ImportAttachment, postImport } from './httpClient';
import { clearAttachments, readAttachments } from './attachmentStore';
import { buildJUnitXml, TestResultLike } from './xmlBuilder';
import { writeResultMarker } from './resultMarker';

const EVENT_TEST_PASS = 'pass';
const EVENT_TEST_FAIL = 'fail';
const EVENT_TEST_PENDING = 'pending';
const EVENT_RUN_END = 'end';

function classnameFor(test: Test): string {
  return test.parent ? test.parent.fullTitle() : path.basename(process.cwd());
}

function extractError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Names only the specific TESTPULSE_* variables that are missing, never
 * the resolved value of a setting that IS present -- since some
 * settings (a resolved `url`) can carry embedded credentials in an
 * unusual configuration, and `check`'s own output only ever forwards
 * this string verbatim.
 */
function missingConfigReason(config: ResolvedConfig): string | null {
  const missing: string[] = [];
  if (!config.url) missing.push('TESTPULSE_URL');
  if (!config.token) missing.push('TESTPULSE_TOKEN');
  if (!config.project) missing.push('TESTPULSE_PROJECT');
  if (missing.length === 0) return null;
  return `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} required (set directly, or via reporter options)`;
}

/**
 * A Mocha reporter that builds JUnit XML directly from each Test's own
 * `testpulseProperties` (set via testpulse.Case()/testpulseAttach.Attach())
 * and auto-submits it, without depending on mocha-junit-reporter or any
 * other third-party JUnit XML writer -- confirmed via mocha-junit-reporter's
 * own README to support only testsuite-level custom properties, with no
 * per-testcase mechanism at all.
 *
 * Registered via Mocha's own `reporter`/`reporterOptions` (or CLI
 * `--reporter-option`) configuration, per Mocha's own reporter
 * constructor convention: `new Reporter(runner, options)`. `options` is
 * Mocha's own fully-resolved options object -- this is how the
 * `--parallel` warning below reads `options.parallel` without touching
 * any Mocha internals.
 *
 * `EVENT_RUN_END`'s handler is `async`; Mocha's own default (no
 * `--exit` flag) is `exitMochaLater`, which waits for the event loop to
 * drain naturally rather than force-killing the process, so this
 * handler's submission genuinely completes before the process exits --
 * confirmed via a real repro reading lib/cli/run-helpers.js, and
 * covered by a permanent e2e regression test
 * (test/e2e/asyncCompletion.e2e.test.ts).
 */
export class TestPulseReporter {
  /** Exposed so tests can await EVENT_RUN_END's async handler deterministically. */
  public donePromise: Promise<void> = Promise.resolve();

  private results: TestResultLike[] = [];
  private reporterOptions: ReporterOptions;

  constructor(runner: Runner, options: MochaOptions = {}) {
    this.reporterOptions = (options.reporterOption ?? options.reporterOptions ?? {}) as ReporterOptions;

    if (options.parallel) {
      // Since Mocha's --parallel mode transmits Test objects from
      // worker processes to the main process via Test.prototype.serialize()'s
      // fixed, hardcoded field list (lib/test.js), which carries no
      // custom properties, testpulse_case_key set via Case() never
      // survives to this reporter under --parallel. Without this
      // warning, the failure mode is a fully silent green build: zero
      // case keys submitted, indistinguishable from "no one called Case()".
      // eslint-disable-next-line no-console
      console.error(
        'testpulse-mocha: WARNING: running under --parallel, which is not supported -- ' +
          "custom test properties set via Case()/Attach() do not survive Mocha's own " +
          'worker-to-main serialization (Test.prototype.serialize() uses a fixed field list), ' +
          'so no case keys will reach this reporter. See the README for details.',
      );
    }

    runner.on(EVENT_TEST_PASS, (test: Test) => this.recordResult(test, 'passed'));
    runner.on(EVENT_TEST_FAIL, (test: Test, err: Error) => this.recordResult(test, 'failed', err));
    runner.on(EVENT_TEST_PENDING, (test: Test) => this.recordResult(test, 'pending'));
    runner.once(EVENT_RUN_END, () => {
      this.donePromise = this.onRunEnd();
    });
  }

  private recordResult(test: Test, status: 'passed' | 'failed' | 'pending', err?: Error): void {
    this.results.push({
      title: test.title,
      classname: classnameFor(test),
      status,
      duration: test.duration ?? 0,
      properties: test.testpulseProperties ?? null,
      failureMessage: err?.message,
      failureStack: err?.stack,
    });
  }

  private async onRunEnd(): Promise<void> {
    const config = resolveConfig(this.reporterOptions);
    const suiteName = path.basename(process.cwd());
    const report = buildJUnitXml(suiteName, this.results);

    const declaredCaseKeys = new Set(
      this.results
        .map((r) => r.properties?.['testpulse_case_key'])
        .filter((k): k is string => typeof k === 'string'),
    );

    const reason = missingConfigReason(config);
    if (reason) {
      // eslint-disable-next-line no-console
      console.error(`testpulse-mocha: ${reason}. Skipping submission.`);
      // Writing a failed marker here (rather than leaving none at all)
      // is what lets `check` name the real cause -- otherwise "no
      // marker found" reads as "the reporter never ran," which is
      // wrong: it did run, and correctly declined to submit.
      writeResultMarker({ failed: true, reason });
      return;
    }

    // TypeScript narrowing: reason === null above guarantees these three.
    const url = config.url as string;
    const token = config.token as string;
    const project = config.project as string;

    if (config.dryRun) {
      await this.runDryRun(url, project, token, declaredCaseKeys);
      return;
    }

    await this.runSubmit(url, project, token, report, declaredCaseKeys, config.failOnUnmatched);
  }

  private async runDryRun(
    url: string,
    project: string,
    token: string,
    declaredCaseKeys: Set<string>,
  ): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('testpulse-mocha: dry run -- no import will be submitted');
    try {
      const result = await getCases(url, project, token);
      if (result.status < 200 || result.status >= 300) {
        throw new Error(`fetch failed: status ${result.status}`);
      }
      const existing = new Set((result.body as Array<{ key: string }>).map((c) => c.key));
      for (const key of declaredCaseKeys) {
        // eslint-disable-next-line no-console
        console.log(existing.has(key) ? `  would match: ${key}` : `  would NOT match (no such case): ${key}`);
      }
      writeResultMarker({ failed: false });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`testpulse-mocha: dry-run fetch failed: ${extractError(e)} (url: ${redactUrl(url)})`);
      writeResultMarker({ failed: true });
    }
  }

  private async runSubmit(
    url: string,
    project: string,
    token: string,
    report: string,
    declaredCaseKeys: Set<string>,
    failOnUnmatched: boolean,
  ): Promise<void> {
    // Only attachments whose case key THIS run actually declared are
    // included -- a stale .testpulse/attachments left over from an
    // unrelated earlier run must not silently ride along into this
    // submission.
    const attachments: ImportAttachment[] = readAttachments(process.cwd())
      .filter((a) => declaredCaseKeys.has(a.caseKey))
      .map((a) => ({
        caseKey: a.caseKey,
        filename: a.filename,
        contentType: a.contentType,
        data: a.data.toString('base64'),
      }));

    try {
      const result = await postImport(url, project, token, report, attachments);
      if (result.status === 201) {
        const body = result.body as { key?: string };
        // eslint-disable-next-line no-console
        console.log(`testpulse-mocha: all tests matched, created run ${body.key}`);
        writeResultMarker({ failed: false });
        clearAttachments(process.cwd());
      } else if (result.status === 207) {
        const body = result.body as { matched?: number; unmatched?: Array<{ caseKey: string }> };
        const unmatched = body.unmatched ?? [];
        // eslint-disable-next-line no-console
        console.log(`testpulse-mocha: ${body.matched} matched, ${unmatched.length} unmatched`);
        for (const u of unmatched) {
          // eslint-disable-next-line no-console
          console.log(`  unmatched: ${u.caseKey}`);
        }
        if (unmatched.length > 0) {
          // eslint-disable-next-line no-console
          console.log('testpulse-mocha: enable failOnUnmatched to make this a hard failure');
          writeResultMarker({ failed: failOnUnmatched });
        } else {
          writeResultMarker({ failed: false });
        }
        clearAttachments(process.cwd());
      } else {
        // eslint-disable-next-line no-console
        console.error(`testpulse-mocha: submission failed: status ${result.status} (url: ${redactUrl(url)})`);
        writeResultMarker({ failed: true });
      }
    } catch (e) {
      // Only the extracted message and a credential-stripped URL are
      // logged -- never the raw caught error object, since most JS HTTP
      // clients' error objects carry the outgoing request's headers,
      // including Authorization.
      // eslint-disable-next-line no-console
      console.error(`testpulse-mocha: submission failed: ${extractError(e)} (url: ${redactUrl(url)})`);
      writeResultMarker({ failed: true });
    }
  }
}

// Re-exported for callers that want to log a config without the token.
export { redacted };
