# THREAD UI — Vision Analysis 1
## T3-style “threads” agent UI screenshots → BarkCLI implementation spec

**Source:** 5 screenshots supplied as attachments (T3 Code / t3.codes-style dark
agent chat). They are sequential crops of **one session**: debugging
`acquire_worktree()` in `barkcli-core/src/agent/worktree.rs` (“could not acquire
an isolated worktree”), running `grep`/`sed`/`cargo test`/`cargo build`/`install-macos-app.sh`,
editing `worktree.rs` + `runner.rs`, then explaining the fix.

**Purpose:** reverse-engineer the visual + interaction contract so BarkCLI’s
`web/src/threads/` can match it. This document describes what the images show,
then gives a concrete, buildable spec mapped to BarkCLI’s existing types,
components, and CSS tokens.

**Caveat:** crops show only the message column — no sidebar, header, or composer
is visible. Layout conclusions are about the conversation column only.

---

## 1. Per-image analysis

### Image 1 — `…00832cd9…png` — Working state, collapsed step list
*Filename chip in the request order: image 1.*

**Layout / components**
- Full-bleed near-black column (`#000`–`#050505`). No chat bubbles.
- Top header row: `Working for 6m 14s` in muted gray, regular weight, ~14px,
  left-aligned, with a hairline divider (`white/8`) underneath spanning the
  column width.
- Below: a vertical, append-only list of step rows, one per tool call / thought.
  Each row is a single horizontal line: **tool icon (left) + single-line label
  (truncated with `…`) + `>` disclosure chevron (right)**.
- Vertical scrollbar visible at far right (thin, dark thumb).

**Step rows visible (top → bottom)**
1. `>_  Running bash` — white/brighter text, “Running” is a verb label, “bash”
   is the tool. This is the *currently executing* step.
2. `🧠 Considering worktree issue  The user is facing an issue with acquiring
   an isolated worktree for a task, a… >` — thought step: title + preview of
   the thought text.
3. `>_ cd /Users/…/barkcli && grep -rn 'could not acquire an isolated worktree\|co… >`
4. `>_ cd /Users/…/barkcli && grep -rn 'acquire_worktree\|create_worktree\|Workt… >`
5. `>_ cd /Users/…/barkcli && sed -n '1,150p' barkcli-core/src/agent/worktree.rs >`
6. `>_ cd /Users/…/barkcli && sed -n '210,250p' barkcli-core/src/runtime/runner.rs >`
7. `>_ cd /Users/…/barkcli && grep -rn 'could not acquire an isolated worktree\|ac… >`
8. `🧠 Rethinking worktree behavior  Okay, so the issue seems to be with
   acquire_worktree() in worktree.rs. It … >`
9. `✎ barkcli/barkcli-core/src/agent/worktree.rs >` — edit step, red-tinted
   pencil icon.
10. `✎ barkcli/barkcli-core/src/agent/worktree.rs >` — second edit (gray/green
    pencil).
11. `🧠 Fixing the edit  Okay, the first edit didn't work because the file
    content might be a bit different from wh… >`
12. `>_ cd /Users/…/barkcli && sed -n '80,115p' barkcli-core/src/agent/worktree.rs >`
13. `🧠 Updating documentation  I noticed that the "if main_is_dirty()" check is
    missing between the path exist… >` (partially clipped at bottom).

**Typography / color / pattern**
- Row label: ~13–14px system sans, weight 400, `text-zinc-400` (`#a1a1aa`)
  for finished steps; active row `text-zinc-100`, weight 500.
- Commands and paths in the same sans (not mono) at collapsed level — mono is
  reserved for the expanded detail. Truncation at ~90–110ch.
- Icons: 14–16px outline icons, muted gray; edit icon carries a faint red/dark
  tint; thought icon is a “brain” outline.
- Chevron `>` is a small muted glyph, always right-aligned, ~16px hit target.
- Row height ~28–32px, no separators, no row backgrounds. Hover/focus state
  not visible in still but implied by affordance.

**Meaning:** the *entire* agent execution is one expandable disclosure list
under a live timer. The collapsed list is the primary working-state UI — the
user can skim what the agent did without reading any output.

---

### Image 2 — `…13559501…png` — Expanded bash step (“details” block)
*Image 2.*

**Layout / components**
- One step row in expanded state, then its detail block directly below it.
- Header row: `>_  cd /Users/…/barkcli && grep -rn 'acquire_worktr…` (truncated),
  right-aligned timestamp `9:25 am`, and a **downward** chevron `⌄`
  (rotated from `>`), indicating open.
