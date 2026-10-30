import { _electron as electron } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, COVE_DEVTOOLS: "0" };
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({ args: [desktopDir], cwd: desktopDir, env });
try {
  const page = await app.firstWindow();
  await page.waitForSelector(".app-layout, .setup-grid, .cove-loader", { timeout: 30_000 });
  await page.waitForFunction(() => document.body.innerText.includes("Cove") && document.querySelector(".app-layout, .setup-grid"), { timeout: 30_000 });
  const title = await page.title();
  const url = page.url();
  const text = (await page.locator("body").innerText()).slice(0, 300);
  if (!url.startsWith("http://127.0.0.1:")) throw new Error(`Unexpected URL: ${url}`);
  if (!/cove/i.test(text)) throw new Error(`Cove UI did not render: ${JSON.stringify({ title, url, text })}`);
  console.log("desktop smoke passed", { title, url, text: text.slice(0, 80) });
} finally {
  await app.close();
}
