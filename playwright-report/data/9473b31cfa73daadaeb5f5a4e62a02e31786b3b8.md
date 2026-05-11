# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> Knowledge Agent — end-to-end smoke >> Bob can chat and gets answers from his KB, not Alice's
- Location: e2e\smoke.spec.ts:129:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('.prose-chat').first()
Expected: visible
Received: hidden
Timeout:  60000ms

Call log:
  - Expect "toBeVisible" with timeout 60000ms
  - waiting for locator('.prose-chat').first()
    121 × locator resolved to <div class="prose-chat"></div>
        - unexpected value "hidden"

```

```yaml
- alert
- complementary:
  - link "Knowledge Agent":
    - /url: /chat
  - navigation:
    - link "Chat":
      - /url: /chat
    - link "Admin":
      - /url: /admin
  - text: Signed in as bob@demo.local
  - button "Sign out"
- main:
  - text: Should I take creatine? Give me dose, cost, and time to effect.
  - link "[1] Supplement catalog — evidence-based picks for muscle building":
    - /url: "#"
  - link "[2] Pre-workout supplements and the pump — what's worth it":
    - /url: "#"
  - link "[3] Pre-workout supplements and the pump — what's worth it":
    - /url: "#"
  - link "[4] Supplement catalog — evidence-based picks for muscle building":
    - /url: "#"
  - link "[5] Herbal & adaptogen supplements — what's worth it for muscle building":
    - /url: "#"
  - link "[6] Herbal & adaptogen supplements — what's worth it for muscle building":
    - /url: "#"
  - link "[7] Supplement catalog — evidence-based picks for muscle building":
    - /url: "#"
  - link "[8] Pre-workout supplements and the pump — what's worth it":
    - /url: "#"
  - paragraph: "Yes, you should consider taking creatine. Here are the details:"
  - list:
    - listitem:
      - strong: "Dose:"
      - text: 3–5 g per day, every day. No need to "load"; you'll reach the same end-state in about 3–4 weeks at 5 g/day.
    - listitem:
      - strong: "Monthly Cost:"
      - text: Approximately $5–10 for bulk powder.
    - listitem:
      - strong: "Time to Effect:"
      - text: Noticeable strength increase and a scale-weight bump (due to water and glycogen) in 2–4 weeks; hypertrophy benefits accrue over months.
  - paragraph: Creatine is well-supported by strong evidence for muscle building and performance enhancement [1].
  - link "[1] Supplement catalog — evidence-based picks for muscle building":
    - /url: "#"
  - link "[2] Pre-workout supplements and the pump — what's worth it":
    - /url: "#"
  - link "[3] Pre-workout supplements and the pump — what's worth it":
    - /url: "#"
  - link "[4] Supplement catalog — evidence-based picks for muscle building":
    - /url: "#"
  - link "[5] Herbal & adaptogen supplements — what's worth it for muscle building":
    - /url: "#"
  - link "[6] Herbal & adaptogen supplements — what's worth it for muscle building":
    - /url: "#"
  - link "[7] Supplement catalog — evidence-based picks for muscle building":
    - /url: "#"
  - link "[8] Pre-workout supplements and the pump — what's worth it":
    - /url: "#"
  - textbox "Ask anything about this knowledge base…"
  - button [disabled]
  - button "New chat"
