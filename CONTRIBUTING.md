# Contributing

## Setup

```bash
npm install
npm run build
```

## Testing

Tests are layered:

- **Unit tests** (`test/unit/`, `npm test`) — `Case`/`Attach`, the XML
  builder, `config`, `check`, `attachmentStore`, and the reporter each
  tested in isolation. `Case`/`Attach` tests run against a real Mocha
  `Test`/`Context` pair built via Mocha's own classes
  (`test/unit/helpers/mochaObjects.ts`, `new Mocha.Test(...)`/
  `new Mocha.Context()`) rather than a hand-rolled duck-typed fake.
  Reporter tests mock `../../src/httpClient` via `jest.mock()`.
- **End-to-end tests** (`test/e2e/`, `npm run test:e2e`) — spawn a real
  nested `mocha` process against a fixture project under
  `test/fixtures/`, proving the pieces actually integrate (`Case`/
  `Attach` → the reporter → the submitted request → the result marker →
  `check`'s exit code). These run against the built `dist/` output, so
  `npm run test:e2e` rebuilds first. A real stub HTTP server
  (`test/e2e/helpers/stubImportServer.ts`) stands in for the TestPulse
  import API. `test/e2e/parallel.e2e.test.ts` runs a real
  `mocha --parallel --jobs 2` invocation, formalizing this project's own
  research finding that `Test.prototype.serialize()`'s hardcoded field
  list drops custom properties across the worker→main IPC boundary, and
  that the reporter's `--parallel` warning fires under real parallel
  execution, not just against a synthetic options object.
  `test/e2e/asyncCompletion.e2e.test.ts` formalizes another research
  finding as a permanent regression test: a genuinely slow (500ms)
  submission inside the reporter's `EVENT_RUN_END` handler still
  completes before the process exits, since Mocha's default (no
  `--exit`) waits for the event loop to drain rather than force-killing
  the process.

Run everything: `npm run test:all`.

TDD is the standing practice: write the failing test first, then the
minimal implementation to make it pass.

## Release process

Releases are automated via [`semantic-release`](https://semantic-release.gitbook.io/)
on merge to `main`, following [Angular/Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, etc.) — see `.releaserc.json`. Publishing to npm uses
[trusted publishing (OIDC)](https://docs.npmjs.com/trusted-publishers/), so
there's no `NPM_TOKEN` secret to manage day-to-day.

**The very first publish is a one-time exception**: npm's OIDC trusted
publishing can only be configured for a package that already exists on
the registry, so it can't create a brand-new package on its own first
publish. Before the first release, publish `0.1.0` (or whatever version
`package.json` currently holds) manually with a real npm login/token
from a maintainer's machine, then configure a Trusted Publisher for
`testpulse-mocha` on npmjs.com pointing at this repo's `release.yml`
workflow. Every release after that goes through OIDC automatically.

If a release's publish step fails after its version-bump commit/tag has
already been pushed (a real risk with `semantic-release`'s prepare-before-publish
ordering), trigger `.github/workflows/release.yml` manually
(`workflow_dispatch`) to publish the already-tagged version directly,
rather than re-running the push-triggered flow.
