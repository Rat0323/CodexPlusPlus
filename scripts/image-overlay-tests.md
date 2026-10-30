# Image overlay regressions

Run with Node and locally available Playwright, Sharp and PNGJS. NODE_PATH can
point at an existing dependency directory; no installation is required when these
are already available. The browser defaults to msedge; override with
CODEX_TEST_BROWSER or CODEX_TEST_BROWSER_PATH.

- node scripts/test-image-overlay.cjs: opt-in, image clearing, repeated installation,
  source/opacity changes, legacy defaults, resizing, typing, attachment deletion,
  scrolling and native DOM/animation/guest ownership.
- node scripts/test-image-native-media.cjs: image/SVG/canvas/video/popup/badge
  composition at three opacity and three zoom values; click-through, disable and
  late media during scrolling.
- node scripts/test-image-composite.cjs: whole-frame patterned wallpaper comparisons.
  Five fit modes cover no transform, translate:0, translate:-154px and
  transform:translateX(-154px). Additional zoom cases exercise intermediate sidebar
  positions, composer growth and viewport resizing.
- node scripts/test-background-resume.cjs and node scripts/test-session-action-layout.cjs:
  independent scan scheduler and sidebar layout tests.

The current implementation deliberately restores the old full-window image layer.
Wallpapers tint native media and ordinary popups too; full opacity can hide content.
pointer-events:none preserves input delivery, not native pixel colors. The media
suite asserts this composition explicitly instead of expecting the retired regional
implementation's media promotion, per-control SVG filters or popup protection.

The shared fixture decodes the URL actually used by the overlay, then waits for
rendering. It does not fabricate ready, resource, cleanup or work-stat interfaces.
Disabling goes through the production configuration path. Each case checks page
errors and runs in its own browser page.

The rollback replaces tests specific to the removed regional painting machinery:
observer/cache work counts, SVG primitive reuse, regional material registration and
native-media color protection. Native layout, interactions, image composition and
reversibility remain covered by the suites above. These fixtures do not claim
real-app FPS, cross-platform GPU coverage or full installed-app acceptance.

For a reproducible pre-fix RED on the same fixtures:
CODEX_OVERLAY_BASELINE=be6162a node scripts/test-image-composite.cjs
(use the equivalent environment assignment in PowerShell). The transformed-footer
cases must fail; the current source must pass with the same one-channel tolerance.
CODEX_OVERLAY_CANDIDATE_FUNCTION can load a temporary source copy for mutation checks.
