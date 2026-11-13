# barkcli marketing site: design direction

| | |
|---|---|
| Scope | `landing-next/` homepage and the shared `site/` components it uses |
| Position | barkcli is the management layer for AI agents. Not a board, not a tracker. |
| Status | Living document. It describes what ships, not what we wish shipped. |
| Last reviewed | 2026-11-13 |

Every rule here exists to stop a specific failure. When a rule and a screenshot
disagree, the screenshot wins and the rule gets rewritten.

---

## 1. Design read

> Reading this as: a developer-tool landing page for engineers who already run
> coding agents, with a quiet terminal-modern language, leaning toward a
> token-driven Tailwind system, Space Grotesk / Manrope / Geist Mono, and motion
> that only explains state.

The audience is technical and sceptical. They have been pitched to by every agent
product on the internet. They do not need a mood; they need to know what this
thing does to their repository, in what order, and what happens when it fails.

---

## 2. Dials

| Dial | Value | Why |
|---|---|---|
| `DESIGN_VARIANCE` | **6** | Asymmetric hero and a weighted bento, but the page below the hero settles into one calm rhythm. Enough tension to avoid a template, not enough to cost readability. |
| `MOTION_INTENSITY` | **5** | Entry reveals, one sticky state diagram, tab crossfades. No parallax, no scroll hijack, no perpetual decoration. Motion shows which stage is live. |
| `VISUAL_DENSITY` | **3** | 80-112px section padding, 1120px container, one idea per band. The product captures carry the density; the page around them stays quiet. |

Reduced-motion readers get the same page with all four dials effectively at 1.

---

## 3. References, and what we take from each

### t3.codes

What it gets right, and what we adopt:

1. **The hero is one promise and one action.** A headline, a subline, a download,
   a source link. No feature bullets, no logo wall, no newsletter.
2. **Honesty is the differentiator.** "Bring your own subscription. We don't
   resell tokens." We say the same thing about agents and pricing, and we never
   invent customers we do not have.
3. **The product is the proof.** Real terminal output, real UI, real PRs. We use
   real captures and a labelled sample run, never a fake screenshot.
4. **One canvas, one accent.** Near-black, hairline borders, monospace metadata,
   a single warm accent. No rainbow, no gradient text.
5. **Direct sentences.** Concrete verbs, short lines, no "elevate" or "seamless".

What we do not take: its jokes, its testimonial wall (we have no customers to
quote), its multi-product nav, or its density of surfaces.

### The previous barkcli site

Kept: the dark canvas, the copper accent, the real screenshots, the
"management layer" positioning, the command-first instinct.

Retired: the feature-list structure, the repeated uppercase section labels, the
three competing hero actions, the glow and grid layered on every band, and any
claim that could not be traced to the repository.

### Linear, Vercel, Raycast (restraint only)

One type hierarchy, generous vertical space, borders instead of cards where a
card adds nothing, and focus states that are visible without being loud. No
layout is copied; the discipline is.

---

## 4. Principles

1. **Show the run, not the promise.** Every claim is followed by the mechanism:
   a command, a screenshot, a gate verdict.
2. **One accent, used once per decision.** Copper marks the live or primary
   thing. If everything is copper, nothing is.
3. **Green only means "the gate passed".** Success colour is semantic, never
   decorative.
4. **Borders before boxes.** A hairline separates; a card must earn its radius.
5. **Numbers must be traceable.** `57×` links to the benchmark page. MCP tool
   count is generated. Sample data is labelled "sample" or "example output".
6. **The page must read with JavaScript off.** Reveals start visible, tabs are
   real buttons, FAQ is native `<details>`.
7. **No dead ends.** Every section ends in a next action: docs, source, install.

---

## 5. Foundations

### 5.1 Colour: "Obsidian + Copper"

Single dark theme, locked at the page level. There is no light mode and no
toggle: the product's own surfaces are dark, the captures are dark, and a
half-tested inverted theme would be a regression, not a feature.

