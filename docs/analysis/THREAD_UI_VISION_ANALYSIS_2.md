# Thread UI Vision Analysis (BarkCLI) — v2

> Source screenshots (5) requested for analysis:
>
> 1. `bba01f09-…-00832cd9-18e6-4ae9-b027-fbfe11bf2afb.png` (1568×696)
> 2. `bba01f09-…-13559501-f732-44f6-9961-e1cbbad5a758.png` (1532×202)
> 3. `bba01f09-…-b2aa23f9-bec6-4d3b-8455-00d8c9eb07d4.png` (1502×312)
> 4. `bba01f09-…-6ee4e02e-5755-4f11-a23a-1533dd78006c.png` (1580×850)
> 5. `bba01f09-…-ab7c0f12-a4bf-4256-8ac7-89088b90e133.png` (1506×260)

## 0. Honesty note — image visibility

**I cannot see these images.** The model I am running as does not support image input
(`read` returned: *"this model does not support image input"*). No OCR tooling is
available in this environment (no `tesseract`, no `pytesseract`/`easyocr`, no
image-analysis MCP). I therefore cannot describe the actual pixels of the 5
screenshots, and any per-image description below is an *inference* from (a) the
file dimensions, (b) the attachment provenance (a `bba01f09-…` T3 Code session,
i.e. the screenshots are of **T3 Code's threads/chat UI**), and (c) a direct
read of the T3 Code source tree at `ref/t3code` plus BarkCLI's own
`web/src/threads/`.

If you need a true pixel-level read, re-run this task with a vision-capable model
and feed it the 5 files; the implementation spec in §5 is written to be
actionable regardless.

The T3 Code reference is the right source of truth for the target look: the
screenshots are from a T3 Code thread session, and BarkCLI's stated goal
(`AGENTS.md`, `ANALYSIS_T3CODE.md`) is to match T3 Code's thread/management
layer. Dimensions are consistent with T3 Code's chat surface (wide chat pane
~1500–1580 px, short composer/panel strips ~200–312 px tall).

---

## 1. Per-image inferred content

I cannot confirm these; they are best-guess mappings from dimensions + T3 Code UI.

### Image 1 — `…00832cd9…png` (1568×696, wide, medium height)
Likely the **primary thread view in a "working" state after a prompt**: sidebar
on the left (projects/threads list), main chat column with a user message bubble
(right) followed by an assistant reply, a "Thought process" `<details>` block,
and a `StepExplorer` ("Steps · N") expanded or collapsed, plus the composer at
the bottom. Aspect ratio (~2.25:1) matches T3's `_chat.$environmentId.$threadId`
route with the right inspector possibly closed.

### Image 2 — `…13559501…png` (1532×202, very short strip)
Likely a **collapsed/expanded "details" block or a queued-messages panel strip**:
a single horizontal band showing a `MarkdownDetails`/`Collapsible` header
(`ChevronRight` + summary label) or the `QueuedMessagesPanel` with 1–2 queued
prompts. 202 px height ≈ one component row band, not a full thread.

### Image 3 — `…b2aa23f9…png` (1502×312, short band)
Likely a **tool-calls / steps display** (the `StepExplorer` expanded view): a
scrollable list of step rows (Read/Search/Edit/Run/Checks) with mono truncated
values and a nested output `<pre>` (max-height ~40 → ~312 px total for ~6 rows).
Alternatively a "Changed files" card band.

### Image 4 — `…6ee4e02e…png` (1580×850, tallest)
Likely the **full thread view with an expanded details block**: tallest capture,
room for sidebar + chat column + possibly the right inspector (diff/files) or an
expanded `ChangedFilesCard` / `V2ItemInspector`. This is the "after prompt,
results visible" hero shot.

### Image 5 — `…ab7c0f12…png` (1506×260, short band)
Likely a **results display strip**: e.g. the `AssistantChangedFilesSection`
(`ChangedFilesCard` with file tree + diff totals) or a `RunReviewCard` / gate
result row, ~260 px = a card with a few file rows.

> Because I cannot verify, treat §1 as a hypothesis. The spec in §5 targets the
> T3 patterns these screenshots are almost certainly illustrating.

---

