# testpulse-mocha

A Mocha reporter + `check` CLI for reporting test results into
[TestPulse](https://github.com/Barayo/TestPulse) — tags a test with a
TestPulse case key, and auto-submits a JUnit XML report the reporter
builds directly from the run (matching each tagged test to an existing
case).

> Requires `mocha` 9.0 or later. **`--parallel` mode is not supported**
> (see below for why).

Unlike Jest/Jasmine, Mocha has no implicit "current test" global
accessible from arbitrary code — no equivalent to `expect.getState()` or
`jasmine.getEnv()`. The only way to reach the running test is via `this`
inside a non-arrow `it()`/hook function body. `Case`/`Attach` therefore
take that Mocha `Context` as an explicit first argument.

`mocha-junit-reporter`'s own README states plainly that custom
properties can only be added at the `<testsuite>` level, with no
mechanism for per-testcase properties — the same gap `jasmine-reporters`
had — so this package builds JUnit XML directly from `Runner` events
rather than depending on it.

## Install

```sh
npm install --save-dev testpulse-mocha
```

## Set up the reporter

```js
// .mocharc.js
module.exports = {
  spec: 'test/**/*.spec.js',
  reporter: 'testpulse-mocha',
  reporterOptions: { url: 'http://localhost:8080', project: 'LOGIN' },
};
```

`reporter` must be a resolvable module name/path string (not a live
function value) — Mocha's CLI coerces `.mocharc.js`'s `reporter` field
through the same string-typed option handling it uses for `--reporter`
on the command line, regardless of source.

## Tag your tests

```js
const { Case } = require('testpulse-mocha');

describe('login', function () {
  it('succeeds', function () {
    // `this` must come from a non-arrow function -- arrow functions
    // never have their own `this`, and Mocha's own APIs
    // (this.timeout(), this.retries()) already require this same
    // convention, so this isn't a new constraint this plugin introduces.
    Case(this, 'LOGIN-42', { platform: 'linux', tags: ['smoke'] });
    // ...
  });
});
```

Run your suite and check the result — since Mocha's own CLI determines
its exit code independent of anything a reporter sets on
`process.exitCode` (confirmed by reading `lib/cli/run-helpers.js`:
`exitMochaLater`/`exitMocha` register a `process.on('exit', ...)`
handler that unconditionally overwrites it), `testpulse-mocha check` is
the only thing that can fail the build for a submission error or an
unmatched case:

```sh
mocha; mocha_status=$?
testpulse-mocha check; check_status=$?
[ "$mocha_status" -eq 0 ] && [ "$check_status" -eq 0 ]
```

**Don't chain these with `&&`** (`mocha && testpulse-mocha check`) — when
a test fails, `mocha` exits non-zero and `&&` short-circuits, so `check`
never runs and its own diagnostic (e.g. "submission failed: status 401")
never prints, even though the overall exit code happens to still be
non-zero from the test failure alone. In CI, running each as its own
step (rather than one shell line) sidesteps this automatically, since
most CI systems already fail the job on any non-zero step.

**Don't pass `--exit`** to `mocha` when using this reporter. Mocha's
default (no `--exit`) waits for the event loop to drain naturally before
exiting, which is what lets the reporter's `async` `EVENT_RUN_END`
handler actually finish submitting before the process exits. `--exit`
forces an immediate `process.exit()` once the synchronous portion of
that handler returns (i.e. right after its first `await`), which can
kill an in-flight submission before it completes.

## Attach screenshots/files

```js
const { Case, Attach } = require('testpulse-mocha');

it('fails with a bad password', function () {
  Case(this, 'LOGIN-43');
  const screenshot = takeScreenshot();
  Attach(this, 'LOGIN-43', screenshot, 'failure.png', 'image/png');
});
```

`Attach` only accepts a case key the *currently-executing* test has
itself declared via `Case` (verified against `context.test`'s own
recorded properties) — a mismatch, or a test that never called `Case`,
throws. Content type is validated before the case-key check. Only
`image/png`, `image/jpeg`, and `image/webp` are accepted. Multiple
`Attach` calls under the same case key within one test are all
preserved. Attachments are written to a `.testpulse/` scratch directory
— **add it to your `.gitignore`**, since it can hold screenshot bytes.

## Configuration

**The environment variable always wins over the reporter option**, for
every setting below — not just `token`. There is no third,
config-file-backed tier.

| Setting | Reporter option | Env var |
|---|---|---|
| API base URL | `url` | `TESTPULSE_URL` |
| API token | `token` | `TESTPULSE_TOKEN` |
| Project key | `project` | `TESTPULSE_PROJECT` |
| Fail on unmatched | `failOnUnmatched` | `TESTPULSE_FAIL_ON_UNMATCHED` |
| Dry run | `dryRun` | `TESTPULSE_DRY_RUN` |

**`TESTPULSE_FAIL_ON_UNMATCHED` and `TESTPULSE_DRY_RUN` parse via a
fixed rule**: the case-insensitive string `"true"` or `"1"` is `true`;
every other value (including the literal string `"false"`) is `false`.
This is deliberately not a bare JavaScript truthiness check, which would
treat `"false"` as truthy.

**Use `TESTPULSE_TOKEN` in CI**, not the `token` reporter option — a
value committed in your `.mocharc.js` is a real secret leak; an
environment variable set from a CI secret is not. Because the env var
wins for every setting, not just `token`, an unrelated `TESTPULSE_URL`/
`TESTPULSE_PROJECT` left set in your shell can also silently override a
value you set in the config file — if a run targets the wrong project,
check your environment before your config.

## Build outcome policy

| Response | Behavior |
|---|---|
| `201` all matched | `check` exits `0`; summary logged |
| `207` some unmatched | `check` exits `0` by default (unmatched keys logged, points at `failOnUnmatched`); exits non-zero if `failOnUnmatched` is set |
| network/auth/4xx/5xx error | `check` always exits non-zero, unconditionally |

Submission-error logging is restricted to the response status, an
extracted error message, and the target URL with any embedded
credentials stripped — never a raw caught error or request/response
object, since most JS HTTP clients' error objects carry the outgoing
request's headers (including `Authorization`).

## Dry run

```js
reporterOptions: { dryRun: true }
```

Fetches existing case keys via a read-only
`GET /api/v1/projects/{project}/cases` and previews which tagged tests
would match, without submitting anything. `check` exits `0` regardless
of the preview's content, unless the preview fetch itself fails.

## The `--parallel` limitation

`mocha --parallel` is **not supported**. Mocha transmits `Test` objects
from worker processes to the main process via
`Test.prototype.serialize()` (`lib/test.js`), which returns a hardcoded
object literal — an exhaustive, fixed field list with no room for custom
properties. Any `testpulse_case_key` a worker-process test declared via
`Case()` is silently dropped before it ever reaches this reporter in the
main process; this is a structural limitation of Mocha's own
serializer, not a bug in this plugin, and there is currently no
workaround from userland.

Because `fail-on-unmatched` is off by default, running under
`--parallel` without this warning would otherwise be a fully silent
green build: every submitted report has zero case keys, the API returns
`207` with everything unmatched, and `check` still exits `0` — nothing
would distinguish "no one called `Case()`" from "`Case()` was called but
didn't survive." To make this diagnosable, the reporter checks Mocha's
own resolved `parallel` option (part of the standard config object
passed into a reporter's constructor, `new Reporter(runner, options)`)
and logs a stderr warning naming this limitation whenever it detects
`--parallel` is active.

## License

MIT
