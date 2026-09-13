import { describe, expect, it } from 'vitest';
import { EMPTY_FILTERS, activeFilterCount, buildSearchRequest, datePreset } from '../search/build-request';

describe('buildSearchRequest', () => {
  it('omits empty filters, scope and the default sort', () => {
    expect(buildSearchRequest('  nook  ', EMPTY_FILTERS, 'relevance', 'node-1')).toEqual({ query: 'nook', limit: 20 });
  });

  it('maps every filter onto the §9.5 body', () => {
    const body = buildSearchRequest(
      'plan',
      {
        ...EMPTY_FILTERS,
        titleOnly: true,
        inCurrentTree: true,
        kinds: ['page', 'database'],
        tagIds: ['t1'],
        created: { from: '2026-01-01', to: '2026-02-01' },
        updated: { from: '2026-03-01' },
        includeArchived: true,
        includeFiles: true,
      },
      'updated',
      'node-1',
      50,
    );
    expect(body).toEqual({
      query: 'plan',
      limit: 50,
      scope: { ancestorId: 'node-1' },
      sort: 'updated',
      filters: {
        titleOnly: true,
        kinds: ['page', 'database'],
        tagIds: ['t1'],
        createdFrom: '2026-01-01',
        createdTo: '2026-02-01',
        updatedFrom: '2026-03-01',
        includeArchived: true,
        includeFiles: true,
      },
    });
  });

  it('drops the scope when no page is open', () => {
    const body = buildSearchRequest('x', { ...EMPTY_FILTERS, inCurrentTree: true }, 'relevance', null);
    expect(body.scope).toBeUndefined();
  });

  it('counts the active filters', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ ...EMPTY_FILTERS, titleOnly: true, kinds: ['page'], updated: { from: '2026-01-01' } })).toBe(3);
  });

  it('builds date presets as local ISO days', () => {
    const now = new Date('2026-09-13T12:00:00');
    expect(datePreset('week', now)).toEqual({ from: '2026-09-06', to: '2026-09-13' });
    expect(datePreset('today', now)).toEqual({ from: '2026-09-13', to: '2026-09-13' });
  });
});
