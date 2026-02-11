// tests/e2e/profile-setup.spec.js
//
// Test: set registered name and avatar for both test accounts.
// Flow: Connect → Login → Navigate to profile edit → Set name → Set avatar

import { test, expect } from "@playwright/test";
import { setupApp } from "./helpers/app-setup.js";
import { testConfig, testConfig2 } from "./helpers/test-config.js";
import { ensureStaked } from "./helpers/staking-helper.js";
import { createRobotAvatar1, createRobotAvatar2 } from "./helpers/test-image.js";

/**
 * Connect wallet and login. Reusable across profile tests.
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

/**
 * Full profile setup: name registration + avatar upload.
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} config - test account config (testConfig or testConfig2)
 * @param {string} desiredName - name to register (e.g. "e2etest1")
 */
async function setupProfile(page, config, desiredName, avatarBuffer) {
  // ── 0. Ensure staked (needed for later publishing, good to have) ──
  console.log(`  Setting up profile for ${config.accountAddress}`);
  await ensureStaked(200, config);

  // ── 1. Setup and navigate directly to profile edit page ──
  await setupApp(page, {
    config,
    route: `/profile-edit/${config.accountAddress}`,
  });

  // ── 2. Connect + Login ──
  await connectAndLogin(page);

  // ── 3. Wait for profile edit form to load ──
  const crossDomainHeading = page.locator(
    'h3:has-text("Cross Domain Settings")'
  );
  await crossDomainHeading.waitFor({ state: "visible", timeout: 30_000 });
  console.log("  Profile edit page loaded");

  // ── 4. Set registered name ──
  const nameInput = page.locator("#registered-name");
  await nameInput.waitFor({ state: "visible", timeout: 10_000 });

  const currentName = await nameInput.inputValue();
  console.log(
    `  Current name: "${currentName}", desired: "${desiredName}"`
  );

  if (currentName === desiredName) {
    console.log(`  Name "${desiredName}" already set, skipping registration`);
  } else {
    await nameInput.clear();
    await nameInput.fill(desiredName);

    // Wait for debounce validation to complete (500ms + contract call)
    // The "Register Name" button appears when not checking/registering
    const registerBtn = page.locator('button:has-text("Register Name")');
    await registerBtn.waitFor({ state: "visible", timeout: 15_000 });
    await expect(registerBtn).toBeEnabled({ timeout: 15_000 });

    // Check for name errors (e.g. "already taken" by another account)
    const nameError = page.locator(
      'p.text-xs[class*="destructive"]'
    );
    const hasError = await nameError.isVisible().catch(() => false);
    if (hasError) {
      const errText = await nameError.textContent().catch(() => "");
      throw new Error(
        `Name "${desiredName}" validation failed: ${errText}`
      );
    }

    await registerBtn.click();

    // Handle confirm modal (appears when changing an existing name)
    try {
      const confirmModal = page.locator('text="Confirm Name Change"');
      await confirmModal.waitFor({ state: "visible", timeout: 3000 });
      const confirmBtn = page.locator('button:has-text("Confirm")');
      await confirmBtn.click();
      console.log("  Confirmed name change in modal");
    } catch {
      // No confirm modal — first-time registration, that's fine
    }

    // Wait for name registration to complete (contract tx)
    const deadline = Date.now() + 60_000;
    let success = false;

    while (Date.now() < deadline && !success) {
      // Check for success toast
      const toast = page.locator('text="Name registered successfully!"');
      if (await toast.isVisible().catch(() => false)) {
        success = true;
        break;
      }

      // Also check if register button became disabled (nameInput === initialName after success)
      const disabled = await registerBtn.isDisabled().catch(() => false);
      if (disabled) {
        const val = await nameInput.inputValue();
        if (val === desiredName) {
          success = true;
          break;
        }
      }

      await page.waitForTimeout(500);
    }

    if (!success) {
      throw new Error(
        `Name registration timed out for "${desiredName}" after 60s`
      );
    }
    console.log(`  Name "${desiredName}" registered successfully`);
  }

  // ── 5. Set avatar ──
  console.log("  Setting avatar...");

  const pngBuffer = avatarBuffer;
  const filePayload = {
    name: "robot-avatar.png",
    mimeType: "image/png",
    buffer: pngBuffer,
  };

  // Auto-handle any file chooser dialog that may pop up
  page.once("filechooser", (chooser) => chooser.setFiles(filePayload));

  // Click the avatar area to open the editor modal.
  // The avatar div has classList with "rounded-2xl cursor-pointer" when editable.
  const avatarArea = page.locator(
    'div[class*="rounded-2xl"][class*="cursor-pointer"]'
  ).first();
  await avatarArea.waitFor({ state: "visible", timeout: 10_000 });
  await avatarArea.click();

  // Wait for the "Edit Avatar" modal
  const editAvatarTitle = page.locator('text="Edit Avatar"');
  await editAvatarTitle.waitFor({ state: "visible", timeout: 10_000 });

  // The modal auto-clicks the hidden file input via setTimeout(0).
  // In headless mode the filechooser event may not fire — use setInputFiles as fallback.
  await page.waitForTimeout(500);

  const canvasEl = page.locator("canvas");
  let imageLoaded = await canvasEl.isVisible().catch(() => false);

  if (!imageLoaded) {
    console.log("  Filechooser did not fire, setting files directly");
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await fileInput.setInputFiles(filePayload);
  }

  await canvasEl.waitFor({ state: "visible", timeout: 10_000 });
  console.log("  Image loaded in crop editor");

  // Click "Save" button in the avatar editor modal (exact match to avoid "Save Changes")
  const saveBtn = page.getByRole("button", { name: "Save", exact: true });
  await saveBtn.waitFor({ state: "visible", timeout: 5_000 });
  await saveBtn.click();

  // Wait for avatar upload + contract call to complete (modal closes on success)
  const modalTitle = page.locator('text="Edit Avatar"');
  const avatarDeadline = Date.now() + 60_000;
  let avatarSuccess = false;

  while (Date.now() < avatarDeadline && !avatarSuccess) {
    const modalVisible = await modalTitle.isVisible().catch(() => false);
    if (!modalVisible) {
      avatarSuccess = true;
      break;
    }
    await page.waitForTimeout(500);
  }

  if (!avatarSuccess) {
    throw new Error("Avatar save timed out after 60s");
  }
  console.log("  Avatar set successfully");
}

test.describe("Profile Setup", () => {
  test("set name and avatar for account 1", async ({ page }) => {
    await setupProfile(page, testConfig, "e2etest1", createRobotAvatar1());
  });

  test("set name and avatar for account 2", async ({ page }) => {
    test.skip(!testConfig2, "TEST_PRIVATE_KEY2 not set in .env");
    await setupProfile(page, testConfig2, "e2etest2", createRobotAvatar2());
  });
});
