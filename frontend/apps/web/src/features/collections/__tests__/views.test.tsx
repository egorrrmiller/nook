import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TableView } from '../views/TableView';
import { applyViewConfig } from '../views/view-utils';
import { collectionTransport } from '../transport';
import type { CollectionPropertyDefinition, CollectionRow, CollectionViewConfig } from '../model';
import { mockApi } from '../../../mocks/handlers';
import { useWorkspaceStore } from '../../../stores/workspace';

const properties: CollectionPropertyDefinition[] = [
  { id: 'status', name: 'Status', type: 'select', config: { options: ['Backlog', 'Done'] } },
  { id: 'priority', name: 'Priority', type: 'number' },
  { id: 'mystery', name: 'Formula', type: 'formula' },
];

const rows: CollectionRow[] = [
  { id: 'row-1', title: 'Alpha', properties: { status: 'Done', priority: 2, mystery: { expression: '2 + 2', result: 4 } } },
  { id: 'row-2', title: 'Beta', properties: { status: 'Backlog', priority: 1, mystery: { expression: '1 + 1', result: 2 } } },
];

const config: CollectionViewConfig = {
  visiblePropertyIds: ['status', 'priority', 'mystery'],
  filters: { kind: 'group', operator: 'and', children: [] },
  sorts: [],
  groupBy: null,
};

describe('collection views', () => {
  it('renders table rows and keeps unknown property values visible', () => {
    render(<TableView properties={properties} rows={rows} config={config} onChange={vi.fn()} onOpenRow={vi.fn()} />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getAllByTestId('unknown-property-value')).toHaveLength(2);
  });

  it('edits a supported table property', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TableView properties={properties} rows={rows} config={config} onChange={onChange} onOpenRow={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: 'Priority' }) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, '5{Enter}');
    expect(onChange).toHaveBeenCalledWith(rows[0], 'priority', 5);
  });

  it('applies nested AND/OR filters and sorting without dropping unknown fields', () => {
    const filtered = applyViewConfig(rows, { ...config, filters: { kind: 'group', operator: 'or', children: [{ kind: 'rule', propertyId: 'status', operator: 'equals', value: 'Done' }, { kind: 'rule', propertyId: 'priority', operator: 'greater_than', value: 3 }] }, sorts: [{ propertyId: 'priority', direction: 'descending' }] });
    expect(filtered.map((row) => row.title)).toEqual(['Alpha']);
    expect(filtered[0]?.properties.mystery).toEqual(rows[0]?.properties.mystery);
  });

  it('persists view config through the mock transport', async () => {
    const workspaceId = mockApi.state.workspaces[0]!.id;
    const collection = mockApi.state.collections[0]!;
    mockApi.state.sessionUserId = mockApi.state.users[0]!.id;
    useWorkspaceStore.getState().setActive(workspaceId);
    const next = { ...collection.views[0]!.config, groupBy: 'status' };
    await collectionTransport.patchView(collection.id, collection.views[0]!.id, { config: next });
    await waitFor(() => expect(mockApi.state.collections[0]!.views[0]!.config.groupBy).toBe('status'));
  });
});

