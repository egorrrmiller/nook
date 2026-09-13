import { expect, test } from '@playwright/test';

test('login → sidebar → create page → open it', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@localhost');
  await page.getByLabel('Password').fill('change-me');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/w\//);
  const sidebar = page.getByTestId('sidebar');
  await expect(sidebar).toBeVisible();
  // "Getting started" is seeded as a favourite, so it now appears in both sidebar sections.
  await expect(sidebar.getByTestId('tree-private').getByText('Getting started')).toBeVisible();

  await page.getByTestId('new-page').click();
  await expect(page).toHaveURL(/\/w\/[^/]+\/p\/[^/]+$/);
  await expect(page.getByTestId('page-view')).toBeVisible();

  const title = page.getByTestId('page-title');
  await title.fill('Smoke test page');
  await expect(sidebar.getByTestId('tree-private').getByText('Smoke test page')).toBeVisible();

  // The BlockNote editor mounted.
  await expect(page.locator('.bn-editor')).toBeVisible();

  // Open it again from the tree after visiting home.
  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('home-greeting')).toBeVisible();
  await sidebar.getByTestId('tree-private').getByText('Smoke test page').click();
  await expect(page.getByTestId('page-title')).toHaveValue('Smoke test page');
});
