import { test, expect, type Page } from "@playwright/test";

// Hard-coded demo credentials matching scripts/_lib.ts SEED_USERS.
const ALICE = { email: "alice@demo.local", password: "demo-password-A!" };
const BOB = { email: "bob@demo.local", password: "demo-password-B!" };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  // Wait for the form to be fully interactive — Turbopack can take a moment
  // on a cold compile of /login.
  const emailInput = page.locator("input#email");
  await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  await emailInput.fill(email);
  await page.locator("input#password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/chat/, { timeout: 30_000 });
}

async function signOut(page: Page) {
  // The signout form is in the sidebar; on mobile it's in the header.
  // Submit it via JS to avoid layout flakiness.
  await page.evaluate(() => {
    const form = document.querySelector('form[action="/auth/signout"]');
    if (form) (form as HTMLFormElement).submit();
  });
  await page.waitForURL(/\/login/, { timeout: 15_000 });
}

async function sendChat(page: Page, prompt: string) {
  const input = page.getByPlaceholder(/ask anything/i);
  await input.fill(prompt);
  // Submit by clicking the send button — Enter sometimes races with form ready state.
  await page.locator('form button[type="submit"]').first().click();
}

async function waitForAssistantReply(page: Page): Promise<string> {
  // Wait until at least one assistant bubble has substantive text. Dev mode
  // can be very slow on cold compile + cold LLM streaming, so the timeout is
  // generous. `next build && next start` reduces this to ~3s.
  // The `.prose-chat` selector only matches real assistant messages — phantom
  // data-only messages are filtered out in chat.tsx (no .prose-chat).
  await page.waitForFunction(
    () => {
      const bubbles = Array.from(document.querySelectorAll(".prose-chat"));
      return bubbles.some((b) => (b.textContent || "").trim().length > 30);
    },
    null,
    { timeout: 120_000 }
  );
  await expect(page.getByText(/thinking/i)).toHaveCount(0, { timeout: 30_000 });

  const text = (await page.locator(".prose-chat").last().innerText()).trim();
  expect(text.length).toBeGreaterThan(30);
  return text;
}

test.describe("Knowledge Agent — end-to-end smoke", () => {
  test("landing page renders the hero", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /grounded chat agent/i })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByRole("link", { name: /log in/i }).first()).toBeVisible();
  });

  test("redirects unauthenticated user away from /chat", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  // Bundle Alice's chat + admin + isolation into a single test so we pay the
  // cold-compile cost once. Dev-mode Webpack takes ~30-90s on first hit of
  // /chat and /admin; production build cuts that to a few seconds.
  test("Alice end-to-end: chat → citations → admin → her pizza KB", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, ALICE.email, ALICE.password);
    await expect(page).toHaveURL(/\/chat$/);

    await sendChat(page, "What style of pizza should I try if my home oven maxes at 550°F?");
    const text = await waitForAssistantReply(page);

    // Answer should mention at least one home-oven-friendly style.
    expect(text.toLowerCase()).toMatch(/ny|new york|detroit|sicilian|al taglio|grandma/);

    // Citations should appear under the message.
    const citationChips = page.locator('main .mx-auto.flex.max-w-3xl a[href="#"]');
    await expect(citationChips.first()).toBeVisible({ timeout: 10_000 });
    expect(await citationChips.count()).toBeGreaterThanOrEqual(1);

    // Now check her admin shows pizza, not muscle.
    await page.goto("/admin");
    await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 30_000 });
    await page.waitForFunction(
      () => !document.body.innerText.toLowerCase().includes("loading…"),
      null,
      { timeout: 30_000 }
    );
    const body = (await page.locator("body").innerText()).toLowerCase();
    expect(body).toMatch(/neapolitan|detroit|dough|sauce/);
    expect(body).not.toMatch(/creatine|hypertrophy|whey protein/);
  });

  test("Alice can open the admin panel and see her pizza KB", async ({ page }) => {
    await signIn(page, ALICE.email, ALICE.password);
    await page.getByRole("link", { name: /admin/i }).first().click();
    await page.waitForURL(/\/admin/);

    // Sources tab is default; should list pizza docs.
    await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 15_000 });
    // Wait for the "Loading…" spinner to disappear, indicating fetch finished.
    await page.waitForFunction(
      () => !document.body.innerText.toLowerCase().includes("loading…"),
      { timeout: 20_000 }
    );

    const sourcesText = await page.locator("body").innerText();
    // Should mention at least one of our pizza-doc titles.
    expect(sourcesText.toLowerCase()).toMatch(/neapolitan|new york|detroit|dough|sauce/);

    // Configuration tab loads.
    await page.getByRole("button", { name: /configuration/i }).click();
    await expect(page.getByLabel(/persona/i)).toBeVisible({ timeout: 10_000 });
    const persona = await page.getByLabel(/persona/i).inputValue();
    expect(persona.toLowerCase()).toMatch(/pizza/);
  });

  test("Bob (muscle KB) sees a different KB after switching accounts", async ({ page }) => {
    // First sign in as Alice and remember her sources page snippet.
    await signIn(page, ALICE.email, ALICE.password);
    await page.goto("/admin");
    await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(
      () => !document.body.innerText.toLowerCase().includes("loading…"),
      { timeout: 20_000 }
    );
    const aliceSources = (await page.locator("body").innerText()).toLowerCase();

    // Sign out, sign in as Bob.
    await signOut(page);
    await signIn(page, BOB.email, BOB.password);
    await page.goto("/admin");
    await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForFunction(
      () => !document.body.innerText.toLowerCase().includes("loading…"),
      { timeout: 20_000 }
    );
    const bobSources = (await page.locator("body").innerText()).toLowerCase();

    // Bob should see muscle / supplement content; should NOT see pizza-specific titles.
    expect(bobSources).toMatch(/creatine|supplement|hypertrophy|protein|muscle/);
    expect(bobSources).not.toMatch(/neapolitan|detroit-style pizza|dough hydration/);

    // And cross-check: Alice's sources page didn't contain Bob's titles.
    expect(aliceSources).not.toMatch(/creatine monohydrate|whey protein/);
  });

  test("Bob end-to-end: chat → muscle answer + off-topic refusal", async ({ page }) => {
    test.setTimeout(300_000);
    await signIn(page, BOB.email, BOB.password);
    await sendChat(page, "Should I take creatine? Give me dose, cost, and time to effect.");
    const text = await waitForAssistantReply(page);

    const lower = text.toLowerCase();
    expect(lower).toMatch(/creatine/);
    expect(lower).toMatch(/3.{0,5}5\s*g|monohydrate|evidence|cost|\$/);
    expect(lower).not.toMatch(/neapolitan|cornicione/);

    // Same conversation, ask an off-topic question. Agent should decline.
    await page.locator('button:has-text("New chat")').click().catch(() => {});
    await sendChat(page, "What's the best style of pizza for a home oven?");
    const offTopic = await waitForAssistantReply(page);
    const lt = offTopic.toLowerCase();
    expect(lt).toMatch(/don't know|don't have|outside|knowledge base|off[- ]topic|hypertrophy|muscle|supplement|cannot/);
  });
});
