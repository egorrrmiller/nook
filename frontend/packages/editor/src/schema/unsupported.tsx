import type { BlockSpecs, InlineContentSpecs, PropSchema } from '@blocknote/core';
import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react';
import { Button } from '@nook/ui';
import * as Y from 'yjs';

type UnknownSpecs = {
  blocks: BlockSpecs;
  inlineContent: InlineContentSpecs;
};

type UnknownDefinition = {
  content: 'inline' | 'none' | 'plain';
  propSchema: PropSchema;
};

/**
 * Build read/delete-only specs for types this client does not know yet.
 *
 * BlockNote has no wildcard node in its schema. Registering these specs before
 * y-prosemirror binds the document is therefore important: an unknown XML
 * element would otherwise be treated as an invalid ProseMirror node and
 * removed from the shared Y.Doc.
 */
export function unsupportedSpecsFromDocument(
  doc: Y.Doc,
  knownBlockTypes: ReadonlySet<string>,
  knownInlineTypes: ReadonlySet<string>,
): UnknownSpecs {
  const blockTypes = new Map<string, UnknownDefinition>();
  const inlineTypes = new Map<string, PropSchema>();
  const root = doc.getXmlFragment('document');

  for (const child of root.toArray()) {
    if (child instanceof Y.XmlElement)
      collectBlockTypes(child, knownBlockTypes, blockTypes, inlineTypes, knownInlineTypes);
  }

  const blocks: BlockSpecs = {};
  for (const [type, definition] of blockTypes)
    blocks[type] = unsupportedBlockSpec(type, definition) as never;

  const inlineContent: InlineContentSpecs = {} as InlineContentSpecs;
  for (const [type, propSchema] of inlineTypes)
    inlineContent[type] = unsupportedInlineSpec(type, propSchema) as never;

  return { blocks, inlineContent };
}

/** Same fallback for a stored blocks projection used when collaboration is offline. */
export function unsupportedSpecsFromBlocks(
  blocks: readonly UnknownBlockJson[],
  knownBlockTypes: ReadonlySet<string>,
  knownInlineTypes: ReadonlySet<string>,
): UnknownSpecs {
  const blockTypes = new Map<string, UnknownDefinition>();
  const inlineTypes = new Map<string, PropSchema>();
  for (const block of blocks)
    collectJsonBlockTypes(block, knownBlockTypes, knownInlineTypes, blockTypes, inlineTypes);

  const result: UnknownSpecs = { blocks: {}, inlineContent: {} as InlineContentSpecs };
  for (const [type, definition] of blockTypes)
    result.blocks[type] = unsupportedBlockSpec(type, definition) as never;
  for (const [type, propSchema] of inlineTypes)
    result.inlineContent[type] = unsupportedInlineSpec(type, propSchema) as never;
  return result;
}

type UnknownBlockJson = {
  type: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: readonly UnknownBlockJson[];
};

function collectBlockTypes(
  node: Y.XmlElement,
  knownBlockTypes: ReadonlySet<string>,
  blocks: Map<string, UnknownDefinition>,
  inlineTypes: Map<string, PropSchema>,
  knownInlineTypes: ReadonlySet<string>,
): void {
  if (node.nodeName === 'blockGroup') {
    for (const child of node.toArray()) {
      if (child instanceof Y.XmlElement)
        collectBlockTypes(child, knownBlockTypes, blocks, inlineTypes, knownInlineTypes);
    }
    return;
  }

  if (node.nodeName !== 'blockContainer') return;
  const content = node
    .toArray()
    .find((child): child is Y.XmlElement => child instanceof Y.XmlElement);
  if (!content) return;

  if (!knownBlockTypes.has(content.nodeName)) {
    blocks.set(content.nodeName, {
      content: hasInlineContent(content) ? 'inline' : 'none',
      propSchema: propSchemaFromAttributes(content),
    });
  }
  collectInlineTypes(content, knownBlockTypes, knownInlineTypes, inlineTypes);

  for (const child of node.toArray()) {
    if (child instanceof Y.XmlElement && child.nodeName === 'blockGroup') {
      collectBlockTypes(child, knownBlockTypes, blocks, inlineTypes, knownInlineTypes);
    }
  }
}

function collectJsonBlockTypes(
  block: UnknownBlockJson,
  knownBlockTypes: ReadonlySet<string>,
  knownInlineTypes: ReadonlySet<string>,
  blocks: Map<string, UnknownDefinition>,
  inlineTypes: Map<string, PropSchema>,
): void {
  if (!knownBlockTypes.has(block.type)) {
    blocks.set(block.type, {
      content: Array.isArray(block.content)
        ? 'inline'
        : typeof block.content === 'string'
          ? 'plain'
          : 'none',
      propSchema: propSchemaFromJsonProps(block.props),
    });
  }
  if (Array.isArray(block.content))
    collectJsonInlineTypes(block.content, knownBlockTypes, knownInlineTypes, inlineTypes);
  for (const child of block.children ?? [])
    collectJsonBlockTypes(child, knownBlockTypes, knownInlineTypes, blocks, inlineTypes);
}

