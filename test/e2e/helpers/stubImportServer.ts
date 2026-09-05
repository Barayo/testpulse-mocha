import * as http from 'http';
import type { AddressInfo } from 'net';

export interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: unknown;
}

export interface StubImportServer {
  url: string;
  requests: CapturedRequest[];
  close: () => Promise<void>;
}

/** A real local HTTP server standing in for the TestPulse import API, capturing every request it receives. */
export function startStubImportServer(
  handler: (req: CapturedRequest) => { status: number; body: unknown },
): Promise<StubImportServer> {
  const requests: CapturedRequest[] = [];

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const captured: CapturedRequest = {
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      };
      requests.push(captured);
      const { status, body } = handler(captured);
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    });
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        requests,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}
