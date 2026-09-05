import * as fs from 'fs';
import * as path from 'path';

export interface ResultMarker {
  failed: boolean;
  reason?: string;
}

function markerPath(): string {
  return path.join(process.cwd(), '.testpulse', 'result.json');
}

/**
 * Records whether the run's outcome should fail the build. Mocha's own
 * CLI determines its process exit code independent of anything a
 * reporter sets on process.exitCode -- confirmed via a real repro
 * reading lib/cli/run-helpers.js's exitMochaLater/exitMocha, which
 * register a process.on('exit', ...) handler that unconditionally
 * overwrites process.exitCode with the test-failure-derived count, run
 * AFTER the reporter's own synchronous event handling. This marker,
 * paired with the separate `check` CLI that reads it, is how a
 * submission error or an unmatched-case-with-failOnUnmatched outcome
 * actually fails the build.
 */
export function writeResultMarker(marker: ResultMarker): void {
  const dir = path.dirname(markerPath());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(markerPath(), JSON.stringify(marker));
}

export type ReadResultMarkerOutcome =
  | { present: true; marker: ResultMarker }
  | { present: false };

export function readResultMarker(): ReadResultMarkerOutcome {
  if (!fs.existsSync(markerPath())) {
    return { present: false };
  }
  const marker: ResultMarker = JSON.parse(fs.readFileSync(markerPath(), 'utf8'));
  return { present: true, marker };
}