- Detail block: a syntax-highlighted shell command, wrapped across 3 visual
  lines, indented to align under the label (left edge ~ icon column).

**Expanded content (verbatim)**
```
cd /Users/akshatnaruka/Downloads/.ses/barkcli && grep -rn
'acquire_worktree\|create_worktree\|WorktreeManager\|dirty' barkcli-core/src/agent
barkcli-core/src/runtime 2>&1 | head -25
```

**Syntax colors (OneDark / GitHub-dark-like)**
- `cd` keyword: purple `#c678dd`.
- Paths / `barkcli-core/src/agent`, `2>&1`, `head`: orange `#d19a66` / `#e5c07b`.
- `&&`, `grep`, `|`: purple/blue operators `#61afef` / `#c678dd`.
- Quoted pattern `'acquire_worktree\|…'` : green `#98c379`.
- `-rn`, `-25`: orange numbers/flags.

**Typography / pattern**
- Code: ~13px mono (`SF Mono` / `JetBrains Mono`), line-height ~1.5, `white-space:
  pre-wrap` — long commands wrap instead of horizontal-scrolling.
- No copy button, no header bar, no exit-code badge visible in this crop.
- Timestamp appears **only** on the expanded/focused row (collapsed rows in
  image 1 show no time). This is the “details” affordance: expand to audit.
- The expanded block has no border or background — it floats on the black
  background, distinguished only by indentation and color. That restraint is
  the core of the aesthetic: chrome is invisible until needed.

---

### Image 3 — `…b2aa23f9…png` — Expanded Thought step
*Image 3.*

**Layout / components**
- Expanded thought detail with a **blue focus/selection ring** around the whole
  block (`#3b82f6`-ish, 1–2px) — indicates keyboard focus / hovered / selected
  step.
- Header: brain icon + `Thought` (muted, ~14px), right-aligned clock time
  `9:27 am`, down-chevron `⌄`.
- Title (bold, ~16–17px, weight 600, white): `Rethinking worktree behavior`
- Body paragraph, rendered markdown prose.
- Floating pill centered at bottom: `⌄ Scroll to end` — dark pill
  (`#1a1a1a`), white text, small chevron. This is the auto-scroll affordance:
  shown when the user has scrolled up inside a long detail / the column and
  new content arrives below, or when the detail body overflows its viewport.

**Body text (verbatim)**
> Okay, so the issue seems to be with `acquire_worktree()` in `worktree.rs`.
> It calls `main_is_dirty()` and refuses if there are uncommitted changes,
> but worktrees are created from `HEAD`, not the current working tree.
> So, the dirty state of the main branch shouldn't block the creation of a
> new worktree. The checkpoint mentioned that the blocker was removed, but
> it looks like it's still there in the code. I need to double-check

**Typography / pattern**
- Body: ~15px sans, `line-height ~1.65`, `text-zinc-200`. First line is the
  *title* (bold), the rest is the thought text — i.e. the agent emits
  `title + body`, and the UI splits them.
- Inline code is rendered as **dark pill chips**: `acquire_worktree()`,
  `worktree.rs`, `main_is_dirty()`, `HEAD` — background `#27272a`/`#1f1f23`,
  ~12.5px mono, `padding: 1px 5px`, `border-radius: 4px`, slightly lighter
  text than body. This chip style is the only “background” inside prose.
- The trailing thoughts are clipped (no ellipsis; the detail is viewport-
  limited and scrolls — hence “Scroll to end”).
- No italic styling (unlike BarkCLI’s current `.chat-thought-content` which is
  italic). Thought text is normal prose, same as an assistant message.

---

### Image 4 — `…6ee4e02e…png` — Completed run summary + final answer
*Image 4.*

**Layout / components**
- Header now reads `Worked for 6m 48s` (past tense) with a down-chevron `⌄` on
  the right of the label — the whole step list is now a collapsible section,
  collapsed-or-expanded via that chevron.
- Summary line under a tool/hammer icon:
  `🔨 Ran 11 commands and changed 2 files` — aggregated counts, muted gray.
