import { expect, test, type Page } from '@playwright/test';

const SHOTS = process.env.NOOK_E2E_SHOTS ?? 'test-results/editor';

const editor = (page: Page) => page.locator('.bn-editor').first();

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@localhost');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/w\//);
}

async function newPage(page: Page, title: string) {
  await page.getByTestId('new-page').click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/p\/[^/]+$/);
  await page.getByTestId('page-title').fill(title);
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
}

/**
 * Dispatches a real paste with the given plain text. The e2e project compiles without DOM libs,
 * so the browser globals are reached through a typed view of `globalThis`.
 */
interface PasteGlobals {
  DataTransfer: new () => { setData(format: string, data: string): void };
  ClipboardEvent: new (type: string, init: Record<string, unknown>) => Event;
  document: { querySelector(selector: string): { dispatchEvent(event: Event): boolean } | null };
}

async function pastePlainText(page: Page, text: string) {
  await page.evaluate((payload) => {
    const g = globalThis as unknown as PasteGlobals;
    const dt = new g.DataTransfer();
    dt.setData('text/plain', payload);
    const event = new g.ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    g.document.querySelector('.bn-editor')?.dispatchEvent(event);
  }, text);
}

/** Types `/query` and picks the first suggestion. */
async function slash(page: Page, query: string, expected: RegExp) {
  await page.keyboard.type(`/${query}`);
  const menu = page.locator('#bn-suggestion-menu');
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('option').first()).toContainText(expected);
  await page.keyboard.press('Enter');
}

