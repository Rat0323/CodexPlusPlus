import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../../../assets/inject/renderer-inject.js", import.meta.url), "utf8");
const install = source.match(/^  function installCodexPlusImageOverlay\([^]*?^  \}/m)?.[0];
assert.ok(install);

// Browser suites verify pixels, positioning, lifetimes and bounded work.
// Static checks guard side effects outside those synthetic fixtures.
it("never captures or reparents native media", () => {
  assert.doesNotMatch(install, /cloneNode|captureStream|drawImage|toDataURL/);
  assert.doesNotMatch(install, /node\.style\s*=|node\.style\.(?:setProperty|removeProperty)|appendChild\(node\)|showPopover/);
});

it("leaves native animation APIs and guest documents alone", () => {
  assert.doesNotMatch(install, /document\.startViewTransition|Element\.prototype\.animate|skipTransition/);
  assert.doesNotMatch(install, /styleSheets|cssRules|adoptedStyleSheets|executeJavaScript|setInterval/);
});

it("installs only when enabled and removes the single layer when disabled", () => {
  type OverlayNode = {
    id?: string; tagName: string; style: Record<string, string>;
    parentElement: object | null; setAttribute(): void; remove(): void;
  };
  const nodes: OverlayNode[] = [];
  const root = { appendChild(node: OverlayNode) { nodes.push(node); node.parentElement = root; } };
  const window: { __CODEX_PLUS_IMAGE_OVERLAY__?: { enabled: boolean; dataUrl: string; opacity?: number } } = {};
  const document = {
    documentElement: root,
    getElementById: (id: string) => nodes.find(node => node.id === id),
    createElement: (): OverlayNode => ({
      tagName: "DIV", style: {}, parentElement: null,
      setAttribute() {},
      remove() { nodes.splice(nodes.indexOf(this), 1); },
    }),
  };
  const apply = runInNewContext(
    'const codexPlusImageOverlayId="codex-plus-image-overlay";' + install + ';installCodexPlusImageOverlay',
    { window, document, sendCodexPlusDiagnostic() {} },
  );
  apply();
  assert.equal(nodes.length, 0, "disabled by default");
  window.__CODEX_PLUS_IMAGE_OVERLAY__ = { enabled: true, dataUrl: "" };
  apply();
  assert.equal(nodes.length, 0, "missing images do not install an empty layer");
  window.__CODEX_PLUS_IMAGE_OVERLAY__ = { enabled: true, dataUrl: "data:image/png;base64,test", opacity: .3 };
  apply();
  const overlay = nodes[0];
  apply();
  assert.equal(nodes.length, 1, "repeated installation does not duplicate the layer");
  assert.equal(nodes[0], overlay);
  window.__CODEX_PLUS_IMAGE_OVERLAY__.enabled = false;
  apply();
  assert.equal(nodes.length, 0, "disabling restores the native page");
});

it("keeps installation diagnostics and avoids retired foreground installers", () => {
  assert.match(install, /sendCodexPlusDiagnostic\("image_overlay_installed"/);
  assert.doesNotMatch(source, /function installCodexPlusImageOverlayForeground|function codexPlusSettingsGuestWallpaper/);
});
