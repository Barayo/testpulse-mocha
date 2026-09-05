export interface ReporterOptions {
  url?: string;
  token?: string;
  project?: string;
  failOnUnmatched?: boolean | string;
  dryRun?: boolean | string;
}

export interface ResolvedConfig {
  url?: string;
  token?: string;
  project?: string;
  failOnUnmatched: boolean;
  dryRun: boolean;
}

function resolveString(envVar: string, optionValue: string | undefined): string | undefined {
  const envValue = process.env[envVar];
  if (envValue !== undefined && envValue !== '') return envValue;
  return optionValue;
}

/**
 * The fixed, documented boolean-parsing rule: the case-insensitive
 * string "true" or "1" is true; every other value (including "false",
 * "0", and an empty string) is false. Never a bare JavaScript
 * truthiness check on the raw string, which would treat the literal
 * text "false" as truthy.
 */
function parseBoolean(value: string): boolean {
  const normalized = value.toLowerCase();
  return normalized === 'true' || normalized === '1';
}

function resolveBoolean(envVar: string, optionValue: boolean | string | undefined): boolean {
  const envValue = process.env[envVar];
  if (envValue !== undefined && envValue !== '') return parseBoolean(envValue);
  if (typeof optionValue === 'string') return parseBoolean(optionValue);
  return optionValue ?? false;
}

/** Env var always wins over the reporter's own constructor options -- see design.md. */
export function resolveConfig(options: ReporterOptions = {}): ResolvedConfig {
  return {
    url: resolveString('TESTPULSE_URL', options.url),
    token: resolveString('TESTPULSE_TOKEN', options.token),
    project: resolveString('TESTPULSE_PROJECT', options.project),
    failOnUnmatched: resolveBoolean('TESTPULSE_FAIL_ON_UNMATCHED', options.failOnUnmatched),
    dryRun: resolveBoolean('TESTPULSE_DRY_RUN', options.dryRun),
  };
}

/** Never includes the resolved token -- for use wherever a config needs to appear in logs. */
export function redacted(config: ResolvedConfig): string {
  return JSON.stringify({ ...config, token: config.token ? '(redacted)' : undefined });
}

/**
 * Strips embedded userinfo (credentials) from a URL before it is ever
 * logged. Submission-error logging is restricted to status/message/URL
 * since most JS HTTP clients' error objects carry the outgoing
 * request's headers (including Authorization) -- this covers the
 * separate, narrower case of a URL with its own embedded
 * `https://user:pass@host` credentials in an unusual configuration.
 * Falls back to the raw string if it isn't a parsable URL at all,
 * rather than throwing.
 */
export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = '';
    parsed.password = '';
    return parsed.toString();
  } catch {
    return url;
  }
}