- Then the same collapsed step list (truncated previews, `>` chevrons):
  - `✎ barkcli/barkcli-core/src/agent/worktree.rs >`
  - `>_ cd … sed -n '220,235p' barkcli-core/src/runtime/runner.rs >`
  - `🧠 Refining error message  The error message right now is misleading,
    just saying "commit or stash tracke… >`
  - `✎ barkcli/barkcli-core/src/runtime/runner.rs >`
  - `🧠 Checking tests and building  Okay, the core fix is done. Now, I should
    check if there are any tests relate… >`
  - `>_ cd … grep -rn 'main is dirty\|refusing.*dirty\|commit or st… >`
  - `>_ cd … cargo test -p barkcli-core worktree 2>&1 | tail -15 >`
  - `🧠 Considering app rebuild  Okay, the tests passed, but I should rebuild
    and reinstall the app since the fix … >`
  - `>_ cd … cargo build --release -p barkcli-core 2>&1 | tail -3 >`
  - `🧠 Rebuilding app binaries  Okay, the core is built, but the desktop app
    bundles the server binary, so I nee… >`
  - `>_ cd … bash desktop/scripts/install-macos-app.sh --build … >`
  - `🧠 Explaining the fix  Okay, the fix is done and installed. I need to
    explain what caused the "isolated worktr… >`
- Below the steps: the **final assistant answer** begins in the same column,
  no bubble:
  - Heading `Cause` — ~20px, weight 700, white, `letter-spacing: -0.01em`.
  - Body starts: `` `barkcli-core/src/agent/worktree.rs:acquire_worktree`
    blocked when the main checkout had uncommitted … `` with the same pill-chip
    inline code.
- `Scroll to end` pill again floats over the answer, bottom-center.

**Meaning:** working state and answer share one scroll column. The step list
*collapses into a summary* (`Worked for …` + `Ran N commands…`) once done;
the answer is plain markdown prose underneath, not a card. The user reads the
answer first, expands steps only to audit.

---

### Image 5 — `…ab7c0f12…png` — Changed-files / diff summary card
*Image 5.*

**Layout / components**
- A single card, slightly lighter than the page background
  (`#0a0a0c` page → `#121214`-ish card), `border-radius: ~10px`, no visible
  border or a very subtle `white/6` border.
- **Header row:** `2 changed files` (white, 500, ~14px) + `+6` (green
  `#4ade80`/`#22c55e`, mono, 600) + `−12` (red `#f87171`, mono, 600).
  Right side: a stacked/expand chevron icon (`⇕`-like) and an `Open diff`
  action with a document-plus icon, muted text.
- **File-tree row:** `> 📁 barkcli-core/src` — disclosure chevron, folder icon,
  mono path (`~12.5px`, `text-zinc-300`), and right-aligned `+6  −12` in the
  same green/red mono. The row has its own subtle background (`white/3`,
  `border-radius: 6px`) — i.e. rows inside the card are inset panels.
- **Footer row:** two small muted icons (copy/clipboard, branch/fork) + clock
  time `9:32 am` (`text-zinc-500`, ~12px). These are card-level actions:
  copy diff / copy summary, and branch/worktree identity.

**Pattern:** the *result artifact* of a build run is a compact card: counts
up top, folder-grouped file list in the middle, actions + time at the bottom.
Expanding the folder row (image 5 chevron) would reveal the two files
(`worktree.rs`, `runner.rs`) with per-file `+n −m`. `Open diff` jumps to the
full diff view. This is the “results display” counterpart to the step list:
steps = *how it worked*, card = *what changed*.

---

## 2. Cross-cutting analysis

### 2.1 Layout
- **Single centered column**, max-width ~760–820px (BarkCLI already uses 808px
  in `.thread-conversation` — keep it). No bubbles, no avatars in the step
  list; identity is carried by the tool icon alone.
- **Structure per assistant turn:** `WorkingHeader (timer + chevron)` →
  `StepList (rows + expanded details)` → `SummaryLine (Ran N…)` → `Answer
  (markdown)` → `DiffCard (if files changed)`. Order matters: audit trail
  first, answer last, artifact card after.
- Composer, sidebar, and thread header are **not in the crops** — do not infer
  them from these images.

### 2.2 “Details” blocks (collapsed / expanded)
- **Every step is a disclosure row.** Collapsed = icon + 1-line truncated
  summary + `>`. Expanded = header row gains a timestamp + `⌄`, and a detail
  block renders beneath, indented, borderless.
- **Two detail flavors:**
  - *Tool output* (bash): syntax-highlighted, wrapped mono code. No chrome.
  - *Thought*: title (bold) + prose body with inline-code pill chips.
- **One expanded at a time** is implied (focus ring in image 3 suggests a
  single “active” detail). BarkCLI should enforce accordion behavior:
  expanding a row collapses the previous one.
- **Timestamps are a detail-only signal** (`9:25 am`, `9:27 am`, `9:32 am`).
  Collapsed rows never show time. This keeps the collapsed list scannable.

