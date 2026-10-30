const { assert, assets, check, configure, disable, html, near, pixel, rect, settle, shot } = require("./image-overlay-fixture.cjs");

// 单层回退有意恢复壁纸叠色；仍须保留原生内容、几何与交互。
for (const opacity of [.2, .75, 1]) for (const zoom of [.8, 1, 1.25]) {
  check("native media and popup composition " + opacity + "/" + zoom, async page => {
    await html(page, '#shell{zoom:' + zoom + '}#media{display:flex;gap:20px;padding:30px}' +
      'img,canvas,video{width:80px;height:80px}#popup{position:absolute;top:160px;left:30px;z-index:300;background:#00ff00;width:200px;height:80px}' +
      '#popup button{margin:20px}#badge{position:absolute;left:90px;top:30px;width:20px;height:20px;background:#ffff00}',
      '<div id="shell"><div id="media"><img id="photo" src="' + assets.photo + '">' +
      '<img id="transparent" src="data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#dc2832" opacity=".5"/></svg>') + '">' +
      '<canvas id="canvas" width="80" height="80"></canvas><video id="video" autoplay muted playsinline></video></div>' +
      '<div id="badge"></div><div id="popup" role="dialog"><button id="action">Action</button></div></div>');
    await page.evaluate(async () => {
      const canvas = document.querySelector('#canvas'), context = canvas.getContext('2d');
      context.fillStyle = '#19b450'; context.fillRect(0, 0, 80, 80);
      window.stream = canvas.captureStream(10);
      const video = document.querySelector('#video');
      video.srcObject = window.stream;
      await video.play();
      await Promise.all([...document.images].map(image => image.decode()));
      document.querySelector('#action').onclick = () => { window.clicked = true; };
    });
    await page.waitForFunction(() => document.querySelector('#video').readyState >= 2);
    const selectors = ['#photo', '#transparent', '#canvas', '#video', '#badge', '#popup'];
    const boxes = await Promise.all(selectors.map(selector => rect(page, selector)));
    const native = await shot(page);
    await configure(page, { opacity });
    const painted = await shot(page);
    for (let i = 0; i < selectors.length; i++) {
      assert.deepEqual(await rect(page, selectors[i]), boxes[i], selectors[i] + " keeps native geometry");
      const [x, y, width, height] = boxes[i];
      // 避开弹窗按钮/文字与媒体边缘，比较最终合成像素。
      const point = selectors[i] === '#popup' ? [x + width - 8, y + height - 8] : [x + width / 2, y + height / 2];
      const original = pixel(native, ...point);
      const expected = original.map((value, channel) => Math.round(value * (1 - opacity) + [40, 80, 200][channel] * opacity));
      near(pixel(painted, ...point), expected, selectors[i] + " receives one wallpaper layer");
    }
    await page.locator('#action').click();
    assert.ok(await page.evaluate(() => window.clicked));
    await disable(page);
    near(pixel(await shot(page), 50 * zoom, 50 * zoom), [220, 40, 50], "disable restores native image color");
    await page.evaluate(() => window.stream.getTracks().forEach(track => track.stop()));
  });
}

check("scrolling and late media retain their native ownership under the fixed overlay", async page => {
  await html(page, '#thread{position:relative;height:250px;overflow:auto}#space{height:1000px}img{width:80px;height:80px}',
    '<div id="thread"><div id="space"></div></div>');
  await configure(page, { opacity: .3 });
  await page.evaluate(async source => {
    const image = new Image();
    image.id = 'late';
    image.src = source;
    await image.decode();
    document.querySelector('#space').prepend(image);
    const thread = document.querySelector('#thread');
    thread.scrollTop = 50;
  }, assets.photo);
  await settle(page);
  near(pixel(await shot(page), 40, 10), [166, 52, 95], "new image is composited while scrolling");
  assert.equal(await page.locator('#space > #late').count(), 1);
  assert.equal(await page.$eval('#late', node => node.getAttributeNames().some(name => name.startsWith('data-codex-plus'))), false);
});