function collectJsonInlineTypes(
  content: readonly unknown[],
  knownBlockTypes: ReadonlySet<string>,
  knownInlineTypes: ReadonlySet<string>,
  result: Map<string, PropSchema>,
): void {
  for (const item of content) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const inline = item as { type?: unknown; props?: Record<string, unknown>; content?: unknown };
    if (
      typeof inline.type === 'string' &&
      inline.type !== 'text' &&
      inline.type !== 'link' &&
      !knownBlockTypes.has(inline.type) &&
      !knownInlineTypes.has(inline.type)
    ) {
      result.set(inline.type, propSchemaFromJsonProps(inline.props));
    }
    if (Array.isArray(inline.content))
      collectJsonInlineTypes(inline.content, knownBlockTypes, knownInlineTypes, result);
  }
}

function collectInlineTypes(
  node: Y.XmlElement,
  knownBlockTypes: ReadonlySet<string>,
  knownInlineTypes: ReadonlySet<string>,
  result: Map<string, PropSchema>,
): void {
  for (const child of node.toArray()) {
    if (!(child instanceof Y.XmlElement)) continue;
    if (
      !isStructuralElement(child.nodeName) &&
      !knownBlockTypes.has(child.nodeName) &&
      !knownInlineTypes.has(child.nodeName)
    ) {
      result.set(child.nodeName, propSchemaFromAttributes(child));
    }
    collectInlineTypes(child, knownBlockTypes, knownInlineTypes, result);
  }
}

function hasInlineContent(node: Y.XmlElement): boolean {
  return node
    .toArray()
    .some(
      (child) =>
        child instanceof Y.XmlText ||
        (child instanceof Y.XmlElement && !isStructuralElement(child.nodeName)),
    );
}

function isStructuralElement(name: string): boolean {
  return (
    name === 'blockGroup' ||
    name === 'blockContainer' ||
    name === 'table' ||
    name === 'tableRow' ||
    name === 'tableCell' ||
    name === 'tableHeader'
  );
}

function propSchemaFromAttributes(node: Y.XmlElement): PropSchema {
  const schema: PropSchema = {};
  for (const [name, value] of Object.entries(node.getAttributes())) {
    let type: 'string' | 'number' | 'boolean' = 'string';
    if (typeof value === 'boolean') type = 'boolean';
    else if (typeof value === 'number') type = 'number';
    schema[name] = { default: undefined, type };
  }
  return schema;
}

function propSchemaFromJsonProps(props: Record<string, unknown> | undefined): PropSchema {
  const schema: PropSchema = {};
  for (const [name, value] of Object.entries(props ?? {})) {
    let type: 'string' | 'number' | 'boolean' = 'string';
    if (typeof value === 'boolean') type = 'boolean';
    else if (typeof value === 'number') type = 'number';
    schema[name] = { default: undefined, type };
  }
  return schema;
}

function unsupportedBlockSpec(type: string, definition: UnknownDefinition) {
  const config = { type, propSchema: definition.propSchema, content: definition.content } as const;
  return createReactBlockSpec(
    config as never,
    {
      render: ({ block, editor, contentRef }: any) => (
        <div
          role="alert"
          data-unsupported-block={type}
          style={{
            border: '1px solid #e06c75',
            borderRadius: 6,
            padding: '10px 12px',
            margin: '4px 0',
            color: '#b42318',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong>Не удалось отрисовать блок</strong>
            <code>{type}</code>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => editor.removeBlocks([block.id])}
            >
              Удалить блок
            </Button>
          </div>
          {definition.content !== 'none' ? (
            <div ref={contentRef} style={{ marginTop: 8, color: 'inherit' }} />
          ) : null}
        </div>
      ),
    } as never,
  )();
}

function unsupportedInlineSpec(type: string, propSchema: PropSchema) {
  const config = { type, propSchema, content: 'plain' } as const;
  return createReactInlineContentSpec(
    config as never,
    {
      render: ({ contentRef }: any) => (
        <span
          role="alert"
          data-unsupported-inline={type}
          style={{ color: '#b42318', background: '#fef3f2', padding: '1px 4px' }}
        >
          <span>Ошибка блока: {type}</span>
          <span ref={contentRef} />
        </span>
      ),
    } as never,
  );
}
