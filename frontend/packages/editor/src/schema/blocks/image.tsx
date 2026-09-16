import { createImageBlockConfig, imageParse } from '@blocknote/core';
import {
  createReactBlockSpec,
  ImageToExternalHTML,
  ResizableFileBlockWrapper,
  useResolveUrl,
  type ReactCustomBlockRenderProps,
} from '@blocknote/react';
import { ImageIcon } from 'lucide-react';
import { useEffect, useState, type ComponentProps } from 'react';
import { useOptionalEditorHost } from '../../host-context';
import { attachmentIdFromUrl, imageSrcSet } from '../../media/files';

type ImageProps = ReactCustomBlockRenderProps<typeof createImageBlockConfig>;

/** BlockNote's image preview, but uploads render through `thumb?w=` with a responsive srcset. */
function NookImagePreview(props: Omit<ImageProps, 'contentRef'>) {
  const host = useOptionalEditorHost();
  const url = props.block.props.url;
  const resolved = useResolveUrl(url);
  const attachmentId = attachmentIdFromUrl(url);
  const nameSuggestsSvg = props.block.props.name.toLowerCase().endsWith('.svg');
  const [isSvg, setIsSvg] = useState(nameSuggestsSvg);

  useEffect(() => {
    setIsSvg(nameSuggestsSvg);
    if (!host || !attachmentId || nameSuggestsSvg) return;
    let live = true;
    host.api.files.meta(attachmentId).then((file) => {
      if (live && file.mime.toLowerCase() === 'image/svg+xml') setIsSvg(true);
    }).catch(() => {});
    return () => { live = false; };
  }, [attachmentId, host, nameSuggestsSvg]);

  const responsive = host && !isSvg ? imageSrcSet(host.api, url) : null;
  const src = resolved.loadingState === 'loading' ? url : resolved.downloadUrl;
  const previewSrc = host && attachmentId && isSvg ? host.api.files.previewUrl(attachmentId) : (responsive?.src ?? src);
  return (
    <img
      className="bn-visual-media"
      src={previewSrc}
      srcSet={responsive?.srcSet}
      sizes={responsive?.sizes}
      alt={props.block.props.name || ''}
      width={props.block.props.previewWidth}
      contentEditable={false}
      draggable={false}
      loading="lazy"
    />
  );
}

function NookImageBlock(props: ImageProps) {
  return (
    <ResizableFileBlockWrapper {...(props as unknown as ComponentProps<typeof ResizableFileBlockWrapper>)} buttonIcon={<ImageIcon size={24} />}>
      <NookImagePreview {...props} />
    </ResizableFileBlockWrapper>
  );
}

export const ImageBlock = createReactBlockSpec(createImageBlockConfig, (config) => ({
  meta: { fileBlockAccept: ['image/*'] },
  render: NookImageBlock,
  parse: imageParse(config),
  toExternalHTML: ImageToExternalHTML,
  runsBefore: ['file'],
}));
