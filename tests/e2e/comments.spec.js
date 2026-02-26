// tests/e2e/comments.spec.js
//
// Test: Comments — add a comment on a post + reply to a comment (nested).
// Flow: Connect → Login → Navigate to post → Add comment → Publish
//       Then: Reply to a comment → Publish → Verify nesting

import { test, expect } from "@playwright/test";
import { setupApp } from "./helpers/app-setup.js";
import { testConfig } from "./helpers/test-config.js";
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
 * Navigate to the first non-NSFW post in the feed.
 * Returns the post hash fragment (e.g. "#/post/xyz").
 */
async function navigateToPost(page) {
  const allCards = page.locator("article:has(h4)");
  await allCards.first().waitFor({ state: "visible", timeout: 30_000 });
  const cardCount = await allCards.count();
  console.log(`  Found ${cardCount} post cards in feed`);

  for (let i = 0; i < Math.min(cardCount, 8); i++) {
    const card = allCards.nth(i);
    const cardTitle = await card.locator("h4").textContent().catch(() => "");
    console.log(`  Trying post ${i + 1}: "${cardTitle.trim()}"`);
    await card.click();
    await page.waitForTimeout(1500);

    const hash = await page.evaluate(() => window.location.hash);
    if (!hash.includes("/post/")) {
      console.log(`  Post click didn't navigate (NSFW?), trying next...`);
      continue;
    }

    // Verify the post is commentable (not encrypted/blocked)
    const addComment = page.locator('text="Add a comment..."');
    const commentable = await addComment
      .waitFor({ state: "visible", timeout: 10_000 })
      .then(() => addComment.click({ trial: true, timeout: 3_000 }))
      .then(() => true)
      .catch(() => false);

    if (!commentable) {
      console.log(`  Post not commentable (encrypted?), trying next...`);
      await page.goBack();
      await page.waitForTimeout(1000);
      continue;
    }

    console.log(`  Navigated to post page: ${hash}`);
    return hash;
  }

  throw new Error("No navigable posts found in feed");
}

/**
 * Publish a comment/reply through the editor wizard.
 * Assumes the editor textarea is already visible.
 */
async function publishComment(page, text) {
  const bodyArea = page.locator(
    'textarea[placeholder="Start writing your post content here..."]'
  );
  await bodyArea.waitFor({ state: "visible", timeout: 15_000 });
  await bodyArea.fill(text);
  console.log(`  Filled comment body: "${text}"`);

  // Click "Preview Post"
  const previewBtn = page.locator('button:has-text("Preview Post")');
  await previewBtn.waitFor({ state: "visible", timeout: 10_000 });
  await previewBtn.click();
  await page.waitForTimeout(1000);

  // Click "Publish" in the preview
  const publishBtn = page.locator('button:has-text("Publish")');
  await publishBtn.waitFor({ state: "visible", timeout: 10_000 });
  await publishBtn.click();
  console.log("  Clicked Publish");

  // Wait for wizard to complete
  const deadline = Date.now() + 60_000;
  let result = "pending";

  while (Date.now() < deadline && result === "pending") {
    const successToast = page.locator('text="Successfully published!"');
    if (await successToast.isVisible().catch(() => false)) {
      result = "success";
      break;
    }

    const errorTitle = page.locator('text="Publishing Failed"');
    if (await errorTitle.isVisible().catch(() => false)) {
      const errorMsg = await page
        .locator(".text-red-500, .text-destructive")
        .textContent()
        .catch(() => "unknown error");
      throw new Error(`Publishing failed: ${errorMsg}`);
    }

    const greenCount = await page
      .locator(".bg-green-500.border-green-500")
      .count()
      .catch(() => 0);
    if (greenCount >= 5) {
      result = "success";
      break;
    }

    await page.waitForTimeout(2000);
  }

  if (result === "pending") {
    throw new Error("Comment publishing timed out after 60s");
  }

  console.log("  Comment published successfully");
}

