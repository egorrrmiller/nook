import { expect, test, type Page } from '@playwright/test';

/**
 * Knowledge slice (contracts §9) against the MSW mock API. The shell does not mount the search /
 * export / import dialogs yet, so the flows are driven from the graph route, which this agent owns
 * and which exposes the same components (see the handover notes).
 */
async function fillLogin(page: Page) {
  await page.getByLabel('Email').fill('owner@localhost');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Signs in and lands on `path` in one page load (the mock session lives in memory per load). */
async function signInAt(page: Page, path: (ws: string) => string): Promise<string> {
  await page.goto('/login');
  await fillLogin(page);
  await expect(page).toHaveURL(/\/w\//);
  const ws = new URL(page.url()).pathname.split('/')[2]!;
  const target = path(ws);
  if (new URL(page.url()).pathname !== target) {
    await page.goto(`/login?redirect=${encodeURIComponent(target)}`);
    await fillLogin(page);
    await expect(page).toHaveURL(new RegExp(target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  return ws;
}

test('graph route renders the canvas and the broken-links list', async ({ page }) => {
  await signInAt(page, (w) => `/w/${w}/graph`);

  const canvas = page.getByTestId('graph-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveAttribute('aria-label', /\d+ nodes/);
  // The force layout actually painted something.
  // `e2e` is compiled without the DOM lib, hence the structural cast.
  interface CanvasLike {
    width: number;
    height: number;
    getContext(kind: '2d'): { getImageData(x: number, y: number, w: number, h: number): { data: Uint8ClampedArray } } | null;
  }
  const painted = await canvas.evaluate((el) => {
    const c = el as unknown as CanvasLike;
    const ctx = c.getContext('2d')!;
    const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const first = [data[0], data[1], data[2]];
    for (let i = 4; i < data.length; i += 4) {
      if (data[i] !== first[0] || data[i + 1] !== first[1] || data[i + 2] !== first[2]) return true;
    }
    return false;
  });
  expect(painted).toBe(true);

  const broken = page.getByTestId('broken-links');
  await expect(broken).toBeVisible();
  await expect(broken.getByTestId('broken-link-item').first()).toBeVisible();
  await expect(broken).toContainText('[[Missing page]]');

  // Filters redraw without errors.
  await page.getByTestId('graph-toggle-tags').click();
  await expect(page.getByTestId('graph-canvas')).toBeVisible();
  await page.getByTestId('graph-search').fill('plan');
  await expect(page.getByTestId('graph-search').locator('xpath=..')).toContainText('1');
});

test('search dialog: filters, keyboard, opens a result at its block anchor', async ({ page }) => {
  const ws = await signInAt(page, (w) => `/w/${w}/graph`);

  await page.getByTestId('open-search').click();
  const dialog = page.getByTestId('search-dialog');
  await expect(dialog).toBeVisible();

  await page.getByTestId('search-input').fill('zettelkasten');
  const results = page.getByTestId('search-result');
  await expect(results).toHaveCount(1);
  await expect(dialog.locator('mark').first()).toBeVisible();

  // Title-only drops the content hit, then it comes back.
  await page.getByTestId('search-filter-title-only').click();
  await expect(dialog).toContainText('No results for');
  await page.getByTestId('search-filter-title-only').click();
  await expect(results).toHaveCount(1);

  await page.getByTestId('search-input').press('Enter');
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/p/[^#]+#b-`));
  await expect(page.getByTestId('page-view')).toBeVisible();

  // The query was remembered for next time (recent searches live in localStorage).
  await page.goBack();
  await page.getByTestId('open-search').click();
  await expect(page.getByTestId('recent-search')).toContainText('zettelkasten');
});

test('export dialog downloads a zip', async ({ page }) => {
  await signInAt(page, (w) => `/w/${w}/graph`);

  await page.getByTestId('open-export').click();
  await expect(page.getByTestId('export-dialog')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('export-run').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.zip$/);
  await expect(page.getByTestId('export-done')).toContainText('.zip');
});

test('import dialog creates a page from a markdown file', async ({ page }) => {
  const ws = await signInAt(page, (w) => `/w/${w}/graph`);

  await page.getByTestId('open-import').click();
  await expect(page.getByTestId('import-dialog')).toBeVisible();
  await page.getByTestId('import-file-input').setInputFiles({
    name: 'imported-notes.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('# Imported notes\n\nHello from Playwright.'),
  });
  await expect(page.getByTestId('import-dialog')).toContainText('imported-notes.md');
  await page.getByTestId('import-run').click();

  await expect(page.getByTestId('import-result')).toContainText('Imported 1 page');
  await page.getByTestId('import-open-first').click();
  await expect(page).toHaveURL(new RegExp(`/w/${ws}/p/`));
  await expect(page.getByTestId('page-title')).toHaveValue('Imported notes');
});
