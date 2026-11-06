/**
 * End-to-end test of the running app (http://localhost:5173) in headless Edge.
 * Creates a fresh QA account, then walks every main surface, screenshotting
 * each step into test-results/.
 *
 *   node scripts/e2e-test.mjs
 */
import puppeteer from "puppeteer-core";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = "http://localhost:5173";
const OUT = "test-results";
mkdirSync(OUT, { recursive: true });

const EMAIL = `qa.tester.${Date.now()}@flowtask.test`;
const PASSWORD = "qa-test-password-1";
const NAME = "QA Tester";
const PROJECT = "QA Test Project";
const TASK = "QA test task — verify the whole flow";

const results = [];
const step = (name, ok, note = "") => {
  results.push({ name, ok, note });
  console.log(`${ok ? "✅" : "❌"} ${name}${note ? ` — ${note}` : ""}`);
};

const browser = await puppeteer.launch({
  channel: "msedge",
  headless: "new",
  args: ["--window-size=1440,900", "--no-first-run", "--disable-features=msEdgeSidebarV2"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.setDefaultTimeout(8000);

const shot = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` });
};
const pageText = () => page.evaluate(() => document.body.innerText);
const clickAnyText = async (candidates, scope = "button, a, [role='button'], [role='menuitem']") => {
  const found = await page.evaluate(
    (candidates, scope) => {
      const els = [...document.querySelectorAll(scope)];
      for (const want of candidates) {
        const el = els.find((e) => e.textContent.trim().toLowerCase().includes(want.toLowerCase()));
        if (el) {
          el.click();
          return want;
        }
      }
      return null;
    },
    candidates,
    scope,
  );
  if (!found) throw new Error(`No clickable element matching any of: ${candidates.join(", ")}`);
  return found;
};
const typePlaceholder = async (placeholder, value) => {
  const el = await page.waitForSelector(`input[placeholder="${placeholder}"]`);
  await el.click({ clickCount: 3 });
  await el.type(value);
};

async function gotoNav(labelCandidates, screenshotName, expectText) {
  await clickAnyText(labelCandidates, "a, button");
  await new Promise((r) => setTimeout(r, 1200));
  const body = await pageText();
  const ok = expectText.every((t) => body.toLowerCase().includes(t.toLowerCase()));
  await shot(screenshotName);
  step(`${screenshotName}`, ok, ok ? "" : `expected text missing: ${expectText.join(" / ")}`);
  return ok;
}

try {
  // ---------- 1. Landing: redirected to /login ----------
  await page.goto(BASE, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 1500));
  await shot("01-login-page");
  step("app loads and redirects to login", page.url().includes("/login"), page.url());

  // ---------- 2. Sign up ----------
  await clickAnyText(["No account yet", "Create one"]);
  await typePlaceholder("Alex Rivera", NAME);
  await typePlaceholder("you@example.com", EMAIL);
  await typePlaceholder("At least 6 characters", PASSWORD);
  await shot("02-signup-filled");
  await clickAnyText(["Create account"]);
  await new Promise((r) => setTimeout(r, 2500));
  await shot("03-after-signup");

  let body = await pageText();
  if (/check your inbox|confirmation email/i.test(body)) {
    step("sign-up", false, "email confirmation is ON — session not issued. Disable 'Confirm email' in Dashboard → Authentication to let automated tests (and faster dev) through.");
    await finish();
  } else {
    step("sign-up succeeded (session issued)", !page.url().includes("/login"));
  }

  // ---------- 3. Overview ----------
  await new Promise((r) => setTimeout(r, 1500));
  await shot("04-overview");
  body = await pageText();
  step("overview dashboard renders", /overview|dashboard|good|welcome/i.test(body));

  // ---------- 4. Create a project ----------
  let clicked = "";
  try {
    clicked = await clickAnyText(["new project", "create project", "add project"]);
  } catch {
    // The control may be an icon button; dump what's on the Projects page.
  }
  await clickAnyText(["Projects"], "a, button");
  await new Promise((r) => setTimeout(r, 1000));
  try {
    clicked = clicked || (await clickAnyText(["new project", "create project", "add project", "+"]));
    await new Promise((r) => setTimeout(r, 800));
    await shot("05-project-form");
    // Dialog inputs: fill the first text inputs we find.
    const inputs = await page.$$("input, textarea");
    if (inputs.length >= 1) await inputs[0].type(PROJECT);
    if (inputs.length >= 2) await inputs[1].type("Created by the automated E2E test.");
    await clickAnyText(["create", "save", "add"], "[role='dialog'] button, form button, button");
    await new Promise((r) => setTimeout(r, 1500));
    body = await pageText();
    step("project created", body.includes(PROJECT));
    await shot("06-project-created");
  } catch (err) {
    await shot("05-project-form-FAILED");
    step("project created", false, String(err.message).slice(0, 120));
  }

  // ---------- 5. Open the project and create a task ----------
  try {
    await clickAnyText([PROJECT], "a, button, [role='button'], tr, h3");
    await new Promise((r) => setTimeout(r, 1200));
    await shot("07-project-detail");
    await clickAnyText(["new task", "add task", "create task"]);
    await new Promise((r) => setTimeout(r, 800));
    await shot("08-task-form");
    const inputs = await page.$$("[role='dialog'] input, form input, input");
    if (inputs.length >= 1) await inputs[0].type(TASK);
    await clickAnyText(["create", "save", "add"], "[role='dialog'] button, form button, button");
    await new Promise((r) => setTimeout(r, 1500));
    body = await pageText();
    step("task created", body.includes(TASK));
    await shot("09-task-created");
  } catch (err) {
    await shot("08-task-form-FAILED");
    step("task created", false, String(err.message).slice(0, 120));
  }

  // ---------- 6. Board ----------
  await gotoNav(["board", "kanban"], "10-board", [TASK.slice(0, 12)]);

  // ---------- 7. Calendar ----------
  await gotoNav(["calendar"], "11-calendar", []);

  // ---------- 8. Inbox ----------
  await gotoNav(["inbox", "activity"], "12-inbox", []);

  // ---------- 9. Settings ----------
  await gotoNav(["settings"], "13-settings", ["settings"]);

  // ---------- 10. Reload persistence check ----------
  await page.reload({ waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 2000));
  body = await pageText();
  step("session survives reload", !page.url().includes("/login"), page.url());
  step("data survives reload (task visible)", body.includes(TASK.slice(0, 12)));
  await shot("14-after-reload");
} catch (err) {
  await shot("99-UNEXPECTED-FAILURE");
  step("unexpected failure", false, String(err.message).slice(0, 200));
}

await finish();

async function finish() {
  writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n===== ${passed}/${results.length} checks passed =====`);
  console.log(`Screenshots + results.json in ${OUT}/`);
  await browser.close();
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
}
