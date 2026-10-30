const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { before, after, test } = require("node:test");
const { execFileSync } = require("node:child_process");
const { chromium } = require("playwright");
const sharp = require("sharp");
const { PNG } = require("pngjs");
const repo = path.resolve(__dirname, "..");
const source = process.env.CODEX_OVERLAY_CANDIDATE_FUNCTION
  ? fs.readFileSync(process.env.CODEX_OVERLAY_CANDIDATE_FUNCTION, "utf8")
  : process.env.CODEX_OVERLAY_BASELINE
  ? execFileSync("git", ["show", process.env.CODEX_OVERLAY_BASELINE + ":assets/inject/renderer-inject.js"],
    { cwd: repo, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
  : fs.readFileSync(path.join(repo, "assets/inject/renderer-inject.js"), "utf8");
const install = source.match(/^  function installCodexPlusImageOverlay\([^]*?^  \}/m)[0];
const injection = 'var codexPlusImageOverlayId="codex-plus-image-overlay";var sendCodexPlusDiagnostic=()=>{};' + install;
const overlaySelector = "#codex-plus-image-overlay";
const assets = {};
let browser, started = false;
const bitmap = async color => "data:" + "image/png;base64," + (await sharp({
  create: { width: 80, height: 80, channels: 4, background: color },
}).png().toBuffer()).toString("base64");
async function start() {
  assets.wall = await bitmap("#2850c8");
  assets.photo = await bitmap("#dc2832");
  const data = Buffer.alloc(330 * 200 * 3);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 330; x++) {
    const offset = (y * 330 + x) * 3;
    data[offset] = 30 + Math.floor(x / 30) * 19;
    data[offset + 1] = 20 + Math.floor(y / 20) * 23;
    data[offset + 2] = (Math.floor(x / 30) + Math.floor(y / 20)) % 2 ? 220 : 40;
  }
  assets.pattern = "data:" + "image/png;base64," + (await sharp(data, {
    raw: { width: 330, height: 200, channels: 3 },
  }).png().toBuffer()).toString("base64");
  browser = await chromium.launch({ channel: process.env.CODEX_TEST_BROWSER || "msedge",
    executablePath: process.env.CODEX_TEST_BROWSER_PATH,
    headless: true, ignoreDefaultArgs: ["--hide-scrollbars"] });
}
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const shot = async page => PNG.sync.read(await page.screenshot({ animations: "disabled" }));
const pixel = (image, x, y) => {
  x = Math.floor(x); y = Math.floor(y);
  assert.ok(x >= 0 && y >= 0 && x < image.width && y < image.height, "pixel inside viewport");
  return [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3)];
};
const near = (actual, expected, label = "pixel") => assert.ok(actual.every((v, i) => Math.abs(v - expected[i]) <= 1),
  label + ": " + actual + " != " + expected);
const rect = (page, selector) => page.$eval(selector, node => {
  const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
});
const html = (page, style, body) => page.setContent(
  '<style>body{margin:0;background:#181818;color:white;font:16px Arial}' + style + '</style>' + body);
async function configure(page, options = {}) {
  await page.evaluate(injection);
  await page.evaluate(async config => {
    window.__CODEX_PLUS_IMAGE_OVERLAY__ = config;
    installCodexPlusImageOverlay();
    // 支持加载旧实现作对照，不给单层实现伪造已退役的 ready 接口。
    if (window.__codexPlusImageOverlayReady) await window.__codexPlusImageOverlayReady;
  }, { enabled: true, dataUrl: assets.wall, fitMode: "stretch", opacity: .2, ...options });
  const enabled = await page.evaluate(() => !!(window.__CODEX_PLUS_IMAGE_OVERLAY__.enabled && window.__CODEX_PLUS_IMAGE_OVERLAY__.dataUrl));
  assert.equal(await page.locator(overlaySelector).count(), enabled ? 1 : 0);
  if (enabled) {
    // 等待实际绘制的 URL 解码，不能只验证配置里的图片或伪造加载成功。
    await page.$eval(overlaySelector, async node => {
      const background = getComputedStyle(node).backgroundImage;
      if (!background.startsWith('url("')) throw new Error("missing overlay image");
      const image = new Image();
      image.src = background.slice(5, -2);
      await image.decode();
    });
  }
  await settle(page);
}
async function disable(page) {
  await page.evaluate(() => {
    window.__CODEX_PLUS_IMAGE_OVERLAY__ = { enabled: false };
    installCodexPlusImageOverlay();
  });
  assert.equal(await page.locator(overlaySelector).count(), 0);
  await settle(page);
}
function check(name, run, viewport = { width: 800, height: 600 }, pageOptions = {}) {
  if (!started) { started = true; before(start); after(async () => { await browser?.close(); }); }
  test(name, async () => {
    const page = await browser.newPage({ viewport, ...pageOptions });
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    try {
      await run(page);
      if (await page.evaluate(() => typeof installCodexPlusImageOverlay === "function")) await disable(page);
      assert.deepEqual(errors, [], "no page errors, including during disable");
    } finally { await page.close(); }
  });
}
module.exports = { assert, assets, bitmap, check, configure, disable, html, injection, near, overlaySelector, pixel, rect, settle, sharp, shot };
