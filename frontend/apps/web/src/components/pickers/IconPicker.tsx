import { useMemo, useRef, useState, type ReactNode } from 'react';
import { DicesIcon, Trash2Icon, UploadIcon } from 'lucide-react';
import type { NodeIcon } from '@nook/api-client';
import {
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  cn,
} from '@nook/ui';
import { api } from '../../lib/api';
import { toast } from '../../stores/toast';
import { EMOJI_GROUPS, randomEmoji, recentEmoji, rememberEmoji, searchEmoji } from './emoji';

export interface IconPickerProps {
  value: NodeIcon | null | undefined;
  nodeId: string;
  onChange: (icon: NodeIcon | null) => void;
  children: ReactNode;
}

/** Popover with Emoji | Upload | Link tabs and a Remove action (contracts §10). */
export function IconPicker({ value, nodeId, onChange, children }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>('emoji');
  const [query, setQuery] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const recents = useMemo(() => (open ? recentEmoji() : []), [open]);
  const results = useMemo(() => searchEmoji(query), [query]);

  const pick = (glyph: string) => {
    rememberEmoji(glyph);
    onChange({ type: 'emoji', value: glyph });
    setOpen(false);
  };

  const remove = () => {
    onChange(null);
    setOpen(false);
  };

  async function upload(file: File) {
    setBusy(true);
    try {
      const att = await api.files.upload(file, { nodeId, purpose: 'icon' });
      onChange({ type: 'upload', value: att.id });
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
      <PopoverContent className="w-[360px] p-0" data-testid="icon-picker">
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <div className="flex items-center gap-1 border-b border-border px-1">
            <TabsList className="flex-1 border-0">
              <TabsTab value="emoji">Emoji</TabsTab>
              <TabsTab value="upload">Upload</TabsTab>
              <TabsTab value="link">Link</TabsTab>
            </TabsList>
            {tab === 'emoji' ? (
              <Button variant="subtle" size="icon-sm" aria-label="Random emoji" onClick={() => pick(randomEmoji())}>
                <DicesIcon />
              </Button>
            ) : null}
            {value ? (
              <Button variant="subtle" size="sm" onClick={remove} data-testid="icon-remove">
                <Trash2Icon /> Remove
              </Button>
            ) : null}
          </div>

          <TabsPanel value="emoji" className="p-2">
            <Input
              autoFocus
              placeholder="Search emoji…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              data-testid="emoji-search"
            />
            <div className="mt-2 max-h-64 overflow-y-auto pr-1">
              {query ? (
                <EmojiGrid label="Results" emoji={results.map((e) => e[0])} onPick={pick} empty="No emoji found." />
              ) : (
                <>
                  {recents.length ? <EmojiGrid label="Recent" emoji={recents} onPick={pick} /> : null}
                  {EMOJI_GROUPS.map((g) => (
                    <EmojiGrid key={g.name} label={g.name} emoji={g.emoji.map((e) => e[0])} onPick={pick} />
                  ))}
                </>
              )}
            </div>
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
              <UploadIcon /> {busy ? 'Uploading…' : 'Choose an image'}
            </Button>
            <p className="text-xs text-fg-muted">Square images of at least 280×280 px look best.</p>
          </TabsPanel>

          <TabsPanel value="link" className="flex flex-col gap-2 p-4">
            <Input
              placeholder="https://example.com/icon.png"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Icon image URL"
            />
            <Button
              disabled={!url.trim()}
              onClick={() => {
                onChange({ type: 'url', value: url.trim() });
                setOpen(false);
              }}
            >
              Submit
            </Button>
          </TabsPanel>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}

function EmojiGrid({
  label,
  emoji,
  onPick,
  empty,
}: {
  label: string;
  emoji: readonly string[];
  onPick: (glyph: string) => void;
  empty?: string;
}) {
  if (!emoji.length) return empty ? <p className="px-1 py-4 text-center text-sm text-fg-muted">{empty}</p> : null;
  return (
    <div className="mb-2">
      <p className="px-1 py-1 text-xs font-medium text-fg-muted">{label}</p>
      <div className="grid grid-cols-10 gap-px">
        {emoji.map((glyph, i) => (
          <button
            key={`${glyph}-${i}`}
            type="button"
            title={glyph}
            onClick={() => onPick(glyph)}
            className={cn(
              'flex size-8 items-center justify-center rounded-[var(--radius-sm)] text-[19px] leading-none transition-colors hover:bg-bg-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
            )}
          >
            {glyph}
          </button>
        ))}
      </div>
    </div>
  );
}
