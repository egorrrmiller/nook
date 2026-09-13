/**
 * Block JSON shared by backend, collab and frontend (contracts.md §4).
 * This is BlockNote's document shape; we keep it loose on purpose so custom block
 * types registered later by plugins pass through untouched.
 */
export interface Block {
  id: string;
  type: string;
  props: Record<string, unknown>;
  content?: unknown;
  children: Block[];
}

/** A block as accepted on input: everything optional except `type` (ids are generated when missing). */
export interface PartialBlockInput {
  id?: string;
  type?: string;
  props?: Record<string, unknown>;
  content?: unknown;
  children?: PartialBlockInput[];
}

export type DocOp =
  | { op: "insert"; blocks: PartialBlockInput[]; referenceBlockId?: string; placement?: "before" | "after" | "end" }
  | { op: "update"; blockId: string; block: PartialBlockInput }
  | { op: "remove"; blockIds: string[] }
  | { op: "replace"; blockId: string; blocks: PartialBlockInput[] }
  | { op: "setTitle"; title: string };

export type ConvertRequest =
  | { from: "markdown" | "html"; to: "blocks"; content: string }
  | { from: "blocks"; to: "markdown" | "html"; blocks: PartialBlockInput[] };
