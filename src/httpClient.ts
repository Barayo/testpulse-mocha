export interface HttpResult {
  status: number;
  body: unknown;
}

function joinUrl(base: string, pathname: string): string {
  return `${base.replace(/\/$/, '')}${pathname}`;
}

function authHeaders(token: string | undefined): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function parseBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export interface ImportAttachment {
  caseKey: string;
  filename: string;
  contentType: string;
  data: string;
}

export async function postImport(
  url: string,
  project: string,
  token: string | undefined,
  report: string,
  attachments: ImportAttachment[],
): Promise<HttpResult> {
  const res = await fetch(joinUrl(url, `/api/v1/projects/${encodeURIComponent(project)}/imports`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(token) },
    body: JSON.stringify({ format: 'junit-xml', report, attachments }),
  });
  return { status: res.status, body: await parseBody(res) };
}

export async function getCases(
  url: string,
  project: string,
  token: string | undefined,
): Promise<HttpResult> {
  const res = await fetch(joinUrl(url, `/api/v1/projects/${encodeURIComponent(project)}/cases`), {
    headers: authHeaders(token),
  });
  return { status: res.status, body: await parseBody(res) };
}
