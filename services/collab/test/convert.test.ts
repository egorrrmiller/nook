import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { allText, internal, startStack, type TestStack } from "./helpers.js";

let stack: TestStack;

beforeAll(async () => {
  stack = await startStack();
});

afterAll(async () => {
  await stack.stop();
});

const markdown = [
  "# Title",
  "",
  "Some **bold** and *italic* text.",
  "",
  "## Lists",
  "",
  "- first",
  "- second",
  "",
  "1. one",
  "2. two",
  "",
  "```js",
  "console.log(1);",
  "```",
  "",
].join("\n");

describe("POST /internal/convert", () => {
  it("(f) markdown → blocks → markdown round trip keeps headings, lists and code", async () => {
    const toBlocks = await internal(stack, "POST", "/internal/convert", { from: "markdown", to: "blocks", content: markdown });
    expect(toBlocks.status).toBe(200);
    const blocks = toBlocks.json.result as Array<{ type: string; props: Record<string, unknown>; id: string }>;
    const types = blocks.map((b) => b.type);
    expect(types).toEqual(["heading", "paragraph", "heading", "bulletListItem", "bulletListItem", "numberedListItem", "numberedListItem", "codeBlock"]);
    expect(blocks[0]!.props.level).toBe(1);
    expect(blocks[2]!.props.level).toBe(2);
    expect(blocks[7]!.props.language).toBe("js");
    expect(allText(blocks as never)).toContain("console.log(1);");
    for (const b of blocks) expect(b.id).toMatch(/^[0-9a-f-]{36}$/);

    const toMd = await internal(stack, "POST", "/internal/convert", { from: "blocks", to: "markdown", blocks });
    expect(toMd.status).toBe(200);
    const md = toMd.json.result as string;
    expect(md).toContain("# Title");
    expect(md).toContain("## Lists");
    expect(md).toMatch(/\*\*bold\*\*/);
    expect(md).toMatch(/[-*] first\n[-*] second/);
    expect(md).toMatch(/1\. one\n2\. two/);
    expect(md).toContain("```js\nconsole.log(1);\n```");

    const again = await internal(stack, "POST", "/internal/convert", { from: "markdown", to: "blocks", content: md });
    expect((again.json.result as Array<{ type: string }>).map((b) => b.type)).toEqual(types);
  });

  it("html ↔ blocks", async () => {
    const toBlocks = await internal(stack, "POST", "/internal/convert", {
      from: "html",
      to: "blocks",
      content: "<h1>Hello</h1><p>World <strong>bold</strong></p><ul><li>a</li><li>b</li></ul>",
    });
    expect(toBlocks.status).toBe(200);
    const blocks = toBlocks.json.result as Array<{ type: string }>;
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "bulletListItem", "bulletListItem"]);

    const full = await internal(stack, "POST", "/internal/convert", { from: "blocks", to: "html", blocks });
    expect(full.status).toBe(200);
    expect(full.json.result).toContain("Hello");
    expect(full.json.result).toContain("<strong>bold</strong>");

    const lossy = await internal(stack, "POST", "/internal/convert", { from: "blocks", to: "html", blocks, htmlMode: "lossy" });
    expect(lossy.status).toBe(200);
    expect(lossy.json.result).toMatch(/<h1>Hello<\/h1>/);
    expect(lossy.json.result).toMatch(/<ul>\s*<li>/);
  });

  it("rejects unsupported conversions and bad payloads", async () => {
    expect((await internal(stack, "POST", "/internal/convert", { from: "markdown", to: "html", content: "x" })).status).toBe(400);
    expect((await internal(stack, "POST", "/internal/convert", { from: "blocks", to: "markdown", blocks: "x" })).status).toBe(400);
    const res = await fetch(`${stack.collab.internalUrl}/internal/convert`, {
      method: "POST",
      headers: { "X-Internal-Token": "test-internal-token", "Content-Type": "application/json" },
      body: "{not json",
    });
    expect(res.status).toBe(400);
  });
});
