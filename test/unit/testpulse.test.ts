import { buildTestContext } from './helpers/mochaObjects';
import { Case } from '../../src/testpulse';

describe('Case', () => {
  it('records the case key as a property on context.test', () => {
    const { context, test } = buildTestContext();
    Case(context, 'LOGIN-42');
    expect(test.testpulseProperties).toEqual({ testpulse_case_key: 'LOGIN-42' });
  });

  it('records platform only when supplied', () => {
    const { context, test } = buildTestContext();
    Case(context, 'LOGIN-42', { platform: 'linux' });
    expect(test.testpulseProperties).toEqual({
      testpulse_case_key: 'LOGIN-42',
      testpulse_platform: 'linux',
    });
  });

  it('records version only when supplied', () => {
    const { context, test } = buildTestContext();
    Case(context, 'LOGIN-42', { version: '2.0' });
    expect(test.testpulseProperties).toEqual({
      testpulse_case_key: 'LOGIN-42',
      testpulse_version: '2.0',
    });
  });

  it('records tags only when supplied, joined with commas', () => {
    const { context, test } = buildTestContext();
    Case(context, 'LOGIN-42', { tags: ['smoke', 'auth'] });
    expect(test.testpulseProperties).toEqual({
      testpulse_case_key: 'LOGIN-42',
      testpulse_tags: 'smoke,auth',
    });
  });

  it('records no optional properties when opts is omitted', () => {
    const { context, test } = buildTestContext();
    Case(context, 'LOGIN-42');
    expect(test.testpulseProperties).toEqual({ testpulse_case_key: 'LOGIN-42' });
  });

  it('throws when context.test is not set (called outside a running test)', () => {
    const { context } = buildTestContext();
    context.test = undefined;
    expect(() => Case(context, 'LOGIN-42')).toThrow(/no currently-running test/);
  });
});
