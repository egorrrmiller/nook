import { BlockNoteSchema, defaultBlockSpecs, defaultInlineContentSpecs, filterSuggestionItems } from '@blocknote/core';
import { withCollaboration } from '@blocknote/core/yjs';
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import type { ApiClient, Role } from '@nook/api-client';
import {
  usePluginBlocks,
  usePluginInlineContent,
  usePluginSlashMenuItems,
  type AnyBlockNoteEditor,
} from '@nook/plugin-sdk';
import { useEffect, useMemo, useRef } from 'react';
import { useCollabSession, type CollabMode, type CollabSession } from './collab';
import { useYText } from './useYText';

export interface CollabUser {
  name: string;
  color: string;
}

export interface NookEditorProps {
  nodeId: string;
  /** `remote` (default) talks to the collab service; `local` keeps an in-memory doc (mock mode, tests). */
  mode?: CollabMode;
  user?: CollabUser;
  /** The node's effectiveRole; `viewer` renders read-only (the token's role claim is honoured too). */
  role?: Role;
  theme?: 'light' | 'dark';
  /** Used to seed the title in local mode. */
  initialTitle?: string;
  /** Fired (debounced by the caller if needed) when the title is edited locally. */
  onTitleChange?: (title: string) => void;
  onEditorReady?: (editor: AnyBlockNoteEditor) => void;
  titlePlaceholder?: string;
  className?: string;
  client?: ApiClient;
  autofocusTitle?: boolean;
}

const DEFAULT_USER: CollabUser = { name: 'Anonymous', color: '#9b9a97' };

export function NookEditor(props: NookEditorProps) {
  const session = useCollabSession(props.nodeId, {
    mode: props.mode,
    client: props.client,
    initialTitle: props.initialTitle,
  });

  if (!session || session.status === 'connecting' || (session.status !== 'error' && !session.synced && !session.provider)) {
    return <EditorSkeleton />;
  }
  if (session.status === 'error') {
    return (
      <div role="alert" className="nook-editor-banner border-destructive/40 bg-destructive/10 text-destructive">
        Could not connect to the collaboration service: {session.error}
      </div>
    );
  }
  return <NookEditorInner key={props.nodeId} {...props} session={session} />;
}

function EditorSkeleton() {
  return (
    <div className="nook-editor-skeleton" aria-busy="true" aria-label="Loading editor">
      <div className="nook-skeleton-line w-2/3" />
      <div className="nook-skeleton-line w-full" />
      <div className="nook-skeleton-line w-5/6" />
    </div>
  );
}

function NookEditorInner({
  session,
  user = DEFAULT_USER,
  role,
  theme,
  onTitleChange,
  onEditorReady,
  titlePlaceholder = 'Untitled',
  className,
  autofocusTitle,
}: NookEditorProps & { session: CollabSession }) {
  const { doc, provider, claims } = session;
  const readOnly = role === 'viewer' || claims?.role === 'viewer';

  const pluginBlocks = usePluginBlocks();
  const pluginInline = usePluginInlineContent();
  const pluginSlash = usePluginSlashMenuItems();

  const schema = useMemo(
    () =>
      BlockNoteSchema.create({
        blockSpecs: { ...defaultBlockSpecs, ...pluginBlocks },
        inlineContentSpecs: { ...defaultInlineContentSpecs, ...pluginInline },
      }),
    [pluginBlocks, pluginInline],
  );

  const fragment = useMemo(() => doc.getXmlFragment('document'), [doc]);
  const awareness = provider?.awareness ?? undefined;

  const editor = useCreateBlockNote(
    withCollaboration({
      schema,
      collaboration: {
        fragment,
        user: { name: user.name, color: user.color },
        provider: awareness ? { awareness } : undefined,
        showCursorLabels: 'activity',
      },
    }),
    [schema, fragment, awareness, user.name, user.color],
  );

  useEffect(() => {
    onEditorReady?.(editor as AnyBlockNoteEditor);
  }, [editor, onEditorReady]);

  const titleText = useMemo(() => doc.getText('title'), [doc]);
  const [title, setTitle] = useYText(titleText, onTitleChange);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  const slashItems = useMemo(
    () =>
      pluginSlash.map<DefaultReactSuggestionItem>((item) => ({
        title: item.title,
        subtext: item.subtext,
        aliases: item.aliases,
        group: item.group ?? 'Plugins',
        icon: item.icon as DefaultReactSuggestionItem['icon'],
        onItemClick: () => item.onItemClick(editor as AnyBlockNoteEditor),
      })),
    [pluginSlash, editor],
  );

  return (
    <div className={['nook-editor', className].filter(Boolean).join(' ')} data-readonly={readOnly || undefined}>
      {readOnly ? (
        <div role="status" className="nook-editor-banner">
          You have view-only access to this page.
        </div>
      ) : null}
      <textarea
        ref={titleRef}
        aria-label="Page title"
        data-testid="page-title"
        className="nook-editor-title"
        rows={1}
        placeholder={titlePlaceholder}
        value={title}
        readOnly={readOnly}
        autoFocus={autofocusTitle}
        onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || (e.key === 'ArrowDown' && e.currentTarget.selectionStart === title.length)) {
            e.preventDefault();
            editor.focus();
          }
        }}
      />
      <BlockNoteView editor={editor} theme={theme} editable={!readOnly} slashMenu={false} className="nook-editor-view">
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems([...getDefaultReactSlashMenuItems(editor), ...slashItems], query)
          }
        />
      </BlockNoteView>
    </div>
  );
}
