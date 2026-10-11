const { chromium } = require("playwright-core");
const exp = Math.floor(Date.now()/1000) + 86400;
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = `${b64u({alg:"HS256",typ:"JWT"})}.${b64u({sub:"11111111-1111-1111-1111-111111111111",exp,role:"authenticated",aud:"authenticated"})}.sig`;
const session = { access_token: jwt, refresh_token: "r", expires_in: 86400, expires_at: exp, token_type: "bearer", user: { id: "11111111-1111-1111-1111-111111111111", email: "t@example.com", aud: "authenticated" } };
exports.open = async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  await ctx.addCookies([{ name: "sb-127-auth-token", value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: "http://127.0.0.1:3100" }]);
  return { browser, page: await ctx.newPage() };
};
