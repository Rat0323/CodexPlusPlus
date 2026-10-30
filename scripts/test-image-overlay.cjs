const { assert, assets, check, configure, disable, html, injection, near, overlaySelector, pixel, rect, settle, shot } = require("./image-overlay-fixture.cjs");

check("overlay is opt-in and repeated installation remains reversible", async page => {
  await html(page, "", "<button>Native content</button>");
  const native = await shot(page);
  await page.evaluate(injection);
  await page.evaluate(() => installCodexPlusImageOverlay());
  assert.equal(await page.locator(overlaySelector).count(), 0);
  await configure(page, { dataUrl: "" });
  await configure(page);
  await page.$eval(overlaySelector, node => { window.firstOverlay = node; });
  await configure(page);
  assert.ok(await page.$eval(overlaySelector, node => node === window.firstOverlay));
  await disable(page);
  assert.deepEqual((await shot(page)).data, native.data, "native pixels restored");
  await configure(page);
  await configure(page, { dataUrl: "" });
  assert.deepEqual((await shot(page)).data, native.data, "clearing image restores native pixels");
});

check("changing image and opacity updates the existing visible layer", async page => {
  await html(page, "", "");
  await configure(page, { opacity: .3 });
  near(pixel(await shot(page), 300, 200), [29, 41, 77]);
  await page.$eval(overlaySelector, node => { window.firstOverlay = node; });
  await configure(page, { dataUrl: assets.photo, opacity: .5 });
  near(pixel(await shot(page), 300, 200), [122, 32, 37]);
  assert.ok(await page.$eval(overlaySelector, node => node === window.firstOverlay));
  await configure(page, { dataUrl: assets.wall, opacity: 1 });
  near(pixel(await shot(page), 300, 200), [40, 80, 200]);
});

check("invalid mode and opacity use the legacy defaults and limits", async page => {
  await html(page, "", "");
  for (const [opacity, expected] of [[undefined, .35], ["invalid", .35], [0, .35], [-1, .01], [2, 1]]) {
    await configure(page, { opacity, fitMode: "invalid", dataUrl: assets.pattern });
    const actual = await page.$eval(overlaySelector, node => {
      const style = getComputedStyle(node); return [Number(style.opacity), style.backgroundSize];
    });
    assert.deepEqual(actual, [expected, "contain"]);
  }
});

check("window coverage follows viewport resize without changing native geometry", async page => {
  await html(page, '#composer{position:absolute;left:120px;top:90px;width:400px;height:100px;translate:-40px}',
    '<div id="composer" contenteditable="true">Draft</div>');
  const before = await rect(page, "#composer");
  await configure(page);
  for (const size of [{ width: 800, height: 600 }, { width: 1100, height: 740 }]) {
    await page.setViewportSize(size);
    await settle(page);
    assert.deepEqual(await rect(page, overlaySelector), [0, 0, size.width, size.height]);
    assert.deepEqual(await rect(page, "#composer"), before);
  }
});

check("typing, attachment deletion and scrolling pass through the overlay", async page => {
  await html(page, '#thread{height:300px;overflow:auto}#spacer{height:1000px}#editor{height:50px}',
    '<div id="thread"><div id="spacer">Transcript</div></div><div id="attachment">Attachment<button id="remove">Delete</button></div><div id="editor" contenteditable="true"></div>');
  await page.evaluate(() => document.querySelector('#remove').onclick = () => document.querySelector('#attachment').remove());
  await configure(page);
  await page.locator("#editor").fill("Updated draft");
  assert.equal(await page.locator("#editor").textContent(), "Updated draft");
  await page.locator("#remove").click();
  assert.equal(await page.locator("#attachment").count(), 0);
  await page.mouse.move(150, 150);
  await page.mouse.wheel(0, 200);
  await page.waitForFunction(() => document.querySelector('#thread').scrollTop > 0);
});

check("native nodes, animation APIs and guest documents remain untouched", async page => {
  await html(page, '#composer{position:relative;contain:paint;transform:translateX(20px)}',
    '<div id="composer"><span id="mention" contenteditable="false">Plugin</span><img id="photo"><div role="menu">Menu</div></div><iframe srcdoc="<p>Guest</p>"></iframe><div id="shadow"></div>');
  await page.evaluate(() => {
    document.querySelector('#shadow').attachShadow({ mode: "open" }).innerHTML = '<button>Shadow content</button>';
    window.nativeNodes = [...document.body.querySelectorAll('*')];
    window.nativeMarkup = document.body.innerHTML;
    window.nativeAnimate = Element.prototype.animate;
    window.nativeTransition = document.startViewTransition;
  });
  const geometry = await rect(page, "#composer");
  await configure(page);
  assert.ok(await page.evaluate(() => document.body.innerHTML === window.nativeMarkup &&
    window.nativeNodes.every((node, index) => node === document.body.querySelectorAll('*')[index]) &&
    Element.prototype.animate === window.nativeAnimate && document.startViewTransition === window.nativeTransition));
  assert.deepEqual(await rect(page, "#composer"), geometry);
  assert.equal(await page.frameLocator('iframe').locator('body').textContent(), "Guest");
  assert.equal(await page.locator('#shadow button').textContent(), "Shadow content");
});
