const { open } = require("./common");
const delay = Number(process.argv[2] || 100);   // ms between tapping a mark and tapping Next
(async () => {
  const { browser, page } = await open();
  const bad = [];
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("icon")) bad.push(`${r.status()} ${r.url().slice(-60)}`); });
  await page.goto("http://127.0.0.1:3100/rolls/aaaaaaaa-0000-0000-0000-00000000000a");
  await page.waitForSelector("a[href*='/frames/']");
  await page.locator("a[href*='/frames/']").first().click();
  await page.waitForURL(/frames\//);
  const seen = []; let last = "";
  for (let i = 0; i < 40; i++) {
    await page.waitForFunction((prev) => document.querySelector("h1")?.textContent !== prev || !prev, last, { timeout: 15000 }).catch(() => {});
    const text = await page.locator("body").innerText();
    if (/could not be found/i.test(text)) { console.log(`NOT FOUND after ${seen.join(",")}  ${page.url().slice(-40)}`); break; }
    last = (await page.locator("h1").first().innerText().catch(() => "")) || "";
    seen.push(last.replace(".jpg",""));
    const mark = i % 2 ? "Mark with a star" : "Mark with a heart";
    await page.getByLabel(mark).click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(delay);
    const next = page.getByLabel("Next frame");
    if (!(await next.count())) { console.log("end of roll after", seen.join(",")); break; }
    await next.click({ timeout: 5000 }).catch((e) => console.log("next click failed", e.message.split("\n")[0]));
  }
  await page.waitForTimeout(1500);
  console.log("visited:", seen.join(","), "| http errors:", bad.length ? bad.join(" | ") : "none");
  await browser.close();
})();
