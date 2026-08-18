# Home Page Redesign — Design QA

## Comparison Target

- Source visual truth: `/Users/gao/.codex/generated_images/01a01337-a07d-7260-a8df-e6bc747bb032/exec-bde173ba-ada1-47f8-a7a0-92db9f2efe2a.png`
- Normalized source: `/Users/gao/Workspace/mianshi/design-qa/home-option3-reference-normalized.png`
- Final implementation screenshot: `/Users/gao/Workspace/mianshi/design-qa/home-option3-implementation-final.png`
- Final side-by-side evidence: `/Users/gao/Workspace/mianshi/design-qa/home-option3-comparison-final.png`
- State: dark theme, home route, `面经整理` selected.
- CSS viewport: `390 x 844`.
- Source pixels: `853 x 1844`, normalized to `390 x 844` with ImageMagick.
- Implementation pixels: `390 x 844`, captured at device scale factor `1`.

## Findings

No actionable P0, P1, or P2 differences remain.

- [P3] Existing top-bar control treatment differs slightly from the generated mock.
  - Location: theme and settings controls.
  - Evidence: the mock uses two outlined monochrome controls; the implementation preserves the product's existing filled theme control and mint settings icon.
  - Impact: minor chrome difference only; hierarchy and tap targets are unchanged.
  - Resolution: accepted to preserve the existing app-wide `TopBar` and theme system.

- [P3] Main interview icon uses the closest standard library glyph.
  - Location: centered tool icon.
  - Evidence: the mock contains a custom three-line list glyph; the implementation uses Phosphor `ListDashes` inside the matching outlined container.
  - Impact: small icon-detail variation with no change to meaning or visual weight.
  - Resolution: accepted to keep the project on its existing Phosphor icon system and avoid custom SVG/CSS art.

## Required Fidelity Surfaces

- Fonts and typography: existing Inter / PingFang SC / Noto Sans SC stack retained. Title, tab, body, list, and action weights visually match the source hierarchy; no clipping, truncation, or unintended wrapping at `390px`.
- Spacing and layout rhythm: tab bar, centered tool panel, three divided capability rows, primary action, secondary switch, and bottom privacy note align closely with the normalized reference. The `260px` panel width matches the source's central column.
- Colors and visual tokens: existing near-black background and mint token retained; amber is used for the resume route and the secondary switch. Contrast remains strong in active, inactive, and action states.
- Image quality and asset fidelity: the visual target contains no raster imagery. All icons come from the existing Phosphor library; there are no placeholder images, custom SVGs, CSS drawings, or emoji substitutes.
- Copy and content: tool labels, descriptions, three capability rows, primary actions, tool-switch actions, and local privacy message are present and coherent in both tool states.
- Accessibility: semantic `tablist` / `tab` / `tabpanel` roles, selected-state announcements, labelled controls, visible focus styles, practical touch targets, and non-color text labels are present.
- Responsiveness: `390 x 844` matches the design target. A `320 x 568` check shows no horizontal overflow (`scrollWidth: 320`); the content scrolls vertically as expected on the shorter viewport. The default desktop viewport also preserves the centered hierarchy without overlap.

## Interaction Verification

- Switched between `面经整理` and `简历生成器` through the tabs.
- Switched tools through the secondary text action.
- Opened `简历生成器` through the primary CTA and returned to the home screen.
- Confirmed the fresh browser session reported no console warnings or errors.
- Build: passed.
- Tests: 34 passed across 8 test files.

## Comparison History

### Pass 1

- [P2] The central content column was substantially wider than the selected design.
- [P2] The privacy note fell below the visible mobile viewport.
- Fixes: reduced the tool panel to `260px`; removed the conflicting `min-height: 100%` so the footer can use the available flex space.
- Post-fix evidence: `design-qa/home-option3-implementation-pass-2.png`.

### Pass 2

- [P2] The active-tab underline spanned the full half-width instead of the shorter source indicator.
- [P2] The centered tool icon was oversized, and the interview-to-resume switch used mint instead of the source amber.
- Fixes: inset the underline by `13%`; reduced and repositioned the icon; introduced the opposing-tool switch accent; tightened action sizing; improved footer contrast.
- Post-fix evidence: `design-qa/home-option3-comparison-pass-3.png`.

### Final Pass

- No actionable P0/P1/P2 differences found.
- Full-view comparison: `design-qa/home-option3-comparison-final.png`.
- Focused region comparison was not needed because all text, icons, dividers, and controls remain clearly readable in the normalized `390 x 844` full-view comparison; the main interaction states were inspected separately in the browser.

## Follow-up Polish

- Optional: create a bespoke product icon only if the broader app icon system is redesigned; the current Phosphor glyph is intentionally consistent with the rest of the application.

final result: passed
