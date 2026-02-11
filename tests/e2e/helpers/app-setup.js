// tests/e2e/helpers/app-setup.js
//
// Shared setup: configure localStorage, inject wallet mock, navigate to app.

import { setupWalletMock } from "./wallet-mock.js";
import { testConfig } from "./test-config.js";

/**
 * Prepare the page for E2E testing:
 * 1. Inject mock wallet
 * 2. Set localStorage overrides (backend, password gate)
 * 3. Navigate to the app and wait for it to load
 *
 * @param {import('@playwright/test').Page} page
 * @param {object} [opts]
 * @param {string} [opts.route] - Hash route to navigate to (default: "/")
 */
export async function setupApp(page, opts = {}) {
  const config = opts.config || testConfig;
  const route = opts.route || "/";

  // 1. Inject the mock wallet (must happen before page loads)
  await setupWalletMock(page, {
    privateKey: config.privateKey,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
  });

  // 2. Navigate to a blank page first to set localStorage
  await page.goto("about:blank");
  const baseUrl = page.context().browser()?.contexts?.[0]?._options?.baseURL || "http://localhost:5173";

  // We need to be on the same origin to set localStorage
  await page.goto(baseUrl + "/#/__setup__", { waitUntil: "commit" });

  await page.evaluate(
    ({ backendUrl, devPasswordHash }) => {
      // Point app at the test backend
      localStorage.setItem(
        "connect_override",
        JSON.stringify({
          domain: "",
          backendLink: backendUrl,
        })
      );
      // Skip the dev password gate
      if (devPasswordHash) {
        localStorage.setItem("dev_password_ok", devPasswordHash);
      }
    },
    {
      backendUrl: config.backendUrl,
      devPasswordHash: "9926355d68da965dbdab0a869d5c7082a3182ffb251aa0938d96539e4719bc41",
    }
  );

  // 3. Navigate to the actual route
  await page.goto(baseUrl + "/#" + route, { waitUntil: "domcontentloaded" });

  // 4. Wait for the app to finish loading (spinner disappears)
  await page.waitForFunction(
    () => !document.querySelector(".fixed.inset-0 .w-8.h-8"), // Spinner gone
    { timeout: 30000 }
  );

  // Small extra wait for SolidJS reactivity to settle
  await page.waitForTimeout(500);
}
