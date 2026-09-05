const { Case } = require('../../../../dist');

describe('AsyncCompletionFixture', function () {
  it('a tagged test', function () {
    Case(this, 'LOGIN-42');
  });
});
