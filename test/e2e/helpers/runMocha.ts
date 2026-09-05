import { execFile } from 'child_process';
import * as path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function resolveMochaBin(): string {
  return require.resolve('mocha/bin/mocha.js');
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
