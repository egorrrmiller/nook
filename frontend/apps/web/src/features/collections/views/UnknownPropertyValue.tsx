import type { CollectionPropertyDefinition, JsonValue } from '../model';
import { displayCollectionValue } from '../model';

export function UnknownPropertyValue({ property, value }: { property: CollectionPropertyDefinition; value: JsonValue | undefined }) {
  let raw = displayCollectionValue(value);
  if (!raw) raw = 'Empty';
  return (
    <span
      data-testid="unknown-property-value"
      title={`Unsupported property type: ${property.type}`}
      className="inline-flex max-w-full items-center gap-1 rounded-sm bg-danger/10 px-1.5 py-0.5 text-xs text-danger"
    >
      <span aria-hidden>⚠</span>
      <span className="truncate">Unsupported {property.type}: {raw}</span>
    </span>
  );
}