## 2. T3 Code thread UI anatomy (from `ref/t3code`)

### 2.1 Layout
- Route `/_chat` (`routes/_chat.tsx`) keeps `ChatView` mounted across
  draft→server promotion and modal overlays (settings render *over* the thread,
  no remount).
- Thread route: `/$environmentId/$threadId` (server thread), `/draft/$draftId`,
  `/new`, `/`.
- Shell: **left sidebar** (projects/threads, grouping, snooze/pin, search) +
  **main ChatView** + **right inspector** (`rightPanelStore`, per-thread tab
  list: diff, files, file:<path>, preview, device, terminal:<id>, PR, side-chat)
  + **terminal drawer** + **command palette** (Cmd/Ctrl+K), `?` shortcuts.
- Thread identity is `ScopedThreadRef { environmentId, threadId }`.

### 2.2 Message rows
- `TimelineAssistantRows.tsx` → `AssistantTimelineRow`: avatar/name header,
  `ChatMarkdown` body, optional `AssistantChangedFilesSection`, `AssistantMessageMeta`
  (status pill, copy button, fork button, timestamp) revealed on hover.
- User rows: right-aligned bubble (`chat-message-user`, max-width 88%), header
  with author + actions (reuse/copy) + time.
- Streaming: `chat-streaming-badge` with `agent-wave` bars + "Streaming…",
  pulsing avatar, blinking caret in prose container.

### 2.3 "Details" blocks (collapsed/expanded)
Three distinct collapsible surfaces in T3, all relevant:

1. **`MarkdownDetails.tsx`** — renders markdown `<details>`:
   - Outer: `my-2 border-y border-border/60`.
   - `Collapsible` with `CollapsibleTrigger`: `flex w-full items-center gap-2 py-2
     text-left text-sm font-medium`, `data-panel-open:[&_svg]:rotate-90`.
   - `ChevronRightIcon` size-4, `transition-transform`, rotates 90° when open.
   - Summary text (defaults "Details").
   - Panel: `pb-3 ps-6 text-foreground/[calc(90%+var(--appearance-contrast-boost)/10)]`.
   - Find-in-page reveals closed panels (`hiddenUntilFound`).

2. **Thought process block** (BarkCLI already mirrors): `chat-thought-block`,
   `chat-thought-summary` with spark icon + "Thought process" + "thinking…"
   pulse, content `chat-thought-content` (italic, max-height 320px scroll).

3. **`StepExplorer` (thread-details)** — tool steps:
   - Outer `<details className="thread-details group my-1">`.
   - Summary: inline-flex, gap-1.5, rounded-md, px-1 py-0.5, text-[11px] muted,
     chevron `chevR` rotates 90° on open.
   - Label: `{running ? "Working" : "Steps"} · {steps.length}`.
   - Each step row: label w-12 text-[10.5px] (color by status tone) + value
     `min-w-0 flex-1 truncate font-mono text-[10.5px]` + meta text-[10px].
   - Expandable rows open nested `<details>` with command `<pre>`, file link
     button, detail text, output `<pre>` max-h-40 scroll, truncated at 4000 chars.

4. **Changed files card** (`AssistantChangedFilesSection`): persisted
   expand/collapse per `routeThreadKey` + `runId` in `uiStateStore`
   (`threadChangedFilesExpandedById`), `ChangedFilesCard` with file tree + totals,
   toggle all directories.

### 2.4 Working state after prompt
- `LiveAgentWorkingBubble` (BarkCLI) / T3 equivalent: pulsing avatar, author
  name, streaming badge with status text + elapsed seconds, **Stop** button
  (danger hover), recent activities list (last 3) with icon + label + time,
  "Live execution" footer, ping dot.
- T3 timeline also shows `V2LifecycleRow`, `TimelinePendingApprovalRow`
  (approvals), `ComposerPendingUserInputPanel` for runtime requests.

### 2.5 Tool calls / steps display
- T3 `WorkLog`/`Timeline*Row` entries: `tool_call`, `command_execution`,
  `file_change/search`, `web_search`, `dynamic_tool`, `todo_list`, etc., each
  with an icon (`TimelineToolActivityIcon` → `WorkEntryIcon` set: bot, brain,
  browser, check, list-todo, circle-alert, code, device, eye, globe, hammer,
  search, square-pen, terminal, wrench, x, zap, t3-code, pull-request).
