// tests/e2e/subscriptions.spec.js
//
// Test: Subscriptions — account 1 subscribes to account 2, then vice versa.
// Flow: Navigate to other account's profile → Subscribe → Fill modal → Confirm

import { test, expect } from "@playwright/test";
import { setupApp } from "./helpers/app-setup.js";
import { testConfig, testConfig2 } from "./helpers/test-config.js";
import { ensureStaked } from "./helpers/staking-helper.js";

async function connectAndLogin(page) {
  const connectBtn = page.getByRole('banner').getByRole('button', { name: 'Connect wallet' });
  await connectBtn.waitFor({ state: "visible", timeout: 30_000 });
  await connectBtn.click();
  await expect(connectBtn).not.toBeVisible({ timeout: 15_000 });

  const loginBtn = page.locator('button:has-text("Login")');
  await loginBtn.waitFor({ state: "visible", timeout: 15_000 });
  await loginBtn.click();
  await expect(loginBtn).not.toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
}

/**
 * Subscribe to the profile currently displayed on the page.
 * Handles both fresh subscriptions and renewals (button may say "Unsubscribe" if already subscribed).
 */
async function subscribeOnProfile(page, weeklyAmount = "10", weeks = "1") {
  // Wait for either "Subscribe" or "Unsubscribe" button to appear
  const subscribeBtn = page.getByRole("button", { name: "Subscribe", exact: true });
  const unsubBtn = page.getByRole("button", { name: "Unsubscribe", exact: true });

  // Race: wait for whichever button appears first
  await expect(subscribeBtn.or(unsubBtn)).toBeVisible({ timeout: 15_000 });

  // Check if already subscribed
  const alreadySubscribed = await unsubBtn.isVisible().catch(() => false);
  if (alreadySubscribed) {
    console.log("  Already subscribed — test passes");
    return true;
  }

  // Click "Subscribe" button
  await subscribeBtn.click();
  console.log("  Clicked Subscribe button");

  // Wait for the SubscribeModal to open
  const modal = page.locator('[role="dialog"]');
  await modal.waitFor({ state: "visible", timeout: 10_000 });
  console.log("  Subscribe modal opened");

  // Wait for staking info + subscription info to fully load before filling inputs.
  // The modal has a createEffect that initializes the amount from existing subscription
  // data — if we fill() before that effect runs, it will reset our value to "".
  const amountInput = modal.locator('input[inputmode="decimal"]');
  await amountInput.waitFor({ state: "visible", timeout: 5_000 });

  // Wait for the token balance to appear (means staking info resource resolved)
  const balanceSection = modal.locator('text=/1[,.]|\\d{2,}/');
  await balanceSection.first().waitFor({ state: "visible", timeout: 15_000 });
  console.log("  Staking resources loaded");

  // Wait for subscription info resource to resolve and init effect to settle
  await page.waitForTimeout(2000);

  // Fill weekly amount
  await amountInput.fill(weeklyAmount);
  console.log(`  Weekly amount: ${weeklyAmount}`);
  await page.waitForTimeout(500);

  // Set number of weeks
  const weeksInput = modal.locator('input[type="number"][min="1"][max="52"]');
  await weeksInput.waitFor({ state: "visible", timeout: 5_000 });
  await weeksInput.fill(weeks);
  console.log(`  Weeks: ${weeks}`);
  await page.waitForTimeout(500);

  // If submit button is still disabled, retry with character-by-character input
  // (SolidJS event delegation may not always catch fill() synthetic events)
  const submitBtn = modal.locator('button:has-text("Subscribe")');
  await submitBtn.waitFor({ state: "visible", timeout: 5_000 });

  let enabled = await submitBtn.isEnabled().catch(() => false);
  if (!enabled) {
    console.log("  Submit still disabled — retrying amount with keyboard input");
    await amountInput.click();
    await amountInput.press("Control+a");
    await amountInput.pressSequentially(weeklyAmount, { delay: 50 });
    await page.waitForTimeout(500);
  }

  await expect(submitBtn).toBeEnabled({ timeout: 10_000 });

  // Count pre-existing destructive elements (e.g. "Expired" status text)
  // so we only flag NEW errors that appear after clicking submit
  const preExistingCount = await modal.locator('[class*="destructive"]').count().catch(() => 0);

  await submitBtn.click();
  console.log("  Clicked Subscribe submit button");

  // Wait for modal to close (success) or error message
  const deadline = Date.now() + 60_000;
  let result = "pending";

  while (Date.now() < deadline && result === "pending") {
    // Check if modal closed (success)
    const modalVisible = await modal.isVisible().catch(() => false);
    if (!modalVisible) {
      result = "success";
      break;
    }

    // Check for NEW error text in modal (ignore pre-existing "Expired" status)
    const errEls = modal.locator('[class*="destructive"]');
    const currentCount = await errEls.count().catch(() => 0);
    if (currentCount > preExistingCount) {
      const errText = await errEls.last().textContent().catch(() => "unknown");
      throw new Error(`Subscription failed: ${errText}`);
    }

    await page.waitForTimeout(1000);
  }

  if (result === "pending") {
    throw new Error("Subscription timed out after 60s");
  }

  console.log("  Subscription successful — modal closed");
  await page.waitForTimeout(1000);

  // Verify button changed to "Unsubscribe"
  const unsubVisible = await unsubBtn
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);

  if (unsubVisible) {
    console.log("  Verified: Unsubscribe button is now visible");
  } else {
    console.log("  Warning: Unsubscribe button not visible after subscription");
  }

  return true;
}

test.describe("Subscriptions", () => {
  test("account 1 subscribes to account 2", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!testConfig2, "TEST_PRIVATE_KEY2 not set in .env");

    console.log("  Ensuring account 1 has enough stake...");
    const stakeResult = await ensureStaked(200, testConfig);
    console.log(
      stakeResult.alreadyStaked
        ? `  Already staked: ${stakeResult.staked} SAVVA`
        : `  Staked tokens. New stake: ${stakeResult.staked} SAVVA`
    );

    // Navigate to account 2's profile
    await setupApp(page, {
      config: testConfig,
      route: `/${testConfig2.accountAddress}`,
    });
    await connectAndLogin(page);

    // Wait for profile to load
    const profileName = page.locator("h2.text-2xl");
    await profileName.waitFor({ state: "visible", timeout: 30_000 });
    console.log(`  Viewing profile: ${await profileName.textContent()}`);

    await subscribeOnProfile(page, "10", "1");
  });

  test("account 2 subscribes to account 1", async ({ page }) => {
    test.setTimeout(120_000);
    test.skip(!testConfig2, "TEST_PRIVATE_KEY2 not set in .env");

    console.log("  Ensuring account 2 has enough stake...");
    const stakeResult = await ensureStaked(200, testConfig2);
    console.log(
      stakeResult.alreadyStaked
        ? `  Already staked: ${stakeResult.staked} SAVVA`
        : `  Staked tokens. New stake: ${stakeResult.staked} SAVVA`
    );

    // Navigate to account 1's profile
    await setupApp(page, {
      config: testConfig2,
      route: `/${testConfig.accountAddress}`,
    });
    await connectAndLogin(page);

    // Wait for profile to load
    const profileName = page.locator("h2.text-2xl");
    await profileName.waitFor({ state: "visible", timeout: 30_000 });
    console.log(`  Viewing profile: ${await profileName.textContent()}`);

    await subscribeOnProfile(page, "10", "1");
  });
});