### 2.3 Working state after a prompt
- Header switches `Working for Xm Ys` (present) → `Worked for Xm Ys` (past) on
  completion. The timer is the only live element; steps append beneath it.
- The currently-running step row is brighter (`Running bash`). Finished rows
  dim to gray. Thoughts and edits interleave with commands in a single list —
  there is **no separate “thinking” area**.
- Auto-scroll: the column sticks to the bottom as steps stream in. When the
  user scrolls up (or a detail overflows), a `Scroll to end` pill appears
  bottom-center; clicking it resumes stick-to-bottom.

### 2.4 Tool calls / steps display
- **Icon taxonomy** (map BarkCLI events to these):
  - `>_ ` terminal/stack → `tool_call` where name/input is a shell command, or
    `gate` (tests/builds).
  - `🧠` brain → thought / reasoning text (`assistant` with a thought title, or
    a dedicated thought event).
  - `✎` pencil → file edit (`file_change` / edit / write tool).
  - `🔨` hammer (summary only) → aggregate line, not a step.
- **Collapsed summary format:** `Icon + [Verb/Title] + [object/preview]`.
  - Bash: the raw command, truncated.
  - Thought: `Title  Body preview…` (title bold-ish by position, preview gray).
  - Edit: relative file path only.
- Full command, full thought body, and file diff preview live in the expanded
  detail — never in the collapsed row.

### 2.5 Results display
- **Counts line:** `Ran N commands and changed M files` — derived from the
  step list + diff stats. It is the “did something happen?” glanceable answer.
- **Answer:** plain markdown (headings, prose, pill-chip inline code). No card,
  no bubble. Headings are large and white (`Cause` at ~20px).
- **Diff card:** `N changed files +A −D`, folder-grouped rows with per-folder
  `+A −D`, `Open diff` action, copy/branch footer actions, completion time.

### 2.6 Typography / spacing / colors
| Token | Value (from crops) | BarkCLI equivalent |
|---|---|---|
| Page bg | `#000`–`#050505` | `var(--bg)` (dark) |
| Card bg | `#101013` / `white/4` | `var(--surface)` / `var(--card)` |
| Primary text | `#f4f4f5` (zinc-100) | `var(--text)` |
| Secondary text | `#a1a1aa` (zinc-400) | `var(--muted-strong)` |
| Tertiary / time | `#71717a` (zinc-500) | `var(--muted)` |
| Hairline | `white/8` | `var(--border)` |
| Inline code chip bg | `#27272a` | `var(--surface)` + radius 4px |
| Additions | `#4ade80` mono 600 | `text-success` / emerald |
| Deletions | `#f87171` mono 600 | `text-danger` / rose |
| Focus ring | `#3b82f6` 1px | `ring-accent` |
| Sans | system / Inter, 13–15px, lh 1.6–1.75 | existing `.chat-prose` 14px/1.75 |
| Mono | SF Mono / JetBrains Mono, 12.5–13px | existing `font-mono` |
| Row height | 28–32px collapsed; detail lh 1.5 | new |
| Column measure | ~800px, 24px side padding | existing 808px |

**Patterns to preserve**
1. *Invisible chrome*: no borders/backgrounds on step rows or prose; color and
   weight carry hierarchy.
2. *One accent at a time*: the blue focus ring is the only saturated element
   besides diff green/red and code token colors.
3. *Truncation as a feature*: collapsed rows always ellipsize; full text is
   one click away. Never wrap a collapsed row.
4. *Time appears on expand*: keeps the list quiet by default.

---

## 3. BarkCLI implementation spec

### 3.1 Goals / non-goals
**Goals**
- Match the 5 crops: timer header → collapsed step list → expanded details →
  summary line → prose answer → changed-files card, all in one column.
- Reuse existing BarkCLI plumbing: `ThreadEvent`, `RunRecord.diff_stats`,
  `StepExplorer.parseStepEvent`, `CodeBlock`, `UnifiedDiff`, `openInEditor`,
  `ThreadPane` SSE stream. Do not add new backend events.
- Keep BarkCLI-specific affordances (Stop, Changes pill in header, gate badge)
  but restyle them into the quiet pattern above.

**Non-goals**
- No new sidebar/header/composer design (not in the source images).
- No change to `barkcli run` / worktree / gate logic.

### 3.2 Component tree (new + existing)