- Status tones: failed → `text-tool-error-icon/40` / danger; running → accent;
  success → success; else muted.
- BarkCLI `StepExplorer` already does a subset (read/search/analyze/edit/gate/
  command/find/inspect/generic) with nested output.

### 2.6 Results display
- `AssistantChangedFilesSection` + `ChangedFilesCard`: files list, diff totals,
  open-in-editor, context menu, "open turn diff" callback.
- `RunReviewCard` (BarkCLI) shows run summary: attempt, agent/model, branch,
  worktree, checks; verify/build-on actions.
- Errors: `formatErrorMessage` linkifies URLs; retry.

### 2.7 Typography / spacing / colors / patterns (from T3 + BarkCLI CSS)
T3 (Tailwind, shadcn-derived):
- Message gap: timeline rows `px-1 py-0.5`; assistant header `mb-6`? BarkCLI uses
  `gap: 28px` between messages.
- Font sizes: 11px (steps/meta), 12px (thought content), 12.5–13px (code),
  14px (prose body), 16px (headings).
- Mono: `ui-monospace, "SF Mono", monospace` for code/time/paths.
- Radii: 4px (buttons), 6px (avatar), 8px (thought block), 10px (code block),
  12px (user bubble).
- Borders: `border-border/60`, `border-border/40` subtle; `border-y` for details.
- Colors: `text-foreground`, `text-muted`, `text-muted-strong`, `text-accent`,
  `text-accent-text`, `text-danger`, `text-success`, `text-tool-error-icon`.
- Motion: `transition-transform`, `transition-opacity duration-200`,
  `animate-pulse` for streaming, `animate-ping` for live dot. Reduced-motion
  respected.
- Hover-reveal actions: opacity 0 → 1 on `.group:hover` / `focus-within`.
- Collapsible chevron rotation 90°, `data-panel-open` attribute-driven.

BarkCLI (`web/src/index.css`) mirrors many of these via CSS variables
(`--text`, `--muted`, `--accent`, `--border`, `--surface`, `--card`, `--bg`),
with `.chat-*` classes. Dark/light via `[data-theme="light"]`.

---

## 3. BarkCLI current state (gap analysis)

Existing (`web/src/threads/`):
- `ThreadPane.tsx` (~1856 lines): monolithic; message coalescing, user/assistant
  cards, run summary, execution timeline, composer, queued messages.
- `AssistantMessageCard.tsx`: streaming progressive typing, thought block
  (`<details className="chat-thought-block">`), streaming badge + caret.
- `StepExplorer.tsx`: tool steps with nested details, status tones, output
  truncation. Good, but no icon set, no persistent expand state, no running
  shimmer.
- `QueuedMessagesPanel.tsx`, `RunReviewCard.tsx`, `ThreadComposer.tsx`,
  `CodeBlock.tsx`.
- CSS in `index.css` (`.chat-*`, `.thread-details`).

Gaps vs T3 target:
1. No `MarkdownDetails` component for markdown `<details>` (T3 has one with
   chevron + border-y + find-reveal). BarkCLI's `Prose` uses ReactMarkdown but
   doesn't override `details`/`summary`.
2. No persisted expand/collapse state for steps/changed-files (T3 uses
   `uiStateStore` with versioned localStorage). BarkCLI `StepExplorer` holds
   only local `useState(false)`.
3. No tool activity icon set (`WorkEntryIcon` 20+ icons) — BarkCLI steps show
   text labels only.
4. No hover-reveal action pattern on assistant meta (BarkCLI shows copy button
   always when not streaming; T3 reveals on hover/focus).
5. No right-inspector surfaces (diff/files/terminal/PR) — BarkCLI uses modal
   pages; AGENTS.md suggests per-card right-panel surfaces.
6. No timeline virtualization (LegendList) — BarkCLI renders full list.
7. No `MarkdownDetails` find-in-page reveal.
8. Assistant meta status pill + fork button missing.
9. No `ChangedFilesCard` with diff totals / file tree in thread (BarkCLI has
   `RunReviewCard` but not per-turn changed files).
