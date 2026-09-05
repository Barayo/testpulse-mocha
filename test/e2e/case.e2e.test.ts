import * as path from 'path';
import * as fs from 'fs';
import { runNestedMocha, fixturePath } from './helpers/runMocha';
import { startStubImportServer } from './helpers/stubImportServer';
import { checkExitCode } from '../../src/check';

describe('case tagging (real mocha run)', () => {
  it('the real generated report contains the injected property, and an untagged test does not', async () => {
    const server = await startStubImportServer(() => ({
      status: 201,
      body: { key: 'LOGIN-R1' },
    }));
    const fixtureDir = fixturePath('tagged');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedMocha(fixtureDir, path.join(fixtureDir, '.mocharc.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
    });
    await server.close();

    expect(result.exitCode).toBe(0);
    expect(server.requests).toHaveLength(1);
    const report = (server.requests[0].body as { report: string }).report;
    expect(report).toContain('<property name="testpulse_case_key" value="LOGIN-42"/>');

    const untaggedTestcase = report.match(
      /<testcase[^>]*name="untagged test"[^>]*>[\s\S]*?<\/testcase>|<testcase[^>]*name="untagged test"[^>]*\/>/,
    );
    expect(untaggedTestcase).not.toBeNull();
    expect(untaggedTestcase![0]).not.toContain('testpulse_case_key');

    const originalCwd = process.cwd();
    process.chdir(fixtureDir);
    try {
      expect(checkExitCode()).toBe(0);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(testpulseDir, { recursive: true, force: true });
    }
  });
});