```
ThreadPane
├─ ConversationColumn (.thread-conversation, max-w 808px)
│  ├─ (existing) UserMessageCard
│  ├─ AssistantTurn  [NEW — replaces the current WorkingBubble + Details split]
│  │  ├─ WorkingHeader [NEW]          “Working for 6m 14s ⌄” / “Worked for …”
│  │  ├─ StepList [EVOLVE StepExplorer]
│  │  │  └─ StepRow [NEW] × N         icon + summary + chevron (button)
│  │  │     └─ StepDetail [NEW]       expanded: BashDetail | ThoughtDetail | EditDetail
│  │  ├─ SummaryLine [NEW]            “Ran 11 commands and changed 2 files”
│  │  ├─ AnswerProse (existing Prose) markdown render of final assistant text
│  │  └─ DiffSummaryCard [NEW]        “2 changed files +6 −12 / Open diff”
│  └─ ScrollToEndPill [NEW]           floating, bottom-center
└─ (existing) ComposerDock / ThreadComposer
```

**Files**
| File | Action |
|---|---|
| `web/src/threads/WorkingHeader.tsx` | NEW — timer + collapse toggle |
| `web/src/threads/StepRow.tsx` | NEW — collapsed row + detail switch |
| `web/src/threads/StepDetail.tsx` | NEW — `BashDetail` / `ThoughtDetail` / `EditDetail` |
| `web/src/threads/DiffSummaryCard.tsx` | NEW — folder-grouped changed-files card |
| `web/src/threads/ScrollToEndPill.tsx` | NEW — floating stick-to-bottom button |
| `web/src/threads/AssistantTurn.tsx` | NEW — composes header/list/summary/answer/card |
| `web/src/threads/StepExplorer.tsx` | KEEP as data layer: extend `parseStepEvent` (see §3.4); re-export `StepItem` |
| `web/src/threads/AssistantMessageCard.tsx` | REUSE `formatBackendName`, `useElapsedSeconds`, `splitThinkingContent`; retire `LiveAgentWorkingBubble`’s box styling |
| `web/src/threads/CodeBlock.tsx` | REUSE for `BashDetail` when a full code block is needed; low-level highlight via `rehype-highlight` for inline detail |
| `web/src/components/UnifiedDiff.tsx` | REUSE for `Open diff` destination (Inspector/diff tab) |

### 3.3 Data mapping — existing `ThreadEvent` → step kinds

BarkCLI `ThreadEvent { id, seq, kind, author, text, data, created_at }`
(`web/src/lib/types.ts`). Extend `parseStepEvent` (StepExplorer.tsx:35) to
return the T3 taxonomy:

| `StepItem.kind` (extend union) | Source event | Icon | Collapsed summary | Expanded detail |
|---|---|---|---|---|
| `command` | `kind === "tool_call"` and name/input matches bash/shell/terminal, **or** `kind === "gate"` | `>_` (`terminal`) | `data.input.command` or `text`, truncated | Syntax-highlighted wrapped shell (`BashDetail`) |
| `thought` | `kind === "tool_call"` with reasoning, **or** `assistant` text containing a thought title, **or** `data.thought` | brain (`spark`/`brain`) | `title + "  " + bodyPreview` | `ThoughtDetail`: bold title + prose + pill chips |
| `edit` | `kind === "file_change"`, or name includes edit/write/patch | pencil (`doc`/`edit`, red tint when `status === "failed"`) | relative file path | `EditDetail`: path button (open in editor) + mini diff preview if available |
| `search`/`find`/`inspect`/`analyze` | existing kinds | `eye`/`search` | existing `stepSummary` | existing detail `pre` |
| `generic` | fallback | `spark` | `text` | `pre` with `text` + JSON `data` |

**Title/preview split for thoughts.** Agent thought text follows
`Title\n\nBody…` or `Title — Body…`. Implement `splitThought(text)`:
first non-empty line (≤ 80ch, no trailing period) = title; remainder = body.
Collapsed row shows `title + "  " + first 60ch of body + "…"`. Expanded
detail shows title bold, body as prose. This reproduces images 1/3/4 exactly
(`Rethinking worktree behavior  Okay, so the issue…`).

**Header timer.** Reuse `useElapsedSeconds(active)` (AssistantMessageCard.tsx:46).
- While `chatBusy || activeRun`: label `Working for ${fmt(elapsed)}`.
- After completion: freeze at `Worked for ${fmt(total)}` where total =
  `run.ended_at − run.started_at` (or last-event − first-event for chat turns).
- `fmt`: `6m 14s`, `48s`, `1h 02m`. Add `formatElapsed(s)` to `lib/threads.ts`.
- The whole header is a `<button aria-expanded>` toggling the step list
  (chevron `⌄`/`›` rotates 90°). Default: **expanded while working**,
  **expanded but collapsible when done** (image 4 shows it expanded with
  chevron; collapsing hides rows, leaving only the header + answer).

