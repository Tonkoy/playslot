import { expect, test } from '@playwright/test';

/**
 * Consumer smoke journeys (spec §25). Assumes a running stack with seed data
 * (Ace Tennis Center). Deeper flows (book → confirm → cancel) are covered at the
 * API layer by the Supertest e2e suite; these assert the browser wiring.
 *
 * Note: `/` uses next-intl locale negotiation (Bulgarian is the fallback default);
 * a browser that prefers English is sent to /en, so we visit locales explicitly.
 */

test('renders Bulgarian and switches to English via the header', async ({ page }) => {
  await page.goto('/bg');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('свободен корт');

  await page.getByLabel('Език').selectOption('en');
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('free court');
});

test('clubs list → club profile shows the availability grid', async ({ page }) => {
  await page.goto('/en/clubs');
  const firstClub = page.getByRole('link', { name: /view availability/i }).first();
  await expect(firstClub).toBeVisible();
  await firstClub.click();

  // The grid renders once availability loads: a sticky "Time" column header.
  await expect(page.getByRole('columnheader', { name: 'Time' })).toBeVisible({ timeout: 15_000 });
});

test('coaches directory lists coaches', async ({ page }) => {
  await page.goto('/en/coaches');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Coaches');
});
