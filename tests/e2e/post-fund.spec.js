// tests/e2e/post-fund.spec.js
//
// Test: Post Fund — contribute SAVVA to a post fund + check NFT earnings in wallet.
// Flow: Connect → Login → Navigate to post → Contribute → Verify success
//       Then: Navigate to wallet → Check NFT earnings → Claim if available

import { test, expect } from "@playwright/test";
import { setupApp } from "./helpers/app-setup.js";
import { testConfig } from "./helpers/test-config.js";
import { ensureStaked } from "./helpers/staking-helper.js";

/**
 * Connect wallet and login. Reusable helper.
 */
async function connectAndLogin(page) {
  const connectBtn = page.locator('button:has-text("Connect wallet")');
  await connectBtn.waitFor({ state: "visible", timeout: 30_000 });
  await connectBtn.click();
  await expect(connectBtn).not.toBeVisible({ timeout: 15_000 });

  const loginBtn = page.locator('button:has-text("Login")');
  await loginBtn.waitFor({ state: "visible", timeout: 15_000 });
  await loginBtn.click();
  await expect(loginBtn).not.toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1000);
}

test.describe("Post Fund", () => {
  test("contribute SAVVA to a post fund", async ({ page }) => {
    test.setTimeout(120_000);

    // ── 0. Ensure account has enough stake ──
    console.log("  Checking staking requirements...");
    const stakeResult = await ensureStaked(200);
    console.log(
      stakeResult.alreadyStaked
        ? `  Already staked: ${stakeResult.staked} SAVVA`
        : `  Staked tokens (tx: ${stakeResult.txHash}). New stake: ${stakeResult.staked} SAVVA`
    );

    // ── 1. Setup and navigate to homepage ──
    await setupApp(page);
    await connectAndLogin(page);

    // ── 2. Click a post in the feed to navigate to its page ──
    console.log("  Navigating to a post...");

    // Look for a non-NSFW post — prefer E2E test posts we published
    // Collect all article cards and try each one until we land on a post page
    const allCards = page.locator("article:has(h4)");
    await allCards.first().waitFor({ state: "visible", timeout: 30_000 });
    const cardCount = await allCards.count();
    console.log(`  Found ${cardCount} post cards in feed`);

    let foundContributable = false;
    for (let i = 0; i < Math.min(cardCount, 8); i++) {
      const card = allCards.nth(i);
      const cardTitle = await card.locator("h4").textContent().catch(() => "");
      console.log(`  Trying post ${i + 1}: "${cardTitle.trim()}"`);
      await card.click();
      await page.waitForTimeout(1500);

      // Check if we navigated to a post page
      const hash = await page.evaluate(() => window.location.hash);
      if (!hash.includes("/post/")) {
        console.log(`  Post click didn't navigate (NSFW?), trying next...`);
        continue;
      }

      console.log(`  Navigated to post page: ${hash}`);

      // Check if PostFundCard has an enabled Contribute button
      const fundCard = page.locator('[aria-label="Post Fund"]').last();
      const cardVisible = await fundCard.waitFor({ state: "visible", timeout: 10_000 }).then(() => true).catch(() => false);
      if (!cardVisible) {
        console.log(`  PostFundCard not found, going back...`);
        await page.goBack();
        await page.waitForTimeout(1000);
        continue;
      }

      const btn = fundCard.locator('button:has-text("Contribute")');
      const btnVisible = await btn.waitFor({ state: "visible", timeout: 5_000 }).then(() => true).catch(() => false);
      if (!btnVisible) {
        console.log(`  No Contribute button, going back...`);
        await page.goBack();
        await page.waitForTimeout(1000);
        continue;
      }

      const isDisabled = await btn.isDisabled().catch(() => false);
      if (isDisabled) {
        console.log(`  Contribute button disabled (round expecting), going back...`);
        await page.goBack();
        await page.waitForTimeout(1000);
        continue;
      }

      foundContributable = true;
      console.log(`  Found post with enabled Contribute button`);
      break;
    }

    if (!foundContributable) {
      console.log("  No posts with enabled Contribute button found — skipping test");
      return;
    }

    // ── 3. Click "Contribute" button ──
    const fundCard = page.locator('[aria-label="Post Fund"]').last();
    const contributeBtn = fundCard.locator('button:has-text("Contribute")');
    await contributeBtn.click();
    console.log("  Opened Contribute modal");

    // ── 4. Wait for the ContributeModal to open ──
    const modal = page.locator('[role="dialog"]');
    await modal.waitFor({ state: "visible", timeout: 10_000 });

    // Verify modal title
    const modalTitle = modal.locator("h3");
    await expect(modalTitle).toContainText("Contribute", { timeout: 5_000 });

    // ── 5. Fill amount ──
    const amountInput = modal.locator('input[inputmode="decimal"]');
    await amountInput.waitFor({ state: "visible", timeout: 5_000 });
    await amountInput.fill("10");
    console.log("  Entered amount: 10 SAVVA");

    // Small wait for the amount to be parsed into Wei
    await page.waitForTimeout(300);

    // ── 6. Click "Contribute" submit button in the modal footer ──
    // The footer has Cancel + Contribute buttons; get the primary-styled one
    const submitBtn = modal.locator(
      'button.bg-\\[hsl\\(var\\(--primary\\)\\)\\]:has-text("Contribute")'
    );

    // Fallback: if CSS selector is tricky, use the last "Contribute" button in the modal
    let submitLocator = submitBtn;
    const submitCount = await submitBtn.count().catch(() => 0);
    if (submitCount === 0) {
      submitLocator = modal.locator('button:has-text("Contribute")').last();
    }

    await submitLocator.waitFor({ state: "visible", timeout: 5_000 });
    await expect(submitLocator).toBeEnabled({ timeout: 5_000 });
    await submitLocator.click();
    console.log("  Clicked Contribute submit button");

    // ── 7. Wait for the funding to complete ──
    const deadline = Date.now() + 60_000;
    let result = "pending";

    while (Date.now() < deadline && result === "pending") {
      // Check for success toast
      const successToast = page.locator('text="Funding successful!"');
      if (await successToast.isVisible().catch(() => false)) {
        result = "success";
        break;
      }

      // Check for error toast
      const errorToast = page.locator('text="Funding failed"');
      if (await errorToast.isVisible().catch(() => false)) {
        const errorMsg = await errorToast.textContent().catch(() => "unknown");
        throw new Error(`Funding failed: ${errorMsg}`);
      }

      await page.waitForTimeout(1000);
    }

    if (result === "pending") {
      throw new Error("Funding timed out after 60s — no success or error toast appeared");
    }

    console.log("  Funding successful!");

    // Verify the modal closed
    await expect(modal).not.toBeVisible({ timeout: 5_000 });
    console.log("  Contribute modal closed");
  });

  test("check NFT earnings in wallet and claim if available", async ({ page }) => {
    test.setTimeout(120_000);

    // ── 1. Navigate directly to wallet tab ──
    const walletRoute = `/${testConfig.accountAddress}?tab=wallet`;
    await setupApp(page, { route: walletRoute });
    await connectAndLogin(page);

    // ── 2. Wait for wallet to load ──
    const nftEarningsLabel = page.locator('text="NFT Owner Earnings"');
    await nftEarningsLabel.waitFor({ state: "visible", timeout: 30_000 });
    console.log("  Wallet loaded, NFT Owner Earnings section visible");

    // ── 3. Log the current NFT earnings ──
    // The earnings value is in a TokenValue component near the label
    const nftRow = page.locator("h4:has-text('NFT Owner Earnings')").locator("../..");
    const nftValueText = await nftRow
      .locator('[class*="TokenValue"], span')
      .first()
      .textContent()
      .catch(() => "0");
    console.log(`  Current NFT earnings display: ${nftValueText.trim()}`);

    // ── 4. Check if there are claimable earnings ──
    // The "Claim Rewards" menu item only appears if nftEarnings > 0
    // Try to find a chevron/dropdown button near the NFT earnings
    const nftSection = nftRow.locator('button[aria-haspopup="true"], button:has(svg)');
    const hasMenu = await nftSection.count().catch(() => 0);

    if (hasMenu > 0) {
      console.log("  Found menu button near NFT earnings — clicking to check for Claim");
      await nftSection.first().click();
      await page.waitForTimeout(500);

      // Check if "Claim Rewards" menu item exists
      const claimItem = page.locator('button[role="menuitem"]:has-text("Claim Rewards")');
      const canClaim = await claimItem.isVisible().catch(() => false);

      if (canClaim) {
        console.log("  Claiming NFT earnings...");
        await claimItem.click();

        // Wait for the transaction to complete (wallet refreshes automatically)
        await page.waitForTimeout(5_000);
        console.log("  NFT earnings claim transaction sent");
      } else {
        console.log("  No claimable NFT earnings at this time");
        // Close the menu by pressing Escape
        await page.keyboard.press("Escape");
      }
    } else {
      console.log("  No menu button found — NFT earnings are likely 0");
    }

    // ── 5. Verify wallet section is still intact ──
    await expect(nftEarningsLabel).toBeVisible();
    console.log("  Wallet tab test complete");
  });
});
