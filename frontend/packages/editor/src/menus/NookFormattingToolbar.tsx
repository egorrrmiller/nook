import {
  BasicTextStyleButton,
  BlockTypeSelect,
  ColorStyleButton,
  CreateLinkButton,
  FileCaptionButton,
  FileDeleteButton,
  FileDownloadButton,
  FilePreviewButton,
  FileRenameButton,
  FileReplaceButton,
  FormattingToolbar,
  NestBlockButton,
  TableCellMergeButton,
  TextAlignButton,
  UnnestBlockButton,
  useBlockNoteEditor,
  useComponentsContext,
} from '@blocknote/react';
import { SigmaIcon } from 'lucide-react';
import type { AnyEditor } from '../types';

/** Wraps the selected text in an inline equation (Notion's ⌘⇧E). */
function InlineEquationButton() {
  const Components = useComponentsContext()!;
  const editor = useBlockNoteEditor() as AnyEditor;
  if (!('inlineEquation' in editor.schema.inlineContentSchema)) return null;
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      label="Inline equation"
      mainTooltip="Inline equation"
      icon={<SigmaIcon size={16} />}
      onClick={() => {
        const text = editor.getSelectedText();
        editor.insertInlineContent([{ type: 'inlineEquation', content: text }, ' ']);
      }}
    />
  );
}

/** BlockNote's default toolbar minus comments, plus the inline-equation button. */
export function NookFormattingToolbar() {
  return (
    <FormattingToolbar>
      <BlockTypeSelect key="blockTypeSelect" />
      <TableCellMergeButton key="tableCellMerge" />
      <FileCaptionButton key="fileCaption" />
      <FileReplaceButton key="fileReplace" />
      <FileRenameButton key="fileRename" />
      <FileDeleteButton key="fileDelete" />
      <FileDownloadButton key="fileDownload" />
      <FilePreviewButton key="filePreview" />
      <BasicTextStyleButton basicTextStyle="bold" key="bold" />
      <BasicTextStyleButton basicTextStyle="italic" key="italic" />
      <BasicTextStyleButton basicTextStyle="underline" key="underline" />
      <BasicTextStyleButton basicTextStyle="strike" key="strike" />
      <BasicTextStyleButton basicTextStyle="code" key="code" />
      <TextAlignButton textAlignment="left" key="alignLeft" />
      <TextAlignButton textAlignment="center" key="alignCenter" />
      <TextAlignButton textAlignment="right" key="alignRight" />
      <ColorStyleButton key="colors" />
      <NestBlockButton key="nest" />
      <UnnestBlockButton key="unnest" />
      <CreateLinkButton key="link" />
      <InlineEquationButton key="inlineEquation" />
    </FormattingToolbar>
  );
}
