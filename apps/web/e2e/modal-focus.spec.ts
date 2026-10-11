import { expect, test } from '@playwright/test';
import { E2E_USERS, loginAs } from './helpers';

/**
 * QA-01: every modal with a text field lost focus after each keystroke (the
 * focus effect re-ran on every parent render), so a walk-in name typed as
 * "QA walk-in" was saved as "Q". The dialog must keep focus while typing.
 */
test('a dialog text field keeps focus while typing', async ({ page, request }) => {
  await page.goto('/bg');
  await loginAs(page, request, E2E_USERS.clubAdmin);

  await page.goto('/bg/admin');
  const manage = page.getByRole('link', { name: /Управлявай|Manage/ }).first();
  await expect(manage).toBeVisible({ timeout: 15_000 });
  await manage.click();

  await page.getByRole('link', { name: /календар|calendar/i }).first().click();
  // The first free cell opens the walk-in dialog.
  await page.getByRole('button', { name: /^\+$/ }).first().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const name = dialog.getByRole('textbox').first();
  const typed = 'QA walk-in K12';
  await name.click();
  await name.type(typed, { delay: 30 });

  // The whole string arrived, and the field — not the dialog — still has focus.
  await expect(name).toHaveValue(typed);
  await expect(name).toBeFocused();
});
