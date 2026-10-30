import { _electron as electron } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, COVE_DEVTOOLS: "0", COVE_PORT: "0" };
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({ args: [desktopDir], cwd: desktopDir, env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector(".app-layout, .setup-grid, .cove-loader", { timeout: 30_000 });
  await page.waitForFunction(
    () => document.body.innerText.includes("Cove") && document.querySelector(".app-layout, .setup-grid"),
    { timeout: 30_000 },
  );

  const startUrl = page.url();
  if (!startUrl.startsWith("http://127.0.0.1:")) throw new Error(`Unexpected URL: ${startUrl}`);

  if (new URL(startUrl).pathname === "/setup") {
    const skip = page.getByRole("button", { name: "先使用匿名样例" });
    await skip.click();
    await page.waitForFunction(() => !location.pathname.endsWith("/setup"), { timeout: 10_000 });
    await page.waitForSelector(".page-title", { timeout: 10_000 });
  }

  const text = await page.locator("body").innerText();
  if (!text.includes("简报")) throw new Error(`Setup-to-brief flow did not render: ${text.slice(0, 200)}`);

  const health = await page.evaluate(async () => {
    const response = await fetch("/api/health");
    return response.ok;
  });
  if (!health) throw new Error("Local API health check failed from the desktop renderer");

  console.log("desktop smoke passed", {
    title: await page.title(),
    url: page.url(),
    setupFlow: new URL(startUrl).pathname === "/setup" ? "skip-to-brief" : "already-brief",
  });
} finally {
  await app.close();
}
