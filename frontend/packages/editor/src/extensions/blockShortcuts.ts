import { createExtension } from '@blocknote/core';
import { NodeSelection } from 'prosemirror-state';
import type { AnyEditor } from '../types';
import { duplicateBlocks, selectedBlockIds } from './blockCommands';

export interface BlockShortcutOptions {
  onCopyLink?: (blockId: string) => void;
}

/**
 * Notion's block-level shortcuts that BlockNote does not ship:
 * ⌘D duplicate, ⌘⇧↑/↓ move, Esc select the current block, ⌘⇧L copy link to block.
 * (Tab / Shift-Tab nesting and the arrow-key selection are BlockNote defaults.)
 */
export const BlockShortcutsExtension = createExtension(
  ({ editor, options }: { editor: AnyEditor; options: BlockShortcutOptions | undefined }) => ({
    key: 'nookBlockShortcuts',
    keyboardShortcuts: {
      'Mod-d': () => {
        duplicateBlocks(editor, selectedBlockIds(editor));
        return true;
      },
      'Mod-Shift-ArrowUp': () => {
        editor.moveBlocksUp();
        return true;
      },
      'Mod-Shift-ArrowDown': () => {
        editor.moveBlocksDown();
        return true;
      },
      'Mod-Shift-l': () => {
        const id = editor.getTextCursorPosition().block.id;
        options?.onCopyLink?.(id);
        return true;
      },
      Escape: () => {
        const view = editor.prosemirrorView;
        if (!view) return false;
        const { state } = view;
        if (state.selection instanceof NodeSelection) return false;
        const $from = state.selection.$from;
        // Depth 1 is the block-content node's parent (`blockContainer`).
        for (let d = $from.depth; d > 0; d--) {
          const node = $from.node(d);
          if (node.type.name === 'blockContainer') {
            view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, $from.before(d))));
            return true;
          }
        }
        return false;
      },
    },
  }),
);
