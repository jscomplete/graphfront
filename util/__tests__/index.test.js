'use strict';

const util = require('../index');

describe('hashWith', () => {
  it('supports md5', () => {
    expect(util.hashWith('test@test.com', 'md5')).toBe(
      'b642b4217b34b1e8d3bd915fc65c4452'
    );
  });

  it('can lowercase and trim before hashing', () => {
    expect(util.hashWith('MyEmailAddress@example.com ', 'md5')).toBe(
      '0bc83cb571cd1c50ba6f3e8a78ef1346'
    );
  });

  it('can hash a string as-is', () => {
    expect(
      util.hashWith('MyEmailAddress@example.com ', 'md5', { asIs: true })
    ).toBe('f9879d71855b5ff21e4963273a886bfc');
  });

  it('returns same string if algorithm is not specified', () => {
    expect(
      util.hashWith('dont@hash.me')
    ).toBe('dont@hash.me');
  });

});
