import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { checkExitCode } from '../../src/check';

describe('checkExitCode', () => {
  let cwd: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'testpulse-mocha-check-'));
    process.chdir(cwd);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    fs.rmSync(cwd, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  function writeMarker(content: unknown) {
    const dir = path.join(cwd, '.testpulse');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify(content));
  }

  it('exits non-zero when failed:true', () => {
    writeMarker({ failed: true });
    expect(checkExitCode()).toBe(1);
  });

  it('exits 0 when failed:false', () => {
    writeMarker({ failed: false });
    expect(checkExitCode()).toBe(0);
  });

  it('exits non-zero with a named cause when the marker is missing', () => {
    const errorSpy = jest.spyOn(console, 'error');
    expect(checkExitCode()).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('reporter'));
  });

  it("reports the marker's own reason when the reporter ran but recorded a specific cause", () => {
    const errorSpy = jest.spyOn(console, 'error');
    writeMarker({ failed: true, reason: 'TESTPULSE_TOKEN is required' });
    expect(checkExitCode()).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('TESTPULSE_TOKEN is required'));
  });

  it('falls back to the generic message when failed:true has no reason', () => {
    const errorSpy = jest.spyOn(console, 'error');
    writeMarker({ failed: true });
    expect(checkExitCode()).toBe(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('submission failed or was unmatched'));
  });

  it("never echoes the resolved value of any configuration setting other than naming which one is missing", () => {
    const errorSpy = jest.spyOn(console, 'error');
    // A reason naming only the missing var -- this is what the reporter
    // is responsible for producing (see reporter.test.ts's
    // "names only the missing variables" test); check's own job is
    // simply to print the reason (or the generic fallback) verbatim,
    // never to append or reconstruct a message using any other resolved
    // config value itself.
    writeMarker({ failed: true, reason: 'TESTPULSE_TOKEN is required (set directly, or via reporter options)' });
    checkExitCode();
    const allOutput = errorSpy.mock.calls.flat().join(' ');
    expect(allOutput).not.toContain('https://');
    expect(allOutput).toContain('TESTPULSE_TOKEN');
  });
});