| Token | Value | Use |
|---|---|---|
| `bg` | `#080B10` | Page canvas |
| `bg-deep` | `#05070A` | Banded sections, terminal wells |
| `surface` | `#0B1018` | Panels, preview frames |
| `raised` | `#111722` | Controls on panels, chips |
| `line` | `#1A2130` | Default hairline, panel borders |
| `line-strong` | `#2A3546` | Hover borders, dividers that need weight |
| `fg` | `#F1F3F6` | Headlines, primary text |
| `muted` | `#94A0AF` | Body copy |
| `muted-dim` | `#7B8798` | Metadata, captions, disabled states |
| `copper` | `#D9955C` | The one accent: primary action, active state, live rail |
| `copper-soft` | `#F0C8A4` | Accent text on dark, hover fill |
| `copper-deep` | `#B0703C` | Reserved for non-text accents |
| `success` | `#42C995` | Gate passed, verified only |
| `danger` | `#E5675E` | Gate failed, errors only |
| `ink` | `#1A1005` | Text on copper fills |

Rules:

- No pure black, no pure white, no second accent, no gradient headline.
- Section tints are limited to `bg` and `bg-deep`. The theme never inverts
  mid-page.
- Body text sits at or above 4.5:1. The minimum measured on this page after the
  2026-11-13 pass is 5.41:1 (`muted-dim` on `surface`); `fg`, `muted` and copper
  pairs are higher.

### 5.2 Type

Three families, one job each, loaded through `next/font`.

| Role | Family | Spec |
|---|---|---|
| Display | Space Grotesk | Hero `clamp(2.05rem, 7vw, 3.7rem)` stacked, `clamp(2.5rem, 4.1vw, 3.7rem)` at `lg`; `0.98`, `-0.035em`. Section `clamp(1.9rem, 4vw, 3rem)`, `1.05`, `-0.025em` |
| Body | Manrope | 16.5px hero subtext, 15px section body, 13.5px panel body, all `1.65` |
| Metadata and commands | Geist Mono | 10-12px; uppercase labels are rationed, see 8.4 |

Rules:

- Headline max two lines at desktop. If it needs three, the copy is long, not
  the column narrow. Measured: 2 lines from 360px up (64px tall); 3 lines only at
  320px (96px), where the second line wraps rather than overflows.
- `text-wrap: balance` on headings, `pretty` on paragraphs.
- No serif. No display italics. No letter-spacing on body copy.
- Section headings are sentence case with one full stop. No question-mark
  headlines except FAQ.

### 5.3 Space and rhythm

- Base unit 4px. Scale: 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 112.
- Container: `1120px`, padding `20px` mobile / `32px` from `md`.
- Section band: `py-20` (80px) mobile, `py-28` (112px) desktop.
- Section header stack: headline, then body at `mt-4`, body max `65ch`.
- Card padding: `20px` small, `24px` large. Card gaps: `12px` in the bento.

### 5.4 Shape and elevation

One documented radius system:

| Element | Radius |
|---|---|
| Panels, previews, bento cells | `12px` |
| Buttons, inputs, tabs | `6px` |
| Chips, inline code, tiny badges | `4px` |
| Status pills and count badges | `999px` |

- One border weight: `1px` at `line`, promoted to `line-strong` on hover.
- The only drop shadow in the system is on the hero run panel:
  `0 24px 80px -32px rgba(0,0,0,0.9)`, tinted to the canvas. No shadows on
  cards, buttons, or text.
- No glassmorphism. The header uses a blur only after scroll, over content.

### 5.5 Iconography

- `lucide-react` at `1.5px` stroke, sized 14-16px inline. The project depends on
  it; a second icon family is not worth the bytes. This is the one place the
  anti-slop default is accepted deliberately.
- Icons support labels; they never replace one. No icon-only buttons except the
  mobile menu toggle and copy controls, both of which carry `aria-label`.
- The GitHub mark is the only hand-rolled path, because Lucide has no GitHub
  glyph. It lives in `components/site/Brand.tsx` and nowhere else.
- No decorative coloured dots. Dots exist only as gate status (success/danger)
  or a live run indicator inside the sample panel.

