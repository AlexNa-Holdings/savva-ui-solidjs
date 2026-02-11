// tests/e2e/stake-tokens.spec.js
//
// Test: verify staking works via the UI
// (User avatar dropdown → "My Wallet" → SAVVA chevron → "Increase Staking" modal)

import { test, expect } from "@playwright/test";
import { setupApp } from "./helpers/app-setup.js";
import { testConfig } from "./helpers/test-config.js";
import { getStakingInfo } from "./helpers/staking-helper.js";

test.describe("Token Staking", () => {
  test("check staking balances via contract calls", async () => {
    // Pure Node.js test — no browser needed for balance check
    const info = await getStakingInfo();
    console.log(`  SAVVA balance: ${info.balanceFormatted}`);
    console.log(`  Staked balance: ${info.stakedFormatted}`);
    console.log(`  Account: ${testConfig.accountAddress}`);

    expect(info.balance).toBeGreaterThanOrEqual(0n);
    expect(info.staked).toBeGreaterThanOrEqual(0n);
  });

  test("stake tokens via UI", async ({ page }) => {
    // First check if we even have tokens to stake
    const info = await getStakingInfo();
    console.log(
      `  Balance: ${info.balanceFormatted} SAVVA, Staked: ${info.stakedFormatted} SAVVA`
    );

    if (info.balance === 0n) {
      test.skip(
        true,
        `No SAVVA tokens available to stake. Account ${testConfig.accountAddress} has 0 balance.`
      );
    }

    // ── 1. Setup ──
    await setupApp(page);

    // ── 2. Connect + Login ──
    const connectBtn = page.locator('button:has-text("Connect wallet")');
    await connectBtn.waitFor({ state: "visible", timeout: 30_000 });
    await connectBtn.click();
    await expect(connectBtn).not.toBeVisible({ timeout: 15_000 });

    const loginBtn = page.locator('button:has-text("Login")');
    await loginBtn.waitFor({ state: "visible", timeout: 15_000 });
    await loginBtn.click();
    await expect(loginBtn).not.toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1000);

    // ── 3. Open user dropdown menu (avatar with chevron in header) ──
    // The AuthorizedUser avatar button has aria-haspopup and a chevron
    // It's the first such button in the header banner area
    const avatarBtn = page.locator(
      'header button[aria-haspopup="true"], [role="banner"] button[aria-haspopup="true"]'
    ).first();
    await avatarBtn.waitFor({ state: "visible", timeout: 10_000 });
    await avatarBtn.click();
    await page.waitForTimeout(500);

    // ── 4. Click "My Wallet" in the dropdown ──
    const myWalletItem = page.locator('button:has-text("My Wallet")');
    await myWalletItem.waitFor({ state: "visible", timeout: 5_000 });
    await myWalletItem.click();
    await page.waitForTimeout(2000);

    // ── 5. Open the SAVVA token context menu (chevron ∨ next to balance) ──
    // The "Increase Staking" option is inside a ContextMenu dropdown
    // on the SAVVA balance row. Find the "Open Menu" button near "SAVVA" text.
    const savvaRow = page.locator('text=/SAVVA/').first();
    await savvaRow.waitFor({ state: "visible", timeout: 10_000 });

    // The ContextMenu trigger is a button with aria-label "Open Menu" near the SAVVA row
    const menuTrigger = page
      .locator('button[aria-label="Open Menu"]')
      .first();
    await menuTrigger.waitFor({ state: "visible", timeout: 10_000 });
    await menuTrigger.click();
    await page.waitForTimeout(500);

    // ── 6. Click "Increase Staking" from the context menu ──
    const increaseBtn = page.locator(
      '[role="menuitem"]:has-text("Increase Staking")'
    );
    await increaseBtn.waitFor({ state: "visible", timeout: 5_000 });
    await increaseBtn.click();
    await page.waitForTimeout(500);

    // ── 7. Fill amount in the "Increase Stake" modal ──
    const modalTitle = page.locator('text="Increase Stake"');
    await modalTitle.waitFor({ state: "visible", timeout: 10_000 });

    const amountInput = page.locator(
      'input[type="number"], input[inputmode="decimal"]'
    );
    await amountInput.waitFor({ state: "visible", timeout: 5_000 });
    await amountInput.fill("100");

    // Click the "Stake" button in the modal footer
    const stakeBtn = page.locator('button:has-text("Stake")');
    await stakeBtn.click();

    // ── 8. Wait for transaction to complete ──
    // The modal closes on success, so wait for it to disappear.
    // Also check for errors during the wait.
    const deadline = Date.now() + 60_000;
    let success = false;

    while (Date.now() < deadline && !success) {
      // Check if modal closed (success — the modal auto-closes after staking)
      const modalStillVisible = await modalTitle.isVisible().catch(() => false);
      if (!modalStillVisible) {
        success = true;
        console.log("  ✓ Staking modal closed (transaction succeeded)");
        break;
      }

      // Check for error text inside the modal
      const errorText = page.locator(
        ".text-destructive, .text-red-500"
      );
      if (await errorText.isVisible().catch(() => false)) {
        const msg = await errorText.textContent().catch(() => "unknown");
        throw new Error(`Staking failed: ${msg}`);
      }

      await page.waitForTimeout(500);
    }

    if (!success) {
      throw new Error("Staking transaction timed out after 60s");
    }

    // Verify new stake via contract
    const newInfo = await getStakingInfo();
    console.log(`  New staked balance: ${newInfo.stakedFormatted} SAVVA`);
    expect(newInfo.staked).toBeGreaterThan(info.staked);
  });
});
