import { Maximize2Icon, XIcon } from 'lucide-react';
import { Button, IconButton } from '@nook/ui';
import type { CollectionPropertyDefinition, CollectionRow } from './model';
import { displayCollectionValue } from './model';

export function CollectionRowPeek({ row, properties, mode, onClose, onOpenFullPage }: { row: CollectionRow; properties: CollectionPropertyDefinition[]; mode: 'side' | 'center'; onClose: () => void; onOpenFullPage: () => void }) {
  return <aside data-testid="collection-row-peek" aria-label={`${mode} row peek`} className={mode === 'center' ? 'fixed inset-8 z-40 mx-auto max-w-2xl overflow-y-auto rounded-xl border border-border bg-bg p-5 shadow-xl' : 'fixed inset-y-0 right-0 z-40 w-[min(420px,90vw)] overflow-y-auto border-l border-border bg-bg p-5 shadow-xl'}><div className="flex items-center gap-1"><span className="text-xs uppercase tracking-wide text-fg-muted">{mode === 'center' ? 'Center peek' : 'Side peek'}</span><span className="ml-auto" /><IconButton label="Open full page" onClick={onOpenFullPage}><Maximize2Icon /></IconButton><IconButton label="Close peek" onClick={onClose}><XIcon /></IconButton></div><h2 className="mt-7 text-2xl font-semibold">{row.title || 'Untitled'}</h2><dl className="mt-6 divide-y divide-border">{properties.map((property) => <div key={property.id} className="grid grid-cols-[minmax(100px,35%)_1fr] gap-3 py-3 text-sm"><dt className="text-fg-muted">{property.name}</dt><dd className="min-w-0 break-words">{displayCollectionValue(row.properties[property.id]) || 'Empty'}</dd></div>)}</dl><Button type="button" variant="subtle" size="sm" className="mt-5" onClick={onOpenFullPage}>Open as page</Button></aside>;
}