### 5.6 Motion

| Moment | Spec | Job |
|---|---|---|
| Hero panel entry | 600ms, `0.985 → 1` scale, children staggered 80-480ms | Hierarchy: the run panel resolves after the headline |
| Section reveal | 550ms, 18px rise, once, IntersectionObserver | Storytelling: content arrives as it is reached |
| Story stage change | 300ms colour/weight transition | State: which stage the reader is on |
| Tab panel swap | 280ms crossfade + 6px rise | Feedback: the selected surface changed |
| Hover / active | 180ms colour and border | Feedback: the control is live |

- Easing is `cubic-bezier(0.16, 1, 0.3, 1)` everywhere.
- `prefers-reduced-motion: reduce` collapses every duration to `0.001ms`, stops
  the rail and dash animations, disables autoplay, and leaves content visible.
- No `window.addEventListener("scroll")`. Scroll state comes from Motion's
  `useScroll`/`useMotionValueEvent` or an IntersectionObserver.
- Animate `transform` and `opacity` only. No layout property is animated.

### 5.7 Z-index

| Layer | Value |
|---|---|
| Header | `50` |
| Skip link | `60` |
| Overlays, when they exist | `40` |

Nothing else sets a z-index.

---

## 6. Page architecture

Each section gets one job and one layout family. The family appears once.

| # | Section | Job | Layout family | Proof element |
|---|---|---|---|---|
| 0 | Header | Orientation + install | Single-line nav, 64px | Install button |
| 1 | Hero | The promise and the mechanism | Asymmetric split (1.08 / 0.92) | Live run panel sample |
| 2 | Integration band | Who it drives | Full-bleed flex bar | Agent marks, verbatim names |
| 3 | Scroll story | How a run actually works | Sticky diagram + step column | Commands per stage |
| 4 | Showcase | What the app looks like | Tabbed media panel with side notes | Real captures, recorded run |
| 5 | Bento | What makes delegation safe | Weighted 6-cell grid (4+2, 3+3, 3+3) | Gate verdict, 57× benchmark |
| 6 | Verification | Why the gate can be trusted | Split: argument + terminal | Example failure output |
| 7 | Interfaces | Four ways in | 2×2 hairline matrix, no cards | Real surfaces and commands |
| 8 | Install | Remove the last friction | Centered panel, single column | Four verified install routes |
| 9 | FAQ | Answer the objections | Split: heading + disclosure list | Native `<details>` |
| 10 | Final CTA | One last action | Centered narrow band | Install command |
| 11 | Footer | Navigation and license | 4-column link grid | MIT, source |

The zigzag cap is respected: no three consecutive image+text splits. The bento
never repeats a cell shape twice in a row.

---

## 7. Components

### 7.1 Header

- 64px tall, one line at `lg`, sticky. Transparent until 8px of scroll, then a
  bordered, blurred bar.
- Brand left, four nav items, GitHub, Install. Mobile: brand, Install, menu.
- Menu: Escape closes, focus enters the panel and returns to the toggle, body
  scroll locks.
- Contrast: nav links `muted` on `bg` (7:1+), Install `ink` on `copper`.

### 7.2 Hero

Exactly four text elements:

1. Eyebrow, plain: `MIT licensed. Local first.` No pill, no status dot.
2. Headline, two lines: "Your agents build." / "You stay in control."
3. Subtext, one sentence, 17 words. Never more than 20.
4. One primary action: the install command with a copy control, and one
   secondary text link, "See how a run works".

No stats row, no trust strip, no third link inside the hero. Anything that
wants to be a bullet lives in the section below.

Top padding caps at `pt-24` desktop. The hero fits 900px of viewport height with
the command and secondary link visible.

### 7.3 Run panel (hero visual)

- A component preview, not a screenshot and not a fake dashboard: it renders the
  same four stages the CLI reports, with a `sample` badge and the command that
  would produce it.
- Anatomy: command strip, intent row, three agent rows with branch names, gate
  row, review row. Rows connect with a 1px rail.
- The rail shows flow only while the sample is running; under reduced motion it
  is a static line.