test.describe('editor', () => {
  test('slash menu inserts callout, columns, table of contents and a bookmark', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Blocks tour');

    await page.keyboard.type('# Heading one\n');
    await expect(editor(page).locator('[data-content-type="heading"]')).toHaveCount(1);

    await slash(page, 'callout', /Callout/);
    await page.keyboard.type('Callouts make things pop.');
    await expect(page.getByTestId('callout-block')).toBeVisible();

    await page.keyboard.press('Enter');
    await slash(page, 'toc', /Table of contents/);
    await expect(page.getByTestId('toc-block')).toContainText('Heading one');

    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('> Quotes keep their own style\n');
    await page.keyboard.type('[] Ship the editor\n');

    await slash(page, 'bookmark', /Web bookmark/);
    await page.getByTestId('bookmark-input').getByRole('textbox').fill('https://www.blocknotejs.org');
    await page.getByTestId('bookmark-input').getByRole('button').click();
    await expect(page.getByTestId('bookmark-block')).toContainText('BlockNote');

    // The bookmark form took focus out of the editor; put the cursor back at the end.
    await editor(page).click();
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await slash(page, 'two col', /Two Columns/);
    await expect(editor(page).locator('[data-content-type="columnList"], [data-node-type="columnList"]')).toHaveCount(1);
    await page.keyboard.type('Columns, too');

    await page.waitForTimeout(400); // let the suggestion menu finish fading out
    await page.screenshot({ path: `${SHOTS}/blocks.png`, fullPage: true });
  });

  test('[[ creates a page mention', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Mentions');

    await page.keyboard.type('See [[Reading');
    const menu = page.locator('#bn-suggestion-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText('Reading list');
    await page.screenshot({ path: `${SHOTS}/mention-menu.png` });
    await page.keyboard.press('Enter');

    const mention = page.getByTestId('mention').first();
    await expect(mention).toContainText('Reading list');
    await expect(mention).toHaveAttribute('href', /\/w\/[^/]+\/p\/[^/]+$/);
  });

  test('[[New title]] creates the page and mentions it', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Wiki links');

    await page.keyboard.type('[[Brand new subpage');
    const menu = page.locator('#bn-suggestion-menu');
    await expect(menu).toContainText('Create page');
    await menu.getByRole('option').filter({ hasText: 'Create page' }).click();

    await expect(page.getByTestId('mention').first()).toContainText('Brand new subpage');
    // The new page is a child of the current one: expanding it in the tree must reveal it
    // (proving the app's query cache was invalidated by the create).
    const parentItem = page.getByTestId('sidebar').getByTestId('tree-item').filter({ hasText: 'Wiki links' }).first();
    await parentItem.getByRole('button', { name: /expand/i }).click();
    await expect(page.getByTestId('sidebar')).toContainText('Brand new subpage');
  });

  test('pasting markdown produces blocks', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Paste markdown');

    await pastePlainText(page, ['## Pasted heading', '', '- first', '- second', '', '> quoted'].join('\n'));

    await expect(editor(page).locator('[data-content-type="heading"]')).toContainText('Pasted heading');
    await expect(editor(page).locator('[data-content-type="bulletListItem"]')).toHaveCount(2);
    await expect(editor(page).locator('[data-content-type="quote"]')).toContainText('quoted');
  });

  test('pasting a bare URL offers bookmark / embed / plain link', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Paste url');

    await pastePlainText(page, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

    const choice = page.getByTestId('paste-choice');
    await expect(choice).toBeVisible();
    await expect(choice).toContainText('Create embed');
    await choice.getByRole('menuitem', { name: /Create bookmark/ }).click();
    await expect(page.getByTestId('bookmark-block')).toBeVisible();
  });

  test('uploading an image renders it in the editor', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Image upload');

    await slash(page, 'image', /Image/);
    await editor(page).locator('.bn-add-file-button').first().click();
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'pixel.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    });

    const image = editor(page).locator('img.bn-visual-media');
    await expect(image).toBeVisible({ timeout: 10_000 });
    await expect(image).toHaveAttribute('srcset', /\/api\/files\/[^ ]+\/thumb\?w=/);
  });

  test('a block anchor scrolls to the block and highlights it', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Anchors');
    await page.keyboard.type('First block\nSecond block\nTarget block');

    const target = editor(page).locator('.bn-block-outer').last();
    const blockId = await target.getAttribute('data-id');
    expect(blockId).toBeTruthy();

    // A same-document hash change, like clicking a "copy link to block" URL in the app.
    await page.evaluate((id) => {
      (globalThis as unknown as { location: { hash: string } }).location.hash = `b-${id}`;
    }, blockId);
    // The flash is driven by an injected CSS rule (ProseMirror rewrites class attributes freely).
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const g = globalThis as unknown as {
            getComputedStyle: (e: object) => { animationName: string };
            document: { querySelector(sel: string): object | null };
          };
          const el = g.document.querySelector(`.bn-block-outer[data-id="${id}"]`);
          return el ? g.getComputedStyle(el).animationName : 'none';
        }, blockId),
      )
      .toBe('nook-block-flash');
  });

  test('history: save a version, edit, see the diff and restore', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'History demo');
    await page.keyboard.type('The quick brown fox');
    // The mock mirrors the document like the collab service would (debounced).
    await page.waitForTimeout(800);

    await page.getByTestId('toggle-inspector').click();
    await page.getByTestId('inspector-tab-history').click();
    const panel = page.getByTestId('history-panel');
    await expect(panel).toBeVisible();

    await panel.getByTestId('save-version').click();
    await expect(panel.getByTestId('version-item').first()).toContainText('Saved');

    // Click inside the existing paragraph so the edit lands in the same block (inline diff).
    await editor(page).locator('[data-content-type="paragraph"]').filter({ hasText: 'The quick brown fox' }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' jumps over the lazy dog');
    await page.waitForTimeout(800);
    await panel.getByTestId('save-version').click();

    await expect(panel.getByTestId('version-item')).toHaveCount(2);
    await panel.getByTestId('diff-tab').click();
    const diff = panel.getByTestId('version-diff');
    await expect(diff).toBeVisible();
    await expect(diff.getByTestId('diff-changed')).toContainText('jumps over the lazy dog');
    await page.screenshot({ path: `${SHOTS}/history-diff.png`, fullPage: true });

    await panel.getByTestId('restore-version').click();
    await panel.getByTestId('restore-confirm-yes').click();
    await expect(panel.getByTestId('version-item').first()).toContainText('Before restore');
  });

  test('the Info tab counts words live and the inspector tabs switch', async ({ page }) => {
    await signIn(page);
    await newPage(page, 'Word count');
    await page.keyboard.type('one two three four five');

    await page.getByTestId('toggle-inspector').click();
    await expect(page.getByTestId('page-info')).toBeVisible();
    await expect(page.getByTestId('info-words')).toHaveText('5');

    await page.getByTestId('inspector-tab-backlinks').click();
    await expect(page.getByTestId('stub-backlinks-panel')).toBeAttached();
  });
});
