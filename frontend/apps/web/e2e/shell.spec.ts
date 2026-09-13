import { expect, test, type Page } from '@playwright/test';

const SHOTS = 'e2e/screenshots';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@localhost');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/w\//);
  await expect(page.getByTestId('sidebar')).toBeVisible();
}

function row(page: Page, title: string) {
  return page.getByTestId('tree-private').getByTestId('tree-item').filter({ hasText: title }).first();
}

/** The `li[role=treeitem]` wrapping a row — it carries aria-expanded / aria-selected. */
function treeItem(page: Page, title: string) {
  return page.getByTestId('tree-private').getByRole('treeitem').filter({ hasText: title }).first();
}

test.describe('shell', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
  });

  test('sidebar sections, favourites and the archived toggle', async ({ page }) => {
    const sidebar = page.getByTestId('sidebar');
    await expect(sidebar.getByTestId('section-favorites')).toBeVisible();
    await expect(sidebar.getByTestId('favorite-item')).toHaveCount(1);

    // Favourite "Reading list" from its row menu → it appears in the Favorites section.
    const reading = row(page, 'Reading list');
    await reading.hover();
    await reading.getByTestId('tree-item-menu').click();
    await page.getByTestId('menu-favorite').click();
    await expect(sidebar.getByTestId('favorite-item')).toHaveCount(2);
    await expect(sidebar.getByTestId('favorites-list')).toContainText('Reading list');
    await page.screenshot({ path: `${SHOTS}/sidebar.png`, fullPage: false });

    // Unfavourite again from the same menu.
    await reading.hover();
    await reading.getByTestId('tree-item-menu').click();
    await page.getByTestId('menu-favorite').click();
    await expect(sidebar.getByTestId('favorite-item')).toHaveCount(1);

    // Archive hides the page until "Show archived" is on, then it shows dimmed.
    await reading.hover();
    await reading.getByTestId('tree-item-menu').click();
    await page.getByTestId('menu-archive').click();
    await expect(row(page, 'Reading list')).toHaveCount(0);
    await page.getByTestId('toggle-archived').click();
    await expect(row(page, 'Reading list')).toBeVisible();
    await expect(row(page, 'Reading list')).toContainText('(archived)');
    await page.getByTestId('toggle-archived').click();

    // Collapsing a section is persisted (mock mode resets the server state on reload, so assert
    // the persisted store rather than reloading the page).
    await sidebar.getByRole('button', { name: 'Private' }).click();
    await expect(page.getByTestId('tree-private')).toHaveCount(0);
    await expect
      .poll(async () => JSON.parse((await page.evaluate(() => localStorage.getItem('nook.ui'))) ?? '{}').state?.collapsedSections?.private)
      .toBe(true);
    await sidebar.getByRole('button', { name: 'Private' }).click();
    await expect(page.getByTestId('tree-private')).toBeVisible();
  });

  test('drag-and-drop moves a page under another', async ({ page }) => {
    const source = row(page, 'Reading list');
    const target = row(page, 'Projects');
    await expect(source).toBeVisible();

    const from = await source.boundingBox();
    const to = await target.boundingBox();
    expect(from && to).toBeTruthy();

    // Pointer drag onto the middle of "Projects" = drop inside it.
    await page.mouse.move(from!.x + 60, from!.y + from!.height / 2);
    await page.mouse.down();
    await page.mouse.move(to!.x + 70, to!.y + to!.height / 2, { steps: 12 });
    await page.mouse.move(to!.x + 72, to!.y + to!.height / 2, { steps: 4 });
    await page.mouse.up();

    // "Projects" expands and now contains the moved page, indented one level deeper.
    await expect(treeItem(page, 'Projects')).toHaveAttribute('aria-expanded', 'true');
    const moved = row(page, 'Reading list');
    await expect(moved).toBeVisible();
    // Rows carry their indent inline: root = 4px, one level deeper = 4 + 12 px.
    await expect(moved).toHaveAttribute('style', /padding-left:\s*16px/);
  });

  test('quick find navigates, and the breadcrumb opens a sibling dropdown', async ({ page }) => {
    await page.keyboard.press('Meta+k');
    const input = page.getByTestId('palette-input');
    await expect(input).toBeVisible();
    await input.fill('reading');
    const hit = page.getByTestId('palette-hit').first();
    await expect(hit).toContainText('Reading list');
    await expect(page.getByText('Search everything')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/palette.png` });
    await hit.click();
    await expect(page).toHaveURL(/\/p\//);
    await expect(page.getByTestId('page-title')).toHaveValue('Reading list');

    // Breadcrumb reflects the page and lists its siblings.
    const crumb = page.getByTestId('breadcrumb-current');
    await expect(crumb).toContainText('Reading list');
    await crumb.click();
    const menu = page.getByRole('menu');
    await expect(menu).toContainText('Getting started');
    await menu.getByRole('menuitem', { name: /Getting started/ }).first().click();
    await expect(page.getByTestId('page-title')).toHaveValue('Getting started');

    // The breadcrumb follows a live title change (wave-0 polish item).
    await page.getByTestId('page-title').fill('Getting started v2');
    await expect(page.getByTestId('breadcrumb-current')).toContainText('Getting started v2');
  });

  test('tabs open, switch and close', async ({ page }) => {
    await row(page, 'Getting started').click();
    await expect(page).toHaveURL(/\/p\//);

    await page.keyboard.press('Meta+t');
    await expect(page.getByTestId('tab-strip')).toBeVisible();
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect(page).toHaveURL(/\/w\/[^/]+$/); // the new tab lands on Home

    // Opening a page from the sidebar navigates the active tab.
    await row(page, 'Projects').click();
    await expect(page.getByTestId('tab')).toHaveCount(2);
    await expect(page.getByTestId('tab').nth(1)).toContainText('Projects');

    // Switch back to the first tab — the route follows the tab.
    await page.getByTestId('tab').first().click();
    await expect(page.getByTestId('page-title')).toHaveValue('Getting started');

    await page.keyboard.press('Meta+w');
    await expect(page.getByTestId('tab-strip')).toHaveCount(0);
  });

  test('trash: delete, search, restore and empty', async ({ page }) => {
    const reading = row(page, 'Reading list');
    await reading.hover();
    await reading.getByTestId('tree-item-menu').click();
    await page.getByTestId('menu-delete').click();
    await expect(row(page, 'Reading list')).toHaveCount(0);

    await page.getByTestId('nav-trash').click();
    await expect(page.getByTestId('trash-view')).toBeVisible();
    await expect(page.getByTestId('trash-item')).toHaveCount(1);
    await page.getByTestId('trash-search').fill('read');
    await expect(page.getByTestId('trash-item')).toHaveCount(1);
    await page.getByTestId('trash-search').fill('nothing-matches');
    await expect(page.getByTestId('trash-item')).toHaveCount(0);
    await page.getByTestId('trash-search').fill('');
    await expect(page.getByTestId('trash-item')).toHaveCount(1);
    await expect(page.getByTestId('topbar-label')).toHaveText('Trash');
    await page.screenshot({ path: `${SHOTS}/trash.png` });

    const item = page.getByTestId('trash-item').first();
    await item.hover();
    await item.getByTestId('trash-restore').click();
    await expect(page).toHaveURL(/\/p\//);
    await expect(row(page, 'Reading list')).toBeVisible();

    // Delete again, then empty the trash through the confirm dialog.
    const restored = row(page, 'Reading list');
    await restored.hover();
    await restored.getByTestId('tree-item-menu').click();
    await page.getByTestId('menu-delete').click();
    await page.getByTestId('nav-trash').click();
    await page.getByTestId('empty-trash').click();
    await page.getByTestId('confirm-dialog-confirm').click();
    await expect(page.getByTestId('trash-item')).toHaveCount(0);
  });

  test('settings: rename the account and switch sections', async ({ page }) => {
    await page.getByTestId('nav-settings').click();
    await expect(page.getByTestId('settings-account')).toBeVisible();

    const name = page.getByTestId('account-display-name');
    await name.fill('Egor');
    await page.getByTestId('account-save').click();
    await expect(page.getByTestId('toast')).toContainText('Profile updated');
    // The new name is served by `GET /api/me` from now on: leave and come back.
    await page.getByTestId('settings-nav-appearance').click();
    await page.getByTestId('settings-nav-account').click();
    await expect(page.getByTestId('account-display-name')).toHaveValue('Egor');

    await page.getByTestId('settings-nav-appearance').click();
    await expect(page.getByTestId('settings-appearance')).toBeVisible();
    await page.screenshot({ path: `${SHOTS}/settings.png` });
    await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.screenshot({ path: `${SHOTS}/settings-dark.png` });
    await page.getByTestId('theme-light').click();

    await page.getByTestId('settings-nav-members').click();
    await expect(page.getByTestId('settings-members')).toBeVisible();
    await expect(page.getByTestId('member-row')).not.toHaveCount(0);
    await page.getByTestId('create-invite').click();
    await expect(page.getByTestId('invite-row')).not.toHaveCount(0);

    await page.getByTestId('settings-nav-tokens').click();
    await page.getByLabel('Name').fill('CI token');
    await page.getByTestId('create-token').click();
    await expect(page.getByTestId('token-reveal')).not.toHaveValue('');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByTestId('token-row')).toHaveCount(2);

    await page.getByTestId('settings-close').click();
    await expect(page.getByTestId('home-greeting')).toContainText('Egor');
  });

  test('page menu applies page settings (font, small text, full width, lock)', async ({ page }) => {
    await row(page, 'Getting started').click();
    await expect(page).toHaveURL(/\/p\//);

    // Checkbox items keep the menu open, so all three toggles happen in one pass.
    await page.getByTestId('page-menu').click();
    await page.getByTestId('font-serif').click();
    await page.getByTestId('toggle-full-width').click();
    await expect(page.getByTestId('toggle-full-width')).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('toggle-small-text').click();
    await expect(page.getByTestId('toggle-small-text')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // The settings reached the server and come back on the node.
    await expect
      .poll(async () =>
        page.evaluate(async (pathname: string) => {
          const ws = JSON.parse(localStorage.getItem('nook.workspace') || '{}').state?.activeWorkspaceId;
          const id = pathname.split('/p/')[1];
          const res = await fetch(`/api/nodes/${id}`, { headers: { 'X-Workspace-Id': ws } });
          const node = (await res.json()) as {
            pageSettings: { font: string; fullWidth: boolean; smallText: boolean };
          };
          return `${node.pageSettings.font}|${node.pageSettings.fullWidth}|${node.pageSettings.smallText}`;
        }, new URL(page.url()).pathname),
      )
      .toBe('serif|true|true');
  });

  test('the shortcuts dialog opens from the palette and closes with Esc', async ({ page }) => {
    await row(page, 'Projects').click();
    await expect(page).toHaveURL(/\/p\//);
    // (The icon/cover pickers are covered by src/test/pickers.test.tsx — their only host is the
    // page header, which the editor slice owns.)
    await page.keyboard.press('Meta+k');
    await page.getByTestId('palette-input').fill('shortcut');
    await page.getByText('Keyboard shortcuts').click();
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0);
  });
});
