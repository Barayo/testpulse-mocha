import { buildJUnitXml, TestResultLike } from '../../src/xmlBuilder';

function result(overrides: Partial<TestResultLike>): TestResultLike {
  return {
    title: 'a test',
    classname: 'a suite',
    status: 'passed',
    duration: 0,
    properties: null,
    ...overrides,
  };
}

describe('buildJUnitXml', () => {
  it('injects properties for a tagged test', () => {
    const xml = buildJUnitXml('suite', [
      result({ title: 'a', properties: { testpulse_case_key: 'LOGIN-42' } }),
    ]);
    expect(xml).toContain('<property name="testpulse_case_key" value="LOGIN-42"/>');
    expect(xml).toContain('<testcase classname="a suite" name="a"');
  });

  it('an untagged test has no properties block', () => {
    const xml = buildJUnitXml('suite', [result({ title: 'a', properties: null })]);
    expect(xml).not.toContain('<properties>');
  });

  it('a failed test includes a failure element with the message', () => {
    const xml = buildJUnitXml('suite', [
      result({
        title: 'a',
        status: 'failed',
        failureMessage: 'expected true to be false',
      }),
    ]);
    expect(xml).toContain('<failure message="expected true to be false">');
  });

  it('a failed test with a stack trace includes it as the failure element body', () => {
    const xml = buildJUnitXml('suite', [
      result({
        title: 'a',
        status: 'failed',
        failureMessage: 'boom',
        failureStack: 'Error: boom\n    at somewhere.js:1:1',
      }),
    ]);
    expect(xml).toContain('at somewhere.js:1:1');
  });

  it('a pending test includes a skipped element', () => {
    const xml = buildJUnitXml('suite', [result({ title: 'a', status: 'pending' })]);
    expect(xml).toContain('<skipped/>');
  });

  it('reports overall suite tests/failures/skipped counts', () => {
    const xml = buildJUnitXml('suite', [
      result({ title: 'a', status: 'passed' }),
      result({ title: 'b', status: 'failed', failureMessage: 'x' }),
      result({ title: 'c', status: 'pending' }),
    ]);
    expect(xml).toContain('tests="3"');
    expect(xml).toContain('failures="1"');
    expect(xml).toContain('skipped="1"');
  });

  describe('XML escaping (every written value)', () => {
    it('escapes special characters in a property value (case key/tag)', () => {
      const xml = buildJUnitXml('suite', [
        result({ title: 'a', properties: { testpulse_tags: 'a&b<c>d"e\'f' } }),
      ]);
      expect(xml).toContain('value="a&amp;b&lt;c&gt;d&quot;e&apos;f"');
      expect(xml).not.toContain('value="a&b<c>d"e\'f"');
    });

    it('escapes special characters in the test title and classname', () => {
      const xml = buildJUnitXml('suite<evil>', [
        result({ title: 'title with <tag> & "quote"', classname: 'class<name>', properties: null }),
      ]);
      expect(xml).toContain('name="suite&lt;evil&gt;"');
      expect(xml).toContain('classname="class&lt;name&gt;"');
      expect(xml).toContain('name="title with &lt;tag&gt; &amp; &quot;quote&quot;"');
    });

    it('a failure message containing XML metacharacters cannot inject a forged sibling property', () => {
      const malicious = '</failure><property name="testpulse_case_key" value="OTHER-1"/>';
      const xml = buildJUnitXml('suite', [
        result({
          title: 'a',
          status: 'failed',
          failureMessage: malicious,
          properties: { testpulse_case_key: 'LOGIN-42' },
        }),
      ]);
      // The malicious text must appear only as escaped literal content --
      // never as a real, second, sibling <property> element.
      const propertyMatches = xml.match(/<property /g) ?? [];
      expect(propertyMatches).toHaveLength(1);
      expect(xml).not.toContain('value="OTHER-1"');
      expect(xml).toContain('&lt;/failure&gt;&lt;property name=&quot;testpulse_case_key&quot; value=&quot;OTHER-1&quot;/&gt;');
    });

    it('a failure message containing a ]]> sequence is escaped, not left as literal CDATA-closing text', () => {
      const xml = buildJUnitXml('suite', [
        result({ title: 'a', status: 'failed', failureMessage: 'weird ]]> sequence' }),
      ]);
      expect(xml).toContain('weird ]]&gt; sequence');
    });

    it('escapes a failure stack trace', () => {
      const xml = buildJUnitXml('suite', [
        result({
          title: 'a',
          status: 'failed',
          failureMessage: 'boom',
          failureStack: 'at <anonymous> & stuff',
        }),
      ]);
      expect(xml).toContain('at &lt;anonymous&gt; &amp; stuff');
    });
  });
});
