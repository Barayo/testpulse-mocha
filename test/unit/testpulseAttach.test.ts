import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildTestContext } from './helpers/mochaObjects';
import { Case } from '../../src/testpulse';
import { Attach } from '../../src/testpulseAttach';

function withTempCwd<T>(fn: () => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'testpulse-mocha-attach-'));
  const original = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(original);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function attachmentFiles(ext: string): string[] {
  const dir = path.join(process.cwd(), '.testpulse', 'attachments');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(ext));
}

describe('Attach', () => {
  it('succeeds for the currently-executing test\'s own declared case key', () => {
    withTempCwd(() => {
      const { context } = buildTestContext();
      Case(context, 'LOGIN-42');
      expect(() =>
        Attach(context, 'LOGIN-42', Buffer.from([1, 2, 3]), 'failure.png', 'image/png'),
      ).not.toThrow();
      expect(attachmentFiles('.data')).toHaveLength(1);
    });
  });

  it('rejects an attachment under a case key belonging to a different test', () => {
    withTempCwd(() => {
      const { context } = buildTestContext();
      Case(context, 'LOGIN-43');
      expect(() =>
        Attach(context, 'OTHER-1', Buffer.from([1]), 'failure.png', 'image/png'),
      ).toThrow(/was not declared via Case\(\)/);
      expect(attachmentFiles('.data')).toHaveLength(0);
    });
  });

  it('rejects an attachment when no Case() call was ever made', () => {
    withTempCwd(() => {
      const { context } = buildTestContext();
      expect(() =>
        Attach(context, 'LOGIN-99', Buffer.from([1]), 'failure.png', 'image/png'),
      ).toThrow(/was not declared via Case\(\)/);
    });
  });

  it('rejects an unsupported content type, even for a declared case key', () => {
    withTempCwd(() => {
      const { context } = buildTestContext();
      Case(context, 'LOGIN-44');
      expect(() =>
        Attach(context, 'LOGIN-44', Buffer.from([1]), 'x.pdf', 'application/pdf'),
      ).toThrow(/unsupported content type/);
      expect(attachmentFiles('.data')).toHaveLength(0);
    });
  });

  it('validates content type before the case-key check', () => {
    withTempCwd(() => {
      // No Case() call at all -- if the case-key check ran first, this
      // would throw the "was not declared" error instead.
      const { context } = buildTestContext();
      expect(() =>
        Attach(context, 'NEVER-DECLARED', Buffer.from([1]), 'x.pdf', 'application/pdf'),
      ).toThrow(/unsupported content type/);
    });
  });

  it('two attachments under the same case key both survive', () => {
    withTempCwd(() => {
      const { context } = buildTestContext();
      Case(context, 'LOGIN-46');
      Attach(context, 'LOGIN-46', Buffer.from([1]), 'a.png', 'image/png');
      Attach(context, 'LOGIN-46', Buffer.from([2]), 'b.png', 'image/png');
      expect(attachmentFiles('.data')).toHaveLength(2);
    });
  });

  it('throws when context.test is not set (called outside a running test)', () => {
    withTempCwd(() => {
      const { context } = buildTestContext();
      context.test = undefined;
      expect(() =>
        Attach(context, 'LOGIN-1', Buffer.from([1]), 'a.png', 'image/png'),
      ).toThrow(/no currently-running test/);
    });
  });
});
