const { Case, Attach } = require('../../../../dist');

describe('CrossTestFixture', function () {
  it('declares a case key', function () {
    Case(this, 'LOGIN-42');
  });

  it("attempts to attach under another test's case key", function () {
    Case(this, 'LOGIN-43');
    let threw = false;
    try {
      Attach(this, 'LOGIN-42', Buffer.from([1]), 'failure.png', 'image/png');
    } catch (e) {
      threw = true;
    }
    if (!threw) {
      throw new Error('expected Attach() to throw for a case key declared by a different test');
    }
  });
});
