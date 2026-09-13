import { expect, test, type Browser, type Page } from '@playwright/test';

const EMAIL = process.env.NOOK_E2E_EMAIL ?? 'owner@localhost';
const PASSWORD = process.env.NOOK_E2E_PASSWORD ?? 'change-me';
const COLLAB_INTERNAL = process.env.NOOK_COLLAB_INTERNAL ?? 'http://127.0.0.1:1235';
const INTERNAL_TOKEN = process.env.NOOK_INTERNAL_TOKEN ?? '';
const SHOTS = process.env.NOOK_E2E_SHOTS ?? 'test-results';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/w\//);
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

// BlockNote puts contenteditable on .bn-editor itself (it is the ProseMirror root), not on a descendant.
const editor = (page: Page) => page.locator('.bn-editor').first();

async function openAsSecondDevice(browser: Browser, url: string) {
  const ctx = await browser.newContext(); // fresh cookies = a second device of the same user
  const page = await ctx.newPage();
  await signIn(page);
  await page.goto(url);
  await expect(page.getByTestId('page-view')).toBeVisible();
  await expect(editor(page)).toBeVisible();
  return { ctx, page };
}

test('one user, two devices: edits converge both ways; server-side ops reach both; state persists on the collab server', async ({ page, browser }) => {
  test.skip(!INTERNAL_TOKEN, 'NOOK_INTERNAL_TOKEN not set');
  const stamp = Date.now().toString(36);

  // Device A: sign in, create a page, give it a title, type a paragraph.
  await signIn(page);
  await page.getByTestId('new-page').click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/p\/[^/]+$/);
  const url = page.url();
  const nodeId = url.split('/p/')[1]!;
  console.log(`[e2e-real] nodeId=${nodeId}`);

  await page.getByTestId('page-title').fill(`Collab smoke ${stamp}`);
  await expect(editor(page)).toBeVisible();
  await editor(page).click();
  await page.keyboard.type(`Hello from A ${stamp}`);
  await expect(editor(page)).toContainText(`Hello from A ${stamp}`);

  // Device B: sees A's text without reload, then adds its own.
  const b = await openAsSecondDevice(browser, url);
  await expect(editor(b.page)).toContainText(`Hello from A ${stamp}`, { timeout: 15_000 });
  await expect(b.page.getByTestId('page-title')).toHaveValue(`Collab smoke ${stamp}`, { timeout: 15_000 });
  await editor(b.page).click();
  await b.page.keyboard.press('End');
  await b.page.keyboard.press('Enter');
  await b.page.keyboard.type(`Hello from B ${stamp}`);
  await expect(editor(page)).toContainText(`Hello from B ${stamp}`, { timeout: 15_000 });

  // Server-side write (the path AI / bots / importers use) lands live on both devices.
  const ops = await page.request.post(`${COLLAB_INTERNAL}/internal/docs/${nodeId}/ops`, {
    headers: { 'X-Internal-Token': INTERNAL_TOKEN },
    data: [
      {
        op: 'insert',
        placement: 'end',
        blocks: [{ id: crypto.randomUUID(), type: 'paragraph', props: {}, content: [{ type: 'text', text: `Hello from server ${stamp}`, styles: {} }], children: [] }],
      },
    ],
  });
  expect(ops.ok(), await ops.text()).toBeTruthy();
  await expect(editor(page)).toContainText(`Hello from server ${stamp}`, { timeout: 15_000 });
  await expect(editor(b.page)).toContainText(`Hello from server ${stamp}`, { timeout: 15_000 });

  // The collab server's own view of the document (what gets persisted through the C# internal API).
  await expect
    .poll(
      async () => {
        const r = await page.request.get(`${COLLAB_INTERNAL}/internal/docs/${nodeId}/blocks`, { headers: { 'X-Internal-Token': INTERNAL_TOKEN } });
        if (!r.ok()) return `HTTP ${r.status()}`;
        return JSON.stringify(await r.json());
      },
      { timeout: 20_000 },
    )
    .toMatch(new RegExp(`Hello from A ${stamp}[\\s\\S]*Hello from B ${stamp}[\\s\\S]*Hello from server ${stamp}`));

  // Title mirrored to the tree (PATCH /api/nodes) shows up in B's sidebar.
  await expect(b.page.getByTestId('sidebar').getByText(`Collab smoke ${stamp}`)).toBeVisible({ timeout: 15_000 });

  await page.screenshot({ path: `${SHOTS}/device-a.png`, fullPage: true });
  await b.page.screenshot({ path: `${SHOTS}/device-b.png`, fullPage: true });
  await b.ctx.close();
});
