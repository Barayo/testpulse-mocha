import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export function isSupportedContentType(contentType: string): boolean {
  return SUPPORTED_CONTENT_TYPES.includes(contentType);
}

export interface StoredAttachmentMeta {
  caseKey: string;
  filename: string;
  contentType: string;
}

function scratchDir(): string {
  return path.join(process.cwd(), '.testpulse', 'attachments');
}

/**
 * Writes an attachment's bytes plus a JSON sidecar into the scratch
 * directory. The on-disk filename is a hash of the case key plus a
 * fresh random identifier per call -- never derived from the
 * caller-supplied filename or case key, which are stored only as JSON
 * *content* -- no path-traversal surface, ported directly from
 * testpulse-jasmine's attachmentStore.ts (itself inherited from a fix
 * testpulse-jest's own gating review required, since a data-driven
 * test's case key is caller-controlled text, not a trusted constant).
 * A fresh identifier per call (not the case key alone) means multiple
 * attachments under one case key never collide or overwrite each other.
 */
export function writeAttachment(
  caseKey: string,
  data: Buffer,
  filename: string,
  contentType: string,
): void {
  const dir = scratchDir();
  fs.mkdirSync(dir, { recursive: true });

  const id = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(`${caseKey}:${id}`).digest('hex');

  fs.writeFileSync(path.join(dir, `${hash}.data`), data);
  const meta: StoredAttachmentMeta = { caseKey, filename, contentType };
  fs.writeFileSync(path.join(dir, `${hash}.json`), JSON.stringify(meta));
}

export interface StoredAttachment extends StoredAttachmentMeta {
  data: Buffer;
}

/**
 * Removes the attachment scratch directory after a successful submission.
 * Without this, a persistent (non-ephemeral) workspace would resubmit a
 * stale attachment alongside a fresh one under the same case key on a
 * later run. Never called on a failed submission, so a retry still has
 * the attachments to resubmit.
 */
export function clearAttachments(searchRoot: string): void {
  fs.rmSync(path.join(searchRoot, '.testpulse', 'attachments'), { recursive: true, force: true });
}

/**
 * Reads every <hash>.json + <hash>.data pair from exactly
 * <searchRoot>/.testpulse/attachments -- writeAttachment() never creates
 * subdirectories there, so this is a flat, non-recursive read, not a
 * tree walk. Scoping to this exact path (rather than recursively
 * matching any directory named "attachments" anywhere under searchRoot)
 * ensures an unrelated "attachments" directory elsewhere in the tree is
 * never treated as a source of real attachments.
 *
 * Also re-validates each sidecar's contentType against the same
 * allowlist writeAttachment()'s caller (Attach()) already enforces on
 * write -- the allowlist is a real security boundary that must hold on
 * the read path a submission is actually built from too.
 *
 * Skips (rather than throws on) a malformed or partially-written
 * sidecar -- a real, ordinary occurrence if a process is killed
 * mid-write (CI timeout, OOM-kill), not just an adversarial-input
 * concern.
 */
export function readAttachments(searchRoot: string): StoredAttachment[] {
  const dir = path.join(searchRoot, '.testpulse', 'attachments');
  const result: StoredAttachment[] = [];
  if (!fs.existsSync(dir)) {
    return result;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.json')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    try {
      const meta: StoredAttachmentMeta = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      if (!isSupportedContentType(meta.contentType)) {
        // eslint-disable-next-line no-console
        console.error(
          `testpulse-mocha: skipping attachment sidecar ${fullPath}: unsupported content type "${meta.contentType}"`,
        );
        continue;
      }
      const dataPath = fullPath.replace(/\.json$/, '.data');
      if (!fs.existsSync(dataPath)) {
        continue;
      }
      const data = fs.readFileSync(dataPath);
      result.push({ ...meta, data });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(
        `testpulse-mocha: skipping malformed attachment sidecar ${fullPath}: ${(e as Error).message}`,
      );
    }
  }
  return result;
}
