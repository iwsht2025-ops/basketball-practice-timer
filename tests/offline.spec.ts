import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, join, extname } from "node:path";
import { tmpdir } from "node:os";

test("publishes install metadata and real PNG home-screen icons", async ({
  request,
}) => {
  const response = await request.get("/manifest.webmanifest");
  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toContain(
    "application/manifest+json",
  );
  const manifest = await response.json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.start_url).toBe("./");
  for (const [file, size] of [
    ["icon-192.png", 192],
    ["icon-512.png", 512],
    ["apple-touch-icon.png", 180],
  ] as const) {
    const icon = await request.get(`/icons/${file}`);
    expect(icon.headers()["content-type"]).toContain("image/png");
    const bytes = await icon.body();
    expect(bytes.subarray(1, 4).toString()).toBe("PNG");
    expect(bytes.readUInt32BE(16)).toBe(size);
    expect(bytes.readUInt32BE(20)).toBe(size);
  }
});
test("reloads offline and completes a practice without network access", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(async () =>
        Boolean(await navigator.serviceWorker.getRegistration()),
      ),
    )
    .toBe(true);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.getByLabel("練習時間（秒）", { exact: true }).fill("1");
  await page.getByLabel("休憩時間（秒）", { exact: true }).fill("0");
  await page.getByLabel("セット数", { exact: true }).fill("1");
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel("練習時間（秒）", { exact: true })).toHaveValue(
    "1",
  );
  await page.getByRole("button", { name: "練習を開始", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "ナイスワーク。" }),
  ).toBeVisible();
});

async function site(prefix = "/") {
  const directory = await mkdtemp(join(tmpdir(), "court-clock-pwa-"));
  await cp(resolve("dist"), directory, { recursive: true });
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, "http://localhost").pathname;
      if (!pathname.startsWith(prefix)) {
        res.writeHead(404).end();
        return;
      }
      const relative =
        decodeURIComponent(pathname.slice(prefix.length)) || "index.html";
      const filename = resolve(directory, relative);
      if (!filename.startsWith(directory + "/")) {
        res.writeHead(404).end();
        return;
      }
      const data = await readFile(filename);
      const type: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".webmanifest": "application/manifest+json",
      };
      res.writeHead(200, {
        "Content-Type": type[extname(filename)] ?? "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const address = server.address() as { port: number };
  return {
    directory,
    url: `http://127.0.0.1:${address.port}${prefix}`,
    async close() {
      await new Promise<void>((r, e) =>
        server.close((error) => (error ? e(error) : r())),
      );
      await rm(directory, { recursive: true, force: true });
    },
  };
}
test("works offline when served from a subdirectory", async ({
  page,
  context,
}) => {
  const served = await site("/practice/");
  try {
    await page.goto(served.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    );
    const scope = await page.evaluate(
      async () => (await navigator.serviceWorker.ready).scope,
    );
    expect(scope).toBe(served.url);
    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "練習を開始", exact: true }),
    ).toBeVisible();
  } finally {
    await page.close();
    await served.close();
  }
});
test("waits to activate updates until the open practice is closed", async ({
  page,
  context,
}) => {
  const served = await site();
  try {
    await page.goto(served.url);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(() =>
      Boolean(navigator.serviceWorker.controller),
    );
    await page.getByRole("button", { name: "練習を開始", exact: true }).click();
    const index = join(served.directory, "index.html");
    await writeFile(
      index,
      (await readFile(index, "utf8")).replace(
        "COURT CLOCK —",
        "COURT CLOCK v2 —",
      ),
    );
    execFileSync(process.execPath, ["scripts/build-pwa.mjs", served.directory]);
    const nextWorker = context.waitForEvent("serviceworker");
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.ready).update();
    });
    const worker = await nextWorker;
    await expect
      .poll(() =>
        page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.ready).waiting),
        ),
      )
      .toBe(true);
    await expect(
      page.getByRole("button", { name: "一時停止", exact: true }),
    ).toBeVisible();
    expect(await page.title()).not.toContain("v2");
    expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(
      2,
    );
    await page.close();
    await expect
      .poll(() => worker.evaluate(async () => (await caches.keys()).length))
      .toBe(1);
    const reopened = await context.newPage();
    await reopened.goto(served.url);
    await expect(reopened).toHaveTitle(/COURT CLOCK v2/);
    await reopened.close();
  } finally {
    if (!page.isClosed()) await page.close();
    await served.close();
  }
});
