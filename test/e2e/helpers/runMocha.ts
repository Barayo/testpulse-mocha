import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Resolves the installed mocha package's own CLI entry point via its
 * declared `bin` field, rather than a hardcoded path -- mocha 9's `bin`
 * is `./bin/mocha` (no extension), while mocha 10+'s is `./bin/mocha.js`,
 * so a hardcoded `mocha/bin/mocha.js` path breaks under mocha 9 (found
 * via the CI matrix, which tests both majors; this machine's locally
 * installed mocha 11 masked the bug during local development).
 */
function resolveMochaBin(): string {
  const pkgPath = require.resolve('mocha/package.json');
  const pkg = require(pkgPath) as { bin?: Record<string, string> | string };
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.mocha;
  if (!binRel) {
    throw new Error('Could not determine mocha CLI bin path from mocha/package.json');
  }
  return path.join(path.dirname(pkgPath), binRel);
}

export interface MochaRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Spawns a real nested `mocha` process against a fixture project's own `.mocharc.js`. */
export async function runNestedMocha(
  cwd: string,
  configPath: string,
  extraEnv: Record<string, string> = {},
  extraArgs: string[] = [],
): Promise<MochaRunResult> {
  const mochaBin = resolveMochaBin();
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      [mochaBin, `--config=${configPath}`, ...extraArgs],
      { cwd, env: { ...process.env, ...extraEnv } },
    );
    return { exitCode: 0, stdout, stderr };
  } catch (err) {
    const e = err as { code?: number; stdout?: string; stderr?: string };
    return { exitCode: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

export function fixturePath(...segments: string[]): string {
  return path.join(__dirname, '..', '..', 'fixtures', ...segments);
}
