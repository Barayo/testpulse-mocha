import * as path from 'path';
import * as fs from 'fs';
import { runNestedMocha, fixturePath } from './helpers/runMocha';
import { startStubImportServer } from './helpers/stubImportServer';
import { checkExitCode } from '../../src/check';

function withCwd<T>(dir: string, fn: () => T): T {
  const original = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(original);
  }
}

describe('submission (real mocha run)', () => {
  it('a genuinely failing test still triggers annotate and submit', async () => {
    const server = await startStubImportServer(() => ({
      status: 201,
      body: { key: 'LOGIN-R3' },
    }));
    const fixtureDir = fixturePath('failing');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedMocha(fixtureDir, path.join(fixtureDir, '.mocharc.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
    });
    await server.close();

    // mocha itself reports the test failure...
    expect(result.exitCode).not.toBe(0);
    // ...but the reporter's EVENT_RUN_END handler still ran and submitted.
    expect(server.requests).toHaveLength(1);
    const report = (server.requests[0].body as { report: string }).report;
    expect(report).toContain('<property name="testpulse_case_key" value="LOGIN-42"/>');
    expect(report).toContain('<failure');

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });

  it('the full chain (mocha; testpulse-mocha check) fails the build for an unmatched, failOnUnmatched case', async () => {
    const server = await startStubImportServer(() => ({
      status: 207,
      body: {
        run: { id: 'r1', key: 'LOGIN-R4' },
        message: '1 unmatched',
        matched: 0,
        unmatched: [{ caseKey: 'LOGIN-42', verdict: 'passed' }],
      },
    }));
    const fixtureDir = fixturePath('tagged-unmatched');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const mochaResult = await runNestedMocha(fixtureDir, path.join(fixtureDir, '.mocharc.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
      TESTPULSE_FAIL_ON_UNMATCHED: 'true',
    });
    await server.close();

    // The underlying tests all passed -- mocha's own exit code is 0.
    expect(mochaResult.exitCode).toBe(0);
    // check is what actually fails the build here.
    const checkResult = withCwd(fixtureDir, () => checkExitCode());
    expect(checkResult).not.toBe(0);

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });
});
