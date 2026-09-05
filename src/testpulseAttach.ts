import { Context } from 'mocha';
import { isSupportedContentType, SUPPORTED_CONTENT_TYPES, writeAttachment } from './attachmentStore';

/**
 * Records a screenshot/artifact attachment for caseKey, which must equal
 * the currently-executing test's own Case()-declared case key. `context`
 * is the same Mocha Context handle Case() requires (`this` inside a
 * non-arrow it()/hook body). Verified against whatever Case() already
 * recorded on `context.test.testpulseProperties` -- Mocha has no
 * built-in equivalent to Jasmine's getSpecProperty(), so this plugin
 * tracks it itself via the same property Case() writes. Content type is
 * validated before the case-key check.
 */
export function Attach(
  context: Context,
  caseKey: string,
  data: Buffer,
  filename: string,
  contentType: string,
): void {
  if (!isSupportedContentType(contentType)) {
    throw new Error(
      `testpulse-mocha: unsupported content type '${contentType}' (allowed: ${SUPPORTED_CONTENT_TYPES.join(', ')})`,
    );
  }

  const test = context.test ?? context.currentTest;
  if (!test) {
    throw new Error(
      'testpulse-mocha: Attach() was called with no currently-running test -- ' +
        'call it from within a non-arrow it()/hook function body, using `this` as the context argument',
    );
  }

  const declaredCaseKey = test.testpulseProperties?.testpulse_case_key;
  if (declaredCaseKey !== caseKey) {
    throw new Error(
      `testpulse-mocha: case key '${caseKey}' was not declared via Case() by the currently-executing test`,
    );
  }

  writeAttachment(caseKey, data, filename, contentType);
}
