import { createReactBlockSpec, FileBlockWrapper, useResolveUrl, type ReactCustomBlockRenderProps } from '@blocknote/react';
import { useEffect, useState, type ComponentProps } from 'react';
import { DownloadIcon, FileTextIcon } from 'lucide-react';
import { useEditorHost } from '../../host-context';
import { attachmentIdFromUrl, formatBytes } from '../../media/files';

export const pdfConfig = {
  type: 'pdf',
  propSchema: {
    backgroundColor: { default: 'default' },
    name: { default: '' },
    url: { default: '' },
    caption: { default: '' },
    showPreview: { default: true },
    previewHeight: { default: 560, type: 'number' },
    pages: { default: 0, type: 'number' },
    size: { default: 0, type: 'number' },
  },
  content: 'none',
} as const;

function PdfPreview({ block, editor }: Omit<ReactCustomBlockRenderProps<typeof pdfConfig>, 'contentRef'>) {
  const host = useEditorHost();
  const resolved = useResolveUrl(block.props.url);
  const [meta, setMeta] = useState<{ pages?: number; size?: number } | null>(null);
  const attachmentId = attachmentIdFromUrl(block.props.url);

  useEffect(() => {
    if (!attachmentId || block.props.pages) return;
    let live = true;
    host.api.files
      .meta(attachmentId)
      .then((a) => {
        if (!live) return;
        setMeta({ pages: a.meta.pages, size: a.size });
        if (a.meta.pages || a.size) {
          editor.updateBlock(block.id, { props: { pages: a.meta.pages ?? 0, size: a.size, name: block.props.name || a.filename } });
        }
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attachmentId, block.props.pages, host.api]);

  const src = resolved.loadingState === 'loaded' ? resolved.downloadUrl : block.props.url;
  const pages = block.props.pages || meta?.pages;
  const size = block.props.size || meta?.size;
  return (
    <div className="nook-pdf" data-testid="pdf-block">
      <iframe className="nook-pdf__frame" src={`${src}#toolbar=1&view=FitH`} title={block.props.name || 'PDF'} style={{ height: block.props.previewHeight }} />
      <div className="nook-pdf__bar">
        <FileTextIcon size={14} />
        <span className="nook-pdf__name">{block.props.name || 'document.pdf'}</span>
        {pages ? <span className="nook-pdf__meta">{pages} page{pages === 1 ? '' : 's'}</span> : null}
        {size ? <span className="nook-pdf__meta">{formatBytes(size)}</span> : null}
        <a className="nook-pdf__download" href={attachmentId ? host.api.files.url(attachmentId, { download: true }) : src} download title="Download">
          <DownloadIcon size={14} />
        </a>
      </div>
    </div>
  );
}

function PdfView(props: ReactCustomBlockRenderProps<typeof pdfConfig>) {
  return (
    <FileBlockWrapper {...(props as unknown as ComponentProps<typeof FileBlockWrapper>)} buttonIcon={<FileTextIcon size={24} />}>
      <PdfPreview {...props} />
    </FileBlockWrapper>
  );
}

/** PDF viewer block (`<iframe>` of `/api/files/{id}`), with page count and size from the attachment meta. */
export const PdfBlock = createReactBlockSpec(pdfConfig, {
  meta: { fileBlockAccept: ['application/pdf', '.pdf'] },
  render: PdfView,
  toExternalHTML: ({ block }) => (
    <a href={block.props.url} data-pdf>
      {block.props.name || block.props.url}
    </a>
  ),
  parse: (el) => {
    if (el.tagName === 'A' && el.hasAttribute('data-pdf')) return { url: el.getAttribute('href') ?? '', name: el.textContent ?? '' };
    return undefined;
  },
});
