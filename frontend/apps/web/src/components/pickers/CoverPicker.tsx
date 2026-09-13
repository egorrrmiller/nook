import { useQuery } from '@tanstack/react-query';
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { Trash2Icon, UploadIcon } from 'lucide-react';
import type { CoverItem, NodeCover } from '@nook/api-client';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Skeleton,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  cn,
} from '@nook/ui';
import { api } from '../../lib/api';
import { toast } from '../../stores/toast';

export interface CoverPickerProps {
  value: NodeCover | null | undefined;
  nodeId: string;
  onChange: (cover: NodeCover | null) => void;
  children: ReactNode;
}

/** Resolves a cover to a displayable URL (gallery ids are looked up in the §8 gallery). */
export function coverUrl(cover: NodeCover | null | undefined, gallery: CoverItem[] | undefined): string | null {
  if (!cover) return null;
  if (cover.type === 'url') return cover.value;
  if (cover.type === 'upload') return api.files.url(cover.value);
  return gallery?.find((c) => c.id === cover.value)?.url ?? null;
}

export function useCoverGallery(enabled = true) {
  return useQuery({
    queryKey: ['covers'],
    queryFn: () => api.covers.list(),
    staleTime: 60 * 60_000,
    enabled,
  });
}

/** Gallery | Upload | Link | Reposition (contracts §10). */
export function CoverPicker({ value, nodeId, onChange, children }: CoverPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>(value ? 'gallery' : 'gallery');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: gallery, isPending } = useCoverGallery(open);
  const groups = [...new Set((gallery ?? []).map((c) => c.group))];

  async function upload(file: File) {
    setBusy(true);
    try {
      const att = await api.files.upload(file, { nodeId, purpose: 'cover' });
      onChange({ type: 'upload', value: att.id, position: value?.position ?? 0.5 });
      setOpen(false);
    } catch {
      toast('Upload failed', 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={children as React.ReactElement} />
      <PopoverContent className="w-[420px] p-0" data-testid="cover-picker">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <div className="flex items-center gap-1 border-b border-border px-1">
            <TabsList className="flex-1 border-0">
              <TabsTab value="gallery">Gallery</TabsTab>
              <TabsTab value="upload">Upload</TabsTab>
              <TabsTab value="link">Link</TabsTab>
              {value ? <TabsTab value="reposition">Reposition</TabsTab> : null}
            </TabsList>
            {value ? (
              <Button
                variant="subtle"
                size="sm"
                data-testid="cover-remove"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Trash2Icon /> Remove
              </Button>
            ) : null}
          </div>

          <TabsPanel value="gallery" className="max-h-72 overflow-y-auto p-3">
            {isPending ? (
              <div className="grid grid-cols-4 gap-2">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group} className="mb-3">
                  <p className="mb-1 text-xs font-medium text-fg-muted">{group}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {(gallery ?? [])
                      .filter((c) => c.group === group)
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          title={c.name}
                          data-testid="cover-gallery-item"
                          onClick={() => {
                            onChange({ type: 'gallery', value: c.id, position: 0.5 });
                            setOpen(false);
                          }}
                          className={cn(
                            'h-14 overflow-hidden rounded-[var(--radius-sm)] border border-border transition-[outline] hover:outline-2 hover:outline-brand',
                            value?.type === 'gallery' && value.value === c.id && 'outline-2 outline-brand',
                          )}
                        >
                          <img src={c.thumbUrl} alt={c.name} className="size-full object-cover" />
                        </button>
                      ))}
                  </div>
                </div>
              ))
            )}
          </TabsPanel>

          <TabsPanel value="upload" className="flex flex-col items-center gap-2 p-4">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = '';
              }}
            />
            <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
              <UploadIcon /> {busy ? 'Uploading…' : 'Upload an image'}
            </Button>
            <p className="text-xs text-fg-muted">Images of at least 1500×600 px look best.</p>
          </TabsPanel>

          <TabsPanel value="link" className="flex flex-col gap-2 p-4">
            <Input
              placeholder="https://example.com/cover.jpg"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Cover image URL"
            />
            <Button
              disabled={!url.trim()}
              onClick={() => {
                onChange({ type: 'url', value: url.trim(), position: 0.5 });
                setOpen(false);
              }}
            >
              Submit
            </Button>
          </TabsPanel>

          {value ? (
            <TabsPanel value="reposition" className="flex flex-col gap-2 p-3">
              <RepositionPad
                src={coverUrl(value, gallery)}
                position={value.position ?? 0.5}
                onChange={(position) => onChange({ ...value, position })}
              />
              <p className="text-center text-xs text-fg-muted">Drag the image up or down to reposition it.</p>
              <Button size="sm" onClick={() => setOpen(false)}>
                Save position
              </Button>
            </TabsPanel>
          ) : null}
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

/** Vertical drag → `position` 0..1 (the cover's vertical focus point). */
function RepositionPad({
  src,
  position,
  onChange,
}: {
  src: string | null;
  position: number;
  onChange: (p: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; start: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { startY: e.clientY, start: position };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const h = ref.current?.clientHeight ?? 1;
    if (!d) return;
    const next = Math.max(0, Math.min(1, d.start - (e.clientY - d.startY) / (h * 2)));
    onChange(Number(next.toFixed(3)));
  };
  const onPointerUp = () => (drag.current = null);

  return (
    <div
      ref={ref}
      role="slider"
      aria-label="Cover position"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={position}
      tabIndex={0}
      data-testid="cover-reposition"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') onChange(Math.min(1, Number((position + 0.05).toFixed(3))));
        if (e.key === 'ArrowDown') onChange(Math.max(0, Number((position - 0.05).toFixed(3))));
      }}
      className="h-32 cursor-grab overflow-hidden rounded-[var(--radius-sm)] border border-border bg-bg-muted active:cursor-grabbing"
      style={
        src
          ? { backgroundImage: `url(${src})`, backgroundSize: 'cover', backgroundPosition: `center ${(1 - position) * 100}%` }
          : undefined
      }
    />
  );
}
