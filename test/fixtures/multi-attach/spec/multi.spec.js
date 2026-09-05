const { Case, Attach } = require('../../../../dist');

describe('MultiAttachFixture', function () {
  it('attaches twice', function () {
    Case(this, 'LOGIN-45');
    Attach(this, 'LOGIN-45', Buffer.from([1]), 'a.png', 'image/png');
    Attach(this, 'LOGIN-45', Buffer.from([2]), 'b.png', 'image/png');
  });
});