**Summary line.** Compute in `AssistantTurn`:
`ran = steps.filter(kind === "command" || kind === "gate").length`,
`changed = latestRun?.diff_stats.files ?? editSteps.length`.
Render `🔨 Ran {ran} commands and changed {changed} files` with the hammer/tool
icon. Hide when `ran === 0 && changed === 0`.

### 3.4 Step row + detail behavior

```tsx
// StepRow.tsx (sketch)
type Props = { step: StepItem; expanded: boolean; onToggle: () => void; onOpenFile?: (p: string, l?: number) => void };
<button className="step-row" aria-expanded={expanded} aria-controls={detailId}>
  <ToolIcon kind={step.kind} status={step.status} />
  <span className="step-row-label">{collapsedSummary(step)}</span>  {/* truncate */}
  <span className="step-row-time">{expanded ? time : null}</span>  {/* detail-only */}
  <Chevron />
</button>
{expanded && <div id={detailId} className="step-detail"><StepDetail step={step} /></div>}
```

- **Accordion:** `AssistantTurn` holds `openStepId: string | null`. Toggling a
  row sets it; opening one closes the previous. The **currently running**
  step auto-opens (image 1: `Running bash` is the implicit open row; image 2/3
  are that row / a thought opened during the run).
- **Keyboard:** rows are real `<button>`s — Enter/Space toggles, arrow keys
  move between rows (`onKeyDown` roving). `aria-expanded` + `aria-controls`
  required. `Cmd/Ctrl+Click` on an edit/analyze row opens the file
  (`openInEditor`, StepExplorer already does this).
- **Running indicator:** the active step row gets `is-running` → label
  `text-zinc-100 font-medium`, icon pulses subtly (`animate-pulse` at 2s, or a
  5px dot like BarkCLI’s existing `.chat-working-dot` — prefer the dot to stay
  quiet). Finished rows dim on completion (all gray in images 1/4).
- **Detail rendering:**
  - `BashDetail`: `pre` with `whitespace-pre-wrap`, token colors via existing
    `rehype-highlight` hljs theme (already defined in `index.css:639-651` —
    purple/orange/green/blue match the crops). No copy button inside the
    detail (copy lives on the `CodeBlock` used in prose). Truncate output at
    4,000ch with `…` (StepExplorer:184 already does this).
  - `ThoughtDetail`: `<h4>` title (600, 16px) + `<div>` prose (15px, lh 1.65)
    with inline `code` → `.chat-inline-code` pill chips. Reuse `Prose` from
    ThreadPane so markdown + chips stay consistent. **Remove italic**
    (`.chat-thought-content` currently italic — change to normal style to
    match image 3).
  - `EditDetail`: file-path button (mono, accent on hover → `openInEditor`)
    + optional stat `+6 −12` + first 20 lines of the unified diff hunk if
    `data.output`/`data.detail` contains one.
- **Focus ring:** the expanded detail wrapper gets `box-shadow: 0 0 0 1px
  var(--accent)` when it contains focus or is the keyboard-active row
  (image 3’s blue outline). Implement via `:focus-within`.

### 3.5 Diff summary card

```tsx
// DiffSummaryCard.tsx
type Props = { run: RunRecord; onOpenDiff: () => void; onCopy: (text: string) => void };
```

- Header: `{files} changed files` + `+{additions}` (green) + `−{deletions}`
  (red), mono 600. Right: expand-all chevron + `Open diff` button
  (`Icon "doc-plus"`).
- Body: group files by **common directory prefix** (e.g. all files under
  `barkcli-core/src` → one row `📁 barkcli-core/src  +6 −12`). Clicking the
  folder row expands to per-file rows (`worktree.rs +4 −8`, `runner.rs +2 −4`).
  When only one folder exists, render it directly (image 5).
- Footer: copy icon (copies `git diff` stat / full diff), branch icon (shows
  `run.branch` in a tooltip / copies it), completion time `9:32 am`
  (from `run.ended_at`, `toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'})`).
- `Open diff` → existing behavior: `onOpenInspector()` + dispatch
  `bark-open-inspector-tab` with `detail: "diff"` (ThreadPane:606 pattern),
  rendering `UnifiedDiff` in the Inspector. Do **not** duplicate the diff
  viewer inside the card.
- Hide the card when `diff_stats.files === 0`. Keep the header `Changes`
  pill (ThreadPane:976) — it stays the persistent counts affordance; the card
  is the in-thread artifact.