- No fake window traffic lights. The strip carries the command and the `sample`
  badge, which is the honest version of the same affordance.

### 7.4 Integration band

- One line: what it drives, then the marks. Names are verbatim CLI names
  (`claude-code`, `codex`, `opencode`) plus "any MCP agent".
- These are integrations, not customers. No testimonial styling, no logos we
  cannot run. Cursor is not listed as a backend because runs are probe-only
  today; it remains documented as an MCP client elsewhere.
- The band is the page's only full-bleed element.

### 7.5 Scroll story

- Four stages: Intent, Plan and dispatch, Build and verify, Review and merge.
  The stage name is the label; no `01 / 04`, no "Stage 1".
- Desktop: the step column scrolls, the diagram sticks at `top-24` and lights the
  active node. Mobile: the diagram is hidden and each step carries its own
  command and chips, so nothing is lost.
- The diagram is a diagram, not a screenshot: nodes, hairline connectors, a
  progress bar. Connectors animate only between active stages.

### 7.6 Showcase

- A tablist (`role="tab"`, arrow/Home/End keys, roving `tabIndex`) over one
  panel: media left, title, caption, three check-marked callouts right.
- Media is a real WebP capture or the recorded run video. Video autoplays muted
  and loops; under reduced motion it shows controls and does not autoplay.
- The frame keeps a mono label (`localhost:4321 · Board`). No traffic lights.
- Tabs are at least 40px tall; primary controls elsewhere are 44px.

### 7.7 Bento

- Six cells for six capabilities, weighted 4/2, 3/3, 3/3. No empty cell, no
  seventh topic squeezed in.
- No labels above the headings. The `h3` is the label, with a 16px icon.
- Three cells carry visual variation: the orchestration cell has a faint grid
  wash, the gate cell is tinted success, the context cell leads with `57×`.
  The rest stay flat surface.
- Each cell ends in one link, never two.

### 7.8 Verification panel

- Left: the argument. Right: example gate output, labelled "(example output)",
  with a real failure visible. A tool that only ever shows green is not
  demonstrating verification.
- The three supporting facts are plain rows: title in `fg`, body in `muted`, no
  green tick bubbles.
- Assets: `pre` with horizontal scroll on small screens, no wrapping of commands.

### 7.9 Interfaces matrix

- 2×2 grid of hairlines, no cards: icon, name, one-sentence body, mono meta.
  This is the page's "no boxes" section and keeps it distinct from the bento.
- Mobile collapses to one column with a single rule between rows.
- macOS app is described as ad-hoc signed, because that is what ships.

### 7.10 Install

- Centered: an `820px` container with a `756px` panel at 1440 (both centred on
  the viewport), one column: headline, one-sentence body, method tabs, command
  with copy, note.
- Four routes, all verified: `install.sh`, `install.ps1`, build from source,
  direct release archives. No Homebrew, no crates.io, no dead commands.
- Tabs 40px tall, keyboard navigable. The active tab is `raised`; the "default"
  badge marks the recommended route.
- After the panel: one link to the getting-started guide. Not two.

### 7.11 FAQ

- Native `<details>`, one hairline between rows, chevron rotation only.
- Answers are two or three sentences and are allowed to be technical.
- Heading left, list right on desktop; stacked on mobile. The right column is
  content, not filler text, so the split-header ban is not triggered.

### 7.12 Final CTA

- Centered, `max-w-3xl`: headline, one sentence, install command, Install and
  Source. Same "Install" label as the header, because it is the same intent.
- No mono strip at the bottom. The license line is a normal sentence.

### 7.13 Footer

- Four columns: brand and scope, Product, Documentation, Project.
- Column headings are 10px mono uppercase; they label navigation, they are not
  section eyebrows.
- Bottom line: MIT, no tracking cookies, built by a named person.

---

## 8. Copy rules

### 8.1 Claims

- Only describe behaviour that exists in the repository. If a command is
  advertised, it must resolve.
- Numbers come from output (`57×` from `barkcli context benchmark`, `83` from
  the MCP tool count generator) or are labelled sample/example.
