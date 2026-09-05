const { Case } = require('../../../../dist');
const assert = require('assert');

describe('FailingFixture', function () {
  it('a real regression', function () {
    Case(this, 'LOGIN-42');
    assert.strictEqual(true, false);
  });
});
