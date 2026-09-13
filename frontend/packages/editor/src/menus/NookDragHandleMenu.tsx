import { SideMenuExtension } from '@blocknote/core/extensions';
import {
  BlockColorsItem,
  RemoveBlockItem,
  TableColumnHeaderItem,
  TableRowHeaderItem,
  useBlockNoteEditor,
  useComponentsContext,
  useExtensionState,
} from '@blocknote/react';
import type { AnyEditor } from '../types';

export interface DragHandleActions {
  duplicateBlocks: (ids: string[]) => void;
  openTurnInto: (ids: string[]) => void;
  copyLinkToBlock: (id: string) => void;
}

/**
 * Drag-handle menu (⋮⋮): delete, duplicate, turn into, colour, copy link to block — plus
 * BlockNote's table header toggles when the block is a table.
 */
export function createNookDragHandleMenu(actions: DragHandleActions) {
  return function NookDragHandleMenu() {
    const Components = useComponentsContext()!;
    const editor = useBlockNoteEditor() as AnyEditor;
    const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });

    if (!block) return null;
    const selected = editor.getSelection()?.blocks ?? [];
    const ids = selected.some((b) => b.id === block.id) ? selected.map((b) => b.id) : [block.id];

    return (
      <Components.Generic.Menu.Dropdown className="bn-menu-dropdown bn-drag-handle-menu">
        <RemoveBlockItem>Delete</RemoveBlockItem>
        <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => actions.duplicateBlocks(ids)}>
          Duplicate
        </Components.Generic.Menu.Item>
        <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => actions.openTurnInto(ids)}>
          Turn into
        </Components.Generic.Menu.Item>
        <BlockColorsItem>Colors</BlockColorsItem>
        <Components.Generic.Menu.Item className="bn-menu-item" onClick={() => actions.copyLinkToBlock(block.id)}>
          Copy link to block
        </Components.Generic.Menu.Item>
        <TableRowHeaderItem>Header row</TableRowHeaderItem>
        <TableColumnHeaderItem>Header column</TableColumnHeaderItem>
      </Components.Generic.Menu.Dropdown>
    );
  };
}
