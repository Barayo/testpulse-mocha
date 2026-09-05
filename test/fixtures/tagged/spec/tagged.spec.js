const { Case } = require('../../../../dist');

describe('TaggedFixture', function () {
  it('login succeeds', function () {
    Case(this, 'LOGIN-42');
  });

  it('untagged test', function () {
    // no Case() call
  });
});