- No invented customers, testimonials, benchmarks, star counts, or logos.

### 8.2 Voice

- Sentence case, concrete verbs, active voice. Second person for the reader.
- One register: technical, plain, dry. No jokes, no metaphors about craft, no
  "quietly trusted by".
- Headline ≤ 8 words. Section body ≤ 25 words. Hero subtext ≤ 20 words.

### 8.3 Dashes

Zero em dashes (`—`) and zero en dashes (`–`) in visible page copy and UI text.
Use a full stop, a comma, a colon, or parentheses. Hyphens only in compounds and
ranges.

Out of scope: the page `<title>`, Open Graph and Twitter metadata, and JSON-LD
answers. `barkcli — The management layer for AI agents` is the brand title and
should not be rewritten to satisfy a copy rule about prose.

### 8.4 Labels

- Maximum one uppercase mono eyebrow per three sections. On the homepage that
  means the hero eyebrow and nothing else above a heading; section headings
  carry the structure.
- Inline labels inside a component are not eyebrows: the scroll story's stage
  names and the bento's "Agent says" / "Gate says" rows label a local value, sit
  inside a panel, and never introduce a section.
- No numbered labels (`01 · Intent`, `Stage 1`), no version stamps, no scroll
  cues, no locale or weather strips.
- At most one middle dot per metadata line. Prefer commas.

### 8.5 Actions

- One label per intent. Install is always "Install". Source is always "Source"
  or "View the source", not "Steal our code".
- No two CTAs with the same intent in the same section.

---

## 9. Accessibility floor

- Skip link to `#main`, visible on focus.
- Focus ring: 2px copper, 2px offset, on every interactive element.
- Targets: 44px for primary CTAs, 40px for tabs and copy controls, 40px for the
  mobile menu toggle. Standalone links are at least 24px tall; links inside a
  sentence are exempt, per WCAG 2.2.
- Tabs implement `role="tablist"` with arrow, Home and End keys and roving
  `tabIndex`.
- FAQ uses native `<details>` so it works without JavaScript.
- Reduced motion removes reveals, looping media and flow animation without
  hiding content.
- Colour is never the only signal: gate state also carries text.
- Headings descend in order; the page has one `h1`.
- Copy feedback is announced with `aria-live="polite"`.
- Contrast measured on the shipped build, not the mockup.

---

## 10. Responsive rules

- Breakpoints: `sm 640`, `md 768`, `lg 1024`, `xl 1280`.
- Every multi-column section declares its mobile collapse in the component:
  hero, story, verification, FAQ, footer to one column; bento and interfaces to
  one column with explicit spans removed; showcase media above notes.
- No horizontal overflow at 320px. Long commands wrap with `break-all` inside
  their panel, never across the page.
- The story diagram is desktop-only (`lg`); mobile gets the same facts as text.
- Navigation is one line from `lg`; below that it is the menu button.

---

## 11. Anti-slop audit

Run against the rules in `design-taste-frontend`, on this page only.