### 3.6 Answer prose + scroll pill

- The final `assistant` event renders via existing `Prose` (ReactMarkdown +
  remark-gfm + rehype-highlight, ThreadPane:80). Ensure heading scale matches
  image 4: `h2` at 20px weight 700 (bump `.chat-prose h2` from 16px — but keep
  `h3/h4` at 16px to avoid inflating nested headings; or scope a
  `.chat-prose > h2:first-child` rule).
- Inline code chips: existing `.chat-inline-code` (surface bg, accent text,
  4px radius) already matches. Verify padding is `2px 4px` (index.css:624) —
  image 3 chips look slightly wider; `2px 6px` is closer.
- `ScrollToEndPill`: fixed `position: sticky; bottom: 12px`, centered,
  `border-radius: 999px`, `bg #1a1a1d`, `border white/10`, label
  `⌄ Scroll to end`. Show when `!stickToBottom && (newOutput || detailOverflow)`.
  Reuse ThreadPane’s `stickToBottom` ref + `newOutput` state (lines 298, 1115-1122)
  and the existing `jump-to-latest` button (line 1783) — restyle that button
  into the pill instead of adding a second one.

### 3.7 CSS additions (append to `web/src/index.css`, near chat rules ~591-658)

```css
/* Thread turn: WorkingHeader + StepList (T3-style, invisible chrome) */
.thread-working-header { display:flex; align-items:center; gap:8px; width:100%;
  padding:10px 0 8px; color:var(--muted); font-size:14px; text-align:left; }
.thread-working-header:hover { color:var(--text); }
.step-row { display:flex; align-items:center; gap:10px; width:100%; padding:5px 0;
  font-size:13.5px; color:var(--muted-strong); text-align:left; }
.step-row:hover { color:var(--text); }
.step-row.is-running { color:var(--text); font-weight:500; }
.step-row-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.step-detail { padding:2px 0 10px 26px; }  /* indent under label, no border/bg */
.step-detail:focus-within { box-shadow:0 0 0 1px var(--accent); border-radius:6px; }
.step-detail pre { font-family:"SF Mono","JetBrains Mono",monospace; font-size:13px; line-height:1.5;
  white-space:pre-wrap; overflow-wrap:anywhere; }
.thought-title { font-size:16px; font-weight:600; color:var(--text); }
.thought-body { font-size:15px; line-height:1.65; color:var(--text); margin-top:6px; }
/* Summary + diff card */
.thread-summary-line { display:flex; gap:8px; align-items:center; color:var(--muted); font-size:14px; padding:8px 0; }
.diff-summary-card { background:var(--surface); border:1px solid var(--border);
  border-radius:10px; padding:12px 14px; }
.diff-folder-row { display:flex; align-items:center; gap:8px; background:color-mix(in srgb, var(--text) 4%, transparent);
  border-radius:6px; padding:6px 10px; font-family:monospace; font-size:12.5px; }
.scroll-to-end { position:sticky; bottom:12px; display:inline-flex; align-items:center; gap:6px;
  background:#1a1a1d; border:1px solid color-mix(in srgb, var(--border) 80%, transparent);
  color:var(--text); border-radius:999px; padding:6px 14px; font-size:13px; }
```

Keep all colors as CSS variables so light theme still works; the crops are
dark-only, so verify the pill/card borders remain visible in light mode.

### 3.8 Refactor of `ThreadPane` rendering

Current `ThreadPane` renders steps in **three** places (live `StepExplorer` +
`LiveAgentWorkingBubble` at 1607-1625, idle `StepExplorer` at 1631-1640, and a
separate `Details` + `thread-activity` disclosure at 1641-1721). Consolidate:

1. Group `displayEvents` + `activityEvents` into turns by `turn_id`/`run_id`
   (the same coalescing key used in `coalesceAssistantEvents`, line 227).
2. Render one `AssistantTurn` per turn: header from the turn’s first/last
   event times, steps from that turn’s `tool_call`/`file_change`/`gate`
   events, answer from its final `assistant` event, diff card from its
   `RunRecord`.
3. **Delete** the standalone `Details`/`thread-activity` block (1641-1721) —
   its per-event `details/summary` duplicates `StepRow`. Preserve
   `RunSummaryCard` (attempt/branch/worktree/gate) inside `AssistantTurn`’s
   expanded detail or below the diff card, not as a separate disclosure.
