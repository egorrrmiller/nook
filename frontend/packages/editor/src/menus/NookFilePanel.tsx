import { EmbedTab, FilePanel, UploadTab, useBlockNoteEditor, type FilePanelProps } from '@blocknote/react';
import { useState } from 'react';
import { useEditorHost } from '../host-context';
import { UrlInput } from '../schema/blocks/bookmark';
import type { AnyEditor } from '../types';

/** "Save to Nook": fetches the URL server-side (§8 `POST /api/files/from-url`) and stores it. */
function FromUrlTab({ blockId }: FilePanelProps) {
  const host = useEditorHost();
  const editor = useBlockNoteEditor() as AnyEditor;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <div className="nook-file-panel__tab">
      <UrlInput
        placeholder="Paste a file URL…"
        buttonLabel={busy ? 'Saving…' : 'Save to Nook'}
        testId="from-url-tab"
        onSubmit={(url) => {
          setBusy(true);
          setError(null);
          host.api.files
            .fromUrl({ url, nodeId: host.nodeId, blockId })
            .then((attachment) => {
              editor.updateBlock(blockId, { props: { url: attachment.url, name: attachment.filename } } as never);
            })
            .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not fetch the file'))
            .finally(() => setBusy(false));
        }}
      />
      {error ? <p className="nook-file-panel__error">{error}</p> : null}
    </div>
  );
}

/** BlockNote's file panel with an extra server-side "from URL" tab. */
export function NookFilePanel(props: FilePanelProps) {
  const editor = useBlockNoteEditor() as AnyEditor;
  const [loading, setLoading] = useState(false);
  const tabs = [
    ...(editor.uploadFile ? [{ name: 'Upload', tabPanel: <UploadTab blockId={props.blockId} setLoading={setLoading} /> }] : []),
    { name: 'Embed link', tabPanel: <EmbedTab blockId={props.blockId} /> },
    { name: 'From URL', tabPanel: <FromUrlTab blockId={props.blockId} /> },
  ];
  return <FilePanel {...props} tabs={tabs} defaultOpenTab={tabs[0]?.name ?? 'Upload'} key={loading ? 'loading' : 'idle'} />;
}