10. Streaming badge uses custom `agent-wave`; T3 similar but with `live-activity-focus`.

---

## 4. Per-image → component mapping (hypothesis)

| Image | Likely primary component(s) |
|---|---|
| 1 (1568×696) | `ThreadPane` full view + `StepExplorer` (collapsed) |
| 2 (1532×202) | `QueuedMessagesPanel` or `MarkdownDetails` header strip |
| 3 (1502×312) | `StepExplorer` expanded (tool rows + output) |
| 4 (1580×850) | `ThreadPane` + expanded details / right inspector |
| 5 (1506×260) | `ChangedFilesCard` / `RunReviewCard` results strip |

---

## 5. Concrete implementation spec for BarkCLI thread UI

Target directory: `web/src/threads/` + `web/src/components/`. Keep existing
files; add new ones; preserve tests.

### 5.1 New components

**A. `web/src/threads/MarkdownDetails.tsx`** (port T3)
- Props: `{ children, open?, onOpenChange? }`.
- State: `useState(open)`; reveal ref for find-in-page.
- Render: outer `div.my-2 border-y border-border/60`; native controlled
  `<details open={expanded}>` (BarkCLI has no `ui/collapsible` primitive, keep
  dependency-free); trigger `flex w-full items-center gap-2 py-2 text-left
  text-sm font-medium text-foreground`, chevron `size-4 shrink-0
  text-muted-foreground transition-transform` rotating 90deg when open; panel
  `pb-3 ps-6`.
- Default summary "Details" when no `<summary>` child.
- Export `MarkdownDetails`.

**B. `web/src/threads/ToolActivityIcon.tsx`** (port subset of T3
`TimelineToolActivityIcon.tsx`)
- Export `WorkEntryIcon` + `WorkEntryIconName` union and `ToolActivityIconView`.
- Map barkcli step kinds to icons using existing `Icon` names where available;
  fall back to `wrench`. Keep it dependency-light (no asset URL state).
- Minimum icon set: bot, brain, search, code, terminal, wrench, check, list-todo,
  globe, hammer, square-pen, eye, x, zap.

**C. `web/src/threads/ChangedFilesCard.tsx`** (new)
- Props: `{ runId, files, totals, allDirectoriesExpanded, resolvedTheme,
  onToggleAllDirectories, onOpenTurnDiff, onFileContextMenu }`.
- Render file tree with +/- counts, totals row, click to open diff.
- Persist expand via `useUiStateStore` (see §5.3).

**D. (removed)** No new `ui/collapsible` primitive — use native controlled
`<details>` to stay dependency-free (BarkCLI has no `components/ui/` dir).

### 5.2 Modify existing components

**`AssistantMessageCard.tsx`**
- Add `MarkdownDetails` override in `Prose`? Actually `Prose` lives in
  `ThreadPane.tsx`. Move `Prose` to a shared module or add `components` prop to
  ReactMarkdown: `details: MarkdownDetails`, `summary: (props) => <summary
  className="...">{props.children}</summary>`.
- Hover-reveal meta: change `.chat-assistant-actions` to opacity 0 → 1 on
  `.group:hover`/`focus-within` (add CSS).
- Add status pill + fork button slot in meta (optional props).
- Keep streaming progressive typing.

**`StepExplorer.tsx`**
- Replace text-only labels with `ToolActivityIcon`/`WorkEntryIcon` per step
  kind (map kind→icon name).
- Add persisted expand state: accept `persistKey?: string` and use
  `localStorage` (or a small `usePersistedBoolean` hook) for outer open state
  instead of `useState(false)`.
- Add running shimmer: when `running`, show `ActivityShimmerOverlay`-style
  pulsing row ("Working…") with elapsed? Optional.
- Keep nested output truncation (4000 chars, max-h-40).
- Add `aria-expanded`/`aria-controls` on summary.

**`ThreadPane.tsx`**
- Extract `Prose` to `web/src/threads/Prose.tsx` (or keep, but override
  `details`/`summary`).
- Add `MarkdownDetails` to ReactMarkdown components.
- Add `ChangedFilesCard` per assistant turn when `run.diff_stats` present
  (wire `run` data; currently `RunSummaryCard` shows checks). Gate behind
  `run.status === "passed"` etc.
