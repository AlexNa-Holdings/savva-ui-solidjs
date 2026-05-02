// tests/e2e/seo-meta.spec.js
//
// Test: SPA-side runtime meta-tag updates (PR 6 SEO).
//
// Verifies that on client-side navigation:
//  1. List routes (/fundraising, /npo-list) install canonical, og:*, twitter:*,
//     and a non-default document.title.
//  2. Tags installed by useMeta carry data-managed-seo="1".
//  3. Navigating back to a non-entity route removes managed tags and restores
//     the AppContext-default title.
//
// Does NOT require a wallet or login — just the SPA mounting against a backend
// (so it shares the same TEST_BACKEND default as other specs but skips the
// wallet-mock injection used by helpers/app-setup.js).

import { test, expect } from "@playwright/test";

const BACKEND_URL =
  process.env.TEST_BACKEND || "https://monad-test.savva.app/api/";
const DEV_PASSWORD_HASH =
  "9926355d68da965dbdab0a869d5c7082a3182ffb251aa0938d96539e4719bc41";

// Read-only app setup: set the same localStorage overrides as the other
// helpers but skip wallet injection.
async function setupAppRO(page) {
  await page.goto("about:blank");
  const baseUrl =
    page.context().browser()?.contexts?.[0]?._options?.baseURL ||
    "http://localhost:5173";

  await page.goto(baseUrl + "/#/__setup__", { waitUntil: "commit" });
  await page.evaluate(
    ({ backendUrl, devPasswordHash }) => {
      localStorage.setItem(
        "connect_override",
        JSON.stringify({ domain: "", backendLink: backendUrl }),
      );
      localStorage.setItem("dev_password_ok", devPasswordHash);
    },
    { backendUrl: BACKEND_URL, devPasswordHash: DEV_PASSWORD_HASH },
  );
  return baseUrl;
}

async function gotoRoute(page, baseUrl, route) {
  await page.goto(baseUrl + "/#" + route, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () => !document.querySelector(".fixed.inset-0 .w-8.h-8"),
    { timeout: 30_000 },
  );
  // Settle SolidJS reactivity (useMeta runs in createEffect).
  await page.waitForTimeout(500);
}

// Read all managed-by-SEO head elements as a flat dict.
async function readManagedHead(page) {
  return page.evaluate(() => {
    const tags = Array.from(
      document.head.querySelectorAll('[data-managed-seo="1"]'),
    );
    const out = {};
    for (const el of tags) {
      const key =
        el.getAttribute("property") ||
        el.getAttribute("name") ||
        el.getAttribute("rel");
      out[key] =
        el.tagName === "LINK"
          ? el.getAttribute("href")
          : el.getAttribute("content");
    }
    return { title: document.title, tags: out };
  });
}

test.describe("SEO runtime meta", () => {
  test("list route /fundraising installs canonical + og + twitter meta", async ({
    page,
  }) => {
    const baseUrl = await setupAppRO(page);
    await gotoRoute(page, baseUrl, "/fundraising");

    const head = await readManagedHead(page);

    // Canonical points at /fundraising on whatever the configured site is
    // (may be the test domain or a localhost fallback — we only assert path).
    expect(head.tags.canonical).toBeTruthy();
    expect(head.tags.canonical).toMatch(/\/fundraising$/);
    expect(head.tags["og:url"]).toBe(head.tags.canonical);

    // List page conventions: og:type=website, twitter:card=summary.
    expect(head.tags["og:type"]).toBe("website");
    expect(head.tags["twitter:card"]).toBe("summary");

    // Site name and locale present.
    expect(head.tags["og:site_name"]).toBeTruthy();
    expect(head.tags["og:locale"]).toBeTruthy();

    // Title was overridden from the AppContext default.
    expect(head.title).toContain("|");
    expect(head.tags["og:title"]).toBe(head.title);
    expect(head.tags["twitter:title"]).toBe(head.title);

    expect(head.tags.robots).toBe("index,follow");
  });

  test("list route /npo-list installs canonical pointing at /npo-list", async ({
    page,
  }) => {
    const baseUrl = await setupAppRO(page);
    await gotoRoute(page, baseUrl, "/npo-list");

    const head = await readManagedHead(page);

    expect(head.tags.canonical).toMatch(/\/npo-list$/);
    expect(head.tags["og:url"]).toBe(head.tags.canonical);
    expect(head.tags["og:type"]).toBe("website");
    expect(head.tags["twitter:card"]).toBe("summary");
    expect(head.title).toContain("|");
  });

  test("navigating back to / clears managed meta and restores default title", async ({
    page,
  }) => {
    const baseUrl = await setupAppRO(page);

    // Land on home, capture the AppContext-default title.
    await gotoRoute(page, baseUrl, "/");
    const homeBefore = await readManagedHead(page);
    expect(Object.keys(homeBefore.tags)).toHaveLength(0);
    const defaultTitle = homeBefore.title;
    expect(defaultTitle).toBeTruthy();

    // Navigate to a list route — managed tags appear, title changes.
    await gotoRoute(page, baseUrl, "/fundraising");
    const listHead = await readManagedHead(page);
    expect(listHead.tags.canonical).toMatch(/\/fundraising$/);
    expect(listHead.title).not.toBe(defaultTitle);

    // Navigate back to home — managed tags must be gone and title restored.
    await gotoRoute(page, baseUrl, "/");
    const homeAfter = await readManagedHead(page);
    expect(Object.keys(homeAfter.tags)).toHaveLength(0);
    expect(homeAfter.title).toBe(defaultTitle);
  });
});
