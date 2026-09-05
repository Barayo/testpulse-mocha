const { Case } = require('../../../../dist');

describe('TaggedUnmatchedFixture', function () {
  it('login succeeds', function () {
    Case(this, 'LOGIN-42');
  });
});