- Replace full-list render with windowing only if > 200 events (optional,
  behind flag) — T3 uses LegendList; BarkCLI can use `react-window` if added,
  but avoid new deps unless needed. Mark as future.
- Keep message coalescing.

**`index.css`**
- Add `.chat-assistant-meta` hover-reveal (opacity 0→1).
- Add `.chat-details` (MarkdownDetails) styles mirroring T3: `border-y
  border-border/60`, chevron rotate.
- Add `@media (prefers-reduced-motion: reduce)` to disable pulse/ping.
- Add `.live-activity-focus` shimmer (optional).

### 5.3 State management

Create `web/src/lib/uiState.ts` (or extend existing) with a small Zustand-less
persisted store:
- `usePersistedBoolean(key, initial)` hook backed by `localStorage` with
  versioned JSON, mirroring T3's `uiStateStore` pattern but minimal.
- Keys: `threadStepsExpanded:<threadId>`, `threadChangedFilesExpanded:<threadId>:<runId>`.
- SSR/demo safe (guard `window`).

### 5.4 Styling tokens (use existing CSS vars)
Keep BarkCLI's existing variables; do not introduce new color system. Map T3
class names to BarkCLI equivalents:
- `text-foreground` → `var(--text)`
- `text-muted`/`text-muted-strong` → `var(--muted)` / `var(--muted-strong)`
- `text-accent`/`text-accent-text` → `var(--accent)` / `var(--accent-text)`
- `border-border/60` → `var(--border)` with opacity via `color-mix` or existing
  `--border-subtle`.
- Radii: reuse existing `border-radius` values (4/6/8/10/12).

### 5.5 Interaction & a11y
- All collapsibles: keyboard Enter/Space toggles; `aria-expanded` on summary.
- Focus visible outlines on summaries and buttons.
- Hover-reveal actions must also show on `:focus-within` and
  `pointer-coarse:opacity-100` (touch).
- Reduced motion: disable `animate-pulse`/`animate-ping`/shimmer.
- Find-in-page: closed `<details>` should open on `beforematch` (T3's
  `hiddenUntilFound`). Implement via `onBeforeMatch` handler opening state.

### 5.6 Tests to add/update
- `MarkdownDetails.test.tsx`: renders summary/content; toggles; default open;
  chevron rotation attribute.
- `StepExplorer.test.tsx` (exists? check): add persisted-expand test using
  mocked localStorage.
- `AssistantMessageCard.test.tsx`: thought block toggle; streaming caret.
- `ThreadPane.test.tsx`: details override renders; changed files card appears
  for passed run.
- Keep existing tests green; don't break `coalesceAssistantEvents` logic.

### 5.7 Acceptance criteria
1. Markdown `<details>` in assistant replies renders as T3-style collapsible
   with chevron + border-y, not raw `<details>` default triangle.
2. Tool steps show icon + label + truncated mono value + nested output; outer
   expand state persists across reload.
3. Working state shows pulsing avatar, status text, elapsed seconds, Stop button,
   recent activities (last 3), "Live execution".
4. Changed files card appears for completed runs with diff totals and clickable
   files.
5. Hover-reveal actions work on mouse and keyboard; reduced-motion respected.
6. No regression in existing `ThreadPane`/`StepExplorer` tests.

### 5.8 Non-goals / deferred
- Right-inspector multi-tab surface (diff/files/terminal/PR) — larger; track
  separately; AGENTS.md flags it.
- Timeline virtualization (LegendList) — defer until perf issue.
- Full `WorkEntryIcon` asset URL state (native app favicons) — defer; use
  static lucide icons only.

---

## 6. If images become available
Re-run with a vision model, replace §1 hypotheses with actual per-image
descriptions (layout, components, details blocks collapsed/expanded, working
state, tool calls/steps, results, typography/spacing/colors), and keep §5 spec
updated. The spec is intentionally derived from T3 Code source so it should
already match; flag any discrepancy.

---

*Generated without image viewing capability. Derived from `ref/t3code` source and
`web/src/threads/` + `web/src/index.css` in the barkcli repo.*