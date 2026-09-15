import { createHttp, type Http } from '@nook/api-client';
import { IS_MOCK, api } from '../../lib/api';
import type {
  CollectionFilterOperator,
  CollectionDocument,
  CollectionPropertyDefinition,
  CollectionRow,
  CollectionRowPropertyPatch,
  CollectionView,
  CollectionViewConfig,
  CollectionViewPatch,
  JsonValue,
} from './model';

interface ApiNode {
  id: string;
  title: string;
  icon?: CollectionRow['icon'];
  createdAt?: string;
  updatedAt?: string;
}

interface ApiCollection {
  id: string;
  name: string;
  properties: Array<{ id: string; name: string; type: string; config: JsonValue; position: number }>;
}

interface ApiDatabase {
  id: string;
  collectionId: string;
  node: ApiNode;
  views: ApiView[];
}

interface ApiView {
  id: string;
  name: string;
  kind: CollectionView['kind'];
  config: Record<string, unknown>;
  position: string;
}

interface ApiRow {
  node: ApiNode;
  properties: Record<string, JsonValue>;
}

interface ApiQueryResponse {
  rows: ApiRow[];
}

/** The backend has a normalized collection/database contract; this adapter keeps view code UI-shaped. */
export interface CollectionTransport {
  get(collectionId: string, signal?: AbortSignal): Promise<CollectionDocument>;
  patchRowProperty(collectionId: string, rowId: string, patch: CollectionRowPropertyPatch): Promise<CollectionRow>;
  patchView(collectionId: string, viewId: string, patch: CollectionViewPatch): Promise<CollectionView>;
}

export function createCollectionTransport(http: Http = createHttp(api.config)): CollectionTransport {
  return {
    get: async (databaseId, signal) => {
      // MSW exposes the UI-shaped fixture directly. Production uses the normalized API below.
      if (IS_MOCK) return http<CollectionDocument>('GET', `/api/collections/${encodeURIComponent(databaseId)}`, { signal });

      const database = await http<ApiDatabase>('GET', `/api/databases/${encodeURIComponent(databaseId)}`, { signal });
      const collection = await http<ApiCollection>('GET', `/api/collections/${encodeURIComponent(database.collectionId)}`, { signal });
      const rows = database.views[0]
        ? (await http<ApiQueryResponse>('POST', `/api/views/${encodeURIComponent(database.views[0].id)}/query`, { signal })).rows
        : [];
      return {
        id: collection.id,
        nodeId: database.id,
        name: collection.name,
        properties: collection.properties.map(toProperty),
        rows: rows.map(toRow),
        views: database.views.map(toView),
        defaultViewId: database.views[0]?.id ?? null,
      };
    },
    patchRowProperty: async (databaseId, rowId, patch) => {
      if (IS_MOCK) {
        return http<CollectionRow>(
          'PATCH',
          `/api/collections/${encodeURIComponent(databaseId)}/rows/${encodeURIComponent(rowId)}/properties`,
          { body: patch },
        );
      }

      const document = await thisGet(http, databaseId);
      const row = document.rows.find((item) => item.id === rowId);
      if (!row) throw new Error(`Collection row ${rowId} was not found.`);
      const properties = { ...row.properties, [patch.propertyId]: patch.value };
      const result = await http<ApiRow>('PATCH', `/api/views/rows/${encodeURIComponent(rowId)}`, {
        body: { properties, title: row.title },
      });
      return toRow(result);
    },
    patchView: async (databaseId, viewId, patch) => {
      if (IS_MOCK) {
        return http<CollectionView>(
          'PATCH',
          `/api/collections/${encodeURIComponent(databaseId)}/views/${encodeURIComponent(viewId)}`,
          { body: patch },
        );
      }

      const result = await http<ApiView>('PATCH', `/api/views/${encodeURIComponent(viewId)}`, {
        body: { config: toApiViewConfig(patch.config) },
      });
      return toView(result);
    },
  };
}

export const collectionTransport = createCollectionTransport();

async function thisGet(http: Http, databaseId: string): Promise<CollectionDocument> {
  // This helper intentionally reuses the same adapter so row updates use the current complete property bag.
  return createCollectionTransport(http).get(databaseId);
}

function toProperty(property: ApiCollection['properties'][number]): CollectionPropertyDefinition {
  return { id: property.id, name: property.name, type: property.type, config: property.config };
}

