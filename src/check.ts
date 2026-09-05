import { readResultMarker } from './resultMarker';

/**
 * The only mechanism that can actually fail the build for a submission
 * error or an unmatched-case outcome, since Mocha's own CLI determines
 * its process exit code independent of anything a reporter sets on
 * process.exitCode -- confirmed via a real repro reading
 * lib/cli/run-helpers.js's exitMochaLater/exitMocha.
 *
 * Prints only what the marker itself carries (or a generic,
 * non-file-system-error message when the marker is absent entirely) --
 * never reconstructs a message using any other resolved configuration
 * value, so a `reason` naming a missing TESTPULSE_TOKEN never ends up
 * alongside an echoed `url` or other setting.
 */
export function checkExitCode(): number {
  const outcome = readResultMarker();
  if (!outcome.present) {
    // eslint-disable-next-line no-console
    console.error(
      'testpulse-mocha: no .testpulse/result.json found -- likely cause: the ' +
        'TestPulseReporter is not registered in your Mocha config (.mocharc.js\'s ' +
        "`reporter` field), or the config file was not actually loaded",
    );
    return 1;
  }
  if (outcome.marker.failed) {
    // eslint-disable-next-line no-console
    console.error(
      outcome.marker.reason
        ? `testpulse-mocha: ${outcome.marker.reason}`
        : 'testpulse-mocha: submission failed or was unmatched with failOnUnmatched set',
    );
    return 1;
  }
  return 0;
}
