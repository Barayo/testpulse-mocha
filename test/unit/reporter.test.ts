import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Suite, Test } from 'mocha';
import { TestPulseReporter } from '../../src/reporter';
import { readResultMarker } from '../../src/resultMarker';
import { writeAttachment } from '../../src/attachmentStore';
import * as httpClient from '../../src/httpClient';

jest.mock('../../src/httpClient');
const mockedHttpClient = httpClient as jest.Mocked<typeof httpClient>;

// Mocha's real Runner extends Node's EventEmitter; a plain EventEmitter
// is a faithful stand-in for unit-testing the reporter's event wiring
// without spinning up a full Suite/Runner tree (that integration is
// covered by the real nested-mocha e2e tests instead).
const EVENT_TEST_PASS = 'pass';
const EVENT_TEST_FAIL = 'fail';
const EVENT_TEST_PENDING = 'pending';
const EVENT_RUN_END = 'end';

function makeTest(title: string, properties?: Record<string, string>): Test {
  const suite = new Suite('a suite');
  const test = new Test(title, function () {});
  test.parent = suite;
  if (properties) test.testpulseProperties = properties;
  return test;
}

describe('TestPulseReporter', () => {
  let cwd: string;
  let originalCwd: string;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    originalCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'testpulse-mocha-reporter-'));
    process.chdir(cwd);
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  function makeReporter(reporterOption: Record<string, unknown> = {}, mochaOptions: Record<string, unknown> = {}) {
    const runner = new EventEmitter();
    const reporter = new TestPulseReporter(runner as never, {
      reporterOption: {
        url: 'https://testpulse.example',
        project: 'LOGIN',
        token: 't0k3n',
        ...reporterOption,
      },
      ...mochaOptions,
    } as never);
    return { runner, reporter };
  }

  async function runEnd(runner: EventEmitter, reporter: TestPulseReporter): Promise<void> {
    runner.emit(EVENT_RUN_END);
    await reporter.donePromise;
  }

  it('a 201 response writes failed:false and logs the summary', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(readResultMarker()).toEqual({ present: true, marker: { failed: false } });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('LOGIN-R1'));
  });

  it('a 207 response with default config writes failed:false and logs unmatched keys', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(readResultMarker()).toEqual({ present: true, marker: { failed: false } });
  });

  it('a 207 response with failOnUnmatched enabled writes failed:true with the unmatched keys in the reason', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const { runner, reporter } = makeReporter({ failOnUnmatched: true });
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('LOGIN-42') },
    });
  });

  it('a 207 response with default config suggests enabling failOnUnmatched', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('enable failOnUnmatched'));
  });

  it('a 207 response with failOnUnmatched already enabled does not suggest enabling it', async () => {
    mockedHttpClient.postImport.mockResolvedValue({
      status: 207,
      body: { matched: 0, unmatched: [{ caseKey: 'LOGIN-42' }] },
    });
    const { runner, reporter } = makeReporter({ failOnUnmatched: true });
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    const allLogs = logSpy.mock.calls.flat().join(' ');
    expect(allLogs).not.toContain('enable failOnUnmatched');
  });

  it('a network error writes failed:true with the real error as reason, not a generic fallback', async () => {
    mockedHttpClient.postImport.mockRejectedValue(new Error('connection refused'));
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('connection refused') },
    });
  });

  it('a 5xx response writes failed:true with the status in the reason, not a generic fallback', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 500, body: { error: 'boom' } });
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('500') },
    });
  });

  it('a genuinely failing test still produces a failure element and still submits', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const { runner, reporter } = makeReporter();
    const failing = makeTest('a', { testpulse_case_key: 'LOGIN-42' });
    runner.emit(EVENT_TEST_FAIL, failing, new Error('expected true to be false'));
    await runEnd(runner, reporter);
    expect(mockedHttpClient.postImport).toHaveBeenCalledTimes(1);
    const report = mockedHttpClient.postImport.mock.calls[0][3];
    expect(report).toContain('<failure message="expected true to be false">');
  });

  it('a pending test produces no submission-blocking error and is tracked as skipped', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PENDING, makeTest('a'));
    await runEnd(runner, reporter);
    const report = mockedHttpClient.postImport.mock.calls[0][3];
    expect(report).toContain('<skipped/>');
  });

  it('an untagged test carries no testpulse properties in the submitted report', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('untagged'));
    await runEnd(runner, reporter);
    const report = mockedHttpClient.postImport.mock.calls[0][3];
    expect(report).not.toContain('testpulse_case_key');
  });

  it('dry run previews matches without submitting', async () => {
    mockedHttpClient.getCases.mockResolvedValue({ status: 200, body: [{ key: 'LOGIN-42' }] });
    const { runner, reporter } = makeReporter({ dryRun: true });
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(mockedHttpClient.postImport).not.toHaveBeenCalled();
    expect(readResultMarker()).toEqual({ present: true, marker: { failed: false } });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('would match: LOGIN-42'));
  });

  it('a dry-run fetch failure writes failed:true with the real error as reason', async () => {
    mockedHttpClient.getCases.mockRejectedValue(new Error('connection refused'));
    const { runner, reporter } = makeReporter({ dryRun: true });
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('connection refused') },
    });
  });

  it('prunes .testpulse/attachments after a successful (201) submission', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 201, body: { key: 'LOGIN-R1' } });
    writeAttachment('LOGIN-42', Buffer.from([1]), 'shot.png', 'image/png');
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(fs.existsSync(path.join(cwd, '.testpulse', 'attachments'))).toBe(false);
  });

  it('leaves .testpulse/attachments in place after a failed submission, for a retry', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 500, body: { error: 'boom' } });
    writeAttachment('LOGIN-42', Buffer.from([1]), 'shot.png', 'image/png');
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(fs.existsSync(path.join(cwd, '.testpulse', 'attachments'))).toBe(true);
  });

  it('writes a failed marker naming only the missing configuration when required config is missing', async () => {
    const runner = new EventEmitter();
    const reporter = new TestPulseReporter(runner as never, { reporterOption: {} } as never);
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    expect(readResultMarker()).toEqual({
      present: true,
      marker: { failed: true, reason: expect.stringContaining('TESTPULSE_TOKEN') },
    });
    expect(mockedHttpClient.postImport).not.toHaveBeenCalled();
  });

  it('names only the missing variables when some configuration is present', async () => {
    const runner = new EventEmitter();
    const reporter = new TestPulseReporter(runner as never, {
      reporterOption: { url: 'https://distinguishing-value.example', project: 'LOGIN' },
    } as never);
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    const outcome = readResultMarker();
    expect(outcome.present).toBe(true);
    if (outcome.present) {
      expect(outcome.marker.reason).toContain('TESTPULSE_TOKEN');
      expect(outcome.marker.reason).not.toContain('distinguishing-value');
      expect(outcome.marker.reason).not.toContain('LOGIN');
    }
  });

  it('never logs the token', async () => {
    mockedHttpClient.postImport.mockResolvedValue({ status: 500, body: { error: 'boom' } });
    const { runner, reporter } = makeReporter();
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allCalls).not.toContain('t0k3n');
  });

  it('on a submission error, logs only status/message/redacted-URL, never a raw error/request object', async () => {
    const leakyError = Object.assign(new Error('socket hang up'), {
      // Simulates a real HTTP client's caught error object, which often
      // carries the outgoing request (including its Authorization header)
      // as a property -- console.error(err) on this would leak the token
      // through the back door even if the code never does console.log(token) directly.
      request: { headers: { authorization: 'Bearer t0k3n' } },
      response: { headers: { authorization: 'Bearer t0k3n' } },
    });
    mockedHttpClient.postImport.mockRejectedValue(leakyError);
    const { runner, reporter } = makeReporter({}, {});
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allCalls).not.toContain('t0k3n');
    expect(allCalls).not.toContain('authorization');
    expect(allCalls).toContain('socket hang up');
  });

  it('redacts embedded URL credentials in submission-error logs', async () => {
    mockedHttpClient.postImport.mockRejectedValue(new Error('boom'));
    const { runner, reporter } = makeReporter({ url: 'https://user:s3cr3t@testpulse.example' });
    runner.emit(EVENT_TEST_PASS, makeTest('a', { testpulse_case_key: 'LOGIN-42' }));
    await runEnd(runner, reporter);
    const allCalls = [...logSpy.mock.calls, ...errorSpy.mock.calls].flat().join(' ');
    expect(allCalls).not.toContain('s3cr3t');
  });

  describe('--parallel detection', () => {
    it('emits a stderr warning naming the --parallel limitation when options.parallel is true', () => {
      const runner = new EventEmitter();
      // eslint-disable-next-line no-new
      new TestPulseReporter(runner as never, {
        parallel: true,
        reporterOption: { url: 'https://testpulse.example', project: 'LOGIN', token: 't0k3n' },
      } as never);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('--parallel'));
    });

    it('does not warn when options.parallel is false/absent', () => {
      const runner = new EventEmitter();
      // eslint-disable-next-line no-new
      new TestPulseReporter(runner as never, {
        reporterOption: { url: 'https://testpulse.example', project: 'LOGIN', token: 't0k3n' },
      } as never);
      expect(errorSpy).not.toHaveBeenCalled();
    });
  });
});
