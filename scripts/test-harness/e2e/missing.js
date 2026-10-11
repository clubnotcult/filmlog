const { open } = require("./common");
(async () => {
  const { browser, page } = await open();
  await page.goto("http://127.0.0.1:3100/rolls/aaaaaaaa-0000-0000-0000-00000000000a/frames/00000000-0000-0000-0000-000000000000?sel=heart");
  await page.waitForTimeout(1500);
  console.log("missing frame page:", (await page.locator("body").innerText()).replace(/\s+/g," ").slice(0,200));
  console.log("recovery link:", await page.locator("a:has-text('Back to roll')").getAttribute("href"));
  await browser.close();
})();