| Rule | Status | Evidence |
|---|---|---|
| Eyebrows ≤ 1 per 3 sections | Pass | One eyebrow above a heading (hero). Stage names and gate rows are inline labels |
| No split-header default | Pass | Hero is a real split with a visual; showcase's right side is actions; verification's right side is a terminal |
| No three equal feature cards | Pass | Weighted bento, hairline interface matrix |
| Bento cell count == content count | Pass | 6 capabilities, 6 cells, no gaps |
| Bento background diversity | Pass | Grid wash, success tint, `57×` display |
| No card-everywhere repetition | Pass | Interfaces and FAQ use rules, not cards |
| Hero ≤ 4 text elements | Pass | Eyebrow, headline, subtext, actions |
| Hero subtext ≤ 20 words | Pass | 17 words |
| Hero CTA visible without scroll | Pass | Verified at 900px height |
| Hero padding ≤ `pt-24` | Pass | `lg:pt-24` |
| Nav one line, ≤ 80px | Pass | 64px, four items |
| Zero em dashes | Pass | None in visible copy. Metadata and JSON-LD keep the brand title's dash by design |
| One accent | Pass | Copper only; green is semantic |
| Shape lock | Pass | 12 / 6 / 4 / pill, documented above |
| CTA contrast | Pass | `ink` on copper ≈ 7.5:1 |
| No div-based fake screenshots | Pass | Real captures and video; run panel is a component preview, labelled sample |
| No fake numbers | Pass | 57× and 83 are generated or linked; sample rows labelled |
| Logo wall without labels | Pass | Integration band, verbatim names, no roles underneath |
| No decorative status dots | Pass | Dots only in gate state and the live run rail |
| No scroll cues / version labels / locale strips | Pass | None present |
| No em-dash, no numbered eyebrows | Pass | Stage names replaced the numbers |
| Quotes ≤ 3 lines | N/A | No testimonials |
| Motion motivated | Pass | Every animation maps to hierarchy, state, or feedback |
| Reduced motion honored | Pass | Global override + per-component fallbacks |
| `window` scroll listener | Pass | Removed; Motion `useScroll` in header |
| Images real | Pass | Four WebP captures, one recorded MP4/WebM |
| Copy self-audit | Pass | Re-read on 2026-11-13 |
| One theme | Pass | Dark only, documented deviation from dual-mode default |

Two deliberate deviations from the skill defaults, both documented:

1. **Dark-only theme.** The product, captures, and brand are dark. A light mode
   would require reshooting every capture and would be shipped untested.
2. **Lucide icons.** Already a project dependency, one family, consistent
   stroke. Installing a second icon set for purity would cost bytes, not clarity.

---

## 12. Do not

- Do not describe barkcli as a Kanban board, task tracker, or project manager.
- Do not add a second accent, a gradient headline, or a glow behind a section.
- Do not add a label above a section heading to "add rhythm". The heading is the
  rhythm.
- Do not put a card around a single sentence.
- Do not add a testimonial, customer logo, or metric without a real source.
- Do not put a command in the page that the installer does not support.
- Do not autoplay anything with sound. Do not autoplay at all under reduced
  motion.
- Do not use scroll hijacking, parallax, or a scroll progress bar.
- Do not add a "Scroll to explore" or a version footer.
- Do not add an animation that cannot be explained in one sentence.

---

## 13. Verification log

Measured on the running build, Chrome headless at 320 / 360 / 375 / 390 / 414 /
768 / 1024 / 1280 / 1440 / 1920:

- Horizontal overflow: 0 at every width (`scrollWidth === clientWidth`). At 320
  the only boxes past the edge are inside the verification terminal's
  `overflow-x-auto` well, which clips them.
- Hero: h1 59.04px / 544px column at 1440 and 1920, 52.48px at 1280, 2 lines
  from 360px up, 3 lines at 320. Install command bottom 618px, secondary link
  bottom 682px, so both are above the fold at 900px height.
- Bento: 4/2, 3/3, 3/3 spans at `lg`, single column below `md`.
- Interfaces: 2 columns of 526.5px at 1440, one column below `sm`.
- Install panel: 756px wide, centred (panel centre 720, viewport centre 720).
- Text contrast: minimum 5.41:1 (`muted-dim`); h1 17.73:1, footer 7.42:1,
  product tabs 12.67-16.15:1.
- Targets: header links 40px, install/product tabs 40px, bento "learn more"
  links 34px, install guide link 35px, footer links 24px.
- Keyboard: tab order through header, story, tabs, FAQ, footer; 5 + 4 tab
  controls respond to arrow keys; menu opens, closes on Escape, and returns
  focus to the toggle.
- Reduced motion: no heading or body copy left at `opacity: 0`; no video
  autoplay.
- Pages export: assets resolve under `/barkcli`, no doubled base path.
- Build: `tsc --noEmit`, `eslint`, `next build`, Pages export all clean.

Not verified: visual composition by eye. The environment has no vision channel,
so this document describes intent and measurements, not a claim that the page
was looked at.

When a change lands, update this file in the same commit. A design doc that
describes a previous version is worse than none.
