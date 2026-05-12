/**
 * Crawl test — exercises every reachable route + every admin action and
 * captures console errors and network errors. Lives alongside the smoke
 * spec but runs in a single test that produces a "findings" report at
 * the end. Designed to catch unexpected regressions across the whole app
 * with a single command.
 *
 *   npm run test:e2e -- crawl.spec.ts
 */
import { test, expect, type Page, type ConsoleMessage } from "@playwright/test";

const ALICE = { email: "alice@demo.local", password: "demo-password-A!" };

interface Finding {
  route: string;
  severity: "console" | "network" | "assert";
  message: string;
}

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.locator("input#email").waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("input#email").fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
}

test.describe("Knowledge Agent — crawl", () => {
  test("visit every route, exercise every admin action, capture findings", async ({ page }) => {
    test.setTimeout(600_000);
    const findings: Finding[] = [];

    function attach(currentRoute: () => string) {
      page.on("console", (msg: ConsoleMessage) => {
        if (msg.type() === "error") {
          findings.push({ route: currentRoute(), severity: "console", message: msg.text().slice(0, 300) });
        }
      });
      page.on("response", (res) => {
        const url = res.url();
        if (url.includes("/_next/") || url.includes("__nextjs")) return;
        if (res.status() >= 500) {
          findings.push({ route: currentRoute(), severity: "network", message: `HTTP ${res.status()} ${url}` });
        }
      });
    }
    let active = "/";
    attach(() => active);

    // 1. Landing page
    active = "/";
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /grounded chat agent/i })).toBeVisible({ timeout: 60_000 });

    // 2. Unauthed /chat → redirect to /login
    active = "/chat (unauthed)";
    await page.goto("/chat");
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    // 3. Unauthed /admin → redirect to /login
    active = "/admin (unauthed)";
    await page.goto("/admin");
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    // 4. Unauthed /widget → redirect
    active = "/widget (unauthed)";
    await page.goto("/widget");
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    // 5. Signup page renders
    active = "/signup";
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create your account/i })).toBeVisible({ timeout: 60_000 });

    // 6. Sign in as Alice
    active = "/login → /chat";
    await signIn(page, ALICE.email, ALICE.password);

    // 7. /widget while signed in
    active = "/widget (authed)";
    await page.goto("/widget");
    await expect(page.getByText(/knowledge assistant/i)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/embedded chat/i)).toBeVisible();

    // 8. Admin: each tab loads cleanly
    active = "/admin → Sources";
    await page.goto("/admin");
    await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(
      () => !document.body.innerText.toLowerCase().includes("loading…"),
      null,
      { timeout: 30_000 }
    );

    active = "/admin → Configuration";
    await page.getByRole("button", { name: /configuration/i }).click();
    await expect(page.locator("input#persona")).toBeVisible({ timeout: 30_000 });

    active = "/admin → Conversations";
    await page.getByRole("button", { name: /conversations/i }).click();
    await expect(page.getByText(/recent conversations/i)).toBeVisible({ timeout: 30_000 });

    active = "/admin → Analytics";
    await page.getByRole("button", { name: /analytics/i }).click();
    await expect(page.getByText(/documents/i).first()).toBeVisible({ timeout: 30_000 });

    // 9. Open the paste form, then cancel (verifies the add-source UI path)
    active = "/admin → open paste form";
    await page.getByRole("button", { name: /sources/i }).click();
    await page.getByRole("button", { name: /^paste$/i }).click();
    await expect(page.locator("input#title")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("textarea#text")).toBeVisible();
    await page.getByRole("button", { name: /^cancel$/i }).click();
    await expect(page.locator("input#title")).toHaveCount(0, { timeout: 5_000 });

    // 10. Open the delete-confirm modal on the first existing doc, then Cancel
    active = "/admin → open delete confirm, cancel";
    const firstRow = page.locator("ul.divide-y > li").first();
    await firstRow.locator('button[title="Delete"]').click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByText(/delete this document/i)).toBeVisible();
    await dialog.getByRole("button", { name: /cancel/i }).click();
    await expect(dialog).toHaveCount(0, { timeout: 5_000 });

    // 11. Configuration tab: change top_k, save, expect toast
    active = "/admin → save config";
    await page.getByRole("button", { name: /configuration/i }).click();
    await expect(page.locator("input#persona")).toBeVisible({ timeout: 30_000 });
    const slider = page.locator("input#topk");
    await slider.evaluate((el) => {
      (el as HTMLInputElement).value = "10";
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText(/configuration saved/i)).toBeVisible({ timeout: 15_000 });

    // 12. Conversations tab: open a conversation modal if any exist
    active = "/admin → open conversation modal";
    await page.getByRole("button", { name: /conversations/i }).click();
    const firstConv = page.locator("ul.divide-y > li button").first();
    if ((await firstConv.count()) > 0) {
      await firstConv.click();
      await expect(page.locator('button[title="Close (Esc)"]').or(page.getByRole("button", { name: /close/i }))).toBeVisible({
        timeout: 10_000,
      });
      // Close via Escape
      await page.keyboard.press("Escape");
    }

    // 13. Sign out
    active = "sign out";
    await page.evaluate(() => {
      const form = document.querySelector('form[action="/auth/signout"]');
      if (form) (form as HTMLFormElement).submit();
    });
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // 14. Authed routes again redirect to /login
    active = "/chat after signout";
    await page.goto("/chat");
    await page.waitForURL(/\/login/, { timeout: 30_000 });

    // ---- Report findings ----
    console.log("\n========= Crawl findings =========");
    if (findings.length === 0) {
      console.log("  (none)");
    } else {
      for (const f of findings) {
        console.log(`  [${f.severity}] ${f.route}\n     ${f.message}`);
      }
    }
    console.log("==================================\n");

    // Network-level 5xx errors fail the test. Console errors are reported
    // but don't fail (Next dev sometimes emits stale-module noise on hot
    // reload that isn't actionable).
    const fatal = findings.filter((f) => f.severity === "network");
    expect(fatal, `crawl observed ${fatal.length} 5xx responses`).toEqual([]);
  });
});
