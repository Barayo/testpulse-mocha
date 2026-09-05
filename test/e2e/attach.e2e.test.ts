import * as path from 'path';
import * as fs from 'fs';
import { runNestedMocha, fixturePath } from './helpers/runMocha';
import { startStubImportServer } from './helpers/stubImportServer';

describe('attachments (real mocha run)', () => {
  it('rejects an attach call under a case key declared by a different test', async () => {
    const fixtureDir = fixturePath('cross-test');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    // No TESTPULSE_* env vars set -- this test is only about the
    // cross-test rejection itself (both tests pass: the second test's
    // own assertion is that Attach() threw), not the submission step.
    const result = await runNestedMocha(fixtureDir, path.join(fixtureDir, '.mocharc.js'));

    expect(result.exitCode).toBe(0);
    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });

  it('two attachments under the same case key both survive and are both submitted', async () => {
    const server = await startStubImportServer(() => ({
      status: 201,
      body: { key: 'LOGIN-R2' },
    }));
    const fixtureDir = fixturePath('multi-attach');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedMocha(fixtureDir, path.join(fixtureDir, '.mocharc.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
    });
    await server.close();

    expect(result.exitCode).toBe(0);
    const body = server.requests[0].body as { attachments: Array<{ caseKey: string }> };
    expect(body.attachments).toHaveLength(2);
    expect(body.attachments.every((a) => a.caseKey === 'LOGIN-45')).toBe(true);

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });
});