```

# Test source

```ts
  1   | import { test, expect, type Page } from "@playwright/test";
  2   | 
  3   | // Hard-coded demo credentials matching scripts/_lib.ts SEED_USERS.
  4   | const ALICE = { email: "alice@demo.local", password: "demo-password-A!" };
  5   | const BOB = { email: "bob@demo.local", password: "demo-password-B!" };
  6   | 
  7   | async function signIn(page: Page, email: string, password: string) {
  8   |   await page.goto("/login");
  9   |   await page.getByLabel("Email").fill(email);
  10  |   await page.getByLabel("Password").fill(password);
  11  |   await page.getByRole("button", { name: "Sign in" }).click();
  12  |   // Wait for the redirect to /chat to settle.
  13  |   await page.waitForURL(/\/chat/, { timeout: 30_000 });
  14  | }
  15  | 
  16  | async function signOut(page: Page) {
  17  |   // The signout form is in the sidebar; on mobile it's in the header.
  18  |   // Submit it via JS to avoid layout flakiness.
  19  |   await page.evaluate(() => {
  20  |     const form = document.querySelector('form[action="/auth/signout"]');
  21  |     if (form) (form as HTMLFormElement).submit();
  22  |   });
  23  |   await page.waitForURL(/\/login/, { timeout: 15_000 });
  24  | }
  25  | 
  26  | async function sendChat(page: Page, prompt: string) {
  27  |   const input = page.getByPlaceholder(/ask anything/i);
  28  |   await input.fill(prompt);
  29  |   await input.press("Enter");
  30  |   // The user's own message renders immediately.
  31  |   await expect(page.locator(".max-w-\\[85\\%\\]").first()).toBeVisible({ timeout: 5_000 });
  32  | }
  33  | 
  34  | async function waitForAssistantReply(page: Page) {
  35  |   // After streaming, the "thinking…" indicator should be gone and at least one
  36  |   // assistant bubble (a div with the border class — not the user pill) should
  37  |   // have non-empty text.
  38  |   await expect(page.getByText(/thinking/i)).toHaveCount(0, { timeout: 75_000 });
  39  | 
  40  |   // The assistant bubble is rendered with the .prose-chat helper class.
  41  |   const assistantBubbles = page.locator(".prose-chat");
> 42  |   await expect(assistantBubbles.first()).toBeVisible({ timeout: 60_000 });
      |                                          ^ Error: expect(locator).toBeVisible() failed
  43  |   const text = (await assistantBubbles.first().innerText()).trim();
  44  |   expect(text.length).toBeGreaterThan(10);
  45  |   return text;
  46  | }
  47  | 
  48  | test.describe("Knowledge Agent — end-to-end smoke", () => {
  49  |   test("landing page renders the hero", async ({ page }) => {
  50  |     await page.goto("/");
  51  |     await expect(page.getByRole("heading", { name: /grounded chat agent/i })).toBeVisible();
  52  |     await expect(page.getByRole("link", { name: /log in/i }).first()).toBeVisible();
  53  |   });
  54  | 
  55  |   test("redirects unauthenticated user away from /chat", async ({ page }) => {
  56  |     await page.goto("/chat");
  57  |     await page.waitForURL(/\/login/, { timeout: 15_000 });
  58  |     expect(page.url()).toContain("/login");
  59  |   });
  60  | 
  61  |   test("Alice (pizza KB) can sign in, chat, and see citations", async ({ page }) => {
  62  |     await signIn(page, ALICE.email, ALICE.password);
  63  |     await expect(page).toHaveURL(/\/chat$/);
  64  | 
  65  |     await sendChat(page, "What style of pizza should I try if my home oven maxes at 550°F?");
  66  |     const text = await waitForAssistantReply(page);
  67  | 
  68  |     // Answer should mention at least one home-oven-friendly style (NY/Detroit/Sicilian/al taglio).
  69  |     expect(text.toLowerCase()).toMatch(/ny|new york|detroit|sicilian|al taglio|grandma/);
  70  | 
  71  |     // At least one citation chip should appear ("[1]") below the message.
  72  |     await expect(page.locator("text=/\\[\\d+\\]/").first()).toBeVisible({ timeout: 5_000 });
  73  |   });
  74  | 
  75  |   test("Alice can open the admin panel and see her pizza KB", async ({ page }) => {
  76  |     await signIn(page, ALICE.email, ALICE.password);
  77  |     await page.getByRole("link", { name: /admin/i }).first().click();
  78  |     await page.waitForURL(/\/admin/);
  79  | 
  80  |     // Sources tab is default; should list pizza docs.
  81  |     await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 15_000 });
  82  |     // Wait for the "Loading…" spinner to disappear, indicating fetch finished.
  83  |     await page.waitForFunction(
  84  |       () => !document.body.innerText.toLowerCase().includes("loading…"),
  85  |       { timeout: 20_000 }
  86  |     );
  87  | 
  88  |     const sourcesText = await page.locator("body").innerText();
  89  |     // Should mention at least one of our pizza-doc titles.
  90  |     expect(sourcesText.toLowerCase()).toMatch(/neapolitan|new york|detroit|dough|sauce/);
  91  | 
  92  |     // Configuration tab loads.
  93  |     await page.getByRole("button", { name: /configuration/i }).click();
  94  |     await expect(page.getByLabel(/persona/i)).toBeVisible({ timeout: 10_000 });
  95  |     const persona = await page.getByLabel(/persona/i).inputValue();
  96  |     expect(persona.toLowerCase()).toMatch(/pizza/);
  97  |   });
  98  | 
  99  |   test("Bob (muscle KB) sees a different KB after switching accounts", async ({ page }) => {
  100 |     // First sign in as Alice and remember her sources page snippet.
  101 |     await signIn(page, ALICE.email, ALICE.password);
  102 |     await page.goto("/admin");
  103 |     await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 15_000 });
  104 |     await page.waitForFunction(
  105 |       () => !document.body.innerText.toLowerCase().includes("loading…"),
  106 |       { timeout: 20_000 }
  107 |     );
  108 |     const aliceSources = (await page.locator("body").innerText()).toLowerCase();
  109 | 
  110 |     // Sign out, sign in as Bob.
  111 |     await signOut(page);
  112 |     await signIn(page, BOB.email, BOB.password);
  113 |     await page.goto("/admin");
  114 |     await expect(page.getByText(/knowledge sources/i)).toBeVisible({ timeout: 15_000 });
  115 |     await page.waitForFunction(
  116 |       () => !document.body.innerText.toLowerCase().includes("loading…"),
  117 |       { timeout: 20_000 }
  118 |     );
  119 |     const bobSources = (await page.locator("body").innerText()).toLowerCase();
  120 | 
  121 |     // Bob should see muscle / supplement content; should NOT see pizza-specific titles.
  122 |     expect(bobSources).toMatch(/creatine|supplement|hypertrophy|protein|muscle/);
  123 |     expect(bobSources).not.toMatch(/neapolitan|detroit-style pizza|dough hydration/);
  124 | 
  125 |     // And cross-check: Alice's sources page didn't contain Bob's titles.
  126 |     expect(aliceSources).not.toMatch(/creatine monohydrate|whey protein/);
  127 |   });
  128 | 
  129 |   test("Bob can chat and gets answers from his KB, not Alice's", async ({ page }) => {
  130 |     await signIn(page, BOB.email, BOB.password);
  131 |     await sendChat(page, "Should I take creatine? Give me dose, cost, and time to effect.");
  132 |     const text = await waitForAssistantReply(page);
  133 | 
  134 |     const lower = text.toLowerCase();
  135 |     expect(lower).toMatch(/creatine/);
  136 |     // Should include either dose info or evidence framing — proves it pulled from the supplement catalog.
  137 |     expect(lower).toMatch(/3.{0,5}5\s*g|monohydrate|evidence|cost/);
  138 |     // Should NOT veer into pizza land.
  139 |     expect(lower).not.toMatch(/neapolitan|cornicione|dough hydration/);
  140 |   });
  141 | 
  142 |   test("Off-topic question gets graceful refusal", async ({ page }) => {
```