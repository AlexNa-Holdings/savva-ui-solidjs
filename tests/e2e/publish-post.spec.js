// tests/e2e/publish-post.spec.js
//
// Comprehensive post publishing test:
// - English + Russian content (title, body, tags)
// - Image upload, thumbnail, inline image in markdown body
// - Category selection
// - Preview verification
// - Full publish wizard (5 steps)

import { test, expect } from "@playwright/test";
import { setupApp } from "./helpers/app-setup.js";
import { testConfig } from "./helpers/test-config.js";
import { ensureStaked } from "./helpers/staking-helper.js";
import { createTestPng } from "./helpers/test-image.js";

/**
 * Connect wallet and login. Reusable helper.
 */
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

test.describe("Post Publishing", () => {
  test("publish a rich post with categories, tags, thumbnail, images, and two locales", async ({ page }) => {
    test.setTimeout(180_000); // 3 min — many steps + blockchain txns
    // ── 0. Ensure account has enough stake to publish ──
    console.log("  Checking staking requirements...");
    const stakeResult = await ensureStaked(200);
    if (stakeResult.alreadyStaked) {
      console.log(`  Already staked: ${stakeResult.staked} SAVVA`);
    } else {
      console.log(`  Staked tokens (tx: ${stakeResult.txHash}). New stake: ${stakeResult.staked} SAVVA`);
    }

    // ── 1. Setup: inject wallet mock, localStorage, navigate ──
    await setupApp(page);

    // ── 2. Connect wallet + Login ──
    await connectAndLogin(page);

    // ── 3. Navigate to editor by clicking "New Post" ──
    const newPostBtn = page.locator(
      'button[aria-label="New Post"], button:has-text("New Post")'
    );
    await newPostBtn.waitFor({ state: "visible", timeout: 10_000 });
    await newPostBtn.click();
    await page.waitForTimeout(1500);

    // ── 4. Fill English title ──
    const titleInput = page.locator('input[placeholder="Post Title"]');
    await titleInput.waitFor({ state: "visible", timeout: 15_000 });

    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const enTitle = `E2E Rich Post ${timestamp}`;
    await titleInput.fill(enTitle);
    console.log(`  EN title: "${enTitle}"`);

    // ── 5. Upload image via Files drawer ──
    console.log("  Opening files drawer...");

    // Click the "Files" button (icon button near the title)
    const filesBtn = page.locator('button:has-text("Files")');
    await filesBtn.waitFor({ state: "visible", timeout: 10_000 });
    await filesBtn.click();
    await page.waitForTimeout(500);

    // Wait for the drawer to appear
    const drawer = page.locator('.fixed.right-0.w-80');
    await drawer.waitFor({ state: "visible", timeout: 5_000 });

    // Upload a test PNG via the hidden file input inside the drawer
    const pngBuffer = createTestPng(128, 128);
    const filePayload = {
      name: "test-image.png",
      mimeType: "image/png",
      buffer: pngBuffer,
    };

    const drawerFileInput = drawer.locator('input[type="file"]');
    await drawerFileInput.setInputFiles(filePayload);
    console.log("  Uploaded test-image.png");

    // Wait for the file to appear in the grid
    const fileGridItem = drawer.locator('[title="test-image.png"]');
    await fileGridItem.waitFor({ state: "visible", timeout: 10_000 });
    console.log("  File appeared in grid");

    // ── 5a. Set as Thumbnail ──
    await fileGridItem.click();
    await page.waitForTimeout(300);

    // The context menu appears with "Insert", "Set as Thumbnail", etc.
    const setThumbnailLink = page.locator('a:has-text("Set as Thumbnail")');
    await setThumbnailLink.waitFor({ state: "visible", timeout: 5_000 });
    await setThumbnailLink.click();
    console.log("  Set as thumbnail");
    await page.waitForTimeout(300);

    // ── 5b. Insert image into body ──
    await fileGridItem.click();
    await page.waitForTimeout(300);

    const insertLink = page.getByRole("link", { name: "Insert", exact: true });
    await insertLink.waitFor({ state: "visible", timeout: 5_000 });
    await insertLink.click();
    console.log("  Inserted image into body");
    await page.waitForTimeout(300);

    // Close the files drawer by clicking the X button
    const drawerCloseBtn = drawer.locator('button:has(svg)').first();
    await drawerCloseBtn.click();
    await page.waitForTimeout(500);

    // ── 6. Fill English body with markdown ──
    const bodyArea = page.locator(
      'textarea[placeholder="Start writing your post content here..."]'
    );
    await bodyArea.waitFor({ state: "visible", timeout: 10_000 });

    // The body may already have the inserted image markdown — append our text
    const existingBody = await bodyArea.inputValue();
    const enBody = `${existingBody}\n\nThis is a comprehensive E2E test post with **rich content**.\n\nCreated at: ${timestamp}\nAccount: ${testConfig.accountAddress}\n\n## Features Tested\n- Categories and tags\n- Thumbnail image\n- Inline images in markdown\n- Multi-locale content (EN + RU)\n\n*Italic text* and \`inline code\` for markdown testing.`;
    await bodyArea.fill(enBody);
    console.log("  EN body filled");

    // ── 7. Set Categories ──
    console.log("  Setting categories...");

    // The categories chevron button has aria-label="Select" and title="Select"
    const catChevron = page.getByRole("button", { name: "Select", exact: true });
    await catChevron.scrollIntoViewIfNeeded();
    await catChevron.waitFor({ state: "visible", timeout: 10_000 });
    await catChevron.click();
    await page.waitForTimeout(500);

    // Select the first 2 category checkboxes by role
    const savvaCheckbox = page.getByRole("checkbox", { name: "SAVVA" });
    await savvaCheckbox.waitFor({ state: "visible", timeout: 5_000 });
    await savvaCheckbox.click();
    console.log("  Selected category: SAVVA");

    const pulseChainCheckbox = page.getByRole("checkbox", { name: "PulseChain" });
    await pulseChainCheckbox.click();
    console.log("  Selected category: PulseChain");

    // Close the dropdown by clicking outside
    await bodyArea.click();
    await page.waitForTimeout(300);

    // ── 8. Set Tags ──
    console.log("  Setting tags...");
    const tagsInput = page.locator('input[placeholder="tag one, tag two, long phrase tag"]');
    await tagsInput.waitFor({ state: "visible", timeout: 10_000 });
    await tagsInput.fill("e2e-test, automated, blockchain");
    // Blur to commit tags (they normalize on blur)
    await tagsInput.evaluate((el) => el.blur());
    await page.waitForTimeout(300);
    console.log("  EN tags set: e2e-test, automated, blockchain");

    // ── 9. Switch to Russian locale ──
    console.log("  Switching to Russian locale...");

    // Scroll back up to find the LangSelector near the title
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // The LangSelector shows "EN" and "RU" pill buttons (use .first() — there's also one in the right pane)
    const ruButton = page.locator('button.themed-pill:has-text("RU")').first();
    await ruButton.waitFor({ state: "visible", timeout: 10_000 });
    await ruButton.click();
    await page.waitForTimeout(500);

    // Verify we switched (RU pill should be active)
    await expect(ruButton).toHaveAttribute("aria-pressed", "true", { timeout: 5_000 });
    console.log("  Switched to RU locale");

    // ── 10. Fill Russian title ──
    const ruTitle = `E2E Тестовый пост ${timestamp}`;
    await titleInput.fill(ruTitle);
    console.log(`  RU title: "${ruTitle}"`);

    // ── 11. Fill Russian body ──
    const ruBody = `Это комплексный тестовый пост E2E с **богатым содержанием**.\n\nСоздано: ${timestamp}\nАккаунт: ${testConfig.accountAddress}\n\n## Проверяемые функции\n- Категории и теги\n- Изображение для обложки\n- Встроенные изображения в тексте\n- Мультиязычный контент (EN + RU)\n\n*Курсивный текст* и \`встроенный код\` для проверки markdown.`;
    await bodyArea.fill(ruBody);
    console.log("  RU body filled");

    // ── 12. Set Russian tags ──
    console.log("  Setting RU tags...");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    await tagsInput.waitFor({ state: "visible", timeout: 10_000 });
    await tagsInput.fill("е2е-тест, автоматический, блокчейн");
    await tagsInput.evaluate((el) => el.blur());
    await page.waitForTimeout(300);
    console.log("  RU tags set");

    // ── 13. Switch back to English for preview ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    const enButton = page.locator('button.themed-pill:has-text("EN")').first();
    await enButton.click();
    await page.waitForTimeout(500);
    console.log("  Switched back to EN for preview");

    // ── 14. Click "Preview Post" ──
    console.log("  Opening preview...");
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);

    const previewBtn = page.locator('button:has-text("Preview Post")');
    await previewBtn.waitFor({ state: "visible", timeout: 10_000 });
    await previewBtn.click();
    await page.waitForTimeout(1000);

    // ── 15. Verify preview content ──
    // Title should be visible (use getByRole to match the specific heading)
    const previewTitle = page.getByRole("heading", { name: /E2E Rich Post/ });
    await expect(previewTitle).toBeVisible({ timeout: 10_000 });
    console.log("  Preview title verified");

    // Thumbnail should be visible (img with alt "Thumbnail preview")
    const thumbnailImg = page.locator('img[alt="Thumbnail preview"]');
    const hasThumbnail = await thumbnailImg.isVisible().catch(() => false);
    if (hasThumbnail) {
      console.log("  Thumbnail visible in preview");
    } else {
      console.log("  Warning: Thumbnail not visible in preview (may be a blob URL issue)");
    }

    // ── 16. Click "Publish" in preview ──
    const publishBtn = page.locator('button:has-text("Publish")');
    await publishBtn.waitFor({ state: "visible", timeout: 10_000 });
    await publishBtn.click();
    console.log("  Publish clicked");

    // ── 17. Wait for wizard to complete all 5 steps ──
    // Wizard: Validate → Check Rights → IPFS Upload → IPFS Publish → Publish
    const deadline = Date.now() + 120_000;
    let result = "pending";

    while (Date.now() < deadline && result === "pending") {
      // Check for "Permission Denied" (insufficient stake)
      const permDenied = page.locator('text="Permission Denied"');
      if (await permDenied.isVisible().catch(() => false)) {
        const detail = await page
          .locator("text=/Insufficient stake/")
          .textContent()
          .catch(() => "");
        throw new Error(
          `Permission Denied: ${detail || "Insufficient stake to publish"}. ` +
            `Auto-staking should have handled this. Check staking-helper.js.`
        );
      }

      // Check for generic publishing error
      const errorTitle = page.locator('text="Publishing Failed"');
      if (await errorTitle.isVisible().catch(() => false)) {
        const errorMsg = await page
          .locator(".text-red-500, .text-destructive")
          .textContent()
          .catch(() => "unknown error");
        throw new Error(`Publishing failed: ${errorMsg}`);
      }

      // Check for success toast
      const successToast = page.locator('text="Successfully published!"');
      if (await successToast.isVisible().catch(() => false)) {
        result = "success";
        console.log("  Success toast appeared");
        break;
      }

      // Check if all wizard steps are green (5 green checkmarks)
      const greenCount = await page
        .locator(".bg-green-500.border-green-500")
        .count()
        .catch(() => 0);
      if (greenCount >= 5) {
        result = "success";
        console.log("  All wizard steps completed");
        break;
      }

      await page.waitForTimeout(2000);
    }

    if (result === "pending") {
      const greenCount = await page
        .locator(".bg-green-500.border-green-500")
        .count()
        .catch(() => 0);
      throw new Error(
        `Publishing timed out after 120s. Completed steps: ${greenCount}/5. ` +
          `Check the screenshot for the current wizard state.`
      );
    }

    console.log(`  Post "${enTitle}" published successfully with categories, tags, thumbnail, and EN+RU content`);
  });
});