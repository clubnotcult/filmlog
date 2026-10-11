const { open } = require("./common");
(async () => {
  const { browser, page } = await open();
  await page.goto("http://127.0.0.1:3100/explore");
  await page.waitForSelector("a[href*='/frames/']");
  await page.locator("a[href*='/frames/']").first().click();
  await page.waitForURL(/frames\//);
  for (let step = 0; step < 17; step++) {
    await page.waitForTimeout(700);
    const text = await page.locator("body").innerText();
    const url = page.url().replace("http://127.0.0.1:3100","").replace(/\?.*/, "");
    const fname = (text.match(/\b[0-9a-z]+\.jpg/) || ["?"])[0];
    if (/could not be found/i.test(text)) { console.log(`step ${step}: NOT FOUND  ${url}`); break; }
    console.log(`step ${step}: ${fname}  roll ${url.slice(7, 15)}`);
    const next = page.getByLabel("Next frame");
    if (!(await next.count())) { console.log("end of results"); break; }
    await next.click();
  }
  await browser.close();
})();
