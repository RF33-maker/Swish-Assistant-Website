import { test, expect, Page } from "@playwright/test";
import http from "node:http";
import { AddressInfo } from "node:net";

const APP_ORIGIN = process.env.APP_ORIGIN || "http://localhost:5000";
const LEAGUE_SLUG = process.env.TEST_LEAGUE_SLUG || "super-league-basketball-20252026";

interface ResizeMsg {
  origin: string;
  height: number;
}

declare global {
  interface Window {
    __resizeMessages: ResizeMsg[];
  }
}

function buildHostPage(widgets: { id: string; src: string }[]): string {
  const iframes = widgets
    .map(
      ({ id, src }) =>
        `<iframe id="${id}" src="${src}" style="width:100%;border:none;background:transparent;" height="500" data-swish-widget allowtransparency="true"></iframe>`,
    )
    .join("\n");
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Embed Host</title></head>
<body>
<h1>External Host Page</h1>
${iframes}
<script>
  window.__resizeMessages = [];
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'swish-widget-resize') {
      window.__resizeMessages.push({ origin: e.origin, height: e.data.height });
    }
  });
</script>
</body></html>`;
}

async function startHostServer(html: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise<void>(resolve => server.close(() => resolve())),
  };
}

async function readResizeMessages(page: Page, settleMs: number): Promise<ResizeMsg[]> {
  await page.waitForTimeout(settleMs);
  return page.evaluate(() => window.__resizeMessages);
}

function realConsoleErrors(errors: string[]): string[] {
  return errors.filter(e => !/favicon|vercel|analytics|devtools/i.test(e));
}

test.describe("Cross-origin widget embedding", () => {
  test("all four widgets render, post height, and have no console errors when embedded cross-origin", async ({ page }) => {
    const widgets = [
      { id: "standings", src: `${APP_ORIGIN}/widget/standings?leagueSlug=${LEAGUE_SLUG}` },
      { id: "scores", src: `${APP_ORIGIN}/widget/game-scores?leagueSlug=${LEAGUE_SLUG}` },
      { id: "leaders", src: `${APP_ORIGIN}/widget/league-leaders?leagueSlug=${LEAGUE_SLUG}&statType=points` },
      {
        id: "player",
        src: process.env.TEST_PLAYER_ID
          ? `${APP_ORIGIN}/widget/player-stats?playerId=${process.env.TEST_PLAYER_ID}&leagueSlug=${LEAGUE_SLUG}`
          : `${APP_ORIGIN}/widget/player-stats`,
      },
    ];
    const host = await startHostServer(buildHostPage(widgets));

    const consoleErrors: string[] = [];
    page.on("console", msg => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", err => consoleErrors.push(err.message));

    await page.goto(host.url);

    const standings = page.frameLocator("#standings");
    await expect(standings.locator('[data-testid="widget-skeleton"]')).toHaveCount(0, { timeout: 20000 });
    await expect(standings.locator("text=Standings")).toBeVisible();

    const scores = page.frameLocator("#scores");
    await expect(scores.locator('[data-testid="widget-skeleton"]')).toHaveCount(0, { timeout: 20000 });
    const scoresFinal = scores.locator('[data-testid="widget-empty"], text=Final, text=Recent Games').first();
    await expect(scoresFinal).toBeVisible();

    const leaders = page.frameLocator("#leaders");
    await expect(leaders.locator('[data-testid="widget-skeleton"]')).toHaveCount(0, { timeout: 20000 });
    await expect(leaders.locator("text=Leaders")).toBeVisible();

    const player = page.frameLocator("#player");
    await expect(player.locator('[data-testid="widget-skeleton"]')).toHaveCount(0, { timeout: 20000 });
    if (process.env.TEST_PLAYER_ID) {
      const stats = player.locator('text=/PPG|Points/i').first();
      await expect(stats).toBeVisible();
    } else {
      await expect(player.locator('[data-testid="widget-error"]')).toContainText(/no player/i);
    }

    const msgs = await readResizeMessages(page, 2500);
    expect(msgs.length).toBeGreaterThanOrEqual(4);
    const tallest = Math.max(...msgs.map(m => m.height));
    expect(tallest).toBeGreaterThan(100);
    expect(tallest).toBeLessThan(2000);

    expect(realConsoleErrors(consoleErrors)).toEqual([]);
    await host.close();
  });

  test("posted height covers the full rendered widget including padding", async ({ page }) => {
    const widgets = [{ id: "standings", src: `${APP_ORIGIN}/widget/standings?leagueSlug=${LEAGUE_SLUG}` }];
    const host = await startHostServer(buildHostPage(widgets));
    await page.goto(host.url);

    const frame = page.frameLocator("#standings");
    await expect(frame.locator('[data-testid="widget-skeleton"]')).toHaveCount(0, { timeout: 20000 });
    await expect(frame.locator("text=Standings")).toBeVisible();

    const msgs = await readResizeMessages(page, 2500);
    expect(msgs.length).toBeGreaterThan(0);

    const reportedHeight = Math.max(...msgs.map(m => m.height));
    const rootHeight = await frame.locator('[data-testid="widget-root"]').evaluate(el => {
      const r = el.getBoundingClientRect();
      return Math.ceil(r.height);
    });
    expect(reportedHeight).toBeGreaterThanOrEqual(rootHeight);
    await host.close();
  });

  test("invalid leagueSlug renders a friendly error block, not a blank page", async ({ page }) => {
    const widgets = [
      { id: "missing", src: `${APP_ORIGIN}/widget/standings` },
      { id: "bogus", src: `${APP_ORIGIN}/widget/standings?leagueSlug=does-not-exist-zzz-${Date.now()}` },
    ];
    const host = await startHostServer(buildHostPage(widgets));
    await page.goto(host.url);

    const missing = page.frameLocator("#missing").locator('[data-testid="widget-error"]');
    await expect(missing).toBeVisible({ timeout: 15000 });
    await expect(missing).toContainText(/no league/i);

    const bogus = page.frameLocator("#bogus").locator('[data-testid="widget-error"]');
    await expect(bogus).toBeVisible({ timeout: 15000 });
    await expect(bogus).toContainText(/league not found/i);

    await host.close();
  });

  test("server allows cross-origin framing (CSP frame-ancestors *)", async ({ request }) => {
    const res = await request.get(`${APP_ORIGIN}/widget/standings?leagueSlug=${LEAGUE_SLUG}`);
    expect(res.status()).toBe(200);
    const csp = res.headers()["content-security-policy"] || "";
    expect(csp).toContain("frame-ancestors");
    expect(csp).toContain("*");
    expect(res.headers()["x-frame-options"]).toBeUndefined();
  });
});
