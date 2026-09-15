import { filterSuggestionItems } from '@blocknote/core';
import { withCollaboration } from '@blocknote/core/yjs';
import { syntaxHighlighter } from '@blocknote/code-block';
import {
  FilePanelController,
  FormattingToolbarController,
  GridSuggestionMenuController,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  getDefaultReactEmojiPickerItems,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { multiColumnDropCursor, locales as multiColumnLocales } from '@blocknote/xl-multi-column';
import { en as enLocale } from '@blocknote/core/locales';
import type { ApiClient, Node, PageSettings, Role } from '@nook/api-client';
import { usePluginBlocks, usePluginInlineContent, usePluginSlashMenuItems, type AnyBlockNoteEditor } from '@nook/plugin-sdk';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type * as Y from 'yjs';
import { useQueryless } from './util/useQueryless';
import { BlocksView } from './BlocksView';
import { useCollabSession, type CollabMode, type CollabSession } from './collab';
import { EditorHostProvider, useEditorHost, type UploadResult } from './host-context';
import { nookBlockSpecs, nookInlineContentSpecs, useNookSchema, type NookSchema } from './schema';
import { unsupportedSpecsFromDocument } from './schema/unsupported';
import { buildSlashItems, type SlashActions } from './menus/slashItems';
import { NookSlashMenu } from './menus/NookSlashMenu';
import { mentionMenuItems } from './menus/mentionItems';
import { ColorPanel, PanelShell, TurnIntoPanel } from './menus/panels';
import { createNookDragHandleMenu } from './menus/NookDragHandleMenu';
import { NookFormattingToolbar } from './menus/NookFormattingToolbar';
import { NookFilePanel } from './menus/NookFilePanel';
import { BlockShortcutsExtension } from './extensions/blockShortcuts';
import { duplicateBlocks, deleteBlocks, selectedBlockIds } from './extensions/blockCommands';
import { blockLinkUrl, copyText, useBlockAnchor } from './extensions/anchors';
import { PasteChoicePopover, type PasteChoice, type PasteChoiceState } from './paste/PasteChoicePopover';
import { classifyPastedText, type PasteClassification } from './paste/classify';
import { PagePicker } from './components/PagePicker';
import { TitleEditor } from './TitleEditor';
import { todayIso } from './schema/inline/dateMention';
import type { AnyEditor } from './types';

export interface CollabUser {
  name: string;
  color: string;
}

/** What the page header slot needs: the title Y.Text (contracts §3) and focus control. */
export interface EditorHeaderContext {
  titleText: Y.Text;
  focusEditor: () => void;
  readOnly: boolean;
  /**
   * True once the document reflects the server's state (or the session is local). Seeding the title Y.Text from a
   * REST-loaded `node.title` before this flips would append it a second time when the remote state arrives.
   */
  synced: boolean;
}

export interface NookEditorProps {
  nodeId: string;
  workspaceId: string;
  /** `remote` (default) talks to the collab service; `local` keeps an in-memory doc (mock mode, tests). */
  mode?: CollabMode;
  /**
   * Rendered above the editor, inside the page column — the page header (icon + title). It gets
   * the Y.Text of the title so the header binds to the same document as the editor.
   */
  header?: (ctx: EditorHeaderContext) => ReactNode;
  user?: CollabUser;
  /** The node's effectiveRole; `viewer` renders read-only (the token's role claim is honoured too). */
  role?: Role;
  /** `pageSettings.locked` also makes the editor read-only (with a banner). */
  pageSettings?: PageSettings | null;
  theme?: 'light' | 'dark';
  initialTitle?: string;
  onTitleChange?: (title: string) => void;
  /** Renders the title textarea inside the editor (standalone / peek use). */
  showTitle?: boolean;
  onEditorReady?: (editor: AnyBlockNoteEditor) => void;
  titlePlaceholder?: string;
  className?: string;
  client?: ApiClient;
  autofocusTitle?: boolean;
  navigate?: (to: string) => void;
  toast?: (message: string) => void;
  /** Uploads a file and returns the props for the media block (app-owned, see features/files). */
  uploadFile?: (file: File, blockId?: string) => Promise<UploadResult>;
  /** Creates a sub-page for `[[New title]]` — the app keeps its caches in sync. */
  createPage?: (title: string) => Promise<Node>;
}

const DEFAULT_USER: CollabUser = { name: 'Anonymous', color: '#9b9a97' };

export function NookEditor(props: NookEditorProps) {
  const session = useCollabSession(props.nodeId, {
    mode: props.mode,
    client: props.client,
    initialTitle: props.initialTitle,
  });

  return (
    <EditorHostProvider
      workspaceId={props.workspaceId}
      nodeId={props.nodeId}
      navigate={props.navigate}
      toast={props.toast}
      uploadFile={props.uploadFile}
      createPage={props.createPage}
    >
      <EditorBody {...props} session={session} />
    </EditorHostProvider>
  );
}

function EditorBody(props: NookEditorProps & { session: CollabSession | null }) {
  const { session } = props;
  if (!session || session.status === 'connecting' || (session.status !== 'error' && !session.synced)) {
    return <EditorSkeleton />;
  }
  if (session.status === 'error') return <OfflineFallback {...props} session={session} />;
  return <NookEditorInner key={props.nodeId} {...props} session={session} />;
}

/**
 * Collab is down: render the last stored projection (`GET /api/nodes/{id}/blocks`, §9.7) in a
 * non-collaborative, read-only editor so the page is still readable.
 */
function OfflineFallback({
  session,
  theme,
  header,
  className,
}: NookEditorProps & { session: CollabSession }) {
  const host = useEditorHost();
  const blocks = useQueryless(() => host.api.nodes.blocks(host.nodeId).then((r) => r.blocks), [host.api, host.nodeId]);
  const titleText = useMemo(() => session.doc.getText('title'), [session.doc]);
  return (
    <div className={['nook-editor', className].filter(Boolean).join(' ')} data-readonly>
      {/* No provider here, so no remote state can arrive: seeding the title from REST is the only source. */}
      {header?.({ titleText, focusEditor: () => {}, readOnly: true, synced: true })}
      <div role="alert" className="nook-editor-banner nook-editor-banner--error" data-testid="collab-fallback">
        Live editing unavailable — showing the last saved version of this page.
      </div>
      <BlocksView blocks={blocks.data ?? []} theme={theme} />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="nook-editor-skeleton" aria-busy="true" aria-label="Loading editor">
      <div className="nook-skeleton-line" style={{ width: '60%' }} />
      <div className="nook-skeleton-line" style={{ width: '100%' }} />
      <div className="nook-skeleton-line" style={{ width: '80%' }} />
    </div>
  );
}

interface OverlayState {
  kind: 'turnInto' | 'color' | 'moveTo';
  blockIds: string[];
}

function NookEditorInner({
  session,
  user = DEFAULT_USER,
  role,
  pageSettings,
  theme,
  onTitleChange,
  onEditorReady,
  titlePlaceholder = 'Untitled',
  className,
  autofocusTitle,
  showTitle,
  initialTitle,
  header,
}: NookEditorProps & { session: CollabSession }) {
  const host = useEditorHost();
  const { doc, provider, claims } = session;
  const readOnly = role === 'viewer' || claims?.role === 'viewer' || pageSettings?.locked === true;

  const pluginBlocks = usePluginBlocks();
  const pluginInlineContent = usePluginInlineContent();
  const fragment = useMemo(() => doc.getXmlFragment('document'), [doc]);
  const knownBlockTypes = useMemo(
    () => new Set([...Object.keys(nookBlockSpecs()), ...Object.keys(pluginBlocks)]),
    [pluginBlocks],
  );
  const knownInlineTypes = useMemo(
    () => new Set([...Object.keys(nookInlineContentSpecs()), ...Object.keys(pluginInlineContent)]),
    [pluginInlineContent],
  );
  const unsupported = useMemo(
    () => unsupportedSpecsFromDocument(doc, knownBlockTypes, knownInlineTypes),
    [doc, knownBlockTypes, knownInlineTypes],
  );
  const schema = useNookSchema(unsupported);
  const awareness = provider?.awareness ?? undefined;

  const [overlay, setOverlay] = useState<OverlayState | null>(null);
  const [paste, setPaste] = useState<PasteChoiceState | null>(null);
  // The editor's options are created once; they reach the current React state through these refs.
  const pasteRef = useRef<((state: PasteChoiceState) => void) | null>(null);
  const copyLinkRef = useRef<((blockId: string) => void) | null>(null);
  const uploadRef = useRef(host.uploadFile);
  uploadRef.current = host.uploadFile;

  const applyPasteChoice = useCallback((ed: AnyEditor, verdict: Extract<PasteClassification, { kind: 'url' }>, choice: PasteChoice) => {
    setPaste(null);
    const block = ed.getTextCursorPosition().block;
    if (choice === 'link') {
      ed.focus();
      return;
    }
    if (choice === 'bookmark') ed.updateBlock(block, { type: 'bookmark', props: { url: verdict.url, fetched: 0 } } as never);
    else if (choice === 'embed') ed.updateBlock(block, { type: 'embed', props: { url: verdict.url } } as never);
    else if (choice === 'mention' && verdict.internal) {
      ed.updateBlock(block, { type: 'paragraph', content: [] } as never);
      ed.setTextCursorPosition(block.id, 'end');
      ed.insertInlineContent([{ type: 'mention', props: { nodeId: verdict.internal.nodeId, title: '' } }, ' ']);
    }
    ed.focus();
  }, []);

  const editor = useCreateBlockNote(
    withCollaboration({
      schema: schema as NookSchema,
      collaboration: {
        fragment,
        user: { name: user.name, color: user.color },
        provider: awareness ? { awareness } : undefined,
        showCursorLabels: 'activity',
      },
      // `xl-multi-column` reads its own section of the dictionary and throws without it.
      dictionary: {
        ...enLocale,
        multi_column: multiColumnLocales.en,
        placeholders: {
          ...enLocale.placeholders,
          default: "Start writing or type '/' for commands",
          heading: 'Heading',
        },
      },
      dropCursor: multiColumnDropCursor,
      tables: { splitCells: true, cellBackgroundColor: true, cellTextColor: true, headers: true },
      extensions: [syntaxHighlighter, BlockShortcutsExtension({ onCopyLink: (id: string) => copyLinkRef.current?.(id) })],
      uploadFile: async (file: File, blockId?: string) => {
        const upload = uploadRef.current;
        if (!upload) return URL.createObjectURL(file);
        const result = await upload(file, blockId);
        // BlockNote hands this straight to `updateBlock`, so it must be a partial block.
        return { props: { url: result.url, name: result.name } };
      },
      // Attachment URLs are already same-origin (`/api/files/{id}`) and authenticated by the
      // session cookie, so nothing has to be rewritten — kept explicit for when that changes.
      resolveFileUrl: async (url: string) => url,
      pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
        const text = event.clipboardData?.getData('text/plain') ?? '';
        const verdict = classifyPastedText(text, { origin: window.location.origin, workspaceId: host.workspaceId });
        if (verdict.kind !== 'url' || !ed.isEditable) return defaultPasteHandler();
        event.preventDefault();
        // Insert the plain link first (like Notion) and offer to convert it.
        ed.createLink(verdict.url, verdict.url);
        const rect = ed.getSelectionBoundingBox();
        pasteRef.current?.({
          url: verdict.url,
          rect: { top: (rect?.bottom ?? 0) + window.scrollY + 6, left: (rect?.left ?? 0) + window.scrollX },
          allowMention: !!verdict.internal,
          allowEmbed: verdict.embeddable || verdict.media === 'video',
          onChoose: (choice) => applyPasteChoice(ed as AnyEditor, verdict, choice),
          onDismiss: () => setPaste(null),
        });
        return true;
      },
    }),
    [schema, fragment, awareness, user.name, user.color],
  );

  pasteRef.current = setPaste;

  const copyLinkToBlock = useCallback(
    (blockId: string) => {
      void copyText(blockLinkUrl(host.pageHref(host.nodeId), blockId)).then((ok) =>
        host.toast(ok ? 'Link to block copied' : 'Could not copy the link'),
      );
    },
    [host],
  );
  copyLinkRef.current = copyLinkToBlock;

  useEffect(() => {
    onEditorReady?.(editor as AnyBlockNoteEditor);
  }, [editor, onEditorReady]);

  useBlockAnchor(editor as AnyEditor, session.synced || session.status === 'local');

  const pluginSlash = usePluginSlashMenuItems();
  const pluginItems = useMemo<DefaultReactSuggestionItem[]>(
    () =>
      pluginSlash.map((item) => ({
        title: item.title,
        subtext: item.subtext,
        aliases: item.aliases,
        group: item.group ?? 'Plugins',
        icon: item.icon as DefaultReactSuggestionItem['icon'],
        onItemClick: () => item.onItemClick(editor as AnyBlockNoteEditor),
      })),
    [pluginSlash, editor],
  );

  const actions = useMemo<SlashActions>(() => {
    const ed = editor as AnyEditor;
    const openMenu = (trigger: string) => {
      const ext = ed.getExtension('suggestionMenu') as { openSuggestionMenu?: (t: string, o?: { deleteTriggerCharacter?: boolean }) => void } | undefined;
      ext?.openSuggestionMenu?.(trigger, { deleteTriggerCharacter: true });
    };
    return {
      openTurnInto: () => setOverlay({ kind: 'turnInto', blockIds: selectedBlockIds(ed) }),
      openColor: () => setOverlay({ kind: 'color', blockIds: selectedBlockIds(ed) }),
      openMoveTo: () => setOverlay({ kind: 'moveTo', blockIds: [] }),
      duplicateBlock: () => void duplicateBlocks(ed, selectedBlockIds(ed)),
      deleteBlock: () => deleteBlocks(ed, selectedBlockIds(ed)),
      copyLinkToBlock: () => copyLinkToBlock(ed.getTextCursorPosition().block.id),
      insertMention: () => openMenu('@'),
      insertDate: () => ed.insertInlineContent([{ type: 'dateMention', props: { date: todayIso(), end: '' } }, ' ']),
      insertInlineEquation: () => ed.insertInlineContent([{ type: 'inlineEquation', content: '' }]),
      insertEmoji: () => openMenu(':'),
    };
  }, [editor, copyLinkToBlock]);

  const DragHandleMenu = useMemo(
    () =>
      createNookDragHandleMenu({
        duplicateBlocks: (ids) => void duplicateBlocks(editor as AnyEditor, ids),
        openTurnInto: (ids) => setOverlay({ kind: 'turnInto', blockIds: ids }),
        copyLinkToBlock,
      }),
    [editor, copyLinkToBlock],
  );

  const titleText = useMemo(() => doc.getText('title'), [doc]);
  const docSynced = session.synced || session.status === 'local';

  return (
    <div className={['nook-editor', className].filter(Boolean).join(' ')} data-readonly={readOnly || undefined}>
      {pageSettings?.locked ? (
        <div role="status" className="nook-editor-banner" data-testid="locked-banner">
          This page is locked — unlock it from the page menu to edit.
        </div>
      ) : readOnly ? (
        <div role="status" className="nook-editor-banner">
          You have view-only access to this page.
        </div>
      ) : null}
      {header ? header({ titleText, focusEditor: () => editor.focus(), readOnly, synced: docSynced }) : null}
      {showTitle && !header ? (
        <TitleEditor
          text={titleText}
          initialTitle={initialTitle}
          onChange={onTitleChange}
          readOnly={readOnly}
          placeholder={titlePlaceholder}
          seedWhen={docSynced}
          autoFocus={autofocusTitle}
          onEnter={() => editor.focus()}
        />
      ) : null}
      <BlockNoteView
        editor={editor}
        theme={theme}
        editable={!readOnly}
        slashMenu={false}
        emojiPicker={false}
        sideMenu={false}
        formattingToolbar={false}
        filePanel={false}
        className="nook-editor-view"
      >
        <SuggestionMenuController
          triggerCharacter="/"
          suggestionMenuComponent={NookSlashMenu}
          getItems={async (query) => filterSuggestionItems(buildSlashItems(editor as AnyEditor, actions, pluginItems), query)}
        />
        <SuggestionMenuController
          triggerCharacter="@"
          getItems={async (query) =>
            mentionMenuItems(
              editor as AnyEditor,
              query,
              { api: host.api, nodeId: host.nodeId, toast: host.toast, createPage: host.createPage },
              { allowCreate: false, allowDates: true },
            )
          }
        />
        <SuggestionMenuController
          triggerCharacter="[["
          getItems={async (query) =>
            mentionMenuItems(
              editor as AnyEditor,
              query,
              { api: host.api, nodeId: host.nodeId, toast: host.toast, createPage: host.createPage },
              { allowCreate: true, allowDates: false },
            )
          }
        />
        <GridSuggestionMenuController
          triggerCharacter=":"
          columns={10}
          minQueryLength={2}
          getItems={async (query) => getDefaultReactEmojiPickerItems(editor, query)}
        />
        <SideMenuController sideMenu={() => <SideMenu dragHandleMenu={DragHandleMenu} />} />
        <FormattingToolbarController formattingToolbar={NookFormattingToolbar} />
        <FilePanelController filePanel={NookFilePanel} />
      </BlockNoteView>
      {overlay?.kind === 'turnInto' ? <TurnIntoPanel editor={editor as AnyEditor} blockIds={overlay.blockIds} onClose={() => setOverlay(null)} /> : null}
      {overlay?.kind === 'color' ? <ColorPanel editor={editor as AnyEditor} blockIds={overlay.blockIds} onClose={() => setOverlay(null)} /> : null}
      {overlay?.kind === 'moveTo' ? (
        <PanelShell title="Move page to" onClose={() => setOverlay(null)} testId="move-to-panel">
          <PagePicker
            placeholder="Move under…"
            onPick={(hit) => {
              setOverlay(null);
              void host.api.nodes
                .update(host.nodeId, { parentId: hit.node.id })
                .then(() => host.toast(`Moved to ${hit.node.title || 'Untitled'}`))
                .catch(() => host.toast('Could not move the page'));
            }}
            onCancel={() => setOverlay(null)}
          />
        </PanelShell>
      ) : null}
      {paste ? <PasteChoicePopover state={paste} /> : null}
    </div>
  );
}
