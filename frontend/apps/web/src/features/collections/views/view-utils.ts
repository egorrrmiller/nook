import type {
  CollectionFilterGroup,
  CollectionFilterNode,
  CollectionFilterRule,
  CollectionRow,
  CollectionSort,
  CollectionViewConfig,
  JsonValue,
} from '../model';
import { displayCollectionValue } from '../model';

function comparable(value: JsonValue | undefined): string | number | boolean | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return displayCollectionValue(value).toLocaleLowerCase();
}

function equals(a: JsonValue | undefined, b: JsonValue | undefined): boolean {
  if (typeof a === 'object' || typeof b === 'object') return displayCollectionValue(a) === displayCollectionValue(b);
  return a === b;
}

function matchesRule(row: CollectionRow, rule: CollectionFilterRule): boolean {
  const actual = row.properties[rule.propertyId];
  const text = displayCollectionValue(actual).toLocaleLowerCase();
  const expected = rule.value;
  const expectedText = displayCollectionValue(expected).toLocaleLowerCase();
  switch (rule.operator) {
    case 'is_empty':
      return actual === undefined || actual === null || actual === '' || (Array.isArray(actual) && actual.length === 0);
    case 'is_not_empty':
      return !matchesRule(row, { ...rule, operator: 'is_empty' });
    case 'equals':
      return equals(actual, expected);
    case 'not_equals':
      return !equals(actual, expected);
    case 'contains':
      return text.includes(expectedText);
    case 'does_not_contain':
      return !text.includes(expectedText);
    case 'greater_than':
      return (comparable(actual) as number | string | null) > (comparable(expected) as number | string | null);
    case 'less_than':
      return (comparable(actual) as number | string | null) < (comparable(expected) as number | string | null);
    case 'on_or_before':
      return text !== '' && text <= expectedText;
    case 'on_or_after':
      return text !== '' && text >= expectedText;
  }
}

function matchesNode(row: CollectionRow, node: CollectionFilterNode): boolean {
  if (node.kind === 'rule') return matchesRule(row, node);
  return matchesGroup(row, node);
}

export function matchesGroup(row: CollectionRow, group: CollectionFilterGroup): boolean {
  if (group.children.length === 0) return true;
  return group.operator === 'and'
    ? group.children.every((child) => matchesNode(row, child))
    : group.children.some((child) => matchesNode(row, child));
}

function compareRows(a: CollectionRow, b: CollectionRow, sort: CollectionSort): number {
  const av = comparable(a.properties[sort.propertyId]);
  const bv = comparable(b.properties[sort.propertyId]);
  if (av === bv) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  const result = av < bv ? -1 : 1;
  return sort.direction === 'ascending' ? result : -result;
}

/** Applies the same client-side semantics to every view. The server can later move this into query parameters. */
export function applyViewConfig(rows: CollectionRow[], config: CollectionViewConfig): CollectionRow[] {
  const filtered = rows.filter((row) => matchesGroup(row, config.filters));
  if (!config.sorts.length) return filtered;
  return [...filtered].sort((a, b) => {
    for (const sort of config.sorts) {
      const result = compareRows(a, b, sort);
      if (result !== 0) return result;
    }
    return 0;
  });
}

export function groupRows(rows: CollectionRow[], propertyId: string | null | undefined) {
  if (!propertyId) return [{ key: null, label: null, rows }];
  const groups = new Map<string, { key: string; label: string; rows: CollectionRow[] }>();
  for (const row of rows) {
    const label = displayCollectionValue(row.properties[propertyId]) || 'Empty';
    const key = label.toLocaleLowerCase();
    const group = groups.get(key) ?? { key, label, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  return [...groups.values()];
}

