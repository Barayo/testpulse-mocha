import { redacted, redactUrl, resolveConfig } from '../../src/config';

const ENV_KEYS = [
  'TESTPULSE_URL',
  'TESTPULSE_TOKEN',
  'TESTPULSE_PROJECT',
  'TESTPULSE_FAIL_ON_UNMATCHED',
  'TESTPULSE_DRY_RUN',
];

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const original: Record<string, string | undefined> = {};
  for (const key of ENV_KEYS) {
    original[key] = process.env[key];
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(vars)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

describe('resolveConfig', () => {
  it('environment variable overrides reporter option', () => {
    withEnv({ TESTPULSE_URL: 'https://a.example' }, () => {
      const config = resolveConfig({ url: 'https://b.example' });
      expect(config.url).toBe('https://a.example');
    });
  });

  it('uses the reporter option when no environment variable is set', () => {
    withEnv({}, () => {
      const config = resolveConfig({ token: 't0k3n' });
      expect(config.token).toBe('t0k3n');
    });
  });

  describe('boolean parsing: fixed case-insensitive "true"/"1" rule, never bare truthiness', () => {
    it('TESTPULSE_DRY_RUN=false resolves to false, not true', () => {
      withEnv({ TESTPULSE_DRY_RUN: 'false' }, () => {
        expect(resolveConfig({ dryRun: true }).dryRun).toBe(false);
      });
    });

    it('TESTPULSE_FAIL_ON_UNMATCHED=false resolves to false, not true', () => {
      withEnv({ TESTPULSE_FAIL_ON_UNMATCHED: 'false' }, () => {
        expect(resolveConfig({ failOnUnmatched: true }).failOnUnmatched).toBe(false);
      });
    });

    it('TESTPULSE_DRY_RUN=TRUE (any-case) resolves to true', () => {
      withEnv({ TESTPULSE_DRY_RUN: 'TRUE' }, () => {
        expect(resolveConfig().dryRun).toBe(true);
      });
    });

    it('TESTPULSE_DRY_RUN=1 resolves to true', () => {
      withEnv({ TESTPULSE_DRY_RUN: '1' }, () => {
        expect(resolveConfig().dryRun).toBe(true);
      });
    });

    it('TESTPULSE_DRY_RUN=0 resolves to false', () => {
      withEnv({ TESTPULSE_DRY_RUN: '0' }, () => {
        expect(resolveConfig({ dryRun: true }).dryRun).toBe(false);
      });
    });

    it('an unset env var falls back to the reporter option boolean as-is', () => {
      withEnv({}, () => {
        expect(resolveConfig({ dryRun: true }).dryRun).toBe(true);
        expect(resolveConfig({ dryRun: false }).dryRun).toBe(false);
        expect(resolveConfig({}).dryRun).toBe(false);
      });
    });

    it('a string "false" reporter option (as CLI --reporter-option would pass) also resolves to false', () => {
      withEnv({}, () => {
        expect(resolveConfig({ dryRun: 'false' as unknown as boolean }).dryRun).toBe(false);
      });
    });
  });
});

describe('redacted', () => {
  it('never includes the resolved token', () => {
    const config = resolveConfig({ url: 'https://a.example', token: 'SECRET', project: 'LOGIN' });
    expect(redacted(config)).not.toContain('SECRET');
  });
});

describe('redactUrl', () => {
  it('strips embedded credentials from a URL', () => {
    expect(redactUrl('https://user:pass@example.com/path')).not.toContain('pass');
    expect(redactUrl('https://user:pass@example.com/path')).not.toContain('user');
  });

  it('leaves a credential-free URL unchanged in substance', () => {
    expect(redactUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('does not throw on an unparsable string', () => {
    expect(() => redactUrl('not a url')).not.toThrow();
  });
});
