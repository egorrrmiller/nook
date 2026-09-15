import type { NodeIcon } from '@nook/api-client';

/** JSON values are deliberately open-ended: a collection must not discard values it cannot render yet. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CollectionPropertyType = string;

export interface CollectionPropertyDefinition {
  id: string;
  name: string;
  type: CollectionPropertyType;
  config?: JsonValue;
  /** Hidden properties remain in the payload and can be enabled from view settings. */
  hidden?: boolean;
}

export interface CollectionRow {
  id: string;
  /** A row is a page in the node tree. `nodeId` lets the backend use a separate row id later. */
  nodeId?: string | null;
  title: string;
  icon?: NodeIcon | null;
  properties: Record<string, JsonValue>;
  createdAt?: string;
  updatedAt?: string;
}

export type CollectionViewKind = 'table' | 'board' | 'list' | 'gallery' | 'calendar';

export type CollectionFilterOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'does_not_contain'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'on_or_before'
  | 'on_or_after';

export interface CollectionFilterRule {
  kind: 'rule';
  propertyId: string;
  operator: CollectionFilterOperator;
  value?: JsonValue;
}

export interface CollectionFilterGroup {
  kind: 'group';
  operator: 'and' | 'or';
  children: CollectionFilterNode[];
}

export type CollectionFilterNode = CollectionFilterRule | CollectionFilterGroup;

export interface CollectionSort {
  propertyId: string;
  direction: 'ascending' | 'descending';
}

export interface CollectionViewConfig {
  visiblePropertyIds: string[];
  filters: CollectionFilterGroup;
  sorts: CollectionSort[];
  groupBy?: string | null;
  propertyWidths?: Record<string, number>;
}

export interface CollectionView {
  id: string;
  name: string;
  kind: CollectionViewKind;
  config: CollectionViewConfig;
  position?: string;
}

export interface CollectionDocument {
  id: string;
  nodeId: string;
  name: string;
  properties: CollectionPropertyDefinition[];
  rows: CollectionRow[];
  views: CollectionView[];
  defaultViewId?: string | null;
}

export interface CollectionRowPropertyPatch {
  propertyId: string;
  value: JsonValue;
}

export interface CollectionViewPatch {
  config: CollectionViewConfig;
}

export const DEFAULT_COLLECTION_VIEW_CONFIG: CollectionViewConfig = {
  visiblePropertyIds: [],
  filters: { kind: 'group', operator: 'and', children: [] },
  sorts: [],
  groupBy: null,
};

export function cloneJson<T extends JsonValue>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneJson(item)) as T;
  const out: { [key: string]: JsonValue } = {};
  for (const [key, item] of Object.entries(value)) out[key] = cloneJson(item);
  return out as T;
}

/** Copy a view config before editing it, including unknown future keys from the server payload. */
export function cloneViewConfig(config: CollectionViewConfig): CollectionViewConfig {
  return cloneJson(config);
}

export function isJsonRecord(value: JsonValue | undefined): value is { [key: string]: JsonValue } {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function displayCollectionValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return new Intl.NumberFormat().format(value);
  if (Array.isArray(value)) return value.map((item) => displayCollectionValue(item)).join(', ');
  if (isJsonRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Unknown value]';
    }
  }
  return String(value);
}

export function propertyOptions(property: CollectionPropertyDefinition): string[] {
  const config = property.config;
  if (!isJsonRecord(config)) return [];
  const raw = config.options;
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : [];
}

export function propertyLabel(properties: CollectionPropertyDefinition[], id: string): string {
  return properties.find((property) => property.id === id)?.name ?? id;
}

