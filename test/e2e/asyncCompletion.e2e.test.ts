import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import type { AddressInfo } from 'net';
import { runNestedMocha, fixturePath } from './helpers/runMocha';

/**
 * Formalizes this session's own manual repro (design.md's Context #4)
 * as a permanent regression test: without a `--exit` flag (Mocha's
 * default), a genuinely slow async submission inside the reporter's
 * EVENT_RUN_END handler still completes -- Mocha's default
 * `exitMochaLater` waits for the event loop to drain naturally rather
 * than force-killing the process, unlike `--exit`. This server holds
 * the response open for 500ms before responding, so if the process
 * exited early (the bug this test guards against), the request would
 * never be observed as received-and-responded-to at all.
 */
function startSlowStubServer(delayMs: number): Promise<{ url: string; requestReceived: () => boolean; close: () => Promise<void> }> {
  let received = false;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      received = true;
      setTimeout(() => {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ key: 'LOGIN-R9' }));
      }, delayMs);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requestReceived: () => received,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

describe('async completion before process exit (real mocha run, no --exit)', () => {
  it('the reporter\'s async submission genuinely completes before the process exits', async () => {
    const server = await startSlowStubServer(500);
    const fixtureDir = fixturePath('async-completion');
    const testpulseDir = path.join(fixtureDir, '.testpulse');
    fs.rmSync(testpulseDir, { recursive: true, force: true });

    const result = await runNestedMocha(fixtureDir, path.join(fixtureDir, '.mocharc.js'), {
      TESTPULSE_URL: server.url,
      TESTPULSE_TOKEN: 't0k3n',
      TESTPULSE_PROJECT: 'LOGIN',
    });
    await server.close();

    expect(result.exitCode).toBe(0);
    expect(server.requestReceived()).toBe(true);

    // The result marker (written only after the awaited response comes
    // back) must exist -- proof the async work actually ran to
    // completion, not just that the request was sent before an early exit.
    const markerPath = path.join(testpulseDir, 'result.json');
    expect(fs.existsSync(markerPath)).toBe(true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    expect(marker.failed).toBe(false);

    fs.rmSync(testpulseDir, { recursive: true, force: true });
  });
});