4. `LiveAgentWorkingBubble` (AssistantMessageCard:187) is retired; its
   `recentActivities` box becomes the `StepList` itself. Keep its Stop button
   by moving it into `WorkingHeader` (right-aligned, `Stop` text button).

This is a render-only refactor: SSE append + 1.5s poll (`useEffect` at
ThreadPane:778) already delivers the events `AssistantTurn` needs.

### 3.9 Accessibility & edge cases
- Rows: `<button aria-expanded aria-controls>`, visible focus ring
  (`:focus-visible { box-shadow: 0 0 0 1px var(--accent) }`), arrow-key
  navigation between collapsed rows.
- Timer: `aria-live="polite"` with `aria-label="Working for 6 minutes 14 seconds"`
  (update label at most every 10s to avoid SR spam).
- Thought detail: `<h4>` title inside a `region` labelled by title.
- Empty states: no steps → header shows `Thinking…` (existing
  `workingStatusText` fallback, ThreadPane:742); no diff → no card.
- Long commands: wrap, never horizontal-scroll the detail `pre` (image 2 wraps).
  Full stderr/stdout stays in the Inspector, not the chat.
- Reduced motion: disable pulse/chevron transitions under
  `prefers-reduced-motion`.

### 3.10 Implementation sequence
1. **`lib/threads.ts`**: add `formatElapsed(seconds)`; extend `StepItem` union
   with `thought`; add `splitThought(text)`.
2. **`StepExplorer.tsx`**: extend `parseStepEvent` for `thought` kind
   (title/preview split); extract `StepList` (open-id state) from the
   component so `AssistantTurn` can own the accordion.
3. **New `StepRow.tsx` + `StepDetail.tsx`**: collapsed row, bash/thought/edit
   details, accordion + keyboard support. Unit-test `splitThought` and
   truncation.
4. **New `WorkingHeader.tsx`**: timer (reuse `useElapsedSeconds`), past-tense
   switch, collapse toggle, Stop button.
5. **New `DiffSummaryCard.tsx`**: folder grouping (`commonPrefix(files)`),
   counts, copy/branch footer, `Open diff` wiring. Test grouping with the
   image-5 fixture (`barkcli-core/src/*` → one folder row, `+6 −12`).
6. **New `AssistantTurn.tsx`**: turn grouping, summary line, answer prose,
   card placement. Wire into `ThreadPane`, delete the old `Details` block and
   `LiveAgentWorkingBubble` usage.
7. **CSS**: append §3.7 rules; remove italic from `.chat-thought-content`;
   restyle `.jump-to-latest` into `ScrollToEndPill`.
8. **Tests**: snapshot tests for collapsed/expanded row, accordion (only one
   open), timer tense switch, summary counts (`Ran 11…`), diff-card folder
   grouping. Extend `StepExplorer.test.tsx` / `ThreadPane.test.tsx`.

### 3.11 Acceptance checklist (traceable to crops)
- [ ] **Img 1:** Running turn shows `Working for Xm Ys` + collapsed rows
  (icon + truncated label + `>`), active row brighter, scrollbar not
  covering chevrons.
- [ ] **Img 2:** Clicking a bash row expands to wrapped, syntax-highlighted
  command with timestamp + `⌄`; clicking again collapses.
- [ ] **Img 3:** Clicking a thought row expands to bold title + prose with
  pill-chip inline code; only one row open at a time; `Scroll to end` pill
  appears when scrolled up.
- [ ] **Img 4:** On completion header reads `Worked for …`, summary line
  `Ran N commands and changed M files` appears, answer renders as prose
  with a large `Cause`-style heading beneath the steps.
- [ ] **Img 5:** When files changed, `N changed files +A −D` card renders
  with folder row(s), per-folder counts, `Open diff`, copy/branch actions,
  and completion time; `Open diff` opens the Inspector diff.
- [ ] Dark + light theme both legible; keyboard-only operation works;
  `cargo test` / `vitest run` pass.

---

## 4. What to deliberately *not* copy
- The T3 **blue selection ring as a permanent border** (image 3) — use it only
  for `:focus-within`/keyboard focus, not as a resting card outline.
- **Hammer emoji** as the summary icon — use BarkCLI’s `Icon` set (`terminal` /
  `check`) to stay consistent with existing glyphs.
- **Raw `cd /Users/…` prefixes in collapsed labels** — BarkCLI commands should
  keep cwd but truncate the same way; consider stripping `cd <project> &&`
  into a scope label (e.g. `bash · grep -rn …`) only if it does not lose
  audit value. The crops keep the full command; default to keeping it.

---

*End of analysis. Companion implementation work should start from §3.10 step 1.*
