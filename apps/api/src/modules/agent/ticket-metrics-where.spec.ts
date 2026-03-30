import { buildTicketCreatedAtFilter } from './ticket-metrics-where';

describe('buildTicketCreatedAtFilter', () => {
  it('returns null when no date args', () => {
    expect(buildTicketCreatedAtFilter({})).toBeNull();
  });

  it('sets gte and lt for date_preset today', () => {
    const w = buildTicketCreatedAtFilter({ date_preset: 'today' });
    expect(w).not.toBeNull();
    expect(w!.createdAt).toBeDefined();
    const ca = w!.createdAt as { gte?: Date; lt?: Date };
    expect(ca.gte).toBeInstanceOf(Date);
    expect(ca.lt).toBeInstanceOf(Date);
    expect(ca.lt!.getTime()).toBeGreaterThan(ca.gte!.getTime());
  });

  it('narrows last_7_days with created_after', () => {
    const w = buildTicketCreatedAtFilter({
      date_preset: 'last_7_days',
      created_after: '2099-01-01T00:00:00.000Z',
    });
    expect(w).not.toBeNull();
    const ca = w!.createdAt as { gte?: Date };
    expect(ca.gte?.toISOString().slice(0, 10)).toBe('2099-01-01');
  });
});
