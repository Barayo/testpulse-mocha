import * as path from 'path';
import * as fs from 'fs';
import { runNestedMocha, fixturePath } from './helpers/runMocha';
import { startStubImportServer } from './helpers/stubImportServer';

describe('--parallel mode (real mocha run)', () => {
  it('a case key set under --parallel does not survive to the reporter (documented structural limitation)', async () => {
    const server = await startStubImportServer(() => ({
      status: 201,
      body: { key: 'LOGIN-R5' },
    }));
    const fixtureDir = fixturePath('parallel');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedMocha(
      fixtureDir,
      path.join(fixtureDir, '.mocharc.js'),
      {
        TESTPULSE_URL: server.url,
        TESTPULSE_TOKEN: 't0k3n',
        TESTPULSE_PROJECT: 'LOGIN',
      },
      ['--parallel', '--jobs', '2'],
    );
    await server.close();

    expect(result.exitCode).toBe(0);
    expect(server.requests).toHaveLength(1);
    const report = (server.requests[0].body as { report: string }).report;
    // The structural limitation this test formalizes: Test.prototype.serialize()'s
    // fixed field list drops custom properties across the worker->main
    // IPC boundary, so NEITHER case key survives, unlike a same-process run.
    expect(report).not.toContain('testpulse_case_key');

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });

  it('running under --parallel produces a stderr warning naming the limitation', async () => {
    const server = await startStubImportServer(() => ({
      status: 201,
      body: { key: 'LOGIN-R6' },
    }));
    const fixtureDir = fixturePath('parallel');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedMocha(
      fixtureDir,
      path.join(fixtureDir, '.mocharc.js'),
      {
        TESTPULSE_URL: server.url,
        TESTPULSE_TOKEN: 't0k3n',
        TESTPULSE_PROJECT: 'LOGIN',
      },
      ['--parallel', '--jobs', '2'],
    );
    await server.close();

    expect(result.stderr).toContain('--parallel');

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });
});
