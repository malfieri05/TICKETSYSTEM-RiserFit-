import { normalizeTicketTagLabel } from './ticket-tag.utils';

describe('normalizeTicketTagLabel', () => {
  it('trims, collapses whitespace, lowercases', () => {
    expect(normalizeTicketTagLabel('  Foo   Bar  ')).toBe('foo bar');
  });

  it('matches spec single definition', () => {
    expect(normalizeTicketTagLabel('Vendor\t\nQuote')).toBe('vendor quote');
  });
});