function toRow(row: ApiRow): CollectionRow {
  return {
    id: row.node.id,
    nodeId: row.node.id,
    title: row.node.title,
    icon: row.node.icon ?? null,
    properties: row.properties,
    createdAt: row.node.createdAt,
    updatedAt: row.node.updatedAt,
  };
}

function toView(view: ApiView): CollectionView {
  return { id: view.id, name: view.name, kind: view.kind, position: view.position, config: fromApiViewConfig(view.config) };
}

function fromApiViewConfig(config: Record<string, unknown>): CollectionViewConfig {
  const filters = asRecord(config.filters);
  const sorts = Array.isArray(config.sorts) ? config.sorts : [];
  const groups = Array.isArray(config.groups) ? config.groups : [];
  return {
    visiblePropertyIds: asStringArray(config.visiblePropertyIds),
    filters: fromApiFilterGroup(filters),
    sorts: sorts.flatMap((sort) => {
      const item = asRecord(sort);
      return typeof item.propertyId === 'string' && (item.direction === 'asc' || item.direction === 'desc')
        ? [{ propertyId: item.propertyId, direction: item.direction === 'asc' ? 'ascending' : 'descending' }]
        : [];
    }),
    groupBy: typeof groups[0] === 'object' && groups[0] !== null && typeof (groups[0] as Record<string, unknown>).propertyId === 'string'
      ? (groups[0] as Record<string, unknown>).propertyId as string
      : null,
    propertyWidths: asRecord(config.layout)?.propertyWidths as Record<string, number> | undefined,
  };
}

function fromApiFilterGroup(group: Record<string, unknown>): CollectionViewConfig['filters'] {
  const conditions = Array.isArray(group.conditions) ? group.conditions : [];
  const groups = Array.isArray(group.groups) ? group.groups : [];
  return {
    kind: 'group',
    operator: group.operator === 'or' ? 'or' : 'and',
    children: [
      ...conditions.flatMap((condition) => {
        const item = asRecord(condition);
        if (typeof item.propertyId !== 'string' || typeof item.operator !== 'string') return [];
        return [{ kind: 'rule' as const, propertyId: item.propertyId, operator: toUiFilterOperator(item.operator), value: item.value as JsonValue | undefined }];
      }),
      ...groups.map((child) => fromApiFilterGroup(asRecord(child))),
    ],
  };
}

function toApiViewConfig(config: CollectionViewConfig): Record<string, unknown> {
  return {
    visiblePropertyIds: config.visiblePropertyIds,
    filters: toApiFilterGroup(config.filters),
    sorts: config.sorts.map((sort) => ({ propertyId: sort.propertyId, direction: sort.direction === 'ascending' ? 'asc' : 'desc' })),
    groups: config.groupBy ? [{ propertyId: config.groupBy, direction: 'asc' }] : [],
    layout: config.propertyWidths ? { propertyWidths: config.propertyWidths } : null,
  };
}

function toApiFilterGroup(group: CollectionViewConfig['filters']): Record<string, unknown> {
  return {
    operator: group.operator,
    conditions: group.children.flatMap((child) => child.kind === 'rule'
      ? [{ propertyId: child.propertyId, operator: toApiFilterOperator(child.operator), value: child.value }]
      : []),
    groups: group.children.flatMap((child) => child.kind === 'group' ? [toApiFilterGroup(child)] : []),
  };
}

function toApiFilterOperator(operator: string): string {
  return ({ does_not_contain: 'not_contains', is_empty: 'empty', is_not_empty: 'not_empty', on_or_before: 'before', on_or_after: 'after' } as Record<string, string>)[operator] ?? operator;
}

function toUiFilterOperator(operator: string): CollectionFilterOperator {
  const candidate = ({ not_contains: 'does_not_contain', empty: 'is_empty', not_empty: 'is_not_empty', before: 'on_or_before', after: 'on_or_after' } as Record<string, string>)[operator] ?? operator;
  const known: CollectionFilterOperator[] = ['equals', 'not_equals', 'contains', 'does_not_contain', 'is_empty', 'is_not_empty', 'greater_than', 'less_than', 'on_or_before', 'on_or_after'];
  return known.includes(candidate as CollectionFilterOperator) ? candidate as CollectionFilterOperator : 'equals';
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