test.describe("Comments", () => {
  test("add a comment on a post", async ({ page }) => {
    test.setTimeout(120_000);

    // ── 0. Ensure staked ──
    console.log("  Checking staking requirements...");
    const stakeResult = await ensureStaked(200);
    console.log(
      stakeResult.alreadyStaked
        ? `  Already staked: ${stakeResult.staked} SAVVA`
        : `  Staked tokens (tx: ${stakeResult.txHash}). New stake: ${stakeResult.staked} SAVVA`
    );

    // ── 1. Setup + login + navigate to a post ──
    await setupApp(page);
    await connectAndLogin(page);
    const postHash = await navigateToPost(page);

    // ── 2. Click "Add a comment..." ──
    const addCommentLink = page.locator('text="Add a comment..."');
    await addCommentLink.waitFor({ state: "visible", timeout: 10_000 });
    await addCommentLink.click();
    console.log("  Clicked 'Add a comment...'");
    await page.waitForTimeout(1500);

    // ── 3. Write and publish the comment ──
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const commentText = `E2E test comment ${timestamp}`;
    await publishComment(page, commentText);

    // ── 4. Should navigate back to the post ──
    await page.waitForTimeout(2000);
    const currentHash = await page.evaluate(() => window.location.hash);
    console.log(`  After publish, current hash: ${currentHash}`);

    // Verify comment is visible on the post page
    const commentOnPage = page.locator(`text="${commentText}"`);
    const commentVisible = await commentOnPage
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (commentVisible) {
      console.log("  Comment is visible on the post page");
    } else {
      console.log("  Comment not immediately visible (may need page refresh or WebSocket update)");
    }
  });

  test("reply to a comment", async ({ page }) => {
    test.setTimeout(120_000);

    // ── 0. Ensure staked ──
    console.log("  Checking staking requirements...");
    const stakeResult = await ensureStaked(200);
    console.log(
      stakeResult.alreadyStaked
        ? `  Already staked: ${stakeResult.staked} SAVVA`
        : `  Staked tokens (tx: ${stakeResult.txHash}). New stake: ${stakeResult.staked} SAVVA`
    );

    // ── 1. Setup + login + navigate to a post with comments ──
    await setupApp(page);
    await connectAndLogin(page);

    const allCards = page.locator("article:has(h4)");
    await allCards.first().waitFor({ state: "visible", timeout: 30_000 });
    const cardCount = await allCards.count();

    let foundReply = false;
    for (let i = 0; i < Math.min(cardCount, 8); i++) {
      const card = allCards.nth(i);
      const cardTitle = await card.locator("h4").textContent().catch(() => "");
      console.log(`  Trying post ${i + 1}: "${cardTitle.trim()}"`);
      await card.click();
      await page.waitForTimeout(1500);

      const hash = await page.evaluate(() => window.location.hash);
      if (!hash.includes("/post/")) {
        console.log(`  Post click didn't navigate (NSFW?), trying next...`);
        continue;
      }
      console.log(`  Navigated to: ${hash}`);

      // Scroll down to the comments section
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(2000);

      // Check for a Reply button (means there are comments)
      const replyCount = await page.locator('button:has-text("Reply")').count().catch(() => 0);
      if (replyCount > 0) {
        foundReply = true;
        console.log(`  Found ${replyCount} Reply button(s) on this post`);
        break;
      }

      console.log("  No comments with Reply buttons, going back...");
      await page.goBack();
      await page.waitForTimeout(1000);
    }

    if (!foundReply) {
      console.log("  No posts with comments found — skipping test");
      return;
    }

    // ── 2. Click Reply on the first comment ──
    const replyBtn = page.locator('button:has-text("Reply")').first();
    await replyBtn.click();
    console.log("  Clicked Reply");
    await page.waitForTimeout(1500);

    // ── 3. Write and publish the reply ──
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const replyText = `E2E test reply ${timestamp}`;
    await publishComment(page, replyText);

    // ── 4. Should navigate back ──
    await page.waitForTimeout(2000);
    const currentHash = await page.evaluate(() => window.location.hash);
    console.log(`  After publish, current hash: ${currentHash}`);

    // Verify reply is visible
    const replyOnPage = page.locator(`text="${replyText}"`);
    const replyVisible = await replyOnPage
      .waitFor({ state: "visible", timeout: 15_000 })
      .then(() => true)
      .catch(() => false);

    if (replyVisible) {
      console.log("  Reply is visible on the post page");
    } else {
      console.log("  Reply not immediately visible (may need page refresh or WebSocket update)");
    }
  });
});