import { test, expect, type Page } from "@playwright/test";

// Hard-coded demo credentials matching scripts/_lib.ts SEED_USERS.
const ALICE = { email: "alice@demo.local", password: "demo-password-A!" };
const BOB = { email: "bob@demo.local", password: "demo-password-B!" };

async function signIn(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait for the redirect to /chat to settle.
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
  await input.press("Enter");
  // The user's own message renders immediately.
  await expect(page.locator(".max-w-\\[85\\%\\]").first()).toBeVisible({ timeout: 5_000 });
}

async function waitForAssistantReply(page: Page) {
  // After streaming, the "thinking…" indicator should be gone and at least one
  // assistant bubble (a div with the border class — not the user pill) should
  // have non-empty text.
  await expect(page.getByText(/thinking/i)).toHaveCount(0, { timeout: 75_000 });

  // The assistant bubble is rendered with the .prose-chat helper class.
  const assistantBubbles = page.locator(".prose-chat");
  await expect(assistantBubbles.first()).toBeVisible({ timeout: 60_000 });
  const text = (await assistantBubbles.first().innerText()).trim();
  expect(text.length).toBeGreaterThan(10);
  return text;
}

test.describe("Knowledge Agent — end-to-end smoke", () => {
  test("landing page renders the hero", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /grounded chat agent/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /log in/i }).first()).toBeVisible();
  });

  test("redirects unauthenticated user away from /chat", async ({ page }) => {
    await page.goto("/chat");
    await page.waitForURL(/\/login/, { timeout: 15_000 });
    expect(page.url()).toContain("/login");
  });

  test("Alice (pizza KB) can sign in, chat, and see citations", async ({ page }) => {
    await signIn(page, ALICE.email, ALICE.password);
    await expect(page).toHaveURL(/\/chat$/);

    await sendChat(page, "What style of pizza should I try if my home oven maxes at 550°F?");
    const text = await waitForAssistantReply(page);

    // Answer should mention at least one home-oven-friendly style (NY/Detroit/Sicilian/al taglio).
    expect(text.toLowerCase()).toMatch(/ny|new york|detroit|sicilian|al taglio|grandma/);

    // At least one citation chip should appear ("[1]") below the message.
    await expect(page.locator("text=/\\[\\d+\\]/").first()).toBeVisible({ timeout: 5_000 });
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

  test("Bob can chat and gets answers from his KB, not Alice's", async ({ page }) => {
    await signIn(page, BOB.email, BOB.password);
    await sendChat(page, "Should I take creatine? Give me dose, cost, and time to effect.");
    const text = await waitForAssistantReply(page);

    const lower = text.toLowerCase();
    expect(lower).toMatch(/creatine/);
    // Should include either dose info or evidence framing — proves it pulled from the supplement catalog.
    expect(lower).toMatch(/3.{0,5}5\s*g|monohydrate|evidence|cost/);
    // Should NOT veer into pizza land.
    expect(lower).not.toMatch(/neapolitan|cornicione|dough hydration/);
  });

  test("Off-topic question gets graceful refusal", async ({ page }) => {
    await signIn(page, ALICE.email, ALICE.password);
    await sendChat(page, "How do I optimize a slow Postgres query?");
    const text = await waitForAssistantReply(page);
    const lower = text.toLowerCase();
    // Agent should decline or redirect — not invent SQL advice.
    expect(lower).toMatch(/don't know|don't have|outside|knowledge base|off-topic|pizza/);
  });
});
