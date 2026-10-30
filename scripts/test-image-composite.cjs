const { assert, assets, check, configure, disable, html, overlaySelector, settle, shot } = require("./image-overlay-fixture.cjs");

const fits = {
  fill: ["cover", "center center", "no-repeat"],
  fit: ["contain", "center center", "no-repeat"],
  stretch: ["100% 100%", "center center", "no-repeat"],
  tile: ["auto", "left top", "repeat"],
  center: ["auto", "center center", "no-repeat"],
};
const motions = {
  none: "",
  "translate-zero": "translate:0px",
  "translate-shift": "translate:-154px",
  "transform-shift": "transform:translateX(-154px)",
};
async function fixture(page, motion, zoom = 1) {
  await html(page, 'html,body{width:100%;height:100%;overflow:hidden}*{box-sizing:border-box}' +
    '#shell{zoom:' + zoom + '}#thread{position:absolute;left:120px;top:90px;width:760px;height:540px;overflow:hidden}' +
    '#footer{position:absolute;inset-inline:0;bottom:0;height:180px;' + motion + '}' +
    '#backing{position:absolute;inset:0;background:#181818}' +
    '#composer{position:relative;width:420px;height:110px;margin:28px auto;background:#181818}',
    '<div id="shell"><div id="thread" class="thread-scroll-container"><div id="footer" data-thread-scroll-footer>' +
    '<div id="backing" aria-hidden="true"></div><div id="composer" class="_ComposerLayoutRoot_test"></div></div></div></div>');
}
async function aligned(page, fitMode) {
  if (!await page.locator(overlaySelector).count()) await configure(page, { dataUrl: assets.pattern, fitMode, opacity: .3 });
  // 先取现有层的截图，验证布局变化不依赖重新安装或脚本刷新。
  await settle(page);
  const actual = await shot(page);
  await disable(page);
  // 用独立全窗参考层作像素基准，不读取实现的 fitStyles 或局部绘制属性。
  await page.evaluate(async ({ wall, fit }) => {
    const image = new Image(); image.src = wall; await image.decode();
    const reference = document.createElement('div');
    reference.id = 'reference';
    Object.assign(reference.style, {
      position: 'fixed', inset: '0', width: '100vw', height: '100vh',
      backgroundImage: 'url("' + wall + '")', backgroundSize: fit[0],
      backgroundPosition: fit[1], backgroundRepeat: fit[2], opacity: '.3',
      zIndex: '2147483646', pointerEvents: 'none',
    });
    document.documentElement.append(reference);
  }, { wall: assets.pattern, fit: fits[fitMode] });
  const expected = await shot(page);
  await page.$eval('#reference', node => node.remove());
  await configure(page, { dataUrl: assets.pattern, fitMode, opacity: .3 });
  assert.deepEqual([actual.width, actual.height], [expected.width, expected.height]);
  let mismatches = 0, maxError = 0;
  for (let offset = 0; offset < actual.data.length; offset += 4) {
    const error = Math.max(...[0, 1, 2].map(channel => Math.abs(actual.data[offset + channel] - expected.data[offset + channel])));
    maxError = Math.max(maxError, error);
    if (error > 1) mismatches++;
  }
  assert.equal(mismatches, 0, fitMode + ": full-frame mismatch, max channel error " + maxError);
}

for (const [motion, css] of Object.entries(motions)) for (const fitMode of Object.keys(fits)) {
  check("patterned wallpaper aligns with transformed footer " + motion + "/" + fitMode, async page => {
    await fixture(page, css);
    await aligned(page, fitMode);
  }, { width: 1000, height: 700 });
}

for (const zoom of [.8, 1.25]) for (const fitMode of Object.keys(fits)) {
  check("pattern stays aligned through sidebar motion, composer growth and resize " + zoom + "/" + fitMode, async page => {
    await fixture(page, "", zoom);
    await aligned(page, fitMode);
    for (const x of [-77, -154, 0]) {
      await page.$eval('#footer', (node, x) => { node.style.translate = x + 'px'; }, x);
      await page.$eval('#composer', node => { node.style.height = '145px'; });
      await aligned(page, fitMode);
    }
    await page.setViewportSize({ width: 1100, height: 760 });
    await aligned(page, fitMode);
  }, { width: 1000, height: 700 });
}
